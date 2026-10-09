/**
 * @coderlix/verification — package skeleton.
 *
 * Step 02 (Monorepo/package structure) materializes this package as an
 * empty, buildable workspace member per Final Architecture §36 and the
 * MVP Implementation Plan. It intentionally contains no business logic.
 *
 * Responsibility (per Final Architecture §4): Verification Service + Release Gate + result rules.
 * Real implementation lands in Step 07, 18/19/20 — Phase Machine / Verification Authorization / runner / Release Gate of the MVP Implementation Plan.
 */

/** Stable package identifier, exported so the skeleton is non-empty and
 *  trivially importable/buildable before any real implementation lands. */
export const PACKAGE_NAME = "@coderlix/verification" as const;
