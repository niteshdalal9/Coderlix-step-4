# Coderlix

Coderlix is a **modular monolith** that turns a user request into a
verified code change using specialized agents plus deterministic
infrastructure: agents reason and request operations, deterministic
infrastructure performs those operations and produces evidence, an
Orchestrator controls task/state transitions, and a deterministic
Release Gate is the sole authority that can mark a change released.
Status only ever advances on evidence, never on a model's say-so.

> **Current implementation status: monorepo skeleton only.**
> This repository currently contains **no application code** — no
> database schema, no agents, no orchestrator, no Execution Manager,
> no API, no frontend, and no business logic of any kind. Through
> `Step 02 — Monorepo/Package Structure`, it is the empty, buildable
> `apps/`/`packages/`/`infra/` skeleton (Final Architecture §36) with
> dependency-boundary enforcement wired up, that every later
> implementation step lands in. See
> [Implementation status](#implementation-status) below for exactly
> what does and does not exist yet.

---

## Prerequisites

- **Node.js** `>=22.12.0`. Node.js 24.x (Active LTS) is the recommended
  version for new development environments; Node.js 22.x (Maintenance
  LTS, supported through April 2027) is also fully supported and is
  what this bootstrap was verified against.
- **pnpm** `>=9.0.0` — this repository pins pnpm via the
  [`packageManager`](./package.json) field, so `corepack enable`
  followed by running any `pnpm` command will fetch the exact pinned
  version automatically.
- **Docker** with Docker Compose v2 (`docker compose ...`), for the
  local Postgres development database.

## Install

```bash
corepack enable          # one-time, lets corepack manage the pnpm version below
pnpm install
```

This installs the repository's root-level tooling dependencies plus the
12 `packages/*` and 2 `apps/*` workspace members (each an empty
skeleton — see [Implementation status](#implementation-status)).

## Build / test / lint / boundaries

```bash
pnpm run build                # tsc -b for every workspace package
pnpm run typecheck:all        # per-package source typecheck + tests/configs/harness typecheck
pnpm run lint                 # ESLint (core + typescript-eslint recommended), --max-warnings=0
pnpm run boundaries           # dependency-cruiser: rejects forbidden cross-package imports
pnpm run boundaries:self-test # proves the boundary check itself can fail (Step 02)
pnpm run boundaries:policy    # guards the production rule file + fixture wiring against silent weakening

pnpm run test:unit            # hermetic unit tests: no Docker, no Postgres, no network
pnpm run test:integration     # REAL Docker + REAL PostgreSQL 16 + real git (needs a Docker daemon)
pnpm run test:all             # unit, then integration   (`pnpm test` is the same)
pnpm run coverage             # per-package v8 coverage reports in <package>/coverage/
                              # (`pnpm run test:coverage` is an alias for the same command)
```

`pnpm -r test` (the raw per-package form) runs the same hermetic unit
suites as `pnpm run test:unit`.

**Docker is required for `test:integration`, and that is deliberate.**
Integration tests are never skipped and never run against a mock Docker:
without a usable Linux Docker daemon they **fail** with a
`DockerUnavailableError` that says why. On a machine without Docker
(for example Android → Termux → Ubuntu PRoot) run the unit suites and
let CI (`.github/workflows/ci.yml`, real Docker-capable Linux runners)
run the integration suite. See
[`test/integration-harness/README.md`](test/integration-harness/README.md).

**Commit `pnpm-lock.yaml`.** CI installs with `--frozen-lockfile` and
refuses to run without a committed lockfile. After the first
`pnpm install` that includes the Step 03 dependencies, commit the
generated `pnpm-lock.yaml`. If you have no machine that can run the pinned
pnpm, run the manual **Generate lockfile** workflow
(`.github/workflows/generate-lockfile.yml`): it performs the real install on
a runner and uploads `pnpm-lock.yaml` as an artifact for you to commit (it
never commits or pushes by itself).

Every package currently builds a single placeholder export — there is no
business logic yet — and carries one minimal skeleton smoke test that
proves the unit-test pipeline really executes there (real tests arrive
with real code). `pnpm run boundaries` mechanically enforces the Final
Architecture §4 module-boundary table (e.g. `packages/agents` cannot
import `packages/execution`); see `.dependency-cruiser.cjs` for the full
allow-list and
`packages/agents/boundary-fixture/forbidden-import.fixture.ts` for a
deliberate violation the check is expected to catch.

Test-file convention: `test/**/*.test.ts` is a unit test;
`test/**/*.integration.test.ts` is an integration test (see
`vitest.shared.ts`). No coverage thresholds are enforced yet — there is
no business logic to measure; the plan's gates start with the first real
code.

## Development database

Coderlix requires PostgreSQL 16 in development. Redis is optional at
MVP (an in-process queue/cache is the default) and is **off by
default**.

```bash
cp .env.example .env        # fill in local values; .env is git-ignored
docker compose -f docker-compose.dev.yml up -d postgres
```

To additionally start Redis (only if you are working on something that
needs it):

```bash
docker compose -f docker-compose.dev.yml --profile redis up -d redis
```

Stop everything with:

```bash
docker compose -f docker-compose.dev.yml down
```

## Environment configuration

Copy [`.env.example`](./.env.example) to `.env` and fill in local
values. `.env.example` documents every variable name Coderlix will
eventually read (Postgres connection, optional Redis connection, model
provider auth variable *names* — never keys, sandbox limits, and budget
limits). `.env` is git-ignored; **never commit real credentials**.

## Repository layout (today)

```
coderlix/
  package.json              # pnpm workspace root
  pnpm-workspace.yaml       # workspace globs (apps/*, packages/*, test/*), test-tool version catalog
  tsconfig.base.json        # strict TypeScript base config, extended by every package
  tsconfig.paths.json       # @coderlix/* resolution map, consulted only by dependency-cruiser
  .dependency-cruiser.cjs   # module-boundary policy (Final Architecture §4) — `pnpm run boundaries`
  eslint.config.mjs         # lint config — `pnpm run lint`
  vitest.shared.ts          # shared Vitest config factories (unit / integration)
  tsconfig.test.json        # type-checks tests, vitest configs and the harness — `pnpm run typecheck:tests`
  .github/workflows/ci.yml  # CI: static, unit, coverage, integration (real Docker)
  docker-compose.dev.yml    # local Postgres 16 (+ optional Redis) for development
  .env.example               # variable names/placeholders only, no secrets
  .editorconfig
  .gitignore
  README.md
  apps/
    web/                    # React frontend — empty skeleton (Step 41)
    api/                    # API gateway + orchestration entrypoint — empty skeleton (Step 40/42)
  packages/
    orchestrator/           # classifier, risk engine, Task State Machine, Agent Run lifecycle, fencing
    agents/                 # one module per agent, shared base contract (+ boundary-fixture/, see below)
    providers/               # model provider adapters + capability-alias router
    execution/                # Execution Manager — sole process/file boundary
    workspace/                 # Workspace Manager + mutex
    git-service/                # Git/Checkpoint Manager + reconciliation
    evidence/                    # Evidence Store, provenance chain, invalidation hook
    verification/                 # Verification Service + Release Gate + result rules
    budget/                        # Budget Manager + reservation ledger
    knowledge/                      # Context/Knowledge Service, revision-aware, compaction
    shared-types/                    # Task/Result/Evidence/envelope schemas
    db/                                # schema + migrations
  test/
    integration-harness/    # startStack()/freshRepo()/resetDb(), secrets-redaction helper — test infra only
  infra/
    docker/                 # Docker sandbox baseline — empty, Step 14
    migrations/              # deployment-facing migration artifacts — empty, Step 05
```

Every package under `apps/` and `packages/` is, as of Step 03, an empty,
strictly-typed, independently buildable skeleton: one placeholder
`src/index.ts` export, a `package.json`, a `tsconfig.json`, a two-line
`vitest.config.ts`, and one skeleton smoke test. See each
package's own `README.md` for its responsibility and allowed workspace
dependencies.

## Implementation status

This repository tracks the Coderlix MVP Implementation Plan, which
sequences the Final Architecture Specification into 43 numbered steps
across milestones M0–M8. **Only Steps 01–04 are implemented** (Repository
Bootstrap, Monorepo/Package Structure, Tooling/CI/test harness, and
Shared types). Step 04 added the Zod schemas/types and enums in
`packages/shared-types` — contracts only, no behaviour. Step 03 added lint, the Vitest unit/integration/coverage
setup, the GitHub Actions pipeline, and `test/integration-harness/` (real
PostgreSQL 16 + real Docker + throwaway git repositories + a
secrets-redaction test helper) — test infrastructure only, no product
code. Step 02
materialized the `apps/`/`packages/`/`infra/` tree from Final
Architecture §36 as empty, buildable package skeletons, and added
mechanical dependency-boundary enforcement (`.dependency-cruiser.cjs`,
`pnpm run boundaries`) encoding the §4 Module Boundaries table — e.g.
`packages/agents` cannot import `packages/execution`, `packages/workspace`,
or `packages/git-service` directly, and `packages/verification` cannot
import `packages/providers` (no LLM has release authority). None of the
following exist in this repository yet, and nothing here should be
assumed to work until its corresponding step lands:

- Database schema, migrations, or any persistence layer
- Task State Machine, Task Phase Machine, or Agent Run lifecycle
- Workspace Manager, workspace mutex, Git/Checkpoint Manager, or
  reconciliation protocol
- Execution Manager or the Docker sandbox security baseline
- Evidence Store, provenance chain, or invalidation sweep (only the
  Evidence row *schema* exists)
- Verification Authorization issuance/checking, deterministic
  verification runner, or Release Gate (only the authorization *schema*)
- Model Provider Gateway, adapters, or Budget Manager (only the
  normalized provider and budget *types*)
- Agent Runtime, Operation Request mediation, or any agent
  (Planner, Developer, Tester, Fixer, etc.)
- Orchestrator DAG, recovery/resume, cancellation handshake, or
  late-result fencing
- SSE/event system, frontend, or authentication
- Any business-logic test: the only tests today are the per-package
  skeleton smoke tests, the harness's own self-tests, and the Step 04
  schema/enum contract tests in `packages/shared-types`

## Contributing / next steps

See `Coderlix_MVP_Implementation_Plan.md` for the full step sequence.
Steps 01–04 are done. In Implementation Plan v1.1 the next step is
**Step 05 — Schema + migrations** (`packages/db`, `infra/migrations`),
which also owns the enum-parity test against `ENUM_REGISTRY` from
`@coderlix/shared-types`.
