import { describe, expect, it } from "vitest";
import { hasUniqueItems, isNotAfter } from "../src/index.js";

describe("common helpers", () => {
  it("isNotAfter compares instants across offsets", () => {
    expect(isNotAfter("2026-10-08T10:00:00Z", "2026-10-08T10:00:00Z")).toBe(true);
    expect(isNotAfter("2026-10-08T10:00:01Z", "2026-10-08T10:00:00Z")).toBe(false);
    expect(isNotAfter("2026-10-08T10:00:00+05:30", "2026-10-08T05:00:00Z")).toBe(true);
  });
  it("isNotAfter defers unparseable input to the field schema", () => {
    expect(isNotAfter("garbage", "2026-10-08T10:00:00Z")).toBe(true);
    expect(isNotAfter("2026-10-08T10:00:00Z", "garbage")).toBe(true);
  });
  it("hasUniqueItems", () => {
    expect(hasUniqueItems([])).toBe(true);
    expect(hasUniqueItems(["a", "b"])).toBe(true);
    expect(hasUniqueItems(["a", "a"])).toBe(false);
  });
});
