# boundary-fixture/

Permanent, committed example of a dependency-boundary violation: a
forbidden `packages/agents -> packages/execution` import, forbidden by
Final Architecture §4/§27. See the comment header in
`forbidden-import.fixture.ts` for details.

This directory is **not** part of the `@coderlix/agents` package's
production source:

- excluded from `packages/agents/tsconfig.json` (`exclude`), so it is
  never compiled or emitted to `dist/`;
- not referenced from anything under `src/`;
- excluded from the production `pnpm run boundaries` scan
  (`.dependency-cruiser.cjs`'s `options.exclude`), so a clean,
  architecture-obeying production tree makes that command pass.

**Note on the automated self-test:** `pnpm run boundaries:self-test`
(`scripts/boundaries-self-test.mjs`) does not scan this file directly.
It instead exercises the same rule *intent* (agents -> execution
forbidden) against a throwaway, isolated fixture it generates at
runtime using plain relative imports, then deletes. See that script's
header comment for why -- in short, this file's `@coderlix/execution`
specifier depends on `tsconfig.paths.json`'s alias resolution, which
was not reliably exercising the rule under the installed
dependency-cruiser version. This file itself is unchanged and remains
the canonical, structurally-accurate, permanently-committed example.
