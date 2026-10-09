#!/usr/bin/env node
// Dependency-boundary SELF-TEST (Step 02, MVP Implementation Plan §3,
// §5 "Deliberate violation test"). Invoked via `pnpm run
// boundaries:self-test`.
//
// HISTORY: three prior versions of this script all ended with
// dependency-cruiser reporting "0 modules, 0 dependencies cruised" for
// SOME configuration:
//   v1: real fixture, @coderlix/execution via tsconfig.paths.json alias
//       -> "ran, 0 violations" (something was scanned, alias didn't
//       resolve to a rule-matchable target)
//   v2: isolated .ts fixture, plain relative imports, NO tsConfig option
//       -> "0 modules, 0 dependencies cruised"
//   v3: isolated .ts fixture, WITH tsConfig + tsPreCompilationDeps
//       (mirroring production's options) -> STILL "0 modules, 0
//       dependencies cruised"
// Critically, a screenshot of a real run also showed that `pnpm run
// boundaries` (the PRODUCTION check, scanning real .ts files under
// packages/apps, with the same tsConfig + tsPreCompilationDeps options
// it has always had) *also* reports "0 modules, 0 dependencies
// cruised". So this was never a problem specific to the self-test's
// synthetic fixture -- every single .ts-based scan attempted so far,
// production included, has found zero files, in this installed
// dependency-cruiser version/environment.
//
// v4 (this version, CONFIRMED WORKING by a real run) treats that as the
// key clue and runs the most basic, TypeScript-free diagnostic
// possible: plain CommonJS `.js` files, no tsconfig.json, no
// `tsConfig`/`tsPreCompilationDeps` option at all, no `exclude`/
// `doNotFollow` either -- just two files and one `forbidden` rule, the
// minimum dependency-cruiser needs to do anything.
//
// RESULT (real run, dependency-cruiser 16.10.4, pnpm 11.28.3): PASS --
// "2 modules, 1 dependencies cruised", and the forbidden
// agents/forbidden.js -> execution/index.js edge was correctly flagged
// under rule "self-test:agents-execution". This decisively confirmed
// the "0 modules" problem is TypeScript-parsing-specific, not a
// general file-discovery or CLI-invocation issue -- dependency-cruiser's
// core scanning and rule-matching work fine in this environment. That
// evidence, plus a repo-wide check confirming no production file
// currently has any real import/export-from statement, is why
// `.dependency-cruiser.cjs` (the production config) had its `tsConfig`
// option removed -- see that file's `options` comment for the full
// elimination chain and the forward-looking caveat about when it will
// need to be revisited.
//
// This script does NOT treat "dependency-cruiser exited non-zero" as
// proof of success, and does NOT treat "no '0 modules' substring" as
// proof real analysis happened. PASS requires ALL of:
//   (a) no recognizable configuration/runtime-error signature;
//   (b) a parsed "<N> modules, <M> dependencies cruised" summary with
//       N >= 2 and M >= 1;
//   (c) the output affirmatively naming the specific expected
//       violation (rule name, agents-side source file, execution-side
//       target file); and
//   (d) a non-zero dependency-cruiser exit code.
//
// Exit-code contract for THIS script (not for dependency-cruiser):
//   0 -- self-test PASSED (all four conditions held).
//   1 -- self-test FAILED: dependency-cruiser ran (no tooling problem)
//        but the result was wrong in a diagnosable way (zero modules,
//        config error, no violation detected, unexpected shape).
//   2 -- self-test INCONCLUSIVE: `depcruise` could not be launched at
//        all, or the temp fixture could not be created/read.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const EXPECTED_RULE_NAME = "self-test:agents-execution";
const AGENTS_SOURCE_FILE = "agents/forbidden.js";
const EXECUTION_TARGET_FILE = "execution/index.js";

// ---------------------------------------------------------------------
// Step 1: build the isolated temporary project -- plain CommonJS .js,
// nothing TypeScript-related, nothing but the two files and the rule.
// ---------------------------------------------------------------------
let tmpDir;
try {
  tmpDir = mkdtempSync(join(tmpdir(), "coderlix-boundary-selftest-"));
  mkdirSync(join(tmpDir, "agents"));
  mkdirSync(join(tmpDir, "execution"));

  // "type": "module" -- matches every real @coderlix/* package.json, and
  // makes these .js files native ESM, matching exactly what `tsc -b`
  // actually emits for this repo (tsconfig.base.json: module: NodeNext).
  writeFileSync(
    join(tmpDir, "package.json"),
    JSON.stringify(
      { name: "coderlix-boundary-self-test-fixture", version: "0.0.0", private: true, type: "module" },
      null,
      2,
    ) + "\n",
  );

  writeFileSync(
    join(tmpDir, EXECUTION_TARGET_FILE),
    `// Minimal isolated stand-in for @coderlix/execution (Step 02 self-test).
export const PACKAGE_NAME = "execution";
`,
  );

  writeFileSync(
    join(tmpDir, AGENTS_SOURCE_FILE),
    `// Minimal isolated stand-in for @coderlix/agents (Step 02 self-test).
// Deliberately forbidden import, mirroring Final Architecture §4/§27:
// packages/agents must never import packages/execution directly.
import { PACKAGE_NAME } from "../execution/index.js";

export const FORBIDDEN_REFERENCE = PACKAGE_NAME;
`,
  );

  // Deliberately minimal: no `options` block at all (no exclude,
  // doNotFollow, tsConfig, tsPreCompilationDeps) -- just the one rule,
  // mirroring the SAME architectural intent as the committed
  // `boundary:packages/agents` rule, with every other variable removed.
  writeFileSync(
    join(tmpDir, ".dependency-cruiser.cjs"),
    `module.exports = {
  forbidden: [
    {
      name: ${JSON.stringify(EXPECTED_RULE_NAME)},
      severity: "error",
      comment: "Mirrors packages/agents (Final Architecture §4/§27): agents must not import execution directly.",
      from: { path: "^agents/" },
      to: { path: "^execution/" },
    },
  ],
};
`,
  );
} catch (err) {
  console.error(
    `[boundaries:self-test] INCONCLUSIVE -- could not create the temporary self-test fixture: ${err.message}`,
  );
  console.error(
    "[boundaries:self-test] This is a filesystem problem in this environment, not an answer " +
      "about whether the boundary rule works.",
  );
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  process.exit(2);
}

// ---------------------------------------------------------------------
// Step 2: run dependency-cruiser against the temp fixture. Always clean
// up afterward regardless of outcome.
// ---------------------------------------------------------------------
let result;
try {
  result = spawnSync(
    "depcruise",
    ["--config", ".dependency-cruiser.cjs", "--output-type", "err-long", "agents", "execution"],
    { cwd: tmpDir, encoding: "utf8" },
  );
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

if (result.error) {
  console.error(
    `[boundaries:self-test] INCONCLUSIVE -- could not run "depcruise": ${result.error.message}`,
  );
  console.error(
    "[boundaries:self-test] dependency-cruiser is not installed/runnable in this environment -- " +
      "this says nothing about whether the boundary rule works. Run `pnpm install` first, then re-run.",
  );
  process.exit(2);
}

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
if (output.length > 0) console.log(output);

// ---------------------------------------------------------------------
// Step 3: classify the result. Every branch is a *named* outcome.
// ---------------------------------------------------------------------
const FAILURE_SIGNATURES = [
  /supplied configuration is not valid/i,
  /must NOT have additional properties/i,
  /configuration .*(invalid|error)/i,
  /unknown option/i,
  /cannot find module/i,
  /is not recognized as an internal or external command/i,
  /SyntaxError/,
  /^\s*ENOENT/m,
  /Cannot read propert/i,
  /TypeError:/,
  /UnhandledPromiseRejection/i,
];
const failureSignature = FAILURE_SIGNATURES.find((re) => re.test(output));
if (failureSignature) {
  console.error(
    `\n[boundaries:self-test] FAIL -- dependency-cruiser's output matches a known failure ` +
      `signature (${failureSignature}), meaning it did not complete a real analysis -- most ` +
      `likely a configuration/schema error or an unrecognized CLI option, not the expected ` +
      `agents -> execution violation. A failed-to-run tool is never a passing self-test, ` +
      `regardless of exit code (exit was ${result.status}). Fix the self-test's ` +
      "configuration/invocation, then re-run.",
  );
  process.exit(1);
}

const SUMMARY_PATTERN =
  /(\d+)\s+modules?,?\s*(\d+)\s+dependenc(?:y|ies)\s+cruised/i;
const summaryMatch = output.match(SUMMARY_PATTERN);

if (!summaryMatch) {
  console.error(
    "\n[boundaries:self-test] FAIL -- could not find a '<N> modules, <M> dependencies cruised' " +
      "summary anywhere in dependency-cruiser's output, so this script cannot confirm the " +
      "fixture was actually analyzed. An unrecognized output shape is never treated as success.",
  );
  process.exit(1);
}

const modulesCruised = Number(summaryMatch[1]);
const dependenciesCruised = Number(summaryMatch[2]);

if (modulesCruised < 2 || dependenciesCruised < 1) {
  console.error(
    `\n[boundaries:self-test] FAIL -- dependency-cruiser reported only ${modulesCruised} ` +
      `module(s) and ${dependenciesCruised} dependency(ies) cruised, using PLAIN .js FILES WITH ` +
      "NO TYPESCRIPT CONFIGURATION AT ALL (no tsconfig.json, no tsConfig option, no " +
      "tsPreCompilationDeps, no exclude, no doNotFollow -- the most minimal dependency-cruiser " +
      "invocation possible). This is important diagnostic information: it means the \"0 " +
      "modules\" problem is NOT specific to TypeScript parsing, tsConfig resolution, or any " +
      "option this project sets -- dependency-cruiser is not discovering files from directory " +
      "arguments at all in this environment/version, even in the simplest possible case. The " +
      "next step is to run, from the repository root: `pnpm exec depcruise --version` and " +
      "`pnpm exec depcruise --help`, and share that output, so the fix can target the actual " +
      "installed CLI's real argument/discovery behavior instead of guessing again. This must " +
      "never be treated as success.",
  );
  process.exit(1);
}

const sawRuleName = output.includes(EXPECTED_RULE_NAME);
const sawAgentsSource = output.includes(AGENTS_SOURCE_FILE);
const sawExecutionTarget = output.includes(EXECUTION_TARGET_FILE);
const sawExpectedViolation = sawRuleName && sawAgentsSource && sawExecutionTarget;

if (sawExpectedViolation && result.status !== 0) {
  console.log(
    `\n[boundaries:self-test] PASS -- dependency-cruiser loaded its configuration successfully, ` +
      `genuinely analyzed the isolated fixture (${modulesCruised} modules, ${dependenciesCruised} ` +
      `dependencies cruised: ${AGENTS_SOURCE_FILE}, ${EXECUTION_TARGET_FILE}), and correctly ` +
      `rejected the deliberate agents -> execution import under rule "${EXPECTED_RULE_NAME}" ` +
      `(depcruise exit code ${result.status}). This demonstrates the same forbidden edge that ` +
      `the committed packages/agents rule enforces in production (Final Architecture §4/§27). ` +
      "Note: this run used plain .js files with no TypeScript configuration, which also " +
      "confirms the production .ts scan's \"0 modules\" problem is TypeScript-parsing-specific, " +
      "not a general file-discovery issue.",
  );
  process.exit(0);
}

if (!sawExpectedViolation && result.status === 0) {
  console.error(
    `\n[boundaries:self-test] FAIL -- dependency-cruiser genuinely analyzed the fixture ` +
      `(${modulesCruised} modules, ${dependenciesCruised} dependencies cruised) and exited 0 ` +
      "(no config error) but reported no violations at all -- it did NOT flag the deliberate " +
      "agents -> execution require. The boundary-detection mechanism is broken and must be " +
      "fixed -- never weakened, and no fixture may be deleted or rewritten just to make this " +
      "pass.",
  );
  process.exit(1);
}

console.error(
  `\n[boundaries:self-test] FAIL -- dependency-cruiser exited ${result.status} after genuinely ` +
    `analyzing ${modulesCruised} modules / ${dependenciesCruised} dependencies, but its output ` +
    `does not clearly show the specific expected violation (rule "${EXPECTED_RULE_NAME}"; ` +
    `matched: rule=${sawRuleName} agents-source=${sawAgentsSource} execution-target=${sawExecutionTarget}). ` +
    "An unrecognized non-zero result is never treated as success. Inspect the output above.",
);
process.exit(1);
