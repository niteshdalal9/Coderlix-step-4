import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  HARNESS_RUN_LABEL_KEY,
  POSTGRES_MAJOR_VERSION,
  connectPostgres,
  describeDatabaseObjects,
  freshRepo,
  listContainerIdsByLabel,
  resetDb,
  runProbeContainer,
  startStack,
  waitForNoContainers,
  type PgClient,
  type Stack,
} from "../../src/index.js";

/**
 * Harness self-test — Implementation Plan Step 03 "Tests required: harness
 * self-test".
 *
 * This file needs a REAL Docker daemon. There is intentionally no
 * `skipIf`, no mock daemon and no fallback: if Docker is unavailable,
 * `startStack()` throws DockerUnavailableError and every test here FAILS.
 * A pass therefore means a real Docker daemon started a real PostgreSQL 16
 * container and a real throwaway container was run.
 */

describe("integration harness against real Docker + real PostgreSQL 16", () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack();
  });

  afterAll(async () => {
    await stack?.stop();
  });

  async function withClient<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
    const client = await connectPostgres(stack.postgres);
    try {
      return await fn(client);
    } finally {
      await client.end().catch(() => {
        // already closed
      });
    }
  }

  it("talks to a real Linux Docker daemon with a supported Compose", () => {
    expect(stack.docker.serverVersion).toMatch(/^\d+\.\d+/);
    expect(stack.docker.serverOs).toBe("linux");
    expect(stack.docker.composeVersion).toMatch(/^v?\d+\.\d+\.\d+/);
  });

  it("actually RUNS a container (nonce in, nonce out; not on the host; removed afterwards)", async () => {
    const probe = await runProbeContainer({ dockerBin: stack.docker.dockerBin });
    // The nonce was generated here, passed into the container's environment
    // and printed back by a process running inside the container.
    expect(probe.echoedNonce).toBe(probe.nonce);
    expect(probe.containerKernel).toBe("Linux");
    // Docker sets a container's hostname to its short ID — not this host's.
    expect(probe.containerHostname).toMatch(/^[0-9a-f]{12}$/);
    expect(probe.containerHostname).not.toBe(hostname());
    // `--rm` => the container is gone (poll: removal is asynchronous).
    await waitForNoContainers(`${HARNESS_RUN_LABEL_KEY}=${probe.runLabelValue}`, {
      dockerBin: stack.docker.dockerBin,
    });
  });

  it("PostgreSQL is reachable and is major version 16", async () => {
    const versionNum = await withClient(async (client) => {
      const result = await client.query<{ server_version_num: string }>(
        "SHOW server_version_num",
      );
      return Number(result.rows[0]?.server_version_num);
    });
    expect(Math.floor(versionNum / 10_000)).toBe(POSTGRES_MAJOR_VERSION);
    expect(stack.postgres.host).toBe("127.0.0.1");
  });

  it("starts from a clean, empty database (no Coderlix schema exists in Step 03)", async () => {
    const objects = await withClient((client) => describeDatabaseObjects(client));
    expect(objects).toEqual([]);
  });

  it("resetDb() deterministically returns the database to empty, and is repeatable", async () => {
    await withClient(async (client) => {
      await client.query("CREATE TABLE harness_probe (id integer PRIMARY KEY, note text)");
      await client.query("INSERT INTO harness_probe VALUES (1, 'x')");
      await client.query("CREATE TYPE harness_mood AS ENUM ('a', 'b')");
      await client.query("CREATE SCHEMA harness_extra");
      await client.query("CREATE TABLE harness_extra.t (id integer)");
      await client.query("CREATE FUNCTION harness_fn() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
      await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
      expect((await describeDatabaseObjects(client)).length).toBeGreaterThan(4);
    });

    await stack.resetDb();

    expect(await withClient((client) => describeDatabaseObjects(client))).toEqual([]);

    // Usable again after reset, and resetting twice is idempotent.
    await withClient(async (client) => {
      await client.query("CREATE TABLE harness_probe (id integer PRIMARY KEY)");
    });
    await resetDb(stack);
    await resetDb(stack);
    expect(await withClient((client) => describeDatabaseObjects(client))).toEqual([]);
  });

  it("resetDb() terminates sessions that are still open on the database", async () => {
    const lingering = await connectPostgres(stack.postgres);
    lingering.on("error", () => {
      // expected: the server terminates this session during the reset
    });
    try {
      await lingering.query("CREATE TABLE harness_lingering (id integer)");
      await stack.resetDb();
      expect(await withClient((client) => describeDatabaseObjects(client))).toEqual([]);
    } finally {
      await lingering.end().catch(() => {
        // connection was terminated by the reset
      });
    }
  });

  it("stack.freshRepo() provides isolated repositories that stop() cleans up", async () => {
    const repo = await stack.freshRepo();
    expect(repo.initialCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(existsSync(repo.workDir)).toBe(true);
    expect(existsSync(repo.originDir)).toBe(true);
    // Deliberately NOT cleaned up here: stack.stop() in afterAll must do it.
  });

  it("standalone freshRepo() works alongside the stack", async () => {
    const repo = await freshRepo();
    try {
      expect((await repo.git(["rev-parse", "HEAD"])).stdout.trim()).toBe(repo.initialCommit);
    } finally {
      await repo.cleanup();
    }
  });
});

describe("harness cleanup", () => {
  it("stop() removes containers, closes the database port, deletes repos, and is idempotent", async () => {
    const stack = await startStack();
    const repo = await stack.freshRepo();
    const projectLabel = `com.docker.compose.project=${stack.projectName}`;
    const dockerBin = stack.docker.dockerBin;

    // Reachable before stop.
    const client = await connectPostgres(stack.postgres);
    await client.end();
    expect((await listContainerIdsByLabel(projectLabel, { dockerBin })).length).toBeGreaterThan(0);
    expect(existsSync(repo.rootDir)).toBe(true);

    await stack.stop();

    expect(await listContainerIdsByLabel(projectLabel, { dockerBin })).toEqual([]);
    expect(existsSync(repo.rootDir)).toBe(false);
    // Nothing is listening any more: a fresh connection must fail fast.
    await expect(connectPostgres(stack.postgres, { timeoutMs: 1_500 })).rejects.toThrow();
    // Idempotent, and the stopped stack refuses further use.
    await stack.stop();
    await expect(stack.resetDb()).rejects.toThrow(/stopped/);
    await expect(stack.freshRepo()).rejects.toThrow(/stopped/);
  });
});
