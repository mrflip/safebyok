# Thread 24: the dialog test that flaked under load (2026-10-28)

Branch `20261028-dialog_flake`, PR [#320](https://github.com/mrflip/safebyok/pull/320), on main. Justify: green (root 266, core 3423 / 37 skipped, react 312, indexeddb 167 / 11, postgres 322 / 15,
convex 367 / 9, graphql 344 / 15, fastkey 49, demo 229 / 17, e2e 107 / 116; size budgets within
their limits, react's 6.49 kB / 6.94 kB of 10 kB).

A follow-up after the sprint closed, from the Coach's "yes fix" on "A React test that flakes under
the full justify run": `bank-provider-dialog.test.tsx`, "a dialog that meets misuse keeps the app
in place, and closing it answers declined", failing to find the dialog's Close button about one
full run in three.

* **Built**:
  * **The cause was in the component, not the test.** `useIsMounted` (`packages/safebyok-react/src/is-mounted.ts`)
    set its flag in a passive effect. React runs a commit's passive effects in a task of their
    own once its scheduler has yielded, which it does when its 5 ms slice is spent: on a loaded
    machine, between the commit that shows the dialog and those effects. `findByPlaceholderText`
    resolves on the DOM mutation, so the test types and clicks Unlock in that gap. This test's
    attempt is refused `unknown_key_deriver` before any key is derived, so it settles within
    microtasks, still in the gap: `useAttempts.attempt` asked `isMounted()`, heard false, and
    dropped the refusal. The call was refused (the gating settled), but the form stayed up and the
    trouble notice with its Close never came. Every other dialog test's attempt derives a key,
    which takes a macrotask, so the effects had run by then: that is why only this test flaked.
  * **The fix**: `useIsMounted` now sets its flag in a layout effect, in the commit that shows the
    component, and clears it in a passive effect's cleanup as before (a Suspense boundary hiding
    the component runs its layout cleanups, never its passive ones, so it still reads mounted).
    `PassphraseModal`, `GatingModal` and `PasskeyUnlockButton` all ask it, and all are mended.
  * **Tests** (`tests/is-mounted.test.tsx`): "answers true in the commit that mounts the component,
    before React runs its passive effects" (a sibling's layout effect asks it; fails on the old
    hook, passes on the new), and "answers false while an Activity hides the component, and true
    once it shows again", which the doc block promised and nothing tested, and which the change
    touches.
  * **Changeset** `.changeset/20261028-dialog_flake.md`, patch for safebyok-react.

* **Reproduction and the runs after**:
  * **Load alone did not reproduce it here.** Before the fix: the dialog test file 16 at a time
    ×3 and 40 at a time ×2 (128 runs), and two full multi-package `pnpm -r test` runs as justify
    makes them: all green. This machine (16 cores) seems to keep the scheduler inside its slice.
  * **Forcing the yield did.** A scratch copy of the test (not committed) with `performance.now`
    spied to step 10 ms a read, so React's scheduler always finds its slice spent and yields
    between commit and passive effects, as under load: before the fix it failed 12 of 20 runs
    (the call refused, no Close ever), and with the old hook and the waiting stretched to 500 ms
    it still failed, so the answer was dropped, not late. After the fix: 20 of 20 passed.
  * **Loaded runs after the fix**: the dialog test file 40 at a time ×5 (200 runs), beside the
    first rounds of ten full multi-package `pnpm -r test` rounds: 200 of 200 green, and the react
    package 312 / 312 in each of the 9 rounds that reached it, then in this thread's justify. The
    second round stopped at the core (see *Discoveries*), so pnpm never ran its dependents.

* **Decisions taken**:
  * **Fixed in the component, not the test.** The test clicks as a user may, the moment the
    dialog shows; the dialog's contract says it answers. Nothing in the test waits wrongly.
  * **The regression test is at the hook**, where it is deterministic, not the dialog-level
    `performance.now` reproduction, which leans on how React's scheduler reads the clock.

* **Discoveries**:
  * **Another flake, in the core, under that heavier load**: `tests/test-helpers.test.ts`,
    "vaultDBTimingChecks, against adapters that do not guard > misses that late device where
    nothing holds a round trip", timed out at 5000 ms in one of the ten rounds, with forty
    dialog runs beside it. Not this thread's; left as it is, and raised for the Coach.

* **For the Coach**:
  * **Host-visible, but no change to the contract.** In the gap above, a host's dialog lost an
    attempt's answer: a refusal returned at once (misuse, a blank passphrase) showed nothing, and
    the dialog stayed up over a settled gating. The fix makes the dialogs do what their doc blocks
    already promise; no promise changes. Hence a patch changeset, not a stop for a ruling. Rec:
    confirm.
  * **The core flake** under *Discoveries*. Rec: a small thread of its own if it shows in a
    normal justify run.
