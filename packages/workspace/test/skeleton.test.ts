import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../src/index.js";

// Step 03 skeleton smoke test. This package has no business logic yet; this
// only proves the unit-test pipeline (Vitest + TypeScript source loading)
// really executes here, and that the skeleton's exported identifier has not
// drifted from its package.json name. Real tests arrive with real code.
const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { name: string };

describe("package skeleton", () => {
  it("exports a PACKAGE_NAME that matches package.json#name", () => {
    expect(PACKAGE_NAME).toBe(manifest.name);
  });
});
