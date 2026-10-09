/**
 * Shared primitives for every cross-boundary schema (Step 04).
 *
 * Conventions used across this package (deliberate, uniform):
 *  - Every object schema is `.strict()`: unknown keys are REJECTED, never
 *    silently stripped. A contract that quietly drops a field it does not
 *    know about hides version skew and lets a producer smuggle fields
 *    (e.g. an `authoritative` flag) past a consumer.
 *  - "May be absent" is modelled as `nullable()` with the key REQUIRED
 *    (explicit `null`), matching the nullable DB columns these map to.
 *    `.optional()` is used only for genuinely optional tuning parameters.
 *  - Timestamps are ISO-8601 strings with an explicit UTC offset (JSON has
 *    no date type). Git revisions are lowercase hex object ids.
 *  - Written to the subset of the Zod API that is identical in Zod 3.23
 *    and Zod 4 (no `.default()`, no `z.iso.*`, refinements via `.refine`).
 */
import { z } from "zod";

/** UUID identifier (task, workspace, agent run, execution, ...). */
export const IdSchema = z.string().uuid();

/** Git commit object id: SHA-1 (40) or SHA-256 (64) lowercase hex. */
export const RevisionSchema = z
  .string()
  .regex(
    /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/,
    "revision must be a full lowercase hex git object id (40 or 64 chars)",
  );

/** ISO-8601 timestamp with explicit offset, e.g. 2026-10-08T10:00:00Z. */
export const TimestampSchema = z.string().datetime({ offset: true });

/** Opaque reference (stdout/stderr blob ref, artifact ref, context ref). */
export const OpaqueRefSchema = z.string().min(1);

/** Integer in [0, 2^53-1]. */
export const SafeNonNegativeIntSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);

/** Integer in [1, 2^53-1]. */
export const SafePositiveIntSchema = z
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER);

/** Finite number >= 0. */
export const FiniteNonNegativeNumberSchema = z.number().finite().min(0);

/** True when every string in the array is distinct. */
export function hasUniqueItems(items: readonly string[]): boolean {
  return new Set(items).size === items.length;
}

/**
 * True when `earlier <= later`. If either side is not a parseable
 * timestamp this returns true: the field-level schema has already
 * reported that error, and a second, misleading "ordering" error on top
 * of it would only add noise.
 */
export function isNotAfter(earlier: string, later: string): boolean {
  const a = Date.parse(earlier);
  const b = Date.parse(later);
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return a <= b;
}
