// Dependency-boundary enforcement (Step 02, MVP Implementation Plan §3).
//
// Encodes Final Architecture §4 ("Module Boundaries") and §27 ("Execution
// / Git / Workspace Boundary") as a deterministic, mechanical check,
// rather than a convention documented only in prose. Run with:
//
//   pnpm run boundaries
//
// which runs `scripts/boundaries.mjs` (see that file for why this is a
// wrapper script and not a raw CLI invocation).
//
// WHY THIS SCANS COMPILED dist/ OUTPUT, NOT .ts SOURCE:
// Across many real runs (dependency-cruiser 16.10.4, pnpm 11.28.3,
// Termux/Android), every attempt to scan .ts source directly -- with a
// `tsConfig` option, without one, with `tsPreCompilationDeps`, without
// it, with a simple `exclude` pattern directly verified against real
// paths -- reported "0 modules, 0 dependencies cruised": dependency-
// cruiser was not discovering any .ts file at all, silently. Meanwhile
// `pnpm run boundaries:self-test`, using plain .js files, PASSED for
// real: "2 modules, 1 dependencies cruised", the forbidden import
// genuinely detected. That isolated the problem to TypeScript-source
// parsing specifically, in this environment/version -- not a general
// file-discovery, CLI-invocation, or rule-matching issue.
// Rather than keep guessing at .ts-specific configuration, this scans
// the plain .js output `tsc -b` already produces in each package's
// `dist/` (module: NodeNext per tsconfig.base.json, i.e. native ESM
// `import`/`export` syntax -- confirmed by inspecting real compiled
// output, and confirmed scannable by updating the self-test fixture to
// the identical ESM syntax and re-verifying it still passes). The
// `forbidden` rules below still match: their path patterns (e.g.
// `^packages/agents/`) match any file under that package directory,
// `dist/` included, with no changes needed.
//
// A permanent, committed example of a forbidden import lives at
// `packages/agents/boundary-fixture/forbidden-import.fixture.ts` -- it
// is excluded from that package's own tsconfig.json, so it is NEVER
// compiled into dist/ at all, and therefore automatically invisible to
// this scan without needing an explicit exclude rule for it anymore.
// The *mechanism* that proves dependency-cruiser actually rejects a
// forbidden agents -> execution edge is `pnpm run boundaries:self-test`
// (`scripts/boundaries-self-test.mjs`), which exercises the same rule
// intent via an isolated, throwaway fixture.
//
// How this works: ALLOWED below is the single source of truth -- for each
// workspace module, the full list of other workspace modules it may
// import from. Everything else is generated as a "forbidden" rule, so the
// policy is default-deny: a new package, or a new edge, is rejected until
// someone deliberately adds it to ALLOWED (and, implicitly, re-justifies
// it against Final Architecture §4).
//
// Resolution note: rules match on *source path*, not on package.json
// `dependencies`. Workspace-package import specifiers (`@coderlix/*`) are
// resolved to their source files via `tsconfig.paths.json` (see that
// file's own header comment), NOT via node_modules symlinks -- so the
// check works even though, at Step 02, no package.json yet declares a
// real `workspace:*` dependency on another package (nothing is wired up
// yet; see root README "Implementation status").

/**
 * Allow-list: module id -> array of module ids it may import from.
 * Derived from Final Architecture §4's Module Boundaries table:
 *
 *   - shared-types / db / execution / evidence / budget / knowledge are
 *     leaves (or near-leaves): §4 lists "--" in their "Invokes" column,
 *     i.e. they call into no other listed component.
 *   - providers invokes Budget Manager (§4: "Model Provider Gateway |
 *     ... | Provider adapters, Budget Manager").
 *   - workspace invokes Execution Manager (mediated) and Git Manager
 *     (§4: "Workspace Manager | ... | Execution Manager (mediated), Git
 *     Manager").
 *   - git-service invokes Execution Manager (mediated), Evidence Store
 *     (invalidation hook), and Knowledge Service (staleness events)
 *     (§4: "Git Manager | ... | Execution Manager (mediated), Evidence
 *     Store (invalidation hook)"; Knowledge Service row: "Invoked by:
 *     Agent Runtime, Git Manager (staleness events)").
 *   - verification (Verification Service + Release Gate) invokes
 *     Evidence Store, Git Manager (merge trigger), and the Execution
 *     Manager (dispatches verification-stage executions, §19) and Budget
 *     Manager (release check, Step 20) -- and explicitly NEVER providers:
 *     Step 20 of the MVP Implementation Plan requires "no LLM anywhere
 *     in this module (dependency-lint: no import of `providers`)".
 *   - agents (Agent Runtime + MVP agents) invokes Model Provider Gateway,
 *     Knowledge Service, and the Budget Manager (per-call reserve/settle)
 *     -- and explicitly NEVER execution/workspace/git-service directly:
 *     "No agent process has a direct dependency edge to Execution
 *     Manager, Workspace Manager, or Git Manager -- every path runs
 *     through Agent Runtime's mediation or through the Orchestrator
 *     directly" (§4), restated verbatim as the Step 02 example.
 *   - orchestrator invokes Agent Runtime, Verification Service, Workspace
 *     Manager, Git Manager, Budget Manager (§4: Orchestrator Service row)
 *     plus Execution Manager directly for system-level operations (§5:
 *     "The Orchestrator, directly, for system-level operations not
 *     agent-initiated") and reads Evidence Store (§4 Evidence Store row:
 *     "Invoked by: ... Orchestrator (reads)").
 *   - apps/api invokes only the Orchestrator Service (§4: "API Gateway |
 *     ... | Orchestrator Service").
 *   - apps/web has no business logic client-side; it consumes the API
 *     over HTTP/SSE, not via a package import -- it may only reach
 *     shared-types for request/response typing.
 */
const ALLOWED = {
  "packages/shared-types": [],
  "packages/db": ["packages/shared-types"],
  "packages/execution": ["packages/shared-types", "packages/db"],
  "packages/evidence": ["packages/shared-types", "packages/db"],
  "packages/budget": ["packages/shared-types", "packages/db"],
  "packages/knowledge": ["packages/shared-types", "packages/db"],
  "packages/providers": [
    "packages/shared-types",
    "packages/db",
    "packages/budget",
  ],
  "packages/workspace": [
    "packages/shared-types",
    "packages/db",
    "packages/execution",
    "packages/git-service",
  ],
  "packages/git-service": [
    "packages/shared-types",
    "packages/db",
    "packages/execution",
    "packages/evidence",
    "packages/knowledge",
  ],
  "packages/verification": [
    "packages/shared-types",
    "packages/db",
    "packages/execution",
    "packages/evidence",
    "packages/git-service",
    "packages/budget",
  ],
  "packages/agents": [
    "packages/shared-types",
    "packages/providers",
    "packages/budget",
    "packages/knowledge",
  ],
  "packages/orchestrator": [
    "packages/shared-types",
    "packages/db",
    "packages/agents",
    "packages/verification",
    "packages/workspace",
    "packages/git-service",
    "packages/budget",
    "packages/execution",
    "packages/evidence",
  ],
  "apps/api": ["packages/shared-types", "packages/db", "packages/orchestrator"],
  "apps/web": ["packages/shared-types"],
};

const ALL_MODULES = Object.keys(ALLOWED);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const forbidden = ALL_MODULES.map((moduleId) => {
  const allowed = new Set(ALLOWED[moduleId]);
  const forbiddenTargets = ALL_MODULES.filter(
    (other) => other !== moduleId && !allowed.has(other),
  );
  if (forbiddenTargets.length === 0) return null;

  const toPattern = `^(${forbiddenTargets.map(escapeRegex).join("|")})/`;
  return {
    name: `boundary:${moduleId}`,
    severity: "error",
    comment: `Final Architecture §4/§27: \`${moduleId}\` may import only [${
      ALLOWED[moduleId].join(", ") || "nothing"
    }]. Everything else -- including [${forbiddenTargets.join(
      ", ",
    )}] -- is a forbidden cross-boundary import; route through the mediated/authoritative interface instead of importing the package directly.`,
    from: { path: `^${escapeRegex(moduleId)}/` },
    to: { path: toPattern },
  };
}).filter(Boolean);

module.exports = {
  forbidden,
  options: {
    // No `tsConfig` / `tsPreCompilationDeps` here. They were tried and
    // removed across earlier rounds while diagnosing the "0 modules"
    // problem (see this file's header comment); now moot, since this
    // config no longer scans .ts source at all.
    exclude: {
      // node_modules/coverage: normal build-artifact exclusions.
      // Declaration/map/build-info files: real .js modules only --
      // .d.ts, .js.map, .d.ts.map, and .tsbuildinfo are not importable
      // dependency-graph nodes, so excluding them keeps the module
      // count meaningful (one entry per real compiled file) rather than
      // inflated by non-module artifacts sitting alongside them in
      // dist/. (boundary-fixture needs no explicit exclusion anymore:
      // it is excluded from packages/agents/tsconfig.json's own build,
      // so it is never compiled into dist/ in the first place.)
      path: "(^|/)(node_modules|coverage)(/|$)|\\.(d\\.ts(\\.map)?|js\\.map|tsbuildinfo)$",
    },
    doNotFollow: {
      path: "node_modules",
    },
    // No `reporterOptions` here. An earlier revision set
    // `reporterOptions.err.showMetrics`, which the installed
    // dependency-cruiser's config schema rejects outright ("data/options/
    // reporterOptions must NOT have additional properties"), causing
    // `pnpm run boundaries` to fail on a config-validation error before
    // any real analysis ran. `reporterOptions` only affects cosmetic
    // report formatting, never which imports are flagged, so it is
    // removed rather than guessed at -- `--output-type err-long` on the
    // CLI already controls the report format this project needs.
  },
};
