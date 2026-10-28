# Thread 26: a dialog hidden by Activity, and the unmount gap (2026-10-28)

Branch `20261028-activity_mount`, PR [#350](https://github.com/mrflip/safebyok/pull/350), on main. Justify: green (root 289, core 3500 / 37
skipped, react 322, indexeddb 167 / 11, postgres 322 / 15, convex 375 / 9, graphql 345 / 15,
fastkey 49, demo 230 / 17, e2e 107 / 116).

A follow-up after the sprint closed, from #320's review: `useIsMounted` read false while an
`<Activity>` hid a dialog, so an answer settling meanwhile was dropped (an unlock that succeeded
left the dialog up with `onDone` never called; `PasskeyUnlockButton` stayed disabled), and its
flag cleared a task late at unmount. The Coach: ordinary React, nothing in the core, "U-B-U".

* **Built**:
  * **`useWhenShown`** (`packages/safebyok-react/src/when-shown.ts`, renamed from `is-mounted.ts`;
    internal, not exported) replaces `useIsMounted`. It hands back `whenShown(goOn)`: `goOn` is
    called at once while the component shows; parked while a Suspense boundary or an Activity
    hides it, and called once it shows again; never called once it has unmounted (the promise
    never settles, and the handler goes no further). Set and cleared by one layout effect, so
    "shown" begins in the mounting commit (#320's gap) and ends in the commit that hides or
    unmounts (the unmount gap). The promise carries `goOn`'s result, so a step that is itself an
    await (`gating.attemptPasskey`) goes through it too.
  * **Callers**: `useAttempts.attempt`, `PutPasskeyForm`, `PasskeyPress.press` (its `setAsking(false)`
    now inside each step, not a `finally`), `useAnswerOnce`'s `lockLanded`, and `useAdvice`.
  * **`useAdvice`** no longer makes an answer stale by a layout cleanup (which also ran on hiding);
    an answer is heard if it is for the latest text and the mode it was asked in (a ref of the
    mode as of the last commit).
  * **Tests**: `when-shown.test.tsx` (12: in-commit, StrictMode, Suspense, Activity, hidden then
    unmounted, the result and a throw, identity, the example, after unmount, and the gap between
    an unmounting commit and its passive cleanup, run outside `act` on a bare root);
    `passphrase-modal.test.tsx` "while an Activity hides it" (unlock, refusal, lock landing,
    advice); `passkey-unlock-button.test.tsx` "while an Activity hides it" (a refusal re-enables
    the button; a passkey touched while hidden unlocks once shown). The Activity, Suspense and
    unmount-gap tests fail against the old hook's semantics, checked by swapping it in; the
    lock-landing one passed before too, and pins it.
  * **Changeset** `.changeset/20261028-activity_mount.md`, safebyok-react patch; and
    `-2`, safebyok patch, for the spent answer.
  * **Tests, the spent answer**: `gating.test.ts` *a passkey's answer handed to an attempt* (4:
    gating over, in flight, a lock before the seal, absent_wayin left unspent), failing without
    the fix; `when-shown.test.tsx` 15 (`isShown`, its example); the button's hidden touch now
    zeroed and pressed again; `gating-modal.test.tsx` a put_passkey made while hidden zeroed, and
    the typo's answer zeroed. `notes/guarantees.md` (table, access points, G2) and
    `notes/security.md` amended.

* **Decisions taken**:
  * **The hook stays, with a new contract, rather than going.** "State updates on an unmounted
    component are harmless" is true in a browser, but `ce1890b3` added the hook because a
    `setState` after unmount threw `window is not defined` in a host's test once jsdom was torn
    down (React reads `window.event` to pick an update's priority, for an unmounted component
    too), and a late `onDone` can close the *next* gating's dialog. No React primitive tells a
    hidden component from one gone (Activity runs every effect cleanup on hiding, and a hidden
    tree can then be unmounted with no further cleanup), so the answer is to wait while hidden
    rather than guess. It stays hand-rolled, 15 lines: no library tells the two apart either.
  * **A callback, not `await whenShown()`.** Awaiting a resolved promise costs a microtask, and
    that hop let a host's own `await vault.ensureUnlocked()` resume, and raise the next gating,
    before the first dialog's `onDone` closed it: GatingModal's host example test failed on it.
    `goOn` therefore runs synchronously while shown, as the old `isMounted()` check did.
  * **A passkey's answer is tried now or never** (reversed 2026-10-28, on the Coach's review; this
    entry first had a press settled while hidden wait, its answer parked until the dialog showed).
    Parking held the PRF bytes, as good as the passphrase, for as long as the hide lasted, and
    never zeroed them if the dialog was unmounted while hidden: against `notes/guarantees.md`
    (the answer lives "one seal"; G2, G7). `useWhenShown` now hands back `isShown` beside
    `whenShown`. `PasskeyPress` and `PutPasskeyForm` attempt at once while shown, else zero the
    answer untried and take a press again once shown; only the outcome waits, as on the
    passphrase path. Both zero the answer once its one attempt is done (`attemptOnce`,
    `passkey.ts`), as the core leaves a correctably refused one unspent.
  * **The core spends the answer an attempt is handed** (`spendAnswer`, `gating.ts`; the Coach
    asked for it beside the react fix). Before, only `PasskeyProving.seal` zeroed it, so an
    attempt refused before the seal (`gating_landed`, `attempt_in_flight`, `bad_option`, a lock
    landing first) left the bytes. Every outcome now zeroes it but a refusal the user can correct,
    which the README promises leaves it to hand in again (a mistyped passphrase in `put_passkey`).
    A host retrying with the same answer after misuse meets `bad_option`; one `vault-wayins` test
    did, and now hands in a fresh one. Its own changeset, `-2`, safebyok patch.
  * **Suspense now waits too.** A dialog a Suspense boundary hides meets what settled once it
    shows again, rather than while hidden; same outcome, later.

* **Deviations**:
  * **Pulled in: `useAdvice`.** Not a caller of the hook, but it had the same bug: its staleness
    counter was bumped by a layout cleanup that hiding runs, so advice settling while hidden was
    dropped. Small, and the same matter.
  * **Pulled in: a red convex typecheck on main.** `convex-vault-db.test.ts` (from #315) called the
    throwing `getVault` where `TH.expectBad` reads an Outcome, a merge race with the
    `getVault`/`tryGetVault` split; it now calls `tryGetVault`. Its own commit (`tests:`); another
    thread fixing it too would meet a one-word conflict.

* **Discoveries**:
  * The thread-24 explanation of the flag clearing "a task late" holds: passive cleanups of a
    default-lane commit run in a Scheduler task after the commit's microtasks. Inside `act` the
    gap cannot be seen, which is why the gap test drives a bare `createRoot` with
    `IS_REACT_ACT_ENVIRONMENT` off.

* **For the Coach**:
  * **Suspense now waits as Activity does** (open on the PR): a dialog a Suspense boundary hides
    meets what settled once it shows again, not while hidden. Same outcome, later. Rec: keep.

## Wrap-up pass

Three small leftovers from the review, one commit each in `packages/safebyok-react` and the changeset:

* The changeset now says a passkey touched while the dialog is hidden is *tried* once it shows again (the attempt itself waits), apart from the attempts, advice and lock landings whose outcome waits.
* `inActivity`, defined identically in `passkey-unlock-button.test.tsx` and `passphrase-modal.test.tsx`, is now `TH.inActivity`, defined in the new `tests/test-helpers-react.tsx` (a `.ts` file cannot hold the JSX, and the linter refuses children passed as a prop to `createElement`), which `tests/test-helpers.ts` re-exports with `export *`, so callers keep one `TH`. At the Coach's word the package's `test-helpers.ts` kept its name and history; STYLE.md *Tests* says where a JSX helper goes.
* The bare-root unmount test in `when-shown.test.tsx` asserts the button is there before it clicks, so it cannot pass vacuously.

Left alone, bound for the todo file: `useAdvice`'s `creatingNow`, and the doc blocks.
