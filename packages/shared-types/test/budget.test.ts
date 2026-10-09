import { describe, expect, it } from "vitest";
import { BudgetReservationSchema, BudgetSchema } from "../src/index.js";
import { accepts, budget, budgetReservation, issuePaths, viaJson, without, withPatch } from "./fixtures.js";

describe("Budget", () => {
  const S = BudgetSchema;
  it("round-trips through JSON", () => {
    expect(S.parse(viaJson(budget()))).toEqual(budget());
  });
  it("requires every field; rejects extras", () => {
    for (const k of Object.keys(budget())) expect(accepts(S, without(budget(), k))).toBe(false);
    expect(accepts(S, withPatch(budget(), { unit: "tokens" }))).toBe(false);
  });
  it("limit / used / reserved must be finite and non-negative", () => {
    for (const k of ["limit", "used", "reserved"]) {
      for (const v of [-1, NaN, Infinity, "5"]) expect(accepts(S, withPatch(budget(), { [k]: v }))).toBe(false);
      expect(accepts(S, withPatch(budget(), { [k]: 0 }))).toBe(true);
    }
  });
  it("allows used > limit (§23: overshoot is settled, not refused)", () => {
    expect(accepts(S, withPatch(budget(), { used: 1500 }))).toBe(true);
    expect(accepts(S, withPatch(budget(), { used: 900, reserved: 900 }))).toBe(true);
  });
  it("scope: known values; task scope needs a task-id scope_ref", () => {
    expect(accepts(S, withPatch(budget(), { scope: "global" }))).toBe(false);
    expect(issuePaths(S, withPatch(budget(), { scope_ref: "not-a-uuid" }))).toContain("scope_ref");
    expect(accepts(S, withPatch(budget(), { scope: "provider", scope_ref: "openrouter" }))).toBe(true);
    expect(accepts(S, withPatch(budget(), { scope: "daily", scope_ref: "openrouter", period: "2026-10-08" }))).toBe(true);
  });
});

describe("BudgetReservation", () => {
  const S = BudgetReservationSchema;
  it("round-trips; settled_at and agent_run_id nullable", () => {
    expect(S.parse(viaJson(budgetReservation()))).toEqual(budgetReservation());
    expect(accepts(S, withPatch(budgetReservation(), { settled_at: "2026-10-08T10:01:00Z" }))).toBe(true);
    expect(accepts(S, withPatch(budgetReservation(), { agent_run_id: null }))).toBe(true);
  });
  it("requires expires_at (every reservation has a TTL) and a non-negative estimate", () => {
    expect(accepts(S, without(budgetReservation(), "expires_at"))).toBe(false);
    expect(accepts(S, withPatch(budgetReservation(), { expires_at: null }))).toBe(false);
    expect(accepts(S, withPatch(budgetReservation(), { estimate: -1 }))).toBe(false);
  });
});
