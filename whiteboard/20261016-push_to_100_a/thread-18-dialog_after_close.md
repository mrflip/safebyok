# Thread 18: dialog_after_close (2026-10-17)

Branch `20261017-dialog_after_close`, PR [#147](https://github.com/mrflip/safebyok/pull/147), stacked on
#125 (the top of the line). Justify: green; safebyok-react 217 tests (9 files), demo 189 passed |
16 skipped (18 files), every other package as at the base.

* **Built**:
  - `packages/safebyok-react/src/is-mounted.ts` (internal, not exported): `useIsMounted()`, a
    function answering true from the commit until unmount, kept by a layout effect. A function
    rather than the ref, because TypeScript carries a ref's narrowing across an await (the second
    `! mounted.current` after a first check read as "always falsy" to the linter).
  - `passphrase-modal.tsx`: `submit` and `startOver` ask `isMounted()` after their await (in the
    `try`, the `catch` and the `finally`) and do nothing once the dialog is gone: no `onDone`, no
    `meet`, no state. `useAdvice` reuses thread 14's staleness counter: its layout effect now bumps
    `asked` in its *cleanup*, so the dialog unmounting makes an answer or failure on its way stale
    exactly as a change of mode does (one mechanism, one comparison, no second check).
  - `passkey-unlock-button.tsx`: `press` likewise; and a passkey whose answer arrives after the
    button went unlocks nothing (`vault.unlock` is never called).
  - Doc blocks of `PassphraseModal` and `PasskeyUnlockButton` say so: taken away, they let go;
    the vault's snapshot says whether an unlock landed.
  - Tests (17, each failing without the fix; checked by stashing the two src files): in
    `passphrase-modal.test.tsx`, "once it has gone": an unlock settling after unmount as success,
    `wrong_passphrase`, `vault_locked`, `vault_closed`, a non-VaultError; one after another vault
    took its place; an erase as success, `stale_write`, a condition, misuse; advice answering and
    failing; and a control that a refusal landing while the dialog stands is met as ever. In
    `passkey-unlock-button.test.tsx`: the four unlock outcomes after unmount, and a passkey
    touched after unmount. `is-mounted.test.tsx` covers the hook and its `@example`.
  - Test helpers (`tests/test-helpers.ts`): `TH.held()`, a deferred promise (see Deviations), and
    `TH.watchStateUpdates()`, which counts React's reads of `window.event` -- the read that
    threw in CI, made on every state update scheduled outside an event, including on an
    unmounted fiber -- so a test can assert a gone component scheduled no update. React 19 gives
    no other observable for a setState on an unmounted component.
  - Demo: `App.test.tsx`'s click-through waits for the last unlock to land and the dialog to
    close (it waited for "No lockboxes yet", which shows the moment the vault is erased: the test
    ended with the create-unlock under way every run). That exposed a demo bug, fixed in
    `VaultDashboard.tsx`: the delete, run again by `withUnlockedVault` on the *new* vault after a
    start-over, rejected `absent_box` from a voided handler. A lockbox already gone now reads as
    deleted; a new test in `VaultDashboard.test.tsx` (box erased elsewhere while the dialog asks).
  - Changeset `20261017-dialog_after_close.md`, `safebyok-react: patch`.
* **Decisions taken**:
  - Gone means unmounted (the host took it away, a new vault remounted it through the boundary
    key, or the page went). A dialog that called `onDone(false)` but is still mounted still
    stands: whether to unmount it is the host's call.
  - A misuse error landing after unmount is dropped, not rethrown: there is no boundary left to
    show it, and rethrowing from a voided handler is exactly the unhandled rejection being fixed.
  - Library first: `usehooks-ts`'s `useIsMounted` and `react-use`'s `useMountedState` do this;
    rejected under the sprint's no-new-runtime-dependency rule for a ref and a layout effect the
    file already uses in the same form (thread 14's counter). Named after `usehooks-ts`'s, so it
    reads as the familiar idiom.
* **Deviations**:
  - The handoff asked for `Promise.withResolvers`; the react package's `lib` is ES2023, which does
    not type it, so `TH.held()` wraps `new Promise` (as the core's private `deferred` does). Raising
    `lib` to ES2024 would let `src/` use it too, which is a platform decision, not this thread's.
  - Pulled forward, declared: the demo's `absent_box` delete fix (needed for the App test to wait
    for what it means without a new unhandled rejection).
* **Discoveries**:
  - Measured before the fix (a probe in a scratch build, the App test as it was, 96 runs at 24 in
    parallel): the dialog's catch ran `meet(vault_closed)` after unmount in 80 of 96 runs, 13 of
    them with `window` already undefined. None threw locally: `ReactDOMSharedInternals.p` was
    non-zero at that moment, so React skipped the `window.event` read; on CI it was zero once. After
    the fix (same probe): `meet` never ran (0/96); the guard dropped the rejection in 88, 19 with
    `window` gone. The real App test, fixed: 0 unhandled in 480 runs at 24 in parallel (0 in 480
    before too: it never reproduced as a failure here). The unit tests are what rest on it.
  - The demo resolves `safebyok-react` from `dist/`, not source: a probe in `src/` needs a rebuild.
  - The demo's `App.test.tsx` is order-dependent: under `--sequence.shuffle`, 58 of 96 runs fail
    a visitor test (no sign-in strip) when a sign-in test ran before it. CI runs in file order,
    so it does not bite; not chased here.
  - After the App fix the click-through's re-run delete settles about 2 ms before the test ends;
    nothing on the page shows it, so the test cannot wait for it. Watch for it if a demo flake
    names `VaultDashboard`'s `erase`.
* **For the Coach**: none blocking. Minor: whether to raise the react package's `lib` to ES2024
  (`Promise.withResolvers`); whether the demo's shuffle-order dependence deserves a row.
