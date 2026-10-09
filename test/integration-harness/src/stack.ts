import { randomBytes } from "node:crypto";
import { errorMessage, runChecked } from "./command.js";
import {
  COMPOSE_ENV,
  COMPOSE_FILE,
  POSTGRES_DB,
  POSTGRES_PASSWORD,
  POSTGRES_USER,
} from "./constants.js";
import {
  assertDockerAvailable,
  waitForNoContainers,
  type DockerInfo,
  type DockerOptions,
} from "./docker.js";
import { freshRepo, type FreshRepo, type FreshRepoOptions } from "./fresh-repo.js";
import {
  buildConnection,
  connectPostgres,
  parseComposePortOutput,
  resetDatabase,
  type PostgresConnection,
} from "./postgres.js";

/**
 * `startStack()` — brings up the REAL integration stack (Step 03):
 * a clean PostgreSQL 16 container via Docker Compose, on a Docker daemon
 * that has been verified to be real, and hands tests the connection info,
 * `freshRepo()` and `resetDb()`.
 *
 * It is test infrastructure only — not a second application runtime. It
 * contains no Coderlix business logic, creates no Coderlix schema, and has
 * no mock/fake Docker: if a real Docker daemon is not available it throws
 * `DockerUnavailableError` instead.
 */

export interface StartStackOptions extends DockerOptions {
  /** How long `docker compose up --wait` may take (image pull included). Default 180s. */
  startTimeoutSeconds?: number;
}

export interface Stack {
  /** Unique Docker Compose project name for this stack (all its containers carry it). */
  readonly projectName: string;
  readonly docker: DockerInfo;
  readonly postgres: PostgresConnection;
  /** A throwaway git repo; automatically cleaned up by `stop()` if the test did not. */
  freshRepo(options?: FreshRepoOptions): Promise<FreshRepo>;
  /** Returns the test database to a pristine, empty state (see `resetDatabase`). */
  resetDb(): Promise<void>;
  /** Removes the repos, containers, network and anonymous volumes. Idempotent. Throws if anything is left behind. */
  stop(): Promise<void>;
}

export async function startStack(options: StartStackOptions = {}): Promise<Stack> {
  const docker = await assertDockerAvailable(options);
  const dockerBin = docker.dockerBin;
  const startTimeoutSeconds = options.startTimeoutSeconds ?? 180;
  const projectName = `coderlix-it-${String(process.pid)}-${randomBytes(4).toString("hex")}`;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [COMPOSE_ENV.user]: POSTGRES_USER,
    [COMPOSE_ENV.password]: POSTGRES_PASSWORD,
    [COMPOSE_ENV.database]: POSTGRES_DB,
  };

  const compose = (args: readonly string[], timeoutMs: number) =>
    runChecked(
      dockerBin,
      ["compose", "--project-name", projectName, "--file", COMPOSE_FILE, ...args],
      { env, timeoutMs },
    );

  const projectLabel = `com.docker.compose.project=${projectName}`;
  const repos = new Set<FreshRepo>();
  let stopped = false;
  let stopping: Promise<void> | undefined;

  const teardown = async (): Promise<void> => {
    const problems: unknown[] = [];
    for (const repo of repos) {
      try {
        await repo.cleanup();
      } catch (error) {
        problems.push(error);
      }
    }
    repos.clear();
    try {
      await compose(["down", "--volumes", "--remove-orphans", "--timeout", "10"], 180_000);
    } catch (error) {
      problems.push(error);
    }
    try {
      await waitForNoContainers(projectLabel, { dockerBin });
    } catch (error) {
      problems.push(error);
    }
    if (problems.length > 0) {
      throw new AggregateError(problems, `stack ${projectName} cleanup was incomplete`);
    }
  };

  let connection: PostgresConnection;
  try {
    await compose(
      ["up", "--detach", "--wait", "--wait-timeout", String(startTimeoutSeconds), "postgres"],
      (startTimeoutSeconds + 120) * 1000,
    );
    const portOutput = await compose(["port", "postgres", "5432"], 30_000);
    connection = buildConnection(parseComposePortOutput(portOutput.stdout));

    // Prove the published port really speaks PostgreSQL before returning.
    const probe = await connectPostgres(connection);
    try {
      await probe.query("SELECT 1");
    } finally {
      await probe.end().catch(() => {
        // already closed
      });
    }
  } catch (error) {
    let logs = "";
    try {
      logs = (await compose(["logs", "--no-color", "--tail", "60"], 60_000)).stdout;
    } catch {
      logs = "(could not collect compose logs)";
    }
    stopped = true;
    await teardown().catch((cleanupError: unknown) => {
      logs += `\n(additionally, cleanup failed: ${errorMessage(cleanupError)})`;
    });
    throw new Error(`startStack failed: ${errorMessage(error)}\n--- compose logs ---\n${logs}`, {
      cause: error,
    });
  }

  const assertRunning = (what: string): void => {
    if (stopped) throw new Error(`stack ${projectName} has been stopped; cannot ${what}`);
  };

  return {
    projectName,
    docker,
    postgres: connection,
    async freshRepo(repoOptions) {
      assertRunning("create a fresh repo");
      const repo = await freshRepo(repoOptions);
      repos.add(repo);
      return repo;
    },
    async resetDb() {
      assertRunning("reset the database");
      await resetDatabase(connection);
    },
    stop() {
      stopped = true;
      stopping ??= teardown();
      return stopping;
    },
  };
}
