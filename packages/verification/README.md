# @coderlix/verification

Task Phase Machine, Verification Authorization issuance, the deterministic verification runner, and the Release Gate — the sole writer of VERIFIED -> RELEASED (§6, §13, §30). Never imports the provider/model-gateway package: no LLM has release authority.

> **Status: Step 02 skeleton only.** This package currently contains no
> business logic -- just a minimal, strictly-typed, buildable placeholder.
> Real implementation lands in **Step 07, 18/19/20 — Phase Machine / Verification Authorization / runner / Release Gate** of the MVP Implementation
> Plan.

## Allowed workspace dependencies

Per the dependency-boundary policy enforced by `.dependency-cruiser.cjs`
at the repository root (Final Architecture §4, §27):

`@coderlix/shared-types`, `@coderlix/db`, `@coderlix/execution`, `@coderlix/evidence`, `@coderlix/git-service`, `@coderlix/budget`

Any other cross-package import from this module is a build-time boundary
violation, not a convention.
