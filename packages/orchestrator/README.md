# @coderlix/orchestrator

Orchestrator Service: classification, risk, DAG, the Task State Machine, Agent Run dispatch, Capability Grant issuance, Verification Authorization issuance, workspace lock acquisition, and budget reservation triggers (§4, §12, §14, §17). The only caller permitted to invoke Agent Runtime, Verification Service, Workspace Manager, Git Manager, and Budget Manager directly.

> **Status: Step 02 skeleton only.** This package currently contains no
> business logic -- just a minimal, strictly-typed, buildable placeholder.
> Real implementation lands in **Step 06, 08, 26, 35-38 — Task State Machine / Agent Run lifecycle / retry-escalation / DAG / recovery / cancellation / fencing** of the MVP Implementation
> Plan.

## Allowed workspace dependencies

Per the dependency-boundary policy enforced by `.dependency-cruiser.cjs`
at the repository root (Final Architecture §4, §27):

`@coderlix/shared-types`, `@coderlix/db`, `@coderlix/agents`, `@coderlix/verification`, `@coderlix/workspace`, `@coderlix/git-service`, `@coderlix/budget`, `@coderlix/execution`, `@coderlix/evidence`

Any other cross-package import from this module is a build-time boundary
violation, not a convention.
