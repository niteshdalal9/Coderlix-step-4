/**
 * @coderlix/integration-harness — public API (Step 03 — Tooling, CI, test harness).
 *
 * The planned harness API is `startStack()`, `freshRepo()` and `resetDb()`:
 *
 *   const stack = await startStack();        // real Docker + real Postgres 16
 *   await stack.resetDb();                   // (or resetDb(stack))
 *   const repo  = await stack.freshRepo();   // (or freshRepo() standalone)
 *   ...
 *   await stack.stop();
 *
 * TEST INFRASTRUCTURE ONLY. It must never be imported from packages/* or
 * apps/* production source, and it is not an application runtime.
 */
import type { Stack } from "./stack.js";

export { startStack } from "./stack.js";
export type { Stack, StartStackOptions } from "./stack.js";

export { freshRepo } from "./fresh-repo.js";
export type { FreshRepo, FreshRepoOptions } from "./fresh-repo.js";

/** Returns the stack's test database to a pristine, empty state. Same as `stack.resetDb()`. */
export function resetDb(stack: Stack): Promise<void> {
  return stack.resetDb();
}

export {
  assertDockerAvailable,
  DockerUnavailableError,
  isComposeVersionSupported,
  listContainerIdsByLabel,
  parseComposeVersion,
  probeDocker,
  runProbeContainer,
  waitForNoContainers,
} from "./docker.js";
export type {
  DockerFailureStage,
  DockerInfo,
  DockerOptions,
  DockerProbe,
  DockerProbeFailure,
  ProbeContainerResult,
} from "./docker.js";

export {
  assertDatabaseEmpty,
  buildConnection,
  connectPostgres,
  describeDatabaseObjects,
  parseComposePortOutput,
  quoteIdent,
  resetDatabase,
} from "./postgres.js";
export type { ConnectOptions, PgClient, PostgresConnection } from "./postgres.js";

export {
  assertNoSecretLeak,
  captureOutput,
  findSecretLeaks,
  fingerprint,
  plantSecret,
  SecretLeakError,
} from "./secrets-redaction.js";
export type { CapturedOutput, PlantedSecret, SecretLeak, SecretVariant } from "./secrets-redaction.js";

export { CommandFailedError, CommandSpawnError, runChecked, runCommand } from "./command.js";
export type { CommandResult, RunOptions } from "./command.js";

export {
  COMPOSE_FILE,
  HARNESS_LABEL,
  HARNESS_LABEL_KEY,
  HARNESS_RUN_LABEL_KEY,
  POSTGRES_IMAGE,
  POSTGRES_MAJOR_VERSION,
} from "./constants.js";

export {
  FRESH_REPO_DIR_PREFIX,
  HARNESS_GIT_AUTHOR_EMAIL,
  HARNESS_GIT_AUTHOR_NAME,
  HARNESS_GIT_FIXED_DATE,
  isolatedGitEnv,
} from "./fresh-repo.js";
