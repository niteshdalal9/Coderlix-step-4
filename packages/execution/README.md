# @coderlix/execution

The only component in the system that runs a command, starts a process, or touches a file, for any caller (Final Architecture §5, §27). Depends on nothing else in this repository.

> **Status: Step 02 skeleton only.** This package currently contains no
> business logic -- just a minimal, strictly-typed, buildable placeholder.
> Real implementation lands in **Step 13 — Execution Manager** of the MVP Implementation
> Plan.

## Allowed workspace dependencies

Per the dependency-boundary policy enforced by `.dependency-cruiser.cjs`
at the repository root (Final Architecture §4, §27):

`@coderlix/shared-types`, `@coderlix/db`

Any other cross-package import from this module is a build-time boundary
violation, not a convention.
