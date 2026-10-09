#!/usr/bin/env node
// Step 02 boundary-policy REGRESSION check (added in Step 03 tooling).
// Invoked via `pnpm run boundaries:policy`. Dependency-free: plain Node.
//
// What it guards, and why the other two boundary scripts don't:
//
//   * `pnpm run boundaries` scans real compiled output with the real rules,
//     but only catches an import that EXISTS today. If someone weakens or
//     deletes a rule in `.dependency-cruiser.cjs` (e.g. the agents ->
//     execution prohibition), it stays green until a violating import is
//     written. This script evaluates the REAL rule file against Final
//     Architecture §4 invariants, so weakening the policy fails immediately.
//
//   * `pnpm run boundaries:self-test` proves dependency-cruiser can reject a
//     forbidden import, using a MIRRORED rule in a throwaway fixture. It never
//     reads the production rule file. This script closes that gap.
//
//   * `.dependency-cruiser.cjs` documents the policy as default-deny ("a new
//     package ... is rejected until someone adds it to ALLOWED"), but its
//     rules are generated only for modules already listed in ALLOWED. This
//     script enforces that claim: every workspace module on disk must be
//     covered by exactly one rule, and no rule may exist for a module that is
//     not on disk.
//
// It also guards that the deliberate forbidden-import fixture (Step 02) and
// its wiring cannot be removed or bypassed unnoticed.
//
// Fail-closed: any violated check => exit 1, and zero executed checks => exit 1.
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

let executed = 0;
const failures = [];

function check(description, ok, detail) {
  executed += 1;
  if (ok) {
    console.log(`  pass  ${description}`);
  } else {
    failures.push(`${description}${detail ? ` -- ${detail}` : ""}`);
    console.log(`  FAIL  ${description}${detail ? ` -- ${detail}` : ""}`);
  }
}

function readText(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// ---------------------------------------------------------------------------
// Load the REAL production rule file.
// ---------------------------------------------------------------------------
const config = require(join(REPO_ROOT, ".dependency-cruiser.cjs"));
const rules = Array.isArray(config.forbidden) ? config.forbidden : [];

console.log("[boundaries:policy] rule-file integrity");
check("rule file exports a non-empty forbidden[] list", rules.length > 0);
check(
  "every rule has severity 'error' (no warn/info/ignore downgrade)",
  rules.every((rule) => rule.severity === "error"),
  rules
    .filter((rule) => rule.severity !== "error")
    .map((rule) => `${rule.name}=${rule.severity}`)
    .join(", "),
);
check(
  "rule names are unique and use the 'boundary:' prefix",
  new Set(rules.map((rule) => rule.name)).size === rules.length &&
    rules.every(
      (rule) => typeof rule.name === "string" && rule.name.startsWith("boundary:"),
    ),
);
check(
  "every rule has both a from.path and a to.path pattern (no unconditional rules)",
  rules.every(
    (rule) =>
      typeof rule.from?.path === "string" && typeof rule.to?.path === "string",
  ),
);

// A rule forbids an edge when both patterns match. Evaluated against the two
// path shapes the check can encounter: compiled output (what `boundaries`
// scans) and TypeScript source.
function pathsOf(moduleId) {
  return [`${moduleId}/dist/index.js`, `${moduleId}/src/index.ts`];
}
function isForbidden(from, to) {
  return pathsOf(from).some((fromPath) =>
    pathsOf(to).some((toPath) =>
      rules.some(
        (rule) =>
          new RegExp(rule.from.path).test(fromPath) &&
          new RegExp(rule.to.path).test(toPath),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Default-deny: rules and workspace modules on disk must correspond 1:1.
// ---------------------------------------------------------------------------
function modulesOnDisk() {
  const found = [];
  for (const group of ["packages", "apps"]) {
    const base = join(REPO_ROOT, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        existsSync(join(base, entry.name, "package.json"))
      ) {
        found.push(`${group}/${entry.name}`);
      }
    }
  }
  return found.sort();
}

console.log("[boundaries:policy] default-deny coverage");
const onDisk = modulesOnDisk();
check("at least one workspace module found on disk", onDisk.length > 0);

const uncovered = onDisk.filter(
  (moduleId) =>
    rules.filter((rule) => new RegExp(rule.from.path).test(pathsOf(moduleId)[0]))
      .length !== 1,
);
check(
  "every workspace module on disk is governed by exactly one rule (new package => must be added to ALLOWED)",
  uncovered.length === 0,
  uncovered.join(", "),
);

const ruleModules = rules.map((rule) => rule.name.slice("boundary:".length));
const orphanRules = ruleModules.filter((moduleId) => !onDisk.includes(moduleId));
check(
  "no rule refers to a module that is not on disk (renamed/removed package)",
  orphanRules.length === 0,
  orphanRules.join(", "),
);

// ---------------------------------------------------------------------------
// Architecture invariants (Final Architecture §4 / §27, Implementation Plan
// Steps 02 and 20). Each must be forbidden. A fixed list, deliberately NOT
// derived from ALLOWED, so editing the policy cannot also edit its own check.
// ---------------------------------------------------------------------------
console.log("[boundaries:policy] edges that MUST be forbidden");
const MUST_FORBID = [
  // §4 verbatim: no agent has a direct edge to Execution/Workspace/Git Manager.
  ["packages/agents", "packages/execution", "agents -> execution (§4)"],
  ["packages/agents", "packages/workspace", "agents -> workspace (§4)"],
  ["packages/agents", "packages/git-service", "agents -> git-service (§4)"],
  // Plan Step 20: no LLM anywhere in Verification / Release Gate.
  ["packages/verification", "packages/providers", "verification -> providers (Step 20)"],
  ["packages/verification", "packages/agents", "verification -> agents (Step 20)"],
  // Only the API may reach the Orchestrator; the web app stays on shared-types.
  ["apps/web", "packages/orchestrator", "web -> orchestrator"],
  ["apps/web", "packages/db", "web -> db"],
  ["apps/api", "packages/execution", "api -> execution"],
  ["apps/api", "packages/agents", "api -> agents"],
  // Layering: nothing below the Orchestrator may call upward.
  ["packages/execution", "packages/orchestrator", "execution -> orchestrator"],
  ["packages/providers", "packages/agents", "providers -> agents"],
  ["packages/db", "packages/orchestrator", "db -> orchestrator"],
  ["packages/git-service", "packages/orchestrator", "git-service -> orchestrator"],
  // Packages never import applications.
  ["packages/orchestrator", "apps/api", "orchestrator -> apps/api"],
  ["packages/shared-types", "apps/web", "shared-types -> apps/web"],
  // shared-types is the leaf: it imports no sibling at all.
  ["packages/shared-types", "packages/db", "shared-types -> db"],
  ["packages/shared-types", "packages/orchestrator", "shared-types -> orchestrator"],
];
for (const [from, to, label] of MUST_FORBID) {
  check(`forbidden: ${label}`, isForbidden(from, to));
}

console.log("[boundaries:policy] edges that MUST remain allowed (over-blocking guard)");
const MUST_ALLOW = [
  ["packages/agents", "packages/providers", "agents -> providers"],
  ["packages/agents", "packages/budget", "agents -> budget"],
  ["packages/agents", "packages/knowledge", "agents -> knowledge"],
  ["packages/agents", "packages/shared-types", "agents -> shared-types"],
  ["packages/providers", "packages/budget", "providers -> budget"],
  ["packages/workspace", "packages/execution", "workspace -> execution"],
  ["packages/workspace", "packages/git-service", "workspace -> git-service"],
  ["packages/git-service", "packages/execution", "git-service -> execution"],
  ["packages/verification", "packages/evidence", "verification -> evidence"],
  ["packages/orchestrator", "packages/agents", "orchestrator -> agents"],
  ["packages/orchestrator", "packages/verification", "orchestrator -> verification"],
  ["apps/api", "packages/orchestrator", "api -> orchestrator"],
  ["apps/web", "packages/shared-types", "web -> shared-types"],
  // A module importing its own files is never a boundary violation.
  ["packages/agents", "packages/agents", "agents -> agents (self)"],
  ["apps/api", "apps/api", "api -> api (self)"],
];
for (const [from, to, label] of MUST_ALLOW) {
  check(`allowed: ${label}`, !isForbidden(from, to));
}

// ---------------------------------------------------------------------------
// The deliberate forbidden-import fixture and the scripts that rely on it.
// ---------------------------------------------------------------------------
console.log("[boundaries:policy] Step 02 fixture + wiring cannot be removed or bypassed");
const FIXTURE = "packages/agents/boundary-fixture/forbidden-import.fixture.ts";
check(`fixture exists: ${FIXTURE}`, existsSync(join(REPO_ROOT, FIXTURE)));
check(
  "fixture still contains the deliberate agents -> execution import",
  existsSync(join(REPO_ROOT, FIXTURE)) &&
    /from\s+["']@coderlix\/execution["']/.test(readText(FIXTURE)),
);

let agentsTsconfig;
try {
  agentsTsconfig = JSON.parse(readText("packages/agents/tsconfig.json"));
} catch (err) {
  agentsTsconfig = undefined;
  check("packages/agents/tsconfig.json is readable JSON", false, String(err));
}
if (agentsTsconfig !== undefined) {
  check(
    "packages/agents/tsconfig.json excludes boundary-fixture (never compiled into dist/)",
    Array.isArray(agentsTsconfig.exclude) &&
      agentsTsconfig.exclude.some((entry) => String(entry).includes("boundary-fixture")),
  );
}

check(
  "eslint.config.mjs ignores the fixture (it would otherwise fail lint by design)",
  readText("eslint.config.mjs").includes("packages/agents/boundary-fixture/**"),
);
check(
  "scripts/boundaries.mjs and scripts/boundaries-self-test.mjs both exist",
  existsSync(join(REPO_ROOT, "scripts/boundaries.mjs")) &&
    existsSync(join(REPO_ROOT, "scripts/boundaries-self-test.mjs")),
);

const rootScripts = JSON.parse(readText("package.json")).scripts ?? {};
check(
  "root script 'boundaries' still builds then runs scripts/boundaries.mjs",
  typeof rootScripts.boundaries === "string" &&
    rootScripts.boundaries.includes("scripts/boundaries.mjs") &&
    rootScripts.boundaries.includes("build"),
);
check(
  "root script 'boundaries:self-test' still runs scripts/boundaries-self-test.mjs",
  typeof rootScripts["boundaries:self-test"] === "string" &&
    rootScripts["boundaries:self-test"].includes("scripts/boundaries-self-test.mjs"),
);

// Build-dependent: only meaningful once `pnpm -r build` has produced dist/.
const agentsDist = join(REPO_ROOT, "packages/agents/dist");
if (existsSync(agentsDist)) {
  const leaked = readdirSync(agentsDist).filter((name) =>
    /fixture|forbidden/i.test(name),
  );
  check(
    "packages/agents/dist contains no compiled fixture",
    leaked.length === 0,
    leaked.join(", "),
  );
} else {
  console.log("  note  packages/agents/dist not built; compiled-fixture check not applicable");
}

// ---------------------------------------------------------------------------
console.log("");
if (executed === 0) {
  console.error("[boundaries:policy] FAIL -- no checks executed.");
  process.exit(1);
}
if (failures.length > 0) {
  console.error(
    `[boundaries:policy] FAIL -- ${failures.length} of ${executed} checks failed:`,
  );
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`[boundaries:policy] PASS -- ${executed} checks, 0 failures.`);
