/**
 * @coderlix/orchestrator — package skeleton.
 *
 * Step 02 (Monorepo/package structure) materializes this package as an
 * empty, buildable workspace member per Final Architecture §36 and the
 * MVP Implementation Plan. It intentionally contains no business logic.
 *
 * Responsibility (per Final Architecture §4): classifier, risk engine, Task State Machine, Agent Run lifecycle, fencing.
 * Real implementation lands in Step 06, 08, 26, 35-38 — Task State Machine / Agent Run lifecycle / retry-escalation / DAG / recovery / cancellation / fencing of the MVP Implementation Plan.
 */

/** Stable package identifier, exported so the skeleton is non-empty and
 *  trivially importable/buildable before any real implementation lands. */
export const PACKAGE_NAME = "@coderlix/orchestrator" as const;
