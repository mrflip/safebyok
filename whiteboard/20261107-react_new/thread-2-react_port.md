# Thread 2: react_port (2026-11-07)

Branch `20261107-react_port`, PR #TBD, stacked on #573. Justify: green -- safebyok-react 10 files,
96 tests; the demo 8 files, 36 tests; every other package as before; size budgets within.

* **Built**
  * `packages/safebyok-react` on the new core, peer dependency `safebyok` (no dependency added
    from `safebyok-old`'s list).
  * `BankProvider` (`src/bank-provider.tsx`) takes `Bank.make`'s options but `requestCleartext`,
    which it takes its own way. One bank per `user_id`, made with `Bank.make` in an effect that
    owns it. Once made, `bank.tryHello()`. On unmount or a change of user, `bank.sweep()`, closing
    any dialog. A `bank.autolock()` interval, each minute. `onBadNews` and `requestCleartext` are
    held in refs, so inline handlers make no new bank. Bank options it does not name are passed
    through, so `Bank.make` refuses them to the error boundary. A swept bank tells and asks no
    one.
  * The default asker renders `GatingModal`, but only while `navigator.userActivation.isActive`
    is not false; otherwise it declines. `requestCleartext={null}` declines every ask; a function
    replaces the dialog.
  * `src/hooks.ts`: `useBank`, `useBankSnapshot`, `useVault(vaultlabel)` and
    `useVaultSnapshot(vaultlabel)`. `useVault` answers `{stage: 'waiting'|'unborn'|'present',
    vault}`. It reads `bank.vaultAt` only once the bank snapshot's `stage` is `ready`, never asks,
    never calls `ensureVault`. It calls `vault.tryHello()` once per vault per provider, through a
    WeakSet the provider hands down. A refused vault hello goes to `bank.tellBadNews`.
  * `GatingModal`: a map from gatingkind to dialog, holding `build_vault` and `unlock_vault` →
    `PassphraseModal`; any other kind is declined (`NoDialog`).
  * `PassphraseModal` serves build (with confirmation and strength advice, from the bank's
    checker or the host's `passphraseAdvice`) and unlock.
  * `boundary.tsx`, `attempt-refusals.ts`, `messages.ts`, `when-shown.ts` and `WhisperField` are
    ported. `WhisperField` imports `WhisperFieldAttributes` from `safebyok/utils`.
  * Deleted, for thread 3: `passkey.ts`, `passkey-unlock-button.tsx` and their tests, and the
    fake WebAuthn authenticator in the old test helpers. Thread 3 can bring them back from
    `b903c131c`.
  * Tests rewritten in proportion: `bank-provider`, `hooks`, `gating-modal` and
    `passphrase-modal`, on `safebyok/testing`'s bank worlds. The helpers are in
    `tests/test-helpers.ts`: `providerPropsOf`, `heldGatingOf`, `withoutGesture`, `ShowsVault`.
  * README: the intro, Install, Use, Asking for the passphrase and When an unlock fails are
    rewritten. When opening fails, Starting over and Fingerprint unlock are deleted.
  * Core: `ForeverMillis` exported from `packages/safebyok/src/index.ts`, for the dialog's
    footnote.
  * `demos/safebyok-demo-react`, parked:
    * fake auth, a `SessionBar` with sign in and sign out (`bank.lock()`), and `App` with the
      provider;
    * `src/lib/stores.ts`: `idbVaultDB` from `safebyok-indexeddb`, `MemoryDeviceDB`,
      `argon2idWebV1Deriver`, a `device_id` from `crypto.randomUUID()` kept in localStorage, and
      a DEMO JANK checker that refuses under 12 characters;
    * `KnockKnock`, `VaultDashboard`, `WaysIn`, `PsstModal`, `inspection/`, `outage`,
      `asks-again`, `whisper-text` and their tests removed;
    * `anthropic.ts` kept for thread 5.
  * `tests/scripts/release.test.ts` now expects safebyok-react's packed peer to be `safebyok`.

* **Decisions taken**
  * The autolock period is fixed at a minute (`AutolockEveryMillis`), not a prop.
  * A vault whose record is a tombstone reads as `unborn`: the bank snapshot does not list it as
    present.
  * The gesture gate checks `userActivation.isActive !== false`, so where the browser has no
    `userActivation` (older Safari, jsdom), a dialog may show.
  * The sign-out in the demo calls `bank.lock()` (every vault), not one vault's `lock()`.

* **Deviations**
  * `allowStartOver` is dropped: the new core's gating has no start-over yet.
  * A misused `onBadNews` (not a function) is no longer passed through to be refused. The
    provider passes `undefined` unless one is given, and `Bank.make` checks it.
  * The old set-state-in-effect `eslint-disable` in the provider is gone. No new suppressions.
    The jsx-a11y `eslint-disable-next-line` comments in `modal.tsx` are carried over unchanged.
  * The demo's device leases are in memory (as the handoff said), so a reload locks the vault.

* **Discoveries**
  * Vitest resolves `safebyok` through its built `dist`, so the react tests need
    `pnpm --filter safebyok build` first (`pretest` does it).
  * `vault.hello()` lists boxes (`listBoxes`); it does not call `getVault`. A test that fails a
    vault hello overrides `doListBoxes`.
  * `BadNewsHandler` takes one `VaultError`; `bank.tellBadNews` takes an array.

* **For the Coach**
  * The demo is parked on a sign-in strip, a YOLO call, until threads 3 to 5 bring the account
    menu and boxes back.
