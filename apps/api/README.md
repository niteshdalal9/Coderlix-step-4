# @coderlix/api

HTTP/SSE gateway: routing, auth, validation, rate limiting (§4 API Layer). Invokes the Orchestrator Service only -- it does not reach into any other package directly.

> **Status: Step 02 skeleton only.** This package currently contains no
> business logic -- just a minimal, strictly-typed, buildable placeholder.
> Real implementation lands in **Step 40/42 — REST API + SSE / authentication** of the MVP Implementation
> Plan.

## Allowed workspace dependencies

Per the dependency-boundary policy enforced by `.dependency-cruiser.cjs`
at the repository root (Final Architecture §4, §27):

`@coderlix/shared-types`, `@coderlix/db`, `@coderlix/orchestrator`

Any other cross-package import from this module is a build-time boundary
violation, not a convention.
