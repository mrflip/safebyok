# Thread 1: react_lean_pkg (2026-11-21)

Branch `20261121-react_lean_pkg`. Proved: `pnpm --filter safebyok-react-lean` test (4 files, 88 tests), lint, typecheck, build; `safebyok-react` lint, typecheck, test (277) green.

* **Built**: `packages/safebyok-react-lean`, private 0.0.0, entries `.` (exports the giver), `./parts`, `./kit` (empty); `safebyok` a workspace dependency, react-query a peer. Giver sources, tests and three worlds `git mv`ed in; `secret-search.ts` copied (the old package keeps it and its test). The three eslint-disables for `safebyok` are gone.
* **Decisions**: the new `tests/test-helpers.ts` is minimal (re-exports `safebyok/testing`, the worlds, secret-search); `safebyok-react`'s no longer re-exports the worlds. `safebyok` declares `@tanstack/query-core` a peer dependency in place of a dependency.
* **Deviations**: the brief says 62 giver cases; vitest counts 88 tests (it counts each case of a table). The same files pass. The package is not in the changesets' fixed group.
