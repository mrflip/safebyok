# Thread 1: gate_in_record (2026-10-31)

Branch `20261031-gate_in_record`, PR #TBD, stacked on #408 (`20261031-newvault_models`). Base moved mid-thread: rebased onto 4ff14b4b before any commit of mine, recorded as `branch.20261031-gate_in_record.sprintbase`. Justify: green (safebyok 4529 passed, 37 skipped; every package green).

* **Built**:
  - `models-shapes.ts`: `vaultRecord` = `vaultSparse` + `gate: gateProps.nullable()` (nested, not flattened); the vault's forms moved below the gate's (TDZ). `vaultPatch` is `vaultRecord.partial().strict()`. `buildGateArgs` (`{ proofClosure }`). New section *The vault's world*: `leaseDeviceDB` (the three lease verbs by scope) and `vaultListingOpts` (checks the world's ProvingWorld, logger, leaseMillis, deviceDB).
  - `vault-listing.ts`: `VaultWorld` = ListingWorld & ProvingWorld & `{ scope, logger, leaseMillis, deviceDB }`. `build(dna, proofClosure)`: drafts with `gate: null`, holds the vault, then `vault.buildGate(proofClosure)`. A record goes through the base's `build` untouched.
  - `vault.ts`: `get gate()` (lazy, cached by the identity of `full.gate`), `buildGate(proofClosure)` (Gate.build, then `edit({ gate: gate.pickle() })`), `leaseDBFriend()` (arrow functions over `world.deviceDB` and `this.scope`), `demandReadyToEdit` now demands a full record, new `demandReadyToSend` refuses a gateless vault; `isFullRecord` asks `'gate' in fetched`; `makeStaged` carries the gate. Refusals `gateAlreadyBuilt`, `notGatedYet` (both `bad_option`).
  - Tests: `tests/models/vault.test.ts` (new, 5), `models-shapes.test.ts` (vaultRecord/vaultSparse gate; vaultPatch cases).
  - Spec *Terms*: ground rules 1 and 2; the gate's birth, `vault.gate` and the vault's world marked built. The `gate_props` note left as it was.
* **Decisions taken**:
  - **Nested `gate`, nullable.** The vault must exist before `Gate.build(vault, ...)`, and `draftOf` must answer a full record, so a drafted vault holds `gate: null` until `buildGate`. `send` refuses it then.
  - **The vault edits its gate in after birth** (`vault.buildGate`), not Gate-before-vault: Gate.build needs a Vault, and a failed closure leaves a held, gateless vault that `buildGate` can retry (a second `build(dna)` would refuse it as already held).
  - **The patch's gate is taken only where the vault has none.** A host's stale `{ ...record }` patch can never revert a gate; later gate changes are the gate verbs' (thread 2/3).
  - **`#gate` built lazily in the getter**, not in `settle`: the Storable constructor settles before the subclass's private fields exist.
  - `leaseMillis` pulled forward into `VaultWorld` (thread 2 needs it for `Lease.grant`); declare it struck from thread 2.
* **Deviations**: two guards added (`edit` demands full, `send` demands a gate). Without the first, an edit over a sparse record stages `gate: null` and the next send wipes the gate; without the second, a gateless vault reaches storage. Rule 6 bars consistency checks coming back; these are shape guards, but the Coach may rule otherwise.
* **Discoveries**:
  - Confirmed by `rg` over `models/`: storage is written only by `listing.put`/`del` and storable's `cache.save` of vault and box records; `lease.ts` writes only the lease. A wayin or gate reaches storage only inside the vault record (and its device-cache copy). Proving, Gate and Wayin write nothing.
  - `vault.gate` is a prototype getter, so ducking a Vault as its record fails `vaultRecord` (no own `gate`); ducking it as sparse is fine. Nothing does the former today.
  - `vaultListingOpts` does not check `world.scope` (the listing's base owns it).
* **Set aside**: a host-patchable gate (revert hazard); a private slot or symbol key for the gate's first write (hacky beside `edit`); building the gate before the vault (Gate.build takes a Vault); a flattened gate (the Coach's later `gate_props` note will reshape it anyway).
* **For the Coach**: the two guards above; `gate: null` as a stored-record value that is never stored (send refuses it).
