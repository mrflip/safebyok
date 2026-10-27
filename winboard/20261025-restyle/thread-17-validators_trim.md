# Thread 17: Validators trim, strict vault bag (2026-10-27)

Branch `20261027-validators_trim`, PR [#293](https://github.com/mrflip/safebyok/pull/293), on main (cut from #291, since merged). Justify: green
(core 3391 / 37 skipped, react 309, indexeddb 167, postgres 322, convex 350, graphql 344, demo
229, e2e 107, fastkey 49, root 266; every size budget within its limit, none written).

Two of the Coach's rulings on matters thread 14 (#287) raised: "Validators exports internals too"
(trim) and "A store in the vault bag is now ignored" ("can the other bag be strict too?", ruled
proceed).

* **Built**:
  * **`Validators` trimmed** from 95 names to 66 (`src/validators.ts`). The entry test pins the
    66 by name, and checks every Zod schema the main entry exports by name is the namespace's own.
    The dropped validators keep their `export` in their own modules. `validators.test.ts` runs
    the no-quoting test and the throws-a-VaultError test over them too (`InPackage`), so no
    coverage was lost, and checks the namespace leaves each one out.
  * **Kept, by group** (who calls it):
    - `EpochMillis`, `label`, `user_id`: every scope and time is built from them; hosts compose them.
    - The three scopes, `VaultScope` (the duplicate, left as it is pending the Coach's naming
      question), and the five scopepaths: an adapter files rows under them.
    - The eight tokens and ciphered fields (`vault_tok` ... `vault_key_lease_wrapped`) and
      `Ciphered`: stored fields an adapter reads back.
    - The records and their sparse shapes (`VaultRecord`, `VaultSparse`, `VaultTombstone`,
      `VaultDraft`, the gate and wayin records and sparses, `BoxRecord`, `BoxSparse`,
      `BoxDamaged`, `LeaseRecord`, `DeviceRecord`), `Whisper`, `Sidecar`, `Capacity`: what is
      stored or crosses the VaultDB/DeviceDB seams, or what a snapshot shows. React uses the sparses.
    - `VaultStamp`, `BoxStamp`, `LeaseStamp`: exported by name already. The namespace keeps every
      validator the entry exports by name, so the two lists never disagree.
    - The six `VaultDB` expectations and `BoxDeletion`: an adapter is handed them.
    - `makeBankOpts`, `bankVaultOpts`, `vaultBag`, `bankBag`, `localVaultDBOptsShape`, `maskOpts`,
      `idbOpts` (safebyok-indexeddb reaches it through `Validators`): options bags a host passes.
    - `vaultDBShape`, `deviceDBShape`, `clockShape`, `clockReading`, `keyDeriverShape`,
      `keyDeriverSpec`, `strengthChecker`, `passphraseVerdict`, `loggerShape`,
      `passkeyAnswerShape`: objects a host hands in, and what their callbacks return.
  * **Dropped, by group**:
    - Pieces of a record or stamp: `BaseShape`, `MadeUnderShape`, `MadeShape`, `sealBoxlabel`,
      `LeaseGrant`, `VisibleShape`, `CipheredShape`, `LeaseStampPicked`, `VaultStampPicked`,
      `VaultStampButFormat`, `whisperBag` (a host uses `Sidecar`).
    - The VaultDB base class's own checks of an adapter's answers: `ListedBox`, `StoredRevision`,
      `ReadAnswer`, `ListingAnswer`, `StoredVaultTok`.
    - `Bank.make`'s per-option checks: `maxWhisperBytes`, `maxBoxes`, `declaredBytes`,
      `declaredBoxes`, `leaseHoursAsMillis`, `staleMinutesAsMillis`, `renewMinutesAsMillis`.
      `makeBankOpts` checks the options whole; several of these convert hours or minutes to
      milliseconds, which nobody outside composes.
    - Checks of the package's own steps: `passphraseCleartext` (a key deriver is handed a plain
      string), `vaultMadeUnderShape` (the duck `demandConsistentWith` judges).
  * **The bag naming a vault is strict** (`vaultBag` in `src/bank.ts`, parsed only in
    `#vaultScopeOf` through the new `parseVaultBag`). Its fields are `vaultlabel`, then
    `applabel` and `user_id`, each optional. Any other field refuses `bad_scope` before storage
    is touched. The message is "In the bag naming the vault: There is a field it does not take
    (its name is not repeated): it takes only applabel, user_id, vaultlabel. ...". It goes on to
    say a vault's own stores go in the second bag, and how to name the vault of a Vault object.
    `meta.fieldnames` is as the validator sets it. `bankBag` (`bank.demandConsistentWith(thing)`)
    still strips: it judges things carrying a scope.
  * **Callers fixed**: README's bag paragraph, `Bank`'s class doc, `ensureVault`'s doc,
    `closeVault`'s and `delDamagedVault`'s examples, `TH.closeVault`, the demo's VaultDashboard
    (a `choice` of the label), the React README's retry, the React test world's retry and a hooks
    test, the core bank tests and a snapshot test. Tests: a store in the bag (three spellings)
    refused with nothing touched; an option, a misspelling, a Vault object, its snapshot, a
    BankVault and a vault record each refused by all seven calls; the plain bags still work; a
    marked key quotes nothing.
  * **`notes/security.md`**: both facts amended by a `sonnet` subagent, as its header says.
  * **Changeset** `20261027-validators_trim.md`, safebyok minor, its first line naming both.
* **Decisions taken**:
  * The refusal kind for an unknown field is `bad_scope`, the bag's own (its `Validator` call's).
    A bag amiss already refused `bad_scope`, so a host branches on one kind for the whole bag.
  * The refusal counts the field and does not name it, per #287 and STYLE.md *Validation*. The
    handoff's "naming the key's path" is taken as naming which bag ("In the bag naming the vault").
  * I left the other threads' pending changesets as they are. Mine says it supersedes what they
    say of an unknown field in the first bag.
* **Deviations**: none from the handoff. Note STYLE.md *Validation* ("A scope, taken out of
  whatever carries it, strips"): the vault bag is now treated as a bag a person types, not a
  scope carrier.
* **Discoveries**:
  * Strictness costs a documented convenience: `bank.closeVault(vault)`,
    `bank.ensureVault(bankVault)` and `bank.delDamagedVault(bankVault)` were promised in the
    README and tested ("takes anything carrying the vault's scope as it is"). They now refuse. A
    host passes `{ vaultlabel: vault.vaultlabel }`. See *For the Coach*.
  * No adapter, React source or e2e test reached a dropped name through `Validators`; only
    safebyok-indexeddb reaches `Validators.idbOpts`.
* **For the Coach**:
  * **Vault objects as the bag.** Rec: keep it strict, as built. The alternative is to also take
    a Vault object by `instanceof Vault`: an explicit second type, no sifting, and
    `closeVault(vault)` works again. A BankVault or a snapshot would still need its label.
