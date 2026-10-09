import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPOSE_ENV,
  COMPOSE_FILE,
  HARNESS_LABEL_KEY,
  POSTGRES_DB,
  POSTGRES_IMAGE,
  POSTGRES_MAJOR_VERSION,
  POSTGRES_PASSWORD,
  POSTGRES_USER,
} from "../../src/constants.js";

// Static invariants of the Docker Compose fixture. These need no Docker, so
// they run everywhere (including environments without a daemon) and stop the
// fixture from silently drifting away from the architecture's rules.
const raw = readFileSync(COMPOSE_FILE, "utf8");
// Comments explain the rules (and mention docker.sock etc.); only assert on live config.
const config = raw
  .split("\n")
  .map((line) => line.replace(/#.*$/, ""))
  .join("\n");

function composeDefault(envName: string): string | undefined {
  return new RegExp(`\\$\\{${envName}:-([^}]+)\\}`).exec(config)?.[1];
}

describe("docker-compose.integration.yml fixture", () => {
  it("exists next to the harness", () => {
    expect(existsSync(COMPOSE_FILE)).toBe(true);
  });

  it("uses PostgreSQL 16 (architecture requirement)", () => {
    expect(POSTGRES_IMAGE).toBe(`postgres:${String(POSTGRES_MAJOR_VERSION)}`);
    expect(POSTGRES_MAJOR_VERSION).toBe(16);
    expect(config).toMatch(new RegExp(`^\\s*image:\\s*${POSTGRES_IMAGE}\\s*$`, "m"));
  });

  it("defaults match the harness constants (no drift)", () => {
    expect(composeDefault(COMPOSE_ENV.user)).toBe(POSTGRES_USER);
    expect(composeDefault(COMPOSE_ENV.password)).toBe(POSTGRES_PASSWORD);
    expect(composeDefault(COMPOSE_ENV.database)).toBe(POSTGRES_DB);
  });

  it("publishes Postgres on loopback only, on an ephemeral host port", () => {
    const portLines = config
      .split("\n")
      .filter((line) => /^\s*-\s*"?[\d.:[\]]+"?\s*$/.test(line) && line.includes("5432"));
    expect(portLines).toHaveLength(1);
    expect(portLines[0]).toContain('"127.0.0.1::5432"');
    expect(config).not.toContain("0.0.0.0");
  });

  it("never exposes the Docker socket or host paths, and is not privileged (§26.1)", () => {
    expect(config).not.toContain("docker.sock");
    expect(config).not.toMatch(/^\s*privileged\s*:/m);
    expect(config).not.toMatch(/network_mode\s*:\s*"?host"?/);
    expect(config).not.toMatch(/^\s*volumes\s*:/m);
    expect(config).not.toMatch(/^\s*(pid|ipc)\s*:\s*"?host"?/m);
    expect(config).not.toMatch(/^\s*cap_add\s*:/m);
  });

  it("keeps the data directory on tmpfs so every run starts empty", () => {
    expect(config).toMatch(/^\s*tmpfs\s*:\s*$/m);
    expect(config).toContain("/var/lib/postgresql/data");
  });

  it("labels its containers so leftovers are discoverable", () => {
    expect(config).toContain(`${HARNESS_LABEL_KEY}: "1"`);
  });

  it("health-checks over TCP so the init-phase temporary server cannot report healthy", () => {
    expect(config).toContain("pg_isready -h 127.0.0.1");
  });
});
