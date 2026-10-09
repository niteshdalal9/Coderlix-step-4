/**
 * Deliberate dependency-boundary violation fixture.
 *
 * Required by Step 02 (§5 "Deliberate violation test") of the MVP
 * Implementation Plan: "Create a small isolated dependency-boundary
 * test/fixture proving that a forbidden cross-boundary import fails."
 *
 * This file is intentionally NOT part of `@coderlix/agents`'s production
 * source:
 *   - it lives outside `src/`, in a sibling `boundary-fixture/` directory;
 *   - `packages/agents/tsconfig.json` explicitly excludes
 *     `boundary-fixture`, so `tsc -b` / `pnpm -r build` never compiles it
 *     and it never ships in `dist/`;
 *   - nothing in `src/` references it.
 *
 * Its only purpose is to give the dependency-boundary check
 * (`pnpm run boundaries`, backed by `.dependency-cruiser.cjs` at the repo
 * root) something real to catch: an import from `packages/agents` into
 * `packages/execution`, which Final Architecture §4 forbids outright --
 * "No agent process has a direct dependency edge to Execution Manager,
 * Workspace Manager, or Git Manager -- every path runs through Agent
 * Runtime's mediation or through the Orchestrator directly" -- and which
 * the Step 02 task brief names as the canonical example of a forbidden
 * edge.
 *
 * Expected result: `pnpm run boundaries` reports exactly one violation,
 * pointing at the import below, against the
 * `packages/agents -> forbidden` rule. If it does not fail, the boundary
 * rule is broken and must be fixed -- it must never be weakened (and this
 * file must never be deleted or rewritten to dodge the rule) just to make
 * the check pass.
 */
import { PACKAGE_NAME as FORBIDDEN_EXECUTION_PACKAGE_NAME } from "@coderlix/execution";

export const FORBIDDEN_REFERENCE = FORBIDDEN_EXECUTION_PACKAGE_NAME;
