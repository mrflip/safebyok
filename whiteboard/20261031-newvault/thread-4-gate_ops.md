# Thread 4: gate_ops (2026-10-31)

Branch `20261031-gate_ops`, PR #414, stacked on #413 (`20261031-box_seal`). Justify: green (safebyok 4578 passed, 37 skipped; every package green). `pnpm size:budget`: the same eight "raise" rows as the base (the new phrases are shaken out of every bundle); no `--write`.

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
  - **Which proving signs the reseal (directive 2)**: the proving that opened, the passphrase's or the passkey's, whichever proof was handed. Only the new wayin is sealed. `replacePassphrase` keeps the passkey wayin as stored. Its ctx (`wayinCtxOf`) binds only the vault stamp and its own header, and the vaultKey is unchanged, so it still opens. Both reseal options in the gloss need the PRF answer, so a passkey touch; keeping the stored wayin asks the user nothing and the vaultKey never leaves `Proving`.
  - **Names (directive 3)**: the gate's step is `withX` (`withPassphraseReplaced`, ...), answering `GateProps`. The ops that stage and send live on the vault. No `Gate` or `Proving` is held on a field: each op reads `this.gate` once, synchronously, after `ensureReadyToEdit()`.
  - **The private path**: a token class, `GateStaging`, not a `#stagedGate` field. A field would hold state across `send`'s awaits; the token travels inside the one call and is unforgeable outside `vault.ts`.
  - **Refusals (directive 5)**: through factories in `gate.ts`.
    - A second passkey: `'bad_option'`, `Phrases.PasskeyHeldAlready`. It is a caller's mistake about the vault's state, and errors.ts (where a new kind would go) is out of this thread's scope.
    - Revoking when none: `'absent_wayin'`, `Phrases.NoPasskeyToRevoke`. It matches the old `delWayin` and the attempt's own kind.
    - Both refuse before asking for anything. A bad closure refuses `'bad_option'` from the arg check. A wrong proof refuses with the attempt's own kind (`wrong_passphrase`, `wrong_passkey`, ...) and stores nothing.
  - **Lock state**: unchanged. The ops do not unlock, and proof is asked even of an unlocked vault. The vaultKey is unchanged, so the lease held, and the kept one, stay in force (directive 4: one line in each doc block, and in the spec).
  - **strengthChecker**: the world carries none, so `// not yet:` in `withPassphraseReplaced`.
* **Approaches set aside**:
  - Resealing the passkey wayin from the new passphrase proving. It needs a passkey touch, for a wayin that is still valid.
  - A `stageGate` the vault hands to the gate, or a gate method that calls back into the vault. That passes a function to be called on another instance (ground rule 2).
  - A `#stagedGate` field read in `makeStaged`. State across awaits (directive 3).
* **Deviations**:
  - The gloss said "reseals what stays via `makeWayin(provedProving)`". Nothing that stays is resealed, per the directive-2 reasoning above. Thread 6's planned "resealing both wayins" test should become "keeps the passkey wayin, which still opens" (as `vault-gate.test.ts` already pins).
* **Loosened pins** (`tests/loosened/loosened.test.ts`, *Changing the gate*):
  - README.md:836, a passkey's answer proves a change.
  - README.md:841, the passkey is kept across a new passphrase.
  - README.md:844, another device stays unlocked after a change (no `gate_epoch`).
  - README.md:853, a one-letter new passphrase is set (no strength check).
  - README.md:830, a passkey revoked elsewhere during the proof comes back: the gate is staged whole and the fake store's `put` overwrites. The send fetched afresh first.
* **Discoveries**:
  - `Storable.send` hydrates before `edit`, so a newer record fetched there is overwritten by the staged gate, which was computed from the gate before. A versioned put (stale_write) or a re-check of the gate's identity in `#sendGate` would close it.
  - `Gate.attemptProof` already answers whichever proving opened, so a passkey proving signs a reseal for free.
* **For the Coach** (Open matters):
  - **Passkey proves gate changes**: the old README forbade it. Keep it (a passkey is a full way in under one vaultKey) or refuse `bad_option`.
  - **Passkey kept on a new passphrase**: the old README removed it. Recommend keeping it.
  - **No `gate_epoch`**: other devices stay unlocked after a change. Recommend this until key rotation.
  - **A refusal kind for "passkey held already"**: `'bad_option'` for now; a dedicated kind would need errors.ts.
  - **A gate changed elsewhere is overwritten**: wants a versioned put, or a check in `#sendGate`. Recommend a later thread.
  - **`try*` pairs on the three ops**: added for symmetry with the Storable ops. Easy to drop.
