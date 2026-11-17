# Thread 12: refusalOf removed (2026-11-06)

Branch `20261106-refusalof_removed`, PR #526, based on main. Justify: green (safebyok 61 test files, 1831 tests; size budgets all within limit).

* **Built**: nothing; `refusalOf` and its doc block are gone from `packages/safebyok/src/refusals/outcome.ts`, and the `describe("refusalOf")` block with its `throwingForm` helper from `packages/safebyok/tests/refusals/outcome.test.ts`. The file's imports all still serve (`unexpectedError` is `outcomeOf`'s default). `outcome.ts` has no section banners.
* **Decisions taken**: the changeset is empty. `refusalOf` was never reachable from `src/index.ts` (it exports only `VaultError` and `isVaultError` from `refusals/`) or from `tests/test-helpers.ts` (`./testing`), so no host could name it.
* **Left alone, by instruction**: the module-private `refusalOf` in `helpers/validator.ts`, the test helper `refusalOf` in `tests/test-helpers/models-world.ts` (and its uses), and everything in `safebyok-old`, which has its own `refusalOf` and callers.
* **Deviations**: `notes/guarantees.md:297` still says `refusalOf, outcome.ts`; PR #517 (unmerged, in the merge line) rewrites that sentence to `outcomeOf`, so this thread does not touch guarantees.md.
* **Discoveries**: the throwing forms in the new models let a WebCrypto DOMException reach the host raw, as the Coach was told; this thread changes nothing there.
