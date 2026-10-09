# @coderlix/providers

Model Provider Gateway: capability-alias routing, provider adapters, health tracking, usage/cost tracking. Consults the Budget Manager before every metered call.

> **Status: Step 02 skeleton only.** This package currently contains no
> business logic -- just a minimal, strictly-typed, buildable placeholder.
> Real implementation lands in **Step 21/22/23 — Provider Gateway / adapter contract / model routing** of the MVP Implementation
> Plan.

## Allowed workspace dependencies

Per the dependency-boundary policy enforced by `.dependency-cruiser.cjs`
at the repository root (Final Architecture §4, §27):

`@coderlix/shared-types`, `@coderlix/db`, `@coderlix/budget`

Any other cross-package import from this module is a build-time boundary
violation, not a convention.
