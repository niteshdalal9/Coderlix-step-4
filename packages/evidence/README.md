# @coderlix/evidence

Authoritative evidence storage, the promotion gate, the ten-point provenance chain validator, and checkpoint-triggered invalidation (§9, §10). Depends on nothing else in this repository.

> **Status: Step 02 skeleton only.** This package currently contains no
> business logic -- just a minimal, strictly-typed, buildable placeholder.
> Real implementation lands in **Step 15/16/17 — Evidence Store / provenance chain / invalidation** of the MVP Implementation
> Plan.

## Allowed workspace dependencies

Per the dependency-boundary policy enforced by `.dependency-cruiser.cjs`
at the repository root (Final Architecture §4, §27):

`@coderlix/shared-types`, `@coderlix/db`

Any other cross-package import from this module is a build-time boundary
violation, not a convention.
