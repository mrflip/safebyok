# Thread 6: kit_ways_in (2026-11-21)

Branch `20261121-kit_ways_in`, PR #TBD, stacked on #800 (parts_kit). Proved: `safebyok-react-lean` test 187 (53 new), typecheck and lint clean; `pnpm justify` after the catch-up, below.

* **Built** (`packages/safebyok-react-lean/src/kit/`, all exported from `safebyok-react-lean/kit`):
  * `ReplacePassphraseForm` (`replace-passphrase-form.tsx`): current passphrase, new one with the strength verdict, confirmation; submit disabled until strong and matching. `bank.useReplacePassphrase`.
  * `AddPasskeyForm` (`passkey-forms.tsx`): passphrase field; on submit, the passphrase is taken out of the FormData, then `createPasskey` runs the browser's prompt, then `bank.useAddPasskey`'s gating.
  * `RevokePasskeyForm`: proved by the passphrase. `bank.useRevokePasskey`.
  * `PasskeyUnlockButton`: a one-button form; `askPasskey` over the header it is handed, then `bank.useUnlock` with `{ passkeyCleartext }`. Renders null without WebAuthn or without a passkey header.
  * `passkey.ts`: `passkeysAvailable`, `createPasskey`, `askPasskey`, `CreatePasskeyOpts`, `AskPasskeyOpts`, ported from `safebyok-react`'s `helpers/passkey.ts`; their argument checks are `Checkers('bad_record', …)`, the user-facing refusals use `KitPhrases`.
  * `KitPhrases` gains the forms' words and the passkey refusals (`wrongPasskey`, `noPasskeyToAsk`, `noWebAuthn`, `noPrf`, `passkeyAskFailed`); `refusalTextOf` maps `wrong_passkey`.
  * Tests: `tests/kit/passkey.test.ts` (38, the old helper tests ported, sloppy-options tables included), `replace-passphrase-form.test.tsx` (3), `passkey-forms.test.tsx` (12). `tests/test-helpers/fake-authenticator.ts`: the old `installFakeAuthenticator` ported (stubs `navigator.credentials` and `PublicKeyCredential`), `PasskeyMaking`, and `_cheat_passkeyHeaderOf(world)`, which reads the stored gate's passkey header from a second device over the world's vaultDB.
  * Every submit path is searched with `TH.expectTextUnheld` (rendered tree, both QueryClient caches) for each passphrase, during the held derivation and after; the add and unlock cases check the fake authenticator's PRF outputs were zeroed.

* **Decisions made**:
  * **Revoke is proved by the passphrase only.** A user revoking a passkey may have lost it. No passkey-proved revoke is offered.
  * **`PasskeyUnlockButton` takes `passkeyHeader` as a prop.** No giver hook exposes the gate's passkey header (Discoveries); a prop keeps the button's contract stable once one exists.
  * **A ceremony refusal of the condition family** (no WebAuthn, no PRF, a browser failure) is shown in the form's alert from component state (`ceremonyErr`), beside the mutation's own error; a dismissal shows nothing and runs nothing; a misuse refusal (bad options from the host) is rethrown, to the form action's error boundary.
  * **`attemptThenZero` is not ported**: the core's gating copies a passkey answer's bytes and zeroes the host's (G2), so the kit hands answers straight in.
  * **The strength meter and confirmation are copied** from `CreateVaultForm` into `ReplacePassphraseForm`, as the handoff allowed, not extracted into a part. Two copies; a third would earn a part.
  * `answerNextAfter` was left out of the ported fake authenticator: it existed for crossing tests.

* **Deviations**:
  * **`formActionOf` (thread 5's private helper) changed**: `cleartextsOf` may resolve null, and then nothing runs and the action resolves true (no focus moves, no alert). This is how a dismissed passkey prompt leaves the form as it was. Private to the kit; no contract outside it changes.
  * Orchestrator directive, done as its own commit: `formActionOf`'s private `textOf` renamed `takeText`.

* **Discoveries**:
  * **The giver exposes no passkey header.** `BankSnapshot` carries no gate; the header lives at `device.bank.maingate.passkey0?.toJSON()` in the core. A host cannot today choose between `AddPasskeyForm` and `RevokePasskeyForm`, or feed `PasskeyUnlockButton`. Recommendation, not built (thread 4 edits `react-giver.tsx`, and the handoff kept me to `./kit`): a `usePasskeyHeader()` on the bank giver:
    ```ts
    // Cheat (react_life): the bank's snapshot does not carry its gate, so this re-renders on each change of stage and each form mutation of the bank that succeeds
    function usePasskeyHeader(): PasskeyWayinHeader | null {
      useBank((snap) => snap.stage)
      useMutationState({ filters: { mutationKey: ['sok', banklabel], status: 'success' }, select: (mutation) => mutation.state.submittedAt })
      return (slot.device?.bank?.maingate.passkey0?.toJSON() as PasskeyWayinHeader | undefined) ?? null
    }
    ```
    The cleaner alternative is a `passkeyHeader` on the core's `BankSnapshot`. The doc blocks already name `Knock.usePasskeyHeader()` as where a host gets it.
  * The core refuses a passkey answer over the wrong salt as `wrong_passkey`, which the button shows as `KitPhrases.wrongPasskey`.
  * `tests/` needs the core built (`pnpm --filter 'safebyok-react-lean^...' build`) before a bare `vitest run` in a fresh worktree.

* **What each form needs from the host** (for thread 7's "ways in" panel):
  * `ReplacePassphraseForm giver={SOK} bank={Knock} username?` — show while unlocked or locked; leaves the bank unlocked.
  * `AddPasskeyForm bank={Knock} passkeyOpts username?` — `passkeyOpts: { rp: { name, id? }, user: { name, displayName }, timeout? }`. `rp.name` is the app's name the authenticator shows; `rp.id` the relying-party id (a domain; defaults to the page's own); `user.name` / `displayName` the account the passkey is listed under (the old modals used the user's email and name, e.g. `'u1 (main vault)'`). Show while the bank has no passkey.
  * `RevokePasskeyForm bank={Knock} username?` — show while the bank has a passkey.
  * `PasskeyUnlockButton bank={Knock} passkeyHeader askOpts?` — `askOpts: { rpId?, timeout? }`; `rpId` must match the `rp.id` the passkey was made under. Beside `UnlockForm` at stage `locked`.
  * A `passkeyHeader` source: none yet (Discoveries). Thread 7 needs one for "add a passkey, unlock with it, revoke it".
  * `username` everywhere is only for the password manager's hidden field.

* **For the Coach**:
  * **Passkey header hook**: where should a host read whether the bank has a passkey? Recommend `Knock.usePasskeyHeader()` on the bank giver (thread 4 or 7), cheat-marked as above; or a field on the core's `BankSnapshot`.
  * **Meter duplication**: recommend a shared part once a third form wants it.
  * **Revoke by passkey**: not offered; recommend leaving it out.
