# @coderlix/agents

Agent Runtime (stateless (Task, Context) -> Result execution) plus one module per MVP agent (Planner, Developer, Tester, Fixer). Mediates every Operation Request against the run's Capability Grant. Has zero direct dependency edge to the Execution Manager, Workspace Manager, or Git Manager (§4) -- every path runs through Agent Runtime's mediation or the Orchestrator directly.

> **Status: Step 02 skeleton only.** This package currently contains no
> business logic -- just a minimal, strictly-typed, buildable placeholder.
> Real implementation lands in **Step 27/28/29, 31-34 — Agent Runtime / mediation / handoff envelopes / MVP agents** of the MVP Implementation
> Plan.

## Allowed workspace dependencies

Per the dependency-boundary policy enforced by `.dependency-cruiser.cjs`
at the repository root (Final Architecture §4, §27):

`@coderlix/shared-types`, `@coderlix/providers`, `@coderlix/budget`, `@coderlix/knowledge`

Any other cross-package import from this module is a build-time boundary
violation, not a convention.
