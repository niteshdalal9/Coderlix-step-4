// ESLint flat config (Step 03 — Tooling, CI, test harness). Run via
// `pnpm run lint` (= `eslint . --max-warnings=0`).
//
// Scope of "lint" here, deliberately minimal and non-type-aware:
//   - ESLint core recommended rules for the repo's .mjs/.cjs tooling
//     scripts and config files;
//   - core + typescript-eslint `recommended` for every .ts file
//     (package sources, tests, vitest configs, the integration harness).
//
// This is NOT the dependency-boundary check. Module boundaries are
// enforced by dependency-cruiser (`pnpm run boundaries` and
// `pnpm run boundaries:self-test`, Step 02) and are intentionally not
// duplicated or re-encoded here.
//
// Ignored on purpose:
//   - build/coverage output;
//   - packages/agents/boundary-fixture/** — the Step 02 deliberate
//     forbidden-import fixture. It is not production source, is excluded
//     from that package's tsconfig, and must stay exactly as it is.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const nodeGlobals = {
  console: "readonly",
  process: "readonly",
  Buffer: "readonly",
  URL: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
};

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "packages/agents/boundary-fixture/**",
  ]),

  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: "module", globals: nodeGlobals },
  },

  {
    files: ["**/*.cjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...nodeGlobals,
        module: "writable",
        exports: "writable",
        require: "readonly",
      },
    },
  },

  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
]);
