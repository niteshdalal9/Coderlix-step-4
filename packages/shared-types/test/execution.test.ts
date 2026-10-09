import { describe, expect, it } from "vitest";
import { ExecutionRecordSchema } from "../src/index.js";
import { T0, accepts, executionRecord, issuePaths, viaJson, without, withPatch } from "./fixtures.js";

const S = ExecutionRecordSchema;

describe("ExecutionRecord", () => {
  it("round-trips through JSON", () => {
    expect(S.parse(viaJson(executionRecord()))).toEqual(executionRecord());
  });

  it("rejects extra keys and each missing required key", () => {
    expect(accepts(S, withPatch(executionRecord(), { evidence: true }))).toBe(false);
    for (const k of Object.keys(executionRecord())) {
      expect(accepts(S, without(executionRecord(), k))).toBe(false);
    }
  });

  it("status / exit_code consistency", () => {
    const killed = { status: "killed", exit_code: null };
    expect(accepts(S, withPatch(executionRecord(), killed))).toBe(true);
    expect(accepts(S, withPatch(executionRecord(), { status: "killed", exit_code: 137 }))).toBe(false);
    expect(accepts(S, withPatch(executionRecord(), { status: "success", exit_code: null }))).toBe(false);
    // completed-but-failing process is still status=success (result is derived later, §30.2)
    expect(accepts(S, withPatch(executionRecord(), { exit_code: 1 }))).toBe(true);
    expect(accepts(S, withPatch(executionRecord(), { status: "timeout", exit_code: null }))).toBe(true);
    expect(accepts(S, withPatch(executionRecord(), { status: "running" }))).toBe(false);
  });

  it("exit_code must be an integer in 0..255", () => {
    for (const c of [256, -1, 1.5, "0"]) {
      expect(accepts(S, withPatch(executionRecord(), { exit_code: c }))).toBe(false);
    }
  });

  it("end_time may not precede start_time; timestamps need an offset", () => {
    expect(issuePaths(S, withPatch(executionRecord(), { end_time: "2026-10-08T09:00:00Z" }))).toContain("end_time");
    expect(accepts(S, withPatch(executionRecord(), { end_time: T0 }))).toBe(true);
    expect(accepts(S, withPatch(executionRecord(), { start_time: "2026-10-08T10:00:00" }))).toBe(false);
  });

  it("command / args shape depends on operation_type", () => {
    expect(accepts(S, withPatch(executionRecord(), { command: null }))).toBe(false);
    const file = { operation_type: "read_file", command: null, args: ["src/a.ts"] };
    expect(accepts(S, withPatch(executionRecord(), file))).toBe(true);
    expect(accepts(S, withPatch(executionRecord(), { ...file, command: "cat" }))).toBe(false);
    expect(accepts(S, withPatch(executionRecord(), { ...file, args: ["a", "b"] }))).toBe(false);
    expect(accepts(S, withPatch(executionRecord(), { ...file, args: [] }))).toBe(false);
  });

  it("resource_usage values must be finite and non-negative; refs nullable", () => {
    expect(accepts(S, withPatch(executionRecord(), { resource_usage: { cpu: -1 } }))).toBe(false);
    expect(accepts(S, withPatch(executionRecord(), { resource_usage: { cpu: Infinity } }))).toBe(false);
    expect(accepts(S, withPatch(executionRecord(), { stdout_ref: null, stderr_ref: null }))).toBe(true);
    expect(accepts(S, withPatch(executionRecord(), { stdout_ref: "" }))).toBe(false);
  });
});
