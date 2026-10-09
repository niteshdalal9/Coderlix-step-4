# @coderlix/git-service

Checkpoints, diffs, rollback, merge, and Git/Postgres reconciliation (§8, §11). Directs every git invocation through the Execution Manager; never shells out itself.

> **Status: Step 02 skeleton only.** This package currently contains no
> business logic -- just a minimal, strictly-typed, buildable placeholder.
> Real implementation lands in **Step 11/12 — Git/Checkpoint Manager / reconciliation** of the MVP Implementation
> Plan.

## Allowed workspace dependencies

Per the dependency-boundary policy enforced by `.dependency-cruiser.cjs`
at the repository root (Final Architecture §4, §27):

`@coderlix/shared-types`, `@coderlix/db`, `@coderlix/execution`, `@coderlix/evidence`, `@coderlix/knowledge`

Any other cross-package import from this module is a build-time boundary
violation, not a convention.
