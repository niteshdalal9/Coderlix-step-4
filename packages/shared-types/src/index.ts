/**
 * @coderlix/shared-types — Zod schemas + TS types for every cross-boundary
 * structure (Final Architecture §4; MVP Implementation Plan Step 04).
 *
 * Contracts only. No behaviour lives here: no state machines, no fencing,
 * no evidence promotion, no budget arithmetic, no provider calls. Those
 * are later steps and import these contracts.
 */

/** Stable package identifier (kept from the Step 02 skeleton). */
export const PACKAGE_NAME = "@coderlix/shared-types" as const;

export * from "./common.js";
export * from "./state.js";
export * from "./operation.js";
export * from "./execution.js";
export * from "./verification.js";
export * from "./evidence.js";
export * from "./envelope.js";
export * from "./provider.js";
export * from "./budget.js";
