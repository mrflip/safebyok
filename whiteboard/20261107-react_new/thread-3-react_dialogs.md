# Thread 3: react_dialogs (2026-11-07)

Branch `20261107-react_dialogs`, PR #N, stacked on #574. Justify: green -- safebyok-react 12 files,
111 tests; the demo 9 files, 44 tests; every other package as before; size budgets within.

* **Built**
  * `packages/safebyok-react/src/replace-passphrase-modal.tsx`: `ReplacePassphraseModal` for a
    `replace_passphrase` gating. Three fields: the passphrase in use (`current-password`), the new
    one (`new-password`, with the advice) and its confirmation (`ConfirmField`). It refuses a
    mismatched confirmation before it attempts anything, then calls
    `gating.attempt({ antePassphraseClear, nextPassphraseClear })` and answers `'unlocked'`. The
    core's correctable refusals (`wrong_passphrase`, `weak_passphrase`, `same_passphrase`) show in
    place, and the dialog stays open.
  * `src/del-vault-modal.tsx`: `DelVaultModal` for a `del_vault` gating. One `current-password`
    field calls `gating.attempt({ passphraseClear })` and answers `'deleted'`. A `bank.lock()`
    leaves it open, because the core's `declineAtLock` passes over `del_vault`.
  * `DialogForGatingkind` maps both kinds. `add_passkey` / `replace_passkey` still reach
    `NoDialog`, for thread 11.
  * Pruning:
    * `Messages` loses `changeDropsPasskey`, because the core keeps the passkey on a replace: the
      vaultKey is unchanged.
    * It also loses the three `replacePasskey*` strings: the core has no replace for a passkey.
      Every other unused string is thread 11's (`putPasskey*`, `delPasskey*`, `passkeyButton`,
      `passkeyTrouble`, `noPasskeyToAsk`, `passkeyDamaged`, `noWebAuthn`, `noPrf`,
      `passkeyAskFailed`).
    * `BoundarySource` is now the three dialogs. `'GatingModal'` is gone.
    * `useAttempts` no longer returns `isShown`.
  * Tests: `tests/replace-passphrase-modal.test.tsx` and `tests/del-vault-modal.test.tsx`.
    `test-helpers.ts` gains `replacing`, `deleting`, `addingPasskey`, `gatingOfKind`,
    `submitReplacement` and `submitDeletion`.
  * Demo:
    * `src/components/WaysIn.tsx` lists the vault's passphrase wayin and its passkey wayin (or "no
      passkey"), from `vault.gate.toJSON()`, with a *Change passphrase* button on
      `vault.tryReplacePassphrasePrompt()`.
    * `SessionBar`'s *Delete account* calls `vault.tryDelVaultPrompt()` first. If the vault was
      never born, the account goes without asking. While the stage is `waiting`, it refuses with a
      gripe.
    * `App`'s `Page` renders `WaysIn` while signed in.
    * `.ways-in` style.
    * Tests: `tests/components/WaysIn.test.tsx`, plus four new `SessionBar` tests. Demo helpers:
      `answerReplacementDialog`, `answerDeletionDialog`, `settleAsks`, and a *Lock* button on
      `VaultProbe`.
  * READMEs (client and demo) rewritten where they changed. Changeset
    `.changeset/20261107-react_dialogs.md` (safebyok-react, patch).
* **Decisions taken**
  * The new modals are **not exported** from `src/index.ts`. `GatingModal` is the door, as it is
    for `PassphraseModal` today. Exporting them is a whole-line addition if wanted.
  * The demo stays quiet for `declined` and `locked_while_asking`, the kind the core throws when a
    lock closes a dialog. The handoff said `vault_locked`. The client README's example quiets only
    `declined`.
  * The demo compares `outcome.err.refusalkind` directly: `BadOutcome.err` is already a
    `VaultError`. `isVaultError(err, kind)` narrows to `VaultError` whatever the kind, so a
    negated pair narrows `err` to `never`.
  * Delete account asks `globalThis.confirm` before the vault dialog, as it did before. A `false`
    asks nothing.
* **Deviations**
  * The `NoDialog` tests in `gating-modal.test.tsx` now drive an `add_passkey` gating
    (`TH.addingPasskey`). **Thread 11 maps that kind**, so it must find NoDialog another kind to
    test against, or test it with a bare stub gating.
* **Discoveries**
  * Thread 11 needs `isShown` again: re-add it to `useAttempts`' return (one line), or call
    `useWhenShown` directly.
  * The core's `replacePassphrasePrompt` doc block reads "SLOPDOC". It belongs to the core and is
    left for its owner.
  * PR #574's body says passkey exports and `allowStartOver` come back "in thread 3". This thread's
    gloss leaves passkeys to thread 11 and does not name `allowStartOver`, so neither is here.
  * `settleAsks` in the demo helpers waits 20ms inside `act`, to let a cancelled ask's promise
    chain settle before asserting that nothing appeared. Re-clicking to prove settlement raced
    the chain (`already_asking`).
  * In the demo, WaysIn's button and the dialog's submit are both "Change passphrase". The
    helpers scope to `within(screen.getByRole('dialog'))`.
* **For the Coach**
  * Should `ReplacePassphraseModal` / `DelVaultModal` be exported for hosts that build their own
    `requestCleartext`? (Recommend: not yet. `GatingModal` covers it.)
  * Patch-level changeset, as before 1.0.
