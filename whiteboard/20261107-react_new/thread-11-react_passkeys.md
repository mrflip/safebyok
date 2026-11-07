# Thread 11: react_passkeys (2026-11-07)

Branch `20261107-react_passkeys`, PR #TBD, stacked on #577 (thread 3, react_dialogs). Justify:
green; safebyok-react 151 tests, demo 47, the rest unchanged.

* **Built**
  * `packages/safebyok-react/src/passkey.ts`: `passkeysAvailable`, `createPasskey(opts)`,
    `askPasskey(passkeyHeader, opts)`, `attemptOnce(passkey, attempt)`, rebuilt on the new core.
    The PRF salt is `PasskeySaltBytes` long. `askPasskey` takes `gating.passkeyHeader`
    (`WayinHeader | null`) and asks with `evalByCredential`. `bytesOf` copies the browser's answer
    and zeroes the browser's own copy. `attemptOnce` zeroes the bytes in a `finally`.
  * `passkey-unlock-button.tsx`: `PasskeyUnlockButton`, `offersPasskey(gating)` and
    `PasskeyUnlockButtonProps`. It sits in its own `Boundary`, keyed by `useRoundFor`, and sorts
    what it hears with `attemptRefusalFlavor`. It zeroes, untried, an answer that comes back while
    hidden (`useWhenShown`'s `isShown`). Its focus prop is `takesFocus`, as `PassphraseField`'s is.
  * `PassphraseModal`: for an `unlock_vault` gating where `offersPasskey`, the button comes first
    and takes the focus. What it says goes in a `fromPasskey` gripe, which stays while the user
    types. When the button takes itself away, the focus goes back to the passphrase field.
  * `add-passkey-modal.tsx` (`AddPasskeyModal`): the passphrase, then `createPasskey` from the
    submit, then `attemptOnce(made, gating.attempt({ passphraseClear, passkeyClear }))`. A ref lets
    only one submit run at a time. A dismissed prompt does nothing. It answers 'unlocked'.
  * `revoke-passkey-modal.tsx` (`RevokePasskeyModal`): a copy of `DelVaultModal` for a
    `revoke_passkey` gating, answering 'unlocked'.
  * `GatingModal` maps all six gatingkinds, and the map's type is now total. `NoDialog` stays for
    a kind this package does not know (a newer core). Its tests forge a gatingkind with
    `Object.create(gating, { gatingkind: { value: 'forged_kind' } })`.
  * `passkeyRpId?` goes on `GatingModalProps`, `PassphraseModalProps` and `AddPasskeyModalProps`.
  * `BoundarySource` and `LookFor` gain the three new sources.
  * `index.ts` gains whole-line blocks: `ReplacePassphraseModal` and `DelVaultModal` beside
    `PassphraseModal` (the ride-along), then a passkey block of its own.
  * `messages.ts`: `putPasskey*` became `addPasskey*` and `delPasskey*` became `revokePasskey*`.
    `passkeyDamaged` is dropped. `noWebAuthn`, `noPrf` and `passkeyAskFailed` are reworded as
    words for the user.
  * Tests:
    * The fake authenticator is rebuilt in `tests/test-helpers.ts` (*Fake authenticator*). It
      cleans up through `onTestFinished`, so no `afterEach` is needed. It takes `holdNext(promise)`
      for asks that come back late, and `refuseNext`.
    * New helpers: `addPasskeyTo(world, vault, passkeyClear?)`, `PasskeyMaking`,
      `revokingPasskey`, `submitPasskeyAdd` and `submitPasskeyRevoke`.
    * New test files: `passkey.test.ts`, `passkey-unlock-button.test.tsx` (the PassphraseModal
      passkey cases included), `add-passkey-modal.test.tsx` and `revoke-passkey-modal.test.tsx`.
  * Demo `WaysIn` has one `prompt(verb)` handler for all three buttons:
    * *Add fingerprint* shows while no passkey is held.
    * *Remove fingerprint* shows while one is held.
    * Both show only where `passkeysAvailable()`.
    * `declined` and `locked_while_asking` say nothing.
    * Its tests use a ten-line fake `navigator.credentials.create` in the demo's `test-helpers.tsx`.
  * README: the `GatingModal` bullet, a bullet for the passkey exports, *Asking for the
    passphrase*, and a new section, *Fingerprint unlock (passkeys)*.
  * Changeset: `.changeset/20261107-react_passkeys.md`.

* **Decisions taken**
  * **The refusals the helpers use.** The core has no `passkey_unavailable` or `damaged_wayin`.
    No WebAuthn, no PRF, and any other browser failure refuse `wrong_passkey`: it is correctable,
    so a dialog shows it in place in the words of `Messages`. A SecurityError (wrong rpId) refuses
    `bad_option` (misuse). No passkey header refuses `absent_wayin`. A stored `credential_id` that
    is not base64url refuses `bad_record`. I set aside adding kinds to the core (out of scope) and
    a refusal of the package's own (a second error type for hosts to branch on).
  * **Replace means remove, then add.** The core refuses an add while a passkey is held, so the
    demo offers only what the core allows.
  * **No retry of the passkey across attempts.** After a mistyped passphrase in `AddPasskeyModal`,
    the next submit makes a new passkey. Keeping the answer would break "tried at once or zeroed"
    (`notes/guarantees.md`).
  * **Tests spy on `Gating.prototype.attempt`.** Gating instances are frozen, so a test that
    forces a refusal spies on the prototype.

* **Deviations**
  * One `eslint-disable-next-line jsx-a11y/no-autofocus`, on the button's `autoFocus`. The old
    code had the same, and `PassphraseField` has its twin. Renaming the prop to `takesFocus`
    spared a second disable at the call site.

* **Discoveries**
  * A mistyped passphrase in the add dialog leaves an orphan passkey on the authenticator, as the
    old design did. The README says so.
  * Replacing the passphrase keeps the passkey in the new core. The old README said a new
    passphrase removed it; the new section says it stays.
  * `notes/guarantees.md` (lines 107, 155 and 162) still speaks of the old core and a
    "`put_passkey` form". I left it alone: it is a guarantees doc, and the wording is the
    Coach's to choose.

* **For the Coach**
  * Should the core add a `passkey_unavailable` condition kind? It would replace `wrong_passkey`
    for "no passkey answer can be had here".
  * `BankProvider` does not forward `passkeyRpId` (out of this thread's scope). A host whose
    passkeys answer to another rp id must render `GatingModal` itself for now.
