/**
 * @coderlix/providers — package skeleton.
 *
 * Step 02 (Monorepo/package structure) materializes this package as an
 * empty, buildable workspace member per Final Architecture §36 and the
 * MVP Implementation Plan. It intentionally contains no business logic.
 *
 * Responsibility (per Final Architecture §4): model provider adapters + capability-alias router.
 * Real implementation lands in Step 21/22/23 — Provider Gateway / adapter contract / model routing of the MVP Implementation Plan.
 */

/** Stable package identifier, exported so the skeleton is non-empty and
 *  trivially importable/buildable before any real implementation lands. */
export const PACKAGE_NAME = "@coderlix/providers" as const;
