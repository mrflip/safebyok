# Thread 4: gate_ops (2026-10-31)

Branch `20261031-gate_ops`, PR #414, stacked on #413 (`20261031-box_seal`). Justify: green after the rework (safebyok 4582 passed, 37 skipped; every package green). `pnpm size:budget`: the same eight "raise" rows as the base (the new phrases are shaken out of every bundle); no `--write`.

* **Built**:
  - **Directive 1** (`23f30334`, on its own): the autolock and the damaged-lease path each erased the kept lease twice (`lock()` erases by scope, then `Lease.eraseKept`). Both now `vault.lock()` then `letGo()`; `Lease.#autolockNow` is the autolock's launch. Tests in `vault-unlock.test.ts`: `tryDelLease` called once on each path.
  - **Gate** (`gate.ts`, *The next gate*): `withPassphraseReplaced(proofClosure, passphraseClosure, world)`, `withPasskeyAdded(proofClosure, passkeyClosure, world)`, `withPasskeyRevoked(proofClosure, world)`, each async and answering the next `GateProps`. Each proves this gate with `attemptProof`, makes the new proving, and seals its wayin with `proving.makeWayin(proved)`.
  - **Proving** (`proving.ts`): `PassphraseProving.makeFromClosure` and `PasskeyProving.makeFromClosure` invoke the closure, parse its cleartexts, make the proving, and spend the answer in `finally`.
  - **Vault** (`vault.ts`, *Changing the gate*): `replacePassphrase`, `addPasskey`, `revokePasskey` and their `try*` forms. Each runs `ensureReadyToEdit()`, the gate's step, then `#sendGate(props)`, which sends a module-private `GateStaging`. `isFullPatch` passes it and `makeStaged` takes its gate; a host's patch still carries none.
  - **Shapes** (`models-shapes.ts`): `passphraseCleartexts`, `passkeyCleartexts`, the closure types, and the arg checks for the five new entry points.
  - **Phrases**: `PasskeyHeldAlready`, `NoPasskeyToRevoke`.
  - **Tests**: `tests/models/vault-gate.test.ts` (8) pins each op once through a real vault. Five loosened pins (below).
  - **Spec**: `_Built (thread 4)._` lines under *Vault* and *Gate*; design text untouched.
* **Decisions taken** (YOLO, two-way doors):
  - **Which proving signs the reseal (directive 2)**: the passphrase's, since the rework (a passkey proof refuses). Only the new wayin is sealed; `replacePassphrase` keeps the passkey wayin as stored, which still opens: its ctx (`wayinCtxOf`) binds only the vault stamp and its own header, and the vaultKey is unchanged. Resealing it would need a passkey touch.
  - **Names (directive 3)**: the gate's step is `withX` (`withPassphraseReplaced`, ...), answering `GateProps`. The ops that stage and send live on the vault. No `Gate` or `Proving` is held on a field: each op reads `this.gate` once, synchronously, after `ensureReadyToEdit()`.
  - **The private path**: a token class, `GateStaging`, not a `#stagedGate` field. A field would hold state across `send`'s awaits; the token travels inside the one call and is unforgeable outside `vault.ts`.
  - **Refusals (directive 5)**: through factories in `gate.ts`.
    - A second passkey: `'bad_option'`, `Phrases.PasskeyHeldAlready`. It is a caller's mistake about the vault's state, and errors.ts (where a new kind would go) is out of this thread's scope.
    - Revoking when none: `'absent_wayin'`, `Phrases.NoPasskeyToRevoke`. It matches the old `delWayin` and the attempt's own kind.
    - Both refuse before asking for anything. A bad closure refuses `'bad_option'` from the arg check. A wrong proof refuses with the attempt's own kind (`wrong_passphrase`, `wrong_passkey`, ...) and stores nothing.
  - **Lock state**: unchanged. The ops do not unlock, and proof is asked even of an unlocked vault. The vaultKey is unchanged, so the lease held, and the kept one, stay in force (directive 4: one line in each doc block, and in the spec).
  - **strengthChecker**: the world carries none, so `// not yet:` in `withPassphraseReplaced`.
* **Approaches set aside**:
  - Resealing the passkey wayin on a new passphrase: a passkey touch, for a wayin still valid.
  - A `stageGate` the vault hands to the gate, or a gate method that calls back into the vault. That passes a function to be called on another instance (ground rule 2).
  - A `#stagedGate` field read in `makeStaged`. State across awaits (directive 3).
* **Deviations**:
  - The gloss said "reseals what stays via `makeWayin(provedProving)`". Nothing that stays is resealed, per the directive-2 reasoning above. Thread 6's planned "resealing both wayins" test should become "keeps the passkey wayin, which still opens" (as `vault-gate.test.ts` already pins).
* **Loosened pins** (`tests/loosened/loosened.test.ts`, *Changing the gate*; README:836 and :830 became real tests in the rework):
  - README.md:841, the passkey is kept across a new passphrase.
  - README.md:844, another device stays unlocked after a change (no `gate_epoch`).
  - README.md:853, a one-letter new passphrase is set (no strength check).
* **For the Coach** (Open matters):
  - **Passkey kept on a new passphrase** (TOP row): the old README removed it. Recommend keeping it, with the host showing the passkey beside revoke.
  - **Passkey proof refused for gate changes** (rework): the passphrase alone proves; the Coach may loosen by ruling.
  - **Gate identity check is strict** (rework): a revision bumped elsewhere, gate unchanged, also refuses 'stale_write'. Recommend keeping identity; deep-equal if false positives bite.
  - **No `gate_epoch`**: other devices stay unlocked after a change. Recommend this until key rotation.
  - **A refusal kind for "passkey held already"**: `'bad_option'` for now; a dedicated kind would need errors.ts.
  - **`try*` pairs on the three ops**: added for symmetry with the Storable ops. Easy to drop.

## Rework (2026-10-31, after the review at `high`)

The reviewer's five fixes stand (`b51dc7f3`..`f198afcf`). The orchestrator's two directives, in `871e61b4`:

* **A gate changed elsewhere between the proof and the send refuses `'stale_write'`.** `GateStaging` carries `ante`, the record's `gate` as read synchronously after `ensureReadyToEdit()`, beside the next props; `#sendGate(ante, props)`. `makeStaged` compares `ante` with `demandedFull().gate` by identity and throws `gateMovedUnderChange()` (`vault.ts` *Refusals*, `Phrases.GateMovedUnderChange`) when they differ; `edit` throws before it adopts anything, so nothing is staged or stored. The hydrate inside `send` replaces the record, making the gate another object. This is a consistency check let back by the Coach's amended ground rule 6, by the orchestrator's ruling.
* **A gate change is proved by the passphrase alone.** `Gate.#provePassphrase` runs `attemptProof` and refuses `'bad_option'` (`changeNeedsPassphrase()`, `Phrases.GateChangeNeedsPassphrase`) a proving that is not a `PassphraseProving`. All three `with*` steps call it in place of `attemptProof`, so the new wayin is always sealed from the passphrase's proving. The passkey still unlocks (`ensureUnlocked`); `replacePassphrase`'s doc block says the passkey stays and must be revoked separately.
* **Tests** (`vault-gate.test.ts`): a passkey proof of `replacePassphrase` refuses `'bad_option'`, asks for no new passphrase, stores nothing, and zeroes its PRF bytes; `revokePasskey` by the passkey refuses `'bad_option'` and the passkey still opens; a passkey revoked elsewhere during `replacePassphrase`'s proof stays revoked and the op refuses `'stale_write'`. The try-forms test now replaces by passphrase and checks a passkey refusal. The loosened pins for README:836 and :830 are gone; README:841 stays loosened (the Coach's row).
* **Spec**: both `_Built (thread 4)._` lines updated; design text untouched.
* **Approaches set aside**:
  - Refusing a passkey proof *before* it is tried. Its kind is known only once the closure answers, inside `Proving.attempt`; peeking from `Gate` would put the cleartexts in its hands. So a passkey answer is tried first: a wrong one still refuses `'wrong_passkey'`, a right one `'bad_option'`. Either way the answer is spent by `attempt`'s `finally`.
* **Discoveries**:
  - The identity check is conservative: any newer record the send's hydrate receives carries a newly parsed `gate`, so a revision bumped elsewhere by a host's `send({})`, gate unchanged, also refuses `'stale_write'`. Safe (call again over the record now in hand), but a false positive; a deep-equal on the gate would remove it if the Coach wants.
  - `addPasskey` with a passkey proof cannot reach `#provePassphrase`'s refusal: a vault with a passkey refuses `PasskeyHeldAlready` first, and one without refuses the attempt (`absent_wayin`).
