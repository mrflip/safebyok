# Thread 3: test_hygiene (2026-10-16)

Branch `20261016-test_hygiene`, PR [#103](https://github.com/mrflip/safebyok/pull/103), on main (`b60e516`). Justify: green (core 1136 tests, Convex 286, demo 135, others unchanged).

* **Built**:
  * `tallyWatches` (`packages/safebyok/tests/test-helpers.ts`) counts each watch closed at most once, per watch; a double close still reaches the adapter's unsubscribe. Test: two watches, one closed twice, `{ opened: 2, closed: 1 }` (red on the old helper). Its `@example` now has a test too (a refused open leaves no watch).
  * `expectRefusal` now asserts `instanceOf(VaultError)` (a runtime import of `../src/errors`) in place of instanceOf Error plus the name. One place, so every call site across the packages gets it. Its test table gains a lookalike (named `VaultError`, has a `kind`) and now expects it to fail.
  * `beforeNextCall` on a method that is already a mock replaces it for one call with a plain wrapper that calls the mock through and puts it back, so the mock records the call once. Otherwise, as before, a `vi.spyOn` with `mockImplementationOnce`. `holdNextCall` follows. Armed twice before a call, each arming belongs to one call in order (a queue: vitest's once-implementations on our own spy, a stand-in holding a list of errands on a test's own mock), as on base.
  * `convexRefusalOf` has `packages/safebyok-convex/tests/test-helpers.test.ts` (data returned, its `@example`, resolves fails, other errors thrown on).
  * Demo: `tests/opened-vaults.ts` keeps the vaults `world.open` and `world.openUnlocked` hand out, and `tests/setup.ts` closes them after each test (so the explicit `close()` calls in KnockKnock's Cancel test are gone). The two inspection-panel tests wipe their module stores (`dbStore`, `deviceStore`, the two IndexedDB shelves through the inspectors) after each test; each file ends with a test that fails without the wipe. A pair of ordered tests proves the vault closing.
  * Changeset `20261016-test_hygiene.md` (`safebyok` patch) for the three changed helpers.

* **Decisions taken**:
  * The demo's inspection panels read module singletons from `src/lib/stores.ts`, so "each gets its own store" is done as a wipe after each test, not a fresh module per test (that would mean `vi.resetModules` and dynamic imports for no gain).
  * `beforeNextCall` does not use `getMockImplementation()`: in vitest 5 a `vi.spyOn` spy returns `undefined` from it, so the original is out of reach.
  * Patch, not minor, for the changeset: nothing is added, three helpers get stricter or more exact.

* **Deviations**:
  * `stateOnOpen` in `packages/safebyok/tests/vault.test.ts` (leaves its vault open, noted in #80's review) is left alone: "leaves the vault to open cleanly ... with one live watch" counts on that open watch, and the file is not among the helpers this thread names. Closing it means rewriting that test.
  * No `eslint-disable`, `ts-expect-error` or `any` added. One `Reflect.set` stands in for assigning to a parameter's property.

* **Discoveries**: the "double close" was real, not hypothetical: `Vault.close()` is not idempotent in what it calls (it unsubscribes from storage each time), which is why the tally counted two closes for one watch. Nothing in the vault is wrong with that; the adapters' unsubscribes tolerate it.

* **For the Coach**: `expectRefusal` is stricter for third parties (see the changeset): an adapter built against a second installed copy of `safebyok` now fails `describeVaultDB`. In this repo that is none, as the `@safebyok/source` condition and the unbundled `dist/` share one `VaultError`.
