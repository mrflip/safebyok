# Thread: example rebalance (2026-11-06)
# Thread: example rebalance (2026-11-06)
Branch `20261106-example_rebalance`, PR #514, off `origin/main` at 57f33ee9, hand-spawned (no sprint). Justify: green;
safebyok 61 files, 1834 tests.

* **Built**: the audit's (`/workspace/byok/whiteboard/20261102-newdesign/example-audit.md`) drops and trims across
  `packages/safebyok/src/**` and `tests/test-helpers/**`. `@example`s in src go from 123 to 59, and in the helpers
  from 51 to 28. `label` shows `0__b_` failing three ways with one issue. `Checker`'s first example is the real
  `prfSalt` line. `refusalOf` and `makeLatch` are trimmed. Pointers: 29 removed, 11 renumbered, 6 added, 4 titles
  rewritten. There are new tests for `bankedVaultScope`, `freshPasskeyAnswer`, `isLeaseKey`, `whisper`'s kept
  examples and `Checker`'s `prfSalt`. `Phrases.LabelShape` now names all three rules.
* **Decisions taken**:
  * The phrase is a `patch` changeset: a host sees it in a refusal's message, so it ships.
  * `label`'s doc block repeats the phrase's wording.
  * Collapsed blocks of one line become one-line doc blocks.
* **Deviations**:
  * `isLeaseKey`'s test sits in shapes-gateish.test.ts beside its module, not in lease.test.ts as the audit said.
  * src ends at 59, not the audit's 55. The 4 extra are skipped verdicts:
    * main moved under the audit. Since #499 a whisper is always an object.
    * The `Whisper` type's two literals are now both objects. They show what `Record<string, any>` hides, where the
      audit's string literal did not.
    * `whisper` 1 is now "an object passes, copied". `whisper` 2 is now "a bare string refuses, with its remedy".
      The audit judged a string passing, and `undefined`.
  * Other mappings from the audit's names:
    * `vaultBag` and `bankBag` are `bankedVaultScope` and `BankedVaultScope`.
    * The audit's `bankBag` 4 has no counterpart on main.
    * `guardStrengthChecker` is `invokeStrengthChecker` on main.
* **Discoveries**:
  * Net tokens measured from the diff run higher than the audit's (src -1,324 against -1,071; helpers -416 against
    -314). The collapses remove comment furniture the audit did not count.
  * `isVaultError`'s example calls a `vault.getWhisper` the core lacks (see `human/20261106-example_rebalance.md`).
* **For the Coach**:
  * Two adds wait on model doc blocks: `Bank`'s order and `putBox`'s bare whisper.
  * Should the untested validators get full case tables?
  * A pointer pass is owed. All three are in the human note.
