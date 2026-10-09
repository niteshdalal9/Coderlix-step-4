import { describe, expect, it } from "vitest";
import { RevisionSchema, TimestampSchema, VerificationAuthorizationSchema } from "../src/index.js";
import { REV_A, T0, accepts, issuePaths, verificationAuthorization, viaJson, without, withPatch } from "./fixtures.js";

const S = VerificationAuthorizationSchema;

describe("VerificationAuthorization", () => {
  it("round-trips through JSON", () => {
    expect(S.parse(viaJson(verificationAuthorization()))).toEqual(verificationAuthorization());
  });

  it("requires every field and rejects extras", () => {
    for (const k of Object.keys(verificationAuthorization())) {
      expect(accepts(S, without(verificationAuthorization(), k))).toBe(false);
    }
    expect(accepts(S, withPatch(verificationAuthorization(), { consumed: false }))).toBe(false);
  });

  it("stage and evidence types must be known values", () => {
    expect(accepts(S, withPatch(verificationAuthorization(), { stage: "LINT" }))).toBe(false);
    expect(accepts(S, withPatch(verificationAuthorization(), { allowed_evidence_types: ["sast"] }))).toBe(false);
  });

  it("allowed_evidence_types: non-empty and unique", () => {
    expect(accepts(S, withPatch(verificationAuthorization(), { allowed_evidence_types: [] }))).toBe(false);
    expect(accepts(S, withPatch(verificationAuthorization(), { allowed_evidence_types: ["lint", "lint"] }))).toBe(false);
  });

  it("expires_at must be strictly after issued_at", () => {
    expect(issuePaths(S, withPatch(verificationAuthorization(), { expires_at: T0 }))).toContain("expires_at");
    expect(accepts(S, withPatch(verificationAuthorization(), { expires_at: "2026-10-08T09:00:00Z" }))).toBe(false);
  });

  it("issued_by must be non-empty", () => {
    expect(accepts(S, withPatch(verificationAuthorization(), { issued_by: "" }))).toBe(false);
  });
});

describe("RevisionSchema", () => {
  it("accepts full lowercase hex ids (SHA-1 and SHA-256)", () => {
    expect(RevisionSchema.safeParse(REV_A).success).toBe(true);
    expect(RevisionSchema.safeParse("a".repeat(64)).success).toBe(true);
  });
  it("rejects short, uppercase, ref names and wrong lengths", () => {
    for (const r of ["abc1234", REV_A.toUpperCase(), "HEAD", "main", "a".repeat(39), "a".repeat(41), `${REV_A} `, ""]) {
      expect(RevisionSchema.safeParse(r).success).toBe(false);
    }
  });
});

describe("TimestampSchema", () => {
  it("requires an explicit offset", () => {
    expect(TimestampSchema.safeParse("2026-10-08T10:00:00Z").success).toBe(true);
    expect(TimestampSchema.safeParse("2026-10-08T10:00:00+05:30").success).toBe(true);
    expect(TimestampSchema.safeParse("2026-10-08T10:00:00").success).toBe(false);
    expect(TimestampSchema.safeParse("2026-10-08").success).toBe(false);
    expect(TimestampSchema.safeParse("yesterday").success).toBe(false);
  });
});
