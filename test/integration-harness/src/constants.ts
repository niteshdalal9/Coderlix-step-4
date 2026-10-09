import { fileURLToPath } from "node:url";

/**
 * Shared constants for the integration harness (Step 03).
 *
 * TEST INFRASTRUCTURE ONLY. Nothing in packages/* or apps/* production
 * source may import this package.
 */

/** PostgreSQL 16 is mandated by the architecture (Final Architecture §3/§37). */
export const POSTGRES_IMAGE = "postgres:16";
export const POSTGRES_MAJOR_VERSION = 16;

/**
 * Throwaway, test-only credentials for a tmpfs-backed Postgres container
 * that is published on loopback only. These mirror the defaults in
 * docker-compose.integration.yml (parity is asserted by a unit test).
 * They are NOT secrets and must never be reused anywhere else.
 */
export const POSTGRES_USER = "coderlix_it";
export const POSTGRES_PASSWORD = "coderlix_it_only";
export const POSTGRES_DB = "coderlix_it";

/** Env var names the compose file reads (single source of truth: this file). */
export const COMPOSE_ENV = {
  user: "CODERLIX_IT_POSTGRES_USER",
  password: "CODERLIX_IT_POSTGRES_PASSWORD",
  database: "CODERLIX_IT_POSTGRES_DB",
} as const;

/** Label put on every container the harness starts, so leftovers are findable. */
export const HARNESS_LABEL_KEY = "coderlix.test-harness";
export const HARNESS_LABEL = `${HARNESS_LABEL_KEY}=1`;
export const HARNESS_RUN_LABEL_KEY = "coderlix.test-harness.run";

/**
 * Image used by the Docker "does a container really run" probe. Defaults to
 * the Postgres image the stack already needs, so the probe adds no extra
 * image pull and no extra moving part. It is NOT the sandbox image (that is
 * Step 14, infra/docker).
 */
export const PROBE_IMAGE = POSTGRES_IMAGE;

/** `docker compose up --wait-timeout` needs Compose >= 2.17.0. */
export const MIN_COMPOSE_VERSION = [2, 17, 0] as const;

export const COMPOSE_FILE = fileURLToPath(
  new URL("../docker-compose.integration.yml", import.meta.url),
);
