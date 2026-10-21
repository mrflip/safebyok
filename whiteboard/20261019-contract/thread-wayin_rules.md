# Thread wayin_rules: the way-in half of the Coach's phase-B rulings (2026-10-21)

Branch `20261021-wayin_rules`, PR (opening), stacked on [#214](https://github.com/mrflip/safebyok/pull/214),
in the line main → #213 → #212 → #214 → this. Justify: green. Core 2656 passed, 35 skipped; react
280; convex 279 (8 skipped); postgres 276 (14 skipped); graphql 271 (14 skipped); indexeddb 148
(10 skipped); fastkey 49; demo 207 (16 skipped); e2e 93 (100 skipped); root 265.

Items 1, 2, 4, 11, 12, 13, 14 and 15 of the plan's `b_rulings`.

* **Built**:
  * **1, a new passphrase removes the passkey** (`vault.ts`, `#tryPutWayin`'s `revise`): a
    passphrase change writes `passkey: null`. The user adds a passkey again, proving the new
    passphrase. Documented in `putWayin`'s doc block, the core README (a new *One passphrase, and a
    passkey matched to it* bullet, the example, *One passkey per vault*), react's README,
    VOCABULARY.md, the demo's `WaysIn` and its README, and the changeset. The react dialog reads
    the snapshot's `passkey`, so it follows on its own.
  * **2, `Wayin.seal` stamps itself**: `Wayin.seal(vault, holder, proof, deviceId, vaultKey)`.
    The epoch comes from `holder.vault_key_epoch` and the time from `vault.clock.now()`.
    `WayinVault` gains `clock`. The vault's `#newStamp` and wayin.ts's `stampOf` are gone.
    `WayinStamp` stays exported, as the type of the stamped fields.
  * **4, the strength check is the proof's**: `PassphraseProof.checkStrongEnough()` calls
    `checkStrongEnough(vault.strengthChecker, passphrase, scope)`, with the scope a frozen copy.
    `Vault` gains a public `strengthChecker` getter, beside `keyDeriver`. `ProofVault` gains
    `strengthChecker` and the scope. The vault reads `proof.passphrase` nowhere.
  * **11, `Wayin.seal` returns only the way in.** `#draftVaultProps` returns only the draft. The
    creating unlock writes it, then proves the passphrase against the vault props storage settled
    on, its own or another device's, through `#unwrapWith` → `wayin.tryOpen`. That unwrap is the
    way in's own `unwrapUnder`. The fresh extractable key seals the way in and is dropped.
    `created_elsewhere` still fires only when the settled vault is another's. Tests in
    `vault-lease.test.ts` pin two things: a create unwraps exactly one extractable transient (for
    the lease), and after a create the key each new boxKey is wrapped under is non-extractable.
  * **12, `checkSaltShape`** (`proof.ts`, renamed from `checkFreshSalt`). It is called once, at
    `newProofOf`; the repeat in `passkeyKeying` is gone. `fromB64OrNull` (`crypto.ts`) replaces
    wayin.ts's private `saltBytesOf`, so both files share it.
  * **13, the default checker** is `DefaultStrengthChecker`, renamed from `UnchosenStrengthChecker`,
    and it is an ordinary checker that answers weak. Its reason speaks to the user, then to the
    app's makers: "Vault.make needs a strengthChecker, as safebyok's CUSTOMIZATION.md says under
    Pluggable Passphrase Strength Checker". `UnchosenCheckerSaid`, `#unchosenCheckerSaid` and the
    identity comparison are gone. **No log.** The customer is not left blind: the first passphrase
    anyone tries in development is refused with that message, and react's dialog shows it as
    advice while the user types.
  * **14, a blank passphrase is two refusals.** `Proof.parse` no longer refuses blank.
    `checkStrongEnough` (the function) refuses a blank new passphrase `weak_passphrase` before the
    checker hears it, at create as well as at `putWayin`. `PassphraseWayin.tryOpen` refuses a blank
    proof `wrong_passphrase` before any derivation, through `proof.isBlank`. `newProofOf` lost its
    special case, and is now async: it runs the strength check.
  * **15, `putWayin` resolves the way in as stored**: its summary, taken from the vault props that
    `#reviseWayins` now resolves. The rule is in STYLE.md *Naming*, as **`put` resolves what is
    stored.**, beside `ensure`.
  * `vaultSliceOf` (test helpers, so `safebyok/testing`) now carries `strengthChecker:
    anyStrengthChecker` and `clock: wallClock`. A `VaultSlice` type is exported beside it.
  * `notes/security.md`, amended in place through a sonnet subagent.
  * Changeset `.changeset/20261021-wayin_rules.md`, minor.
* **Decisions taken**:
  * **The kept key at create comes from a second derivation** (item 11). `#draftVaultProps` cannot
    reach `unwrapUnder` without the wayinKey, and only `Wayin.seal` has it. So the create opens its
    stored way in as any unlock does: one control path, and the kept key always comes out of a
    stored way in under a proof. The cost is one more key derivation at create (about 0.5 s in the
    browser), once per vault. The alternative is to split `Wayin.seal`'s keying so the draft can
    unwrap under the same wayinKey, with no second derivation but a less simple seal. See *For the
    Coach*.
  * **The blank-proof check lives in `PassphraseWayin.tryOpen`**, the one place a passphrase is
    read as a proof. A blank standing passphrase at `putWayin`/`delWayin` is therefore refused after
    the hello and refresh, not at the door, though still before any derivation. On an absent vault
    it now reads `absent_vault`. One check, not one per door.
  * **`DefaultStrengthChecker`**: renamed because the Coach calls it "the default strength
    checker", and the name `DefaultLogger` sets the pattern. It is internal, not exported.
  * **`putWayin` resolves `WayinSummary`**, with no overloads by argument kind, since the public
    method is an arrow field.
* **Deviations**:
  * **`putWayin` resolves the props it wrote, not props read back.** `VaultDB.putVaultProps`
    resolves `void`. A conditional write that lands stores exactly what was sent, so "as stored" is
    `next`. Making `putVaultProps` resolve the stored record is C7's (props verbs).
* **Discoveries**:
  * The scope a checker hears is no longer the vault's own frozen `#scope`. It is a frozen copy the
    proof builds from the handle's public getters. A host that `defineProperty`s over the handle's
    `applabel` would change what its own checker hears. The *freeze the handle* row covers this.
  * The react provider's `adviser` (`parseStrengthChecker`) needed no change: the default's reason
    becomes its advice.
* **Contract drift** (for the orchestrator to carry):
  * `putWayin` Returns: the way in as stored, its summary (was: the vault).
  * *The policy*: a new passphrase removes the passkey.
  * `weak_passphrase`: a blank new passphrase, at create as at `putWayin`, refused before the
    checker. `wrong_passphrase`: a blank proof, refused before any derivation, after the read.
    `Proof.parse` no longer refuses blank. No new refusal kinds.
  * `Wayin.seal(vault, holder, proof, deviceId, vaultKey)` resolves the way in alone, and refuses
    no salt shape. `checkSaltShape` sits at the vault's door.
  * With no strengthChecker, nothing is logged; the refusal's message carries the pointer.
  * `Vault.strengthChecker` getter; `PassphraseProof.checkStrongEnough()`.
  * Principle (STYLE.md): every `put*` resolves what is stored.
* **For the Coach**:
  * **A second key derivation at create** (item 11, above). Recommend keeping it: simple control
    flow, and the strongest invariant. Splitting seal's keying would save half a second, once per
    vault.
  * **No log for a missing checker** (item 13). Recommend no log: the refusal's message reaches
    the developer the first time anyone tries a passphrase.
