# Thread 10: react (2026-10-24)

Branch `20261024-react`, PR [#265](https://github.com/mrflip/safebyok/pull/265), cut from `origin/main` (30d5f9df). Justify: green at the tip
(core 3139 + 37 skipped, react 300, demo 227 + 17 skipped, every other package as main).

* **Built**:
  - `packages/safebyok-react/src/gating-modal.tsx`: `GatingModal` (exported), which dispatches on
    `gatingkind`: `PassphraseModal` for `initialize_gate` / `unlock_vault`; a form each for
    `change_passphrase` (current + next, advice on the next, a note that the passkey goes),
    `put_passkey` (passphrase, then `createPasskey` at each submit, one submit at a time),
    `del_passkey` and `del_vault` (passphrase; `del_vault` answers `'deleted'`).
  - `src/modal.tsx`: the parts every dialog shares, moved out of `passphrase-modal.tsx`: the one
    answer above the boundary (`AnsweringOnce`), the trouble notice (worded per kind,
    `Messages.troubleWord(Doing[kind])`), `ModalForm`, `useAttempts` (gripe, `meet`, `fail`,
    `attempt`), `UsernameField` / `PassphraseField`, `useAdvice`, `unlockedFor`.
    `DialogAnswer` and `PassphraseAdvice` now live there (still exported from the index).
  - `BankProvider`'s own `requestCleartext` shows `GatingModal` for every kind: thread 9's
    loosening (four kinds declined unasked) is closed.
  - `attemptRefusalFlavor`'s `in_place` is the core's `CorrectableKindVals` (adds
    `same_passphrase`; `absent_wayin`, `damaged_wayin`, `passkey_unavailable` stay in place).
  - Core: `declinedError(gatingkind, asked)` words the decline by kind (still `vault_locked`);
    `vault.checkPassphrase` retired, `tryCheckStrength` does the check itself.
  - Demo: WaysIn and Delete account go through the provider's dialogs; Delete account treats
    `absent_vault` (a novel vault) as nothing to delete and `vault_locked` (cancelled) quietly.
  - README (react half of thread 11), doc blocks of `BankProvider`, `PassphraseModal`,
    `passkey.ts`, `useRoundFor`, `forBoundary` (stale `vault.unlock`).
  - Size: `BankProvider` 8.1 -> 9.3 kB, `reactEverything` 8.7 -> 9.7 kB (the rule's numbers).
* **Decisions taken**:
  - `DialogAnswer` gains `'deleted'` rather than a second answer type per dialog.
  - The `put_passkey` form keeps no PRF answer across attempts: a typo means the next submit
    makes another passkey (the first stays on the authenticator, unused). Simpler, and no secret in
    React state between submits; the core would leave the answer unspent, so reuse is possible later.
  - The passkey's relying party is `{ name: applabel }` at the page's domain, the user entry
    `passphraseUsername`. No `passkeyRp` prop on the provider (Open Matter below).
  - `gate_made_elsewhere` closes the dialog (as built in 9); the flavor's doc said "advice", now fixed.
  - Delete account calls `tryDel()` and treats `absent_vault` as "no vault to delete", rather than
    reading `vault.state` first: the core judges on a fresh picture, the demo does not.
* **Deviations**: none from the plan. Pulled forward (ground rule 9): the core's
  `checkPassphrase` retirement and the per-kind decline wording, both small.
* **Discoveries**:
  - The dashboard tests for "Start a new vault" and "Accept this copy" were already on main
    (4608ac1b, from #259): nothing to add. Strike from the plan.
  - Thread 9 retired three WaysIn tests (password-manager username, wrong passphrase kept);
    their guarantees are back in `gating-modal.test.tsx` (the change-password form test, the
    wrong-current-passphrase test).
  - Escape is not an activation-triggering key in the HTML spec, a Cancel click is (below).
* **How the joins feel in the UI** (the Coach's audit-5 worry), from the tests in
  `bank-provider-dialog.test.tsx`, *a dialog for every kind of gating*:
  - A read behind a change's dialog does not show in it. The user sees only "Change your vault
    passphrase"; the read waits.
  - Change made: the vault is unlocked under the new passphrase, the read goes on unasked. Feels right.
  - Change cancelled with the Cancel button: the change dialog closes and an "Unlock your vault"
    dialog appears at once, for the waiting read. The user just said no, and is asked again, by a
    dialog of another kind. This is the surprising one.
  - Change cancelled with Escape: Escape gives no user activation, so the waiting read's unlock
    is shown only if the click that opened the change is still within the browser's transient
    activation (about 5 s in Chrome); after that it is declined unasked and the read refuses
    `vault_locked` silently. So Cancel and Escape behave differently, and timing decides.
  - Deletion made: the waiting read refuses `vault_gone`.
  - A lock landing (another tab, expiry) under a change's dialog closes it; the waiting read then
    raises its own unlock (a lock does not stop a call waiting behind another kind), shown only
    with a gesture in hand, so in practice declined.
  - In the demo the scrim covers the page, so the waits arise only from calls the app makes by
    itself (timers, effects, KnockKnock's `useWhisper` mid-flight), not from a second click.
* **Rework, the Coach's ruling (2026-10-24)** on "'Cleartext' replaces 'proof'" (#263): "Make
  this display to the human as "Vault unlocker". TODO: an i18n friendly way to send in phrases
  displayed". Code and VOCABULARY keep `cleartext`; VOCABULARY's entry says how it is shown; the
  TODO is a side quest in TODO.md. Strings changed, where a user may see the passphrase and
  passkey named together: the demo's WaysIn heading ("Ways in" -> "Vault unlockers"); core
  refusals `gate_moved` (vault.ts, proving.ts), `stale_write` (vault.ts, refusals.ts
  `StaleVaultPropsMessage`), `damaged_wayin` (wayin.ts, the bad news in vault.ts),
  `gating_landed` while sealing (proving.ts), `damaged_vault` (vault-db.ts), the device store's
  `getLease` remedy (device-db.ts), and the declined `put_passkey`'s "Its vault unlockers are
  unchanged." safebyok-react's own words name the passphrase or the passkey alone, each right as
  it stands, so none changed. Developer-only text (a logger warning, `bad_option`) is unchanged.
* **For the Coach** (the PR's open questions, each with its Rec):
  - Cancel, then asked again (above): accept; a toldjaso line.
  - A cancelled change refuses `vault_locked`: keep; maybe `gating_declined` after the sprint.
  - No `passkeyRp` / `rpId` prop on the provider: keep; add when a host needs a custom `rp.id`.
  - A typo while adding a passkey leaves an unused one on the authenticator: keep.
  - Delete account on a novel vault leaves its empty record in storage: keep for the demo.
  - `putWayin('passkey')` on a novel vault refuses `absent_vault`: kept.
  - Start over: still a TODO.
