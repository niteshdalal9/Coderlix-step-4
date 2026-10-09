# @coderlix/workspace

Workspace provisioning, isolation, revision tracking, cleanup, and the atomic mutex lock (§7, §7.1). Directs filesystem operations via the Execution Manager and coordinates with the Git Manager; never shells out itself.

> **Status: Step 02 skeleton only.** This package currently contains no
> business logic -- just a minimal, strictly-typed, buildable placeholder.
> Real implementation lands in **Step 09/10 — Workspace Manager / mutex** of the MVP Implementation
> Plan.

## Allowed workspace dependencies

Per the dependency-boundary policy enforced by `.dependency-cruiser.cjs`
at the repository root (Final Architecture §4, §27):

`@coderlix/shared-types`, `@coderlix/db`, `@coderlix/execution`, `@coderlix/git-service`

Any other cross-package import from this module is a build-time boundary
violation, not a convention.
