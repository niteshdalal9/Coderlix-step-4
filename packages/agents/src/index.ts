/**
 * @coderlix/agents — package skeleton.
 *
 * Step 02 (Monorepo/package structure) materializes this package as an
 * empty, buildable workspace member per Final Architecture §36 and the
 * MVP Implementation Plan. It intentionally contains no business logic.
 *
 * Responsibility (per Final Architecture §4): one module per agent, shared base contract.
 * Real implementation lands in Step 27/28/29, 31-34 — Agent Runtime / mediation / handoff envelopes / MVP agents of the MVP Implementation Plan.
 */

/** Stable package identifier, exported so the skeleton is non-empty and
 *  trivially importable/buildable before any real implementation lands. */
export const PACKAGE_NAME = "@coderlix/agents" as const;
