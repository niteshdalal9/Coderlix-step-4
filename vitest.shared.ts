/**
 * Shared Vitest configuration factories (Step 03 — Tooling, CI, test harness).
 *
 * Every package/app has a tiny `vitest.config.ts` that calls
 * `createUnitConfig()`, so there is exactly ONE definition of "how a
 * Coderlix unit test run behaves". A package that later needs integration
 * tests adds a `vitest.integration.config.ts` that calls
 * `createIntegrationConfig()` and a `test:integration` script.
 *
 * Importing this file: every `vitest*.config.ts` imports it as
 * `"../../vitest.shared.ts"` — WITH the extension — and the root
 * package.json declares `"type": "module"`. Both are required so the
 * config also loads under Vite's `configLoader: native` (plain Node ESM:
 * exact file names, and ESM syntax only in files Node treats as ESM).
 * Without them Vite prints "Your Vite config uses features that are
 * unsupported by configLoader: native". tsconfig.test.json enables
 * `allowImportingTsExtensions` so TypeScript accepts the extension.
 *
 * Test-file naming convention (this is what separates the two suites):
 *   - `test/**\/*.test.ts`              -> UNIT: hermetic, no Docker, no
 *                                          Postgres, no network.
 *   - `test/**\/*.integration.test.ts`  -> INTEGRATION: real Postgres 16,
 *                                          real Docker, real git. These
 *                                          FAIL (never skip) when Docker
 *                                          is unavailable.
 *
 * Determinism choices (all deliberate):
 *   - no retries (a flaky pass is a hidden failure);
 *   - no shuffling, files run in a stable order;
 *   - `passWithNoTests: false` — a package whose tests silently vanished
 *     must FAIL, not pass (the same lesson as the Step 02 "0 modules
 *     cruised" false-green);
 *   - integration files never run in parallel with each other.
 *
 * Coverage: provider `v8`, reports generated per package into
 * `<package>/coverage/` (git-ignored). NO thresholds are enforced in
 * Step 03: there is no business logic to measure yet, and the plan's
 * gates (§15: 100% branch on state machines/result rules/fencing/budget
 * ledger/provenance chain, overall >= 80% line) belong to the steps that
 * introduce that code. Vitest 4 requires an explicit `coverage.include`.
 */
import { defineConfig } from "vitest/config";

const ALWAYS_EXCLUDE = ["**/node_modules/**", "**/dist/**", "**/coverage/**"];

export function createUnitConfig() {
  return defineConfig({
    test: {
      include: ["test/**/*.test.ts"],
      exclude: [...ALWAYS_EXCLUDE, "test/**/*.integration.test.ts"],
      environment: "node",
      passWithNoTests: false,
      retry: 0,
      sequence: { shuffle: false },
      coverage: {
        provider: "v8",
        include: ["src/**/*.ts"],
        exclude: ["src/**/*.d.ts"],
        reportsDirectory: "./coverage",
        reporter: ["text", "json-summary", "lcov"],
        clean: true,
      },
    },
  });
}

export function createIntegrationConfig() {
  return defineConfig({
    test: {
      include: ["test/**/*.integration.test.ts"],
      exclude: ALWAYS_EXCLUDE,
      environment: "node",
      passWithNoTests: false,
      retry: 0,
      fileParallelism: false,
      sequence: { shuffle: false },
      // First run may need to pull the Postgres 16 image.
      testTimeout: 180_000,
      hookTimeout: 240_000,
    },
  });
}
