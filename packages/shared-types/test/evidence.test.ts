import { describe, expect, it } from "vitest";
import { EVIDENCE_SCHEMA_VERSION, EvidenceSchema } from "../src/index.js";
import { accepts, evidence, issuePaths, uuid, viaJson, without, withPatch } from "./fixtures.js";

const S = EvidenceSchema;

describe("Evidence", () => {
  it("round-trips through JSON", () => {
    expect(S.parse(viaJson(evidence()))).toEqual(evidence());
  });

  it("requires every §9 field and rejects extras", () => {
    for (const k of Object.keys(evidence())) {
      expect(accepts(S, without(evidence(), k))).toBe(false);
    }
    expect(accepts(S, withPatch(evidence(), { notes: "x" }))).toBe(false);
  });

  it("schema_version: only the current version is accepted", () => {
    expect(EVIDENCE_SCHEMA_VERSION).toBe(1);
    for (const v of [0, 2, "1", null, 1.5]) {
      expect(accepts(S, withPatch(evidence(), { schema_version: v }))).toBe(false);
    }
  });

  it("verification_authorization_id is mandatory (null is not allowed)", () => {
    expect(accepts(S, withPatch(evidence(), { verification_authorization_id: null }))).toBe(false);
  });

  it("agent_run_id and superseded_by are nullable", () => {
    expect(accepts(S, withPatch(evidence(), { agent_run_id: uuid(2) }))).toBe(true);
    expect(accepts(S, withPatch(evidence(), { superseded_by: uuid(31), status: "STALE" }))).toBe(true);
  });

  it("an evidence row cannot supersede itself", () => {
    expect(issuePaths(S, withPatch(evidence(), { superseded_by: uuid(30) }))).toContain("superseded_by");
  });

  it("enums are exact; authoritative must be a real boolean", () => {
    expect(accepts(S, withPatch(evidence(), { result: "PASS" }))).toBe(false);
    expect(accepts(S, withPatch(evidence(), { status: "active" }))).toBe(false);
    expect(accepts(S, withPatch(evidence(), { evidence_type: "sast" }))).toBe(false);
    expect(accepts(S, withPatch(evidence(), { authoritative: "true" }))).toBe(false);
    expect(accepts(S, withPatch(evidence(), { authoritative: 1 }))).toBe(false);
  });

  it("result=pass requires exit_code=0, except manual_review", () => {
    expect(accepts(S, withPatch(evidence(), { exit_code: 1 }))).toBe(false);
    expect(accepts(S, withPatch(evidence(), { exit_code: null }))).toBe(false);
    expect(accepts(S, withPatch(evidence(), { result: "fail", exit_code: 1 }))).toBe(true);
    expect(accepts(S, withPatch(evidence(), { result: "error", exit_code: null }))).toBe(true);
    expect(accepts(S, withPatch(evidence(), { result: "inconclusive", exit_code: 0 }))).toBe(true);
    expect(accepts(S, withPatch(evidence(), { evidence_type: "manual_review", exit_code: null }))).toBe(true);
  });

  it("end_time may not precede start_time; output refs are required", () => {
    expect(accepts(S, withPatch(evidence(), { end_time: "2026-10-08T09:00:00Z" }))).toBe(false);
    expect(accepts(S, withPatch(evidence(), { stdout_ref: null }))).toBe(false);
  });

  it("a payload claiming authoritative=true still only proves well-formedness", () => {
    // Parsing succeeds; trust is decided by the §10 chain (Step 19/20), not here.
    expect(S.parse(evidence()).authoritative).toBe(true);
  });
});
