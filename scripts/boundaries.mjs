#!/usr/bin/env node
// Production dependency-boundary check (Step 02, MVP Implementation
// Plan §3). Invoked via `pnpm run boundaries`.
//
// WHY THIS IS A WRAPPER SCRIPT, NOT A RAW `depcruise ...` CLI call:
// Across this entire debugging history, `pnpm run boundaries` ran as a
// plain CLI invocation and reported "✓ no dependency violations found
// (0 modules, 0 dependencies cruised)" -- which LOOKS like a clean pass
// (green checkmark, exit 0) but actually means nothing was scanned at
// all. That was never caught because nothing ever checked the module
// count; only the exit code was trusted. This script applies the exact
// same lesson `scripts/boundaries-self-test.mjs` already learned the
// hard way: a result is only accepted as a real PASS if the module
// count is positively confirmed to be at least what's actually on
// disk, not merely because dependency-cruiser exited 0.
//
// WHY THIS SCANS packages/*/dist and apps/*/dist (compiled JS), NOT
// packages/*/src and apps/*/src (.ts source):
// See `.dependency-cruiser.cjs`'s header comment for the full
// diagnostic history. Summary: every attempt to scan .ts source
// directly silently found 0 modules in this environment/version;
// scanning the plain .js `tsc -b` already produces was proven to work
// (a real run of the self-test, using the same ESM syntax `tsc -b`
// emits here, found real modules and correctly flagged a forbidden
// import). This script therefore requires `dist/` to exist -- i.e.
// `pnpm -r build` must run first. The `boundaries` npm script chains
// that automatically (`pnpm -r build && node scripts/boundaries.mjs`),
// so `pnpm run boundaries` alone is always self-sufficient; `tsc -b` is
// incremental; so re-running the build here is cheap when already
// up to date.
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Explicit discovery of dist/ directories -- not shell globbing, so
 *  behavior is identical and predictable regardless of how this script
 *  is invoked (pnpm script, direct `node`, different shells, etc.). */
function findDistDirs(groupDir) {
  const base = join(REPO_ROOT, groupDir);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(groupDir, entry.name, "dist"))
    .filter((relPath) => existsSync(join(REPO_ROOT, relPath)));
}

const packageDistDirs = findDistDirs("packages");
const appDistDirs = findDistDirs("apps");
const allDistDirs = [...packageDistDirs, ...appDistDirs];

if (allDistDirs.length === 0) {
  console.error(
    "[boundaries] FAIL -- no dist/ directories found under packages/ or apps/. " +
      "Run `pnpm -r build` first (the `boundaries` npm script normally does this " +
      "automatically -- if you're seeing this, something prevented that build step " +
      "from completing).",
  );
  process.exit(1);
}

let result;
try {
  result = spawnSync(
    "depcruise",
    ["--config", ".dependency-cruiser.cjs", "--output-type", "err-long", ...allDistDirs],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
} catch (err) {
  console.error(`[boundaries] INCONCLUSIVE -- could not run "depcruise": ${err.message}`);
  process.exit(2);
}

if (result.error) {
  console.error(`[boundaries] INCONCLUSIVE -- could not run "depcruise": ${result.error.message}`);
  console.error(
    "[boundaries] dependency-cruiser is not installed/runnable in this environment -- this " +
      "says nothing about whether production obeys the architecture's module boundaries. Run " +
      "`pnpm install` first, then re-run.",
  );
  process.exit(2);
}

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
if (output.length > 0) console.log(output);

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
    `\n[boundaries] FAIL -- dependency-cruiser's output matches a known failure signature ` +
      `(${failureSignature}), meaning it did not complete a real analysis -- most likely a ` +
      `configuration/schema error. A failed-to-run tool is never a passing boundary check, ` +
      `regardless of exit code (exit was ${result.status}).`,
  );
  process.exit(1);
}

const SUMMARY_PATTERN = /(\d+)\s+modules?,?\s*(\d+)\s+dependenc(?:y|ies)\s+cruised/i;
const summaryMatch = output.match(SUMMARY_PATTERN);

if (!summaryMatch) {
  console.error(
    "\n[boundaries] FAIL -- could not find a '<N> modules, <M> dependencies cruised' summary " +
      "anywhere in dependency-cruiser's output, so this script cannot confirm production was " +
      "actually scanned. An unrecognized output shape is never treated as success.",
  );
  process.exit(1);
}

const modulesCruised = Number(summaryMatch[1]);
const dependenciesCruised = Number(summaryMatch[2]);

if (modulesCruised < allDistDirs.length) {
  console.error(
    `\n[boundaries] FAIL -- dependency-cruiser reported only ${modulesCruised} module(s) ` +
      `cruised, but ${allDistDirs.length} dist/ director${allDistDirs.length === 1 ? "y" : "ies"} ` +
      `${allDistDirs.length === 1 ? "was" : "were"} found on disk (${allDistDirs.join(", ")}). ` +
      "This means production was NOT genuinely scanned -- this must never be treated as " +
      "success, no matter what dependency-cruiser's own exit code says.",
  );
  process.exit(1);
}

if (result.status === 0) {
  console.log(
    `\n[boundaries] PASS -- dependency-cruiser genuinely analyzed ${modulesCruised} compiled ` +
      `module(s) across ${allDistDirs.length} package(s)/app(s) (${dependenciesCruised} ` +
      "dependency edge(s) traced) and found no forbidden cross-boundary import (Final " +
      "Architecture §4/§27).",
  );
  process.exit(0);
}

// Non-zero exit with a real, positive module count and no failure
// signature: dependency-cruiser found a genuine architecture
// violation. This is the check doing its job -- fix the offending
// import, don't weaken the rule.
console.error(
  `\n[boundaries] FAIL -- dependency-cruiser genuinely analyzed ${modulesCruised} compiled ` +
    `module(s) (${dependenciesCruised} dependency edge(s)) and found a real dependency-boundary ` +
    "violation (see output above). Fix the offending import -- do not weaken the forbidden " +
    "rule in .dependency-cruiser.cjs to make this pass.",
);
process.exit(result.status || 1);
