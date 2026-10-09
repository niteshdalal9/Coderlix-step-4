import { describe, expect, it } from "vitest";
import { AgentRunRequestSchema, AgentRunResultSchema, ENVELOPE_SCHEMA_VERSION } from "../src/index.js";
import { accepts, agentRunRequest, agentRunResult, uuid, viaJson, without, withPatch } from "./fixtures.js";

describe("AgentRunRequest", () => {
  const S = AgentRunRequestSchema;
  it("round-trips through JSON", () => {
    expect(S.parse(viaJson(agentRunRequest()))).toEqual(agentRunRequest());
  });
  it("unknown / missing / mistyped schema_version is rejected", () => {
    expect(ENVELOPE_SCHEMA_VERSION).toBe(1);
    for (const v of [0, 2, 99, "1", null, undefined]) {
      expect(accepts(S, withPatch(agentRunRequest(), { schema_version: v }))).toBe(false);
    }
    expect(accepts(S, without(agentRunRequest(), "schema_version"))).toBe(false);
  });
  it("requires every field; rejects extras", () => {
    for (const k of Object.keys(agentRunRequest())) {
      expect(accepts(S, without(agentRunRequest(), k))).toBe(false);
    }
    expect(accepts(S, withPatch(agentRunRequest(), { priority: 1 }))).toBe(false);
  });
  it("generation and attempt start at 1 and are integers", () => {
    for (const k of ["task_generation", "attempt_number"]) {
      for (const v of [0, -1, 1.5, "1"]) expect(accepts(S, withPatch(agentRunRequest(), { [k]: v }))).toBe(false);
      expect(accepts(S, withPatch(agentRunRequest(), { [k]: 2 }))).toBe(true);
    }
  });
  it("agent_role must be known; parent_run_id nullable", () => {
    expect(accepts(S, withPatch(agentRunRequest(), { agent_role: "Hacker" }))).toBe(false);
    expect(accepts(S, withPatch(agentRunRequest(), { parent_run_id: uuid(9) }))).toBe(true);
  });
  it("revision must be a full commit id", () => {
    expect(accepts(S, withPatch(agentRunRequest(), { revision: "main" }))).toBe(false);
  });
});

describe("AgentRunResult", () => {
  const S = AgentRunResultSchema;
  it("round-trips through JSON", () => {
    expect(S.parse(viaJson(agentRunResult()))).toEqual(agentRunResult());
  });
  it("unknown / missing / mistyped schema_version is rejected", () => {
    for (const v of [0, 2, "1", null]) {
      expect(accepts(S, withPatch(agentRunResult(), { schema_version: v }))).toBe(false);
    }
    expect(accepts(S, without(agentRunResult(), "schema_version"))).toBe(false);
  });
  it("carries every field the §14.1 fence needs, each required", () => {
    for (const k of ["agent_run_id", "task_id", "task_generation", "attempt_number", "revision_at_completion"]) {
      expect(accepts(S, without(agentRunResult(), k))).toBe(false);
    }
    expect(accepts(S, withPatch(agentRunResult(), { task_generation: "1" }))).toBe(false);
  });
  it("status is terminal-only", () => {
    for (const s of ["QUEUED", "RUNNING", "DONE"]) {
      expect(accepts(S, withPatch(agentRunResult(), { status: s }))).toBe(false);
    }
    for (const s of ["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]) {
      expect(accepts(S, withPatch(agentRunResult(), { status: s }))).toBe(true);
    }
  });
  it("confidence in [0,1] and finite", () => {
    for (const c of [-0.1, 1.1, NaN, Infinity, "0.5"]) {
      expect(accepts(S, withPatch(agentRunResult(), { confidence: c }))).toBe(false);
    }
    expect(accepts(S, withPatch(agentRunResult(), { confidence: 0 }))).toBe(true);
    expect(accepts(S, withPatch(agentRunResult(), { confidence: 1 }))).toBe(true);
  });
  it("evidence_refs are uuids; next_recommended_agent is a role or null; extras rejected", () => {
    expect(accepts(S, withPatch(agentRunResult(), { evidence_refs: ["e1"] }))).toBe(false);
    expect(accepts(S, withPatch(agentRunResult(), { evidence_refs: [uuid(30)] }))).toBe(true);
    expect(accepts(S, withPatch(agentRunResult(), { next_recommended_agent: "Fixer" }))).toBe(true);
    expect(accepts(S, withPatch(agentRunResult(), { next_recommended_agent: "Nobody" }))).toBe(false);
    expect(accepts(S, withPatch(agentRunResult(), { phase: "RELEASED" }))).toBe(false);
  });
});
