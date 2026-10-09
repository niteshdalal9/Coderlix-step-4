# @coderlix/budget

Atomic reserve/settle budget ledger and circuit breaker (§22, §23). Depends on nothing else in this repository.

> **Status: Step 02 skeleton only.** This package currently contains no
> business logic -- just a minimal, strictly-typed, buildable placeholder.
> Real implementation lands in **Step 24/25 — Budget Manager / atomic reservations** of the MVP Implementation
> Plan.

## Allowed workspace dependencies

Per the dependency-boundary policy enforced by `.dependency-cruiser.cjs`
at the repository root (Final Architecture §4, §27):

`@coderlix/shared-types`, `@coderlix/db`

Any other cross-package import from this module is a build-time boundary
violation, not a convention.
