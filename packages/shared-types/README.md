# @coderlix/shared-types

Zod schemas + TS types for every cross-boundary structure (Operation Request, Execution Record, Verification Authorization, Evidence row, Agent Run envelopes, provider/budget types, state/phase/result enums). Depended on by nearly everything; depends on nothing in this repository (third-party: `zod` only).

> **Status: Step 04 — contracts only.** Zod schemas, inferred TS types and
> enum arrays. No behaviour: no state machines, fencing, evidence promotion,
> budget arithmetic or provider calls.

## Contents

| File | Contracts (Architecture §) |
|---|---|
| `state.ts` | all enums as single `as const` arrays + `ENUM_REGISTRY` (DB parity source) |
| `operation.ts` | Operation Request (§5) |
| `execution.ts` | Execution Record (§5) |
| `verification.ts` | Verification Authorization (§6) |
| `evidence.ts` | Evidence row (§9/§10), `schema_version` |
| `envelope.ts` | AgentRunRequest / AgentRunResult (§16), `schema_version` |
| `provider.ts` | GenerationRequest + normalized provider types (§18/§19) |
| `budget.ts` | Budget, BudgetReservation (§22/§23) |
| `common.ts` | id / revision / timestamp primitives |

## Conventions

- Every object schema is `.strict()`: unknown keys fail parsing.
- "May be absent" = required key with `null`, matching nullable DB columns.
- `schema_version` is a literal: an unknown version fails parsing.
- Enum values keep the exact casing of the spec (it is not uniform).
- A successful parse proves a payload is well-formed, never that it is
  trustworthy (`authoritative: true`, `revision`, fencing fields are claims
  until the owning component checks them against durable state).
- Time values are ISO-8601 with offset; durations are milliseconds.

## Allowed workspace dependencies

Per the dependency-boundary policy enforced by `.dependency-cruiser.cjs`
at the repository root (Final Architecture §4, §27):

(none -- this package depends on nothing else in this repository)

Any other cross-package import from this module is a build-time boundary
violation, not a convention.
