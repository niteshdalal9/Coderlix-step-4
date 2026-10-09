# @coderlix/web

Project Dashboard, Task Timeline, Diff Viewer, Test Results, Evidence, and Budget panels (§34). No business logic client-side -- all state comes from the API/SSE.

> **Status: Step 02 skeleton only.** This package currently contains no
> business logic -- just a minimal, strictly-typed, buildable placeholder.
> Real implementation lands in **Step 41 — Minimal frontend** of the MVP Implementation
> Plan.

## Allowed workspace dependencies

Per the dependency-boundary policy enforced by `.dependency-cruiser.cjs`
at the repository root (Final Architecture §4, §27):

`@coderlix/shared-types`

Any other cross-package import from this module is a build-time boundary
violation, not a convention.
