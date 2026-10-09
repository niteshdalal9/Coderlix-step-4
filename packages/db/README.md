# @coderlix/db

Postgres schema, forward-only migrations, and a typed query/transaction client. Sole owner of the database schema.

> **Status: Step 02 skeleton only.** This package currently contains no
> business logic -- just a minimal, strictly-typed, buildable placeholder.
> Real implementation lands in **Step 05 — Schema + migrations** of the MVP Implementation
> Plan.

## Allowed workspace dependencies

Per the dependency-boundary policy enforced by `.dependency-cruiser.cjs`
at the repository root (Final Architecture §4, §27):

`@coderlix/shared-types`

Any other cross-package import from this module is a build-time boundary
violation, not a convention.
