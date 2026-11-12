# Thread 8a: bank_keys (2026-11-12)

Branch `20261112-bank_keys`, PR #TBD, stacked on #662 (thread 7, `20261112-plain_del`). Justify: **red by design**, mended by 8b. My suites are green and tsc and lint are clean on my files; see *What is red*.

* **Built**: the ruled ctx table, in `src/shapes/shapes-gateish.ts`, `src/models/{wayin,gate,proving,lease}.ts` and the deviceDB.
  - `bankStamp` `{user_id, banklabel, bank_tok, registered_at}` and `gateStamp` `{user_id, banklabel, gatelabel, gate_tok, registered_at}` are stripping objChecks beside `vaultStamp`, which is unchanged. `citedGate` `{gatelabel, gate_tok, revision_tok}` is what a lease cites, and a Gate or its record passes it.
  - `LeaseStamp` is `{fmt: 7003, ...BankStamp, gatelabel, gate_tok, gate_revision_tok, proved_at, wayinkind}`. `FirstGateEpoch`, `gateEpoch` and `gateProps` are gone.
  - The wayin ctx is `cipherCtx([bankStamp, gateStamp], purpose, header)`, and the header (from the gate row's wayin shape, `BX.passphraseWayin`/`passkeyWayin`) carries `wayinlabel`. `wayinCtxOf(bank, gate, header)` builds it.
  - The lease ctx is `cipherCtx([bankStamp, leaseStamp], 'vault_key_lease_wrapped')`. `Lease.sealWith`/`unsealWith(text, stamps[])` prepend the lease's own `#bankStamp`, so a box ctx is `[bankStamp, vaultStamp, boxStamp]` once 8b hands `[vaultStamp, boxStamp]`.
  - `Gate` is a plain frozen value over a `GateRecord`: `new Gate(bankStamp, record)` checks the record against the bank's scope and `bank_tok`; `Gate.make(bank, gate, main, passkey0)` builds revision 0 for 8b's `buildBank`. It keeps `bankStamp` and `stamp` (its GateStamp), not enumerable.
  - The provings: `buildNovel(bank, gate, clear, world)`, `buildStored(gate: StampedGate, ...)`, and `buildLease(friend, gate: CitedGate)`. `Lease.buildFromCache(friend, gate: CitedGate)` forgets a row citing another `gate_tok` or `revision_tok`; `buildGranted` takes `{gate, wayinkind}`.
  - The deviceDB keeps one lease row per bank scope. `LeaseQuery` is `BankScope + bank_tok`, `LeaseScopepath` is `[user_id, banklabel]`, `doPeek(BankScope)`. `DeviceDBVersion` is `'002-001-001'`, so IDB wipes the older database.
  - `judgeStrength` and the `StrengthChecker` take a `BankScope`.
  - VOCABULARY gains BankStamp, GateStamp, the lease's citations, and the `gateRevisionTok` row.
* **Decisions taken**:
  - **One shape for what a lease cites**, `CitedGate`, used by `buildFromCache`, `buildLease` and `buildGranted`. A Gate passes it directly, so 8b hands `gate`.
  - **The lease binds its own bank stamp.** `sealWith` takes the caller's stamps and prepends `#bankStamp` itself, so the caller cannot leave the bank out of a box ctx.
  - **The Gate keeps the bank's stamp it was handed.** A gate row has `bank_tok` but not the bank's `registered_at`, so the Gate cannot derive a BankStamp from its record. `buildStored` reads both stamps off the Gate.
  - **The DeviceDB version is bumped** rather than left to fail a parse: an old row is keyed by a 3-part vault scope, which a 2-part bank key would never find, so it would linger unread.
  - `ctxStamp.array().min(1)` for `leaseSealArgs`: an empty list would bind only the bank.
* **Set aside**:
  - Having the proving remember the gate revision: `buildNovel` runs before any revision exists, so the revision is handed to `buildLease` instead.
  - A Gate with no bank stamp, deriving one from its row: there is no `registered_at` for the bank in the gate row.
* **Deviations**:
  - Files beyond the handoff: `helpers/phrases.ts` (ProvingOfOtherGate, LeaseOfOtherGate), `helpers/consts.ts` (version), `helpers/passphrase-strength.ts` and `zxcvbn-strength-checker.ts` (BankScope), `VOCABULARY.md`, `tests/test-helpers/builders.ts` (`wayinOf` typed by the vault record's gate, 8b's to retire), and `tests/shapes/shapes-vaultish-box.test.ts` (dropped the `FirstGateEpoch` import).
  - One cast: `as Wayins` in `gate.ts`, where `make` assembles the row's wayins from the two Wayin pickles before the record check runs.
  - `src`: +277 / -219 lines over 13 files.
* **What is red** (8b's to mend):
  - tsc: `src/models/bank.ts` (2), `gating.ts` (7), `vault-listing.ts` (1) and `vault.ts` (13); and the tests `bank-ending`, `gating`, `proof`, `vault-boxes`, `vault-gate`, `vault-lease`, `vault-unlock`, `vault.test` and `test-helpers/vault-world.ts`. `device.ts` is clean, though the handoff predicted it red.
  - vitest: 397 failures in 20 files. All of them are on the vault-world and bank-world paths, which reach `gating.ts` or `vault-world` calling the old `buildNovel`. ctx-bytes accounts for 15 of them: its `realBoxStamps` cases pin `[bankStamp, vaultStamp, boxStamp]`, which needs 8b's vault. gating.test also raises 10 unhandled rejections.
  - Lint: `gating.ts`, `vault.ts`, `gating.test`, `vault-lease`, `vault-unlock` and `vault.test` (unused imports and unsafe calls over the broken types). The `safebyok-react` build fails because the core's build does.
* **Discoveries**:
  - `vault-world` and `gating.ts` are the one choke point: once 8b moves them to `buildNovel(bank, gate, …)` and hands `Gate` to `buildLease`, nearly every red suite should turn.
  - **For life_tok:** nothing in 8a needed it. `gate_tok` plus `revision_tok` identifies the gate revision a lease was granted under, and `bank_tok` the bank's life. The design's "watch, do not build" holds.
  - `notes/guarantees.md`'s *Where the guarantees are kept* row for `gate.ts` still says "the vault's stamp". guarantees-bank.md's *What moves* matches this change (G3: the wraps are unchanged, only the stamps; G4: one lease row per bank scope citing the gate; G8: the phrases add no secret; G9: the wraps are imported only by proving.ts and lease.ts). 8b promotes it.
  - VOCABULARY's vault record entry still shows a nested `gate` with `gate_epoch`; 8b retires it with the vault record.
* **For the Coach**:
  - **Stamp pairing in buildNovel**: it does not check that the gate stamp's scope and the bank stamp's agree. The ctx binds both, so a mismatch makes a wayin that never opens under the right pair, not one that opens under the wrong pair. I recommend leaving it unchecked.
  - **Vacate's forget**: guarantees-bank.md has a vacate forget the lease by `bank_tok`; `forgetRawLease` forgets by scopepath with no token. My `forget` matches `bank_tok`, as `peek` does. I recommend keeping both.
