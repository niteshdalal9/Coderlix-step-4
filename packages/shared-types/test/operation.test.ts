import { describe, expect, it } from "vitest";
import { OperationRequestSchema } from "../src/index.js";
import { accepts, issuePaths, operationRequest, uuid, viaJson, without, withPatch } from "./fixtures.js";

const S = OperationRequestSchema;

describe("OperationRequest", () => {
  it("round-trips through JSON for every operation type", () => {
    const base = operationRequest();
    const variants = [
      base,
      { ...base, operation_type: "read_file", payload: { path: "src/a.ts" } },
      { ...base, operation_type: "write_file", payload: { path: "src/a.ts", content: "x" } },
      { ...base, operation_type: "list_files", payload: { path: "." } },
    ];
    for (const v of variants) expect(S.parse(viaJson(v))).toEqual(v);
  });

  it("accepts system-originated (null agent run) and verification-stage requests", () => {
    expect(accepts(S, withPatch(operationRequest(), { agent_run_id: null }))).toBe(true);
    expect(
      accepts(S, withPatch(operationRequest(), { verification_authorization_id: uuid(20) })),
    ).toBe(true);
    expect(accepts(S, withPatch(operationRequest(), { timeout_override: 30000 }))).toBe(true);
  });

  it("rejects unknown operation_type and mismatched payloads", () => {
    expect(accepts(S, withPatch(operationRequest(), { operation_type: "delete_file" }))).toBe(false);
    expect(
      accepts(S, withPatch(operationRequest(), { operation_type: "read_file" })),
    ).toBe(false); // run_command payload under read_file
    expect(
      accepts(S, withPatch(operationRequest(), { operation_type: "read_file", payload: { path: "a", content: "x" } })),
    ).toBe(false); // extra payload key
  });

  it("rejects extra top-level keys and missing required keys", () => {
    expect(accepts(S, withPatch(operationRequest(), { sneaky: 1 }))).toBe(false);
    for (const k of ["workspace_id", "agent_run_id", "task_id", "capability_grant_id",
      "verification_authorization_id", "timeout_override", "payload"]) {
      expect(accepts(S, without(operationRequest(), k))).toBe(false);
    }
  });

  it("rejects non-uuid ids", () => {
    expect(issuePaths(S, withPatch(operationRequest(), { task_id: "t-1" }))).toContain("task_id");
  });

  it("rejects a shell string as args, empty command, and NUL bytes", () => {
    const p = (payload: unknown) => withPatch(operationRequest(), { payload });
    expect(accepts(S, p({ command: "pnpm", args: "run test" }))).toBe(false);
    expect(accepts(S, p({ command: "", args: [] }))).toBe(false);
    expect(accepts(S, p({ command: "p\u0000x", args: [] }))).toBe(false);
    expect(accepts(S, p({ command: "pnpm", args: ["a\u0000b"] }))).toBe(false);
    const f = (path: string) =>
      withPatch(operationRequest(), { operation_type: "read_file", payload: { path } });
    expect(accepts(S, f(""))).toBe(false);
    expect(accepts(S, f("a\u0000b"))).toBe(false);
  });

  it("rejects non-positive / fractional timeout_override", () => {
    for (const t of [0, -1, 1.5, "30"]) {
      expect(accepts(S, withPatch(operationRequest(), { timeout_override: t }))).toBe(false);
    }
  });
});
