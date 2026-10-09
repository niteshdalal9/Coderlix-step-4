# `@coderlix/integration-harness`

Integration-test infrastructure for Coderlix (Implementation Plan **Step 03 —
Tooling, CI, test harness**).

> **Test infrastructure only.** This is not an application runtime, not the
> Git Service, not the Execution Manager and not a secrets manager. Nothing in
> `packages/*` or `apps/*` production source may import it, and it contains no
> Coderlix business logic and **no Coderlix database schema** (that begins in
> a later step).

## What it provides

```ts
import { startStack, freshRepo, resetDb } from "@coderlix/integration-harness";

const stack = await startStack();       // real Docker daemon + real PostgreSQL 16
stack.postgres.connectionString;        // postgresql://…@127.0.0.1:<ephemeral port>/coderlix_it
await stack.resetDb();                  // pristine empty database (or: resetDb(stack))
const repo = await stack.freshRepo();   // throwaway git repo (or: freshRepo() standalone)
await stack.stop();                     // removes repos, containers, network; idempotent
```

| API | What it does |
| --- | --- |
| `startStack()` | Verifies a **real** Linux Docker daemon + Compose, then `docker compose up --wait` of `docker-compose.integration.yml` under a unique project name. Returns connection info once the published port has been proven to speak PostgreSQL. Throws `DockerUnavailableError` if Docker is not usable. |
| `stack.resetDb()` / `resetDb(stack)` | `DROP DATABASE … WITH (FORCE)` + `CREATE DATABASE … TEMPLATE template0`, then **verifies** emptiness (no relations, extra schemas, extensions, user types or functions). Sessions open on the database are terminated; recreate any pool afterwards. |
| `freshRepo(options?)` | A bare `origin.git` (the "server", reached over `file://`) plus a working clone with one pushed initial commit. See below. |
| `stack.stop()` | Tears everything down and **fails if anything is left behind**. |
| `runProbeContainer()` | Actually runs a throwaway container (random nonce in → nonce out, container hostname ≠ host). Used by the self-test to prove Docker really ran something. |
| `plantSecret`, `assertNoSecretLeak`, `findSecretLeaks`, `captureOutput` | Secrets-redaction **test helper**: plant a canary, run code, assert it never appears in output (raw, JSON-escaped, URL-encoded, base64/base64url at any alignment, hex). Failure messages never contain the secret. |

## Guarantees

- **No mock Docker, no skip path.** If Docker is unavailable the integration
  tests *fail* with a message saying why. A Docker-dependent test can only
  pass if a real Docker daemon did the work.
- **Deterministic.** Per-run unique Compose project; Postgres data on tmpfs
  (every run starts from an empty cluster); no retries, no shuffling, files run
  serially; `freshRepo()` pins identity, dates and branch so identical options
  give the identical commit SHA. The unit tests prove this without any
  hard-coded SHA and independently of git's output formatting: they rebuild
  the expected blob/tree/commit objects in Node from the pinned inputs, compare
  them with the raw commit object git stored (`git cat-file commit HEAD`), and
  check that repos created seconds apart, in parallel and under different `TZ`
  values all get that same SHA.
- **Isolated.** Postgres is published on `127.0.0.1` only, on a Docker-chosen
  port. `freshRepo()` lives in the OS temp dir, scrubs every inherited `GIT_*`
  variable, ignores global/system git config, and uses an empty template, so
  your real repository and git configuration are never touched.
- **No Docker socket exposure.** Nothing is mounted into any container — in
  particular never the Docker socket (Final Architecture §26.1). The test
  *process* talks to the host daemon through the `docker` CLI; no container is
  given that access. (Asserted by `test/unit/compose-fixture.test.ts`.)
- **No production credentials.** The Postgres credentials are throwaway,
  test-only constants for a tmpfs container bound to loopback.

### Documented deviation: "throwaway git repo server" → local bare repository

**What the plan says.** Implementation Plan v1.1, Step 03, lists the fixture as
"docker-compose fixture: Postgres + a throwaway git repo server + Docker socket
for sandbox tests". The contract it names is `freshRepo()`; the technology
table says only "real git repos"; the acceptance criterion is "one command runs
unit; one runs integration with real Postgres/Docker".

**What this harness does instead.** `freshRepo()` creates a **bare repository
on the local filesystem** (`origin.git`) that acts as the remote, plus a working
clone with one pushed commit. Consumers talk to it with real `git` over a
`file://` URL (`origin.git` is reached through git's own `upload-pack` /
`receive-pack` subprocesses). It is **not** a network git server and **not** a
Compose service.

**Why this is acceptable at Step 03 (decision B — a test-harness
simplification, not an architectural requirement).** Checked against the Final
Coderlix Architecture:

- The architecture contains **no** git server, remote, push/fetch workflow,
  network transport (HTTP/SSH/`git://`), git credential, or hosting-provider
  integration — at MVP or as a deferred Phase 2/3 item.
- Git is a **local** `git` CLI run through the Execution Manager (§8, §27),
  with one worktree/branch per task and a local squash-merge to the target
  branch on a Release Gate decision (§8). The only repository-sourcing
  requirement is "clone/checkout the project repository at a specified base
  revision" (§7, §12.1) — a bare origin satisfies that exactly.
- Sandbox containers are network-deny-by-default with enforced egress (§26,
  §26.1); a networked git server would not be reachable from them regardless.
- The planned tests that use git need *real git repositories*, not a server:
  checkpoint/diff/rollback, the §8.1 dirty-tree matrix, and the "malicious
  `pre-commit` hook never fires" test (Plan Steps 09, 11, 12; failure-injection
  scenarios). None of the failure-injection scenarios requires a git server,
  a clone-source outage, or a transport failure. A `CLONE_FAILED`-style failure
  can be injected deterministically by deleting or corrupting the bare origin.

**Verified behavior** (real git, locally): cloning `originUrl` yields `HEAD ==
initialCommit`; checking out an explicit base revision works; cloning after the
origin is removed exits non-zero (128).

**What is not covered, by design:** network transport, authentication, and
network-level failure modes (timeouts, unreachable host). The architecture does
not specify any of them. **Revisit** if a later step introduces remote-based
project import or a hosting-provider integration: add a git-serving service to
`docker-compose.integration.yml` then, and keep `freshRepo()`'s API unchanged.

The Git Service itself (Plan Step 11) is deliberately not implemented here.

## Running

Requirements: Node ≥ 22.12, pnpm 11.28.3 (pinned), `git`. Integration also
needs a Docker daemon (Linux) with Docker Compose ≥ 2.17 and permission to use
it.

```bash
pnpm --filter @coderlix/integration-harness test              # unit (no Docker)
pnpm --filter @coderlix/integration-harness test:integration  # needs Docker
# or, from the repo root:
pnpm run test:unit
pnpm run test:integration
```

- `test/unit/**` — hermetic: real `git`, real child processes, the compose
  fixture's static invariants, the secrets helper, and the *Docker-unavailable
  failure path* (using a Docker CLI path that genuinely does not exist).
  These run anywhere, including Termux.
- `test/integration/harness.integration.test.ts` — the harness **self-test**:
  daemon is real, a container is really run, Postgres is reachable and is
  v16, the database starts empty, `resetDb()` empties it (tables, schemas,
  enum types, functions, extensions; also with a live session open), repos are
  created and cleaned up, and `stop()` leaves no container, no listening port
  and no repo behind.

If a run is hard-killed (SIGKILL) before cleanup, find and remove leftovers:

```bash
docker ps -a --filter label=coderlix.test-harness=1
docker rm -fv $(docker ps -aq --filter label=coderlix.test-harness=1)
```

## Using it from a package (later steps)

Add `"@coderlix/integration-harness": "workspace:*"` to that package's
`devDependencies`, put tests in `test/**/*.integration.test.ts`, add a
`vitest.integration.config.ts` that calls `createIntegrationConfig()` from the
root `vitest.shared.ts`, and a `"test:integration": "vitest run --config
vitest.integration.config.ts"` script. Start the stack once per test file in
`beforeAll`, call `stack.resetDb()` between tests, and `stack.stop()` in
`afterAll`.

The harness spawns `git` and `docker` for tests. That is acceptable **only**
because it is test code: in the product, `packages/execution` is the single
process-execution boundary (Final Architecture §27).
