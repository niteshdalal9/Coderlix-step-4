/**
 * Budget ledger types (Final Architecture §22, §23; migration M-07).
 *
 * Types only. The reserve / settle / TTL-sweep protocol is Step 17 and
 * lives in conditional SQL, never in code that reads then writes.
 *
 * `used` MAY exceed `limit`: §23 settles actual usage even above the
 * estimate ("tokens already generated can't be un-spent"), so there is
 * intentionally NO `used + reserved <= limit` invariant here. The only
 * hard rule is non-negativity.
 *
 * KNOWN SPEC GAP (not resolved here, see the Step 04 report): §22 lists
 * request, token, time and cost ceilings, but M-07 gives one numeric
 * `limit/used/reserved` per `(scope, scope_ref, period)`, with no unit.
 * These types mirror M-07 as written; a `unit` dimension must be added
 * to the spec and the unique key before Step 05/17 rely on this.
 */
import { z } from "zod";
import { FiniteNonNegativeNumberSchema, IdSchema, TimestampSchema } from "./common.js";
import { BudgetScopeSchema } from "./state.js";

export const BudgetSchema = z
  .object({
    id: IdSchema,
    scope: BudgetScopeSchema,
    /** task id (scope=task), provider name (scope=provider), ... */
    scope_ref: z.string().min(1),
    /** e.g. a day for scope=daily; null when not period-bound. */
    period: z.string().min(1).nullable(),
    limit: FiniteNonNegativeNumberSchema,
    used: FiniteNonNegativeNumberSchema,
    reserved: FiniteNonNegativeNumberSchema,
  })
  .strict()
  .refine((b) => b.scope !== "task" || IdSchema.safeParse(b.scope_ref).success, {
    message: "scope=task requires scope_ref to be a task id (uuid)",
    path: ["scope_ref"],
  });
export type Budget = z.infer<typeof BudgetSchema>;

/** Outstanding reservation, swept by TTL if never settled (§23.5). */
export const BudgetReservationSchema = z
  .object({
    id: IdSchema,
    budget_id: IdSchema,
    agent_run_id: IdSchema.nullable(),
    estimate: FiniteNonNegativeNumberSchema,
    expires_at: TimestampSchema,
    settled_at: TimestampSchema.nullable(),
  })
  .strict();
export type BudgetReservation = z.infer<typeof BudgetReservationSchema>;
