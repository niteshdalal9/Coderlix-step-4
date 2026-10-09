/**
 * @coderlix/api — package skeleton.
 *
 * Step 02 (Monorepo/package structure) materializes this package as an
 * empty, buildable workspace member per Final Architecture §36 and the
 * MVP Implementation Plan. It intentionally contains no business logic.
 *
 * Responsibility (per Final Architecture §4): API gateway + orchestration entrypoint.
 * Real implementation lands in Step 40/42 — REST API + SSE / authentication of the MVP Implementation Plan.
 */

/** Stable package identifier, exported so the skeleton is non-empty and
 *  trivially importable/buildable before any real implementation lands. */
export const PACKAGE_NAME = "@coderlix/api" as const;
