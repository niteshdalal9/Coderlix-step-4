# @coderlix/knowledge

Revision-aware project knowledge store with the authority hierarchy, staleness marking, and context compaction (§20, §29). Depends on nothing else in this repository.

> **Status: Step 02 skeleton only.** This package currently contains no
> business logic -- just a minimal, strictly-typed, buildable placeholder.
> Real implementation lands in **Step 30 — Context/Knowledge Service** of the MVP Implementation
> Plan.

## Allowed workspace dependencies

Per the dependency-boundary policy enforced by `.dependency-cruiser.cjs`
at the repository root (Final Architecture §4, §27):

`@coderlix/shared-types`, `@coderlix/db`

Any other cross-package import from this module is a build-time boundary
violation, not a convention.
