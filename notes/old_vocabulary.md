# Old vocabulary

The names the reform of October 2026 retired, each beside the name that replaced it. This page is
for whoever reads older code, a CHANGELOG, `winboard/` or a released changeset and meets a word the
current cast does not use. Nothing current uses the first table's names: not the code, the docs, the
stored records or the tests. Never name a new thing from this page. The current cast is in
VOCABULARY.md.

The second table, at the end, lists the old design's names that the new core does not have (from
the VOCABULARY sweep of 2026-11-06, `whiteboard/20261106-reform/thread-1-vocab_sweep.md`).
`packages/safebyok-old` used them until it was removed on 2026-11-10.

A name in the New column that also appears in the Old column was renamed again by the rename pass
of 2026-10-19 (Box everywhere; get, put and del on every layer; `check` for a check): follow it down
the table. The rows come from these passes, in order:

* The two rows on `vault_id` and `unlock_epoch`: the rename of 2026-10-21 (better_paths, streamline
  thread 1).
* The rows after them: the primitives sprint of 2026-10-22 and 23 (`winboard/20261022-primitives/`).
* The rows after `TH.makeLatch`: the restyle of 2026-10-26 (`winboard/20261025-restyle/`).
* The rows on standing: the fixup sprint of 2026-10-27 (`winboard/20261027-fixup_sprint/unstanding.md`).
* The rows on the storage interfaces' verbs: the catchsweep sprint of 2026-10-28
  (`winboard/20261027-catchsweep/`).

To be deleted at 1.0.0.

| Old                                                    | New                                                     |
| ------------------------------------------------------ | ------------------------------------------------------- |
| unlock envelope, `UnlockEnvelope`                      | wayin, `Wayin`                                          |
| `PassphraseEnvelope`, `PasskeyEnvelope`                | `PassphraseWayin`, `PasskeyWayin`                       |
| module `Envelope` (`src/envelope.ts`)                  | module `Wayin` (`src/wayin.ts`)                         |
| `EnvelopeHeader`, `EnvelopeStamp`                      | `WayinHeader`, `WayinStamp`                             |
| `bundle.unlocks`, the snapshot's `unlocks`             | `wayins`, on the vault props and the snapshot           |
| unlock (as the snapshot lists it), `UnlockSummary`     | wayin, `WayinSummary`                                   |
| `unlock_id`, `unlockId` (an option)                    | `wayin_id`, `wayinId`                                   |
| `unlocklabel`                                          | `wayinlabel`                                            |
| `method` (stored), `UnlockMethod`, `UnlockMethodVals`  | `wayinkind`, `WayinKind`, `WayinKindVals`               |
| `UnlockProof`                                          | `Proof` (`PasskeyProof` stays)                          |
| `passphraseKey`, `passkeyKey`, acting on the vaultKey  | `wayinKey` (the code that makes one keeps its name)     |
| `vault_key_wrapped` on a way in                        | `vault_key_wayin_wrapped` (the prior vaultKey's stays)  |
| vaultKeyPassphraseWrapped, vaultKeyPasskeyWrapped      | vaultKeyWayinWrapped                                    |
| `removeUnlock`                                         | `retireWayin`                                           |
| `absentUnlock`                                         | `absentWayin`                                           |
| `absent_unlock`, `damaged_unlock`                      | `absent_wayin`, `damaged_wayin`                         |
| `last_unlock`, `too_many_unlocks`                      | `last_wayin`, `too_many_wayins`                         |
| cipherAdditionalData, binding                          | ctx                                                     |
| `cipherBinding`, `CipherBindingPart`                   | `cipherCtx`, `CipherCtxPart`                            |
| every `binding` parameter                              | `ctx`                                                   |
| `envelopeBinding`                                      | `wayinCtx`                                              |
| `boxBinding` (the lockbox's binding)                   | `boxCtx`                                                |
| `localBinding`                                         | `leaseCtx`                                              |
| public bag, `PublicBag`                                | sidecar, `Sidecar`                                      |
| `public_json`, `publicJsonOf`                          | `sidecar_json`, `sidecarJsonOf`                         |
| `store(..., { public })`, `.public` on a summary       | `storeBox(..., { sidecar })`, `.sidecar`                |
| device unlock, remembered unlock, `DeviceUnlock`       | lease, `Lease`                                          |
| format `safebyok-unlock-v1`                            | format `safebyok-lease-v1`                              |
| `localUnlockKey`, `makeLocalUnlockKey`                 | `leaseKey`, `makeLeaseKey`                              |
| `local_unlock_key`                                     | `lease_key`                                             |
| `vault_key_local_wrapped`, vaultKeyLocalWrapped        | `vault_key_lease_wrapped`, vaultKeyLeaseWrapped         |
| `readUnlock`, `writeUnlock`, `eraseUnlock`             | `readLease`, `writeLease`, `eraseLease`                 |
| `UnlockExpectation`                                    | `LeaseExpectation`                                      |
| `rememberDevice`                                       | `grantLease`                                            |
| `rememberedUnlock`                                     | `fetchLease`                                            |
| `takeUpUnlock`                                         | `grantLease`                                            |
| `ForcePassphraseReentryHours`, `MaxReentryHours`       | `LeaseHours`, `MaxLeaseHours`                           |
| `forcePassphraseReentryHours`                          | `leaseHours`                                            |
| `reentryWindowMillis`                                  | `leaseMillis`                                           |
| `Ckeys.unlock`, `Ckeys.isUnlock`, ckey `unlock^…`      | `Ckeys.lease`, `Ckeys.isLease`, ckey `lease^…`          |
| bundle, `VaultBundle`                                  | vault props, `VaultProps`                               |
| format `safebyok-vault-v2`                             | format `safebyok-vault-v3`                              |
| format `safebyok-lockbox-v4`                           | format `safebyok-lockbox-v5`                            |
| `BundleIdentity`, `BundleExpectation`                  | `VaultIdentity`, `VaultPropsExpectation`                |
| `damaged_bundle`                                       | `damaged_vault`                                         |
| `readBundle`                                           | `readVaultProps`                                        |
| `createBundle`                                         | `fetchOrCreateVaultProps`                               |
| `updateBundle`                                         | `updateVaultProps`                                      |
| erase, `eraseBox`, `eraseVault`                        | retire, `retireBox`, `retireVault`                      |
| `eraseDamagedVault`, `EraseDamagedVaultOpts`           | `retireDamagedVault`, `RetireDamagedVaultOpts`          |
| `EraseExpectation`                                     | `RetireExpectation`                                     |
| `vault.store`, `vault.read`, `vault.use`               | `vault.storeBox`, `vault.readBox`, `vault.useBox`       |
| `vault.erase`, `vault.destroy`                         | `vault.retireBox`, `vault.retire`                       |
| `openVault(opts)`, `OpenVaultOpts`                     | `Vault.make(opts)` and `vault.hello()`, `MakeVaultOpts` |
| `revision_id`, revisionId                              | `revision_tok`, revisionTok                             |
| `Ckeys.bundle`                                         | `Ckeys.vaultProps` (the stored ckey `vault^…` is unchanged) |
| `TH.bundleOf`, `TH.rotatedBundleOf`                    | `TH.vaultPropsOf`, `TH.rotatedVaultPropsOf`             |
| `Refusals.staleWrite('bundle' \| 'erase')`             | `Refusals.staleWrite('vaultProps' \| 'retire')`         |
| Postgres `safebyok_bundles`, `safebyok_bundles_changed` | `safebyok_vaults`, `safebyok_vaults_changed`            |
| GraphQL `SafebyokVaultBundle`, `SafebyokVaultBundleInput` | `SafebyokVaultProps`, `SafebyokVaultPropsInput`         |
| GraphQL `SafebyokBundleExpectationInput`, `SafebyokEraseExpectationInput` | `SafebyokVaultPropsExpectationInput`, `SafebyokRetireExpectationInput` |
| GraphQL `safebyok{Read,Create,Update}Bundle`, `safebyokErase{Box,Vault}` | `safebyok{Read,FetchOrCreate,Update}VaultProps`, `safebyokRetire{Box,Vault}` |
| Convex `getBundle`, `createBundle`, `updateBundle`     | `getVaultProps`, `fetchOrCreateVaultProps`, `updateVaultProps` |
| Convex `eraseBox`, `eraseVault`, args `{ bundle }`     | `retireBox`, `retireVault`, args `{ vaultProps }`       |
| Convex table `safebyok_bundles`; tally `bundle_id`, `by_bundle` | `safebyok_vaults`; tally `vault_row_id`, `by_vault_row` |
| lockbox, `Lockbox`                                     | box, `Box`                                              |
| `LockboxSummary`, `DamagedLockbox`, `StoredLockbox`    | `BoxSummary`, `DamagedBox`, `StoredBox`                 |
| `LockboxExpectation`                                   | `BoxExpectation`                                        |
| `LockboxRetireExpectation`                             | `BoxDelExpectation`                                     |
| `LockboxRetirement`; outcomes `retired`, `retired_other` | `BoxDeletion`; outcomes `deleted`, `deleted_other`      |
| `RetireExpectation`                                    | `VaultDelExpectation`                                   |
| `LockboxFormat`, `LockboxFieldsBytes`, `LockboxFixedBytes`, `LockboxHeader` | `BoxFormat`, `BoxFieldsBytes`, `BoxFixedBytes`, `BoxHeader` |
| lockboxKey, lockboxKeyWrapped, `lockboxKeyBytes`       | boxKey, boxKeyWrapped, `boxKeyBytes`                    |
| `lockbox_key_wrapped` (stored)                         | `box_key_wrapped`                                       |
| format `safebyok-lockbox-v5`                           | format `safebyok-box-v6`                                |
| `damaged_lockbox`, `lockbox_too_large`                 | `damaged_whisper`, `box_too_large`                      |
| `maxLockboxes`, `MaxLockboxes`, the capacity `lockboxes` | `maxBoxes`, `MaxBoxes`, `boxes`                         |
| `storeBox` (the vault), `updateBox` (a VaultDB)        | `putBox`, on both                                       |
| `readBox`                                              | `getBox`                                                |
| retire, `retireBox`, `retireWayin`, `retire()`         | del, `delBox`, `delWayin`, `del()`                      |
| `retireVault`, `retireDamagedVault`, `RetireDamagedVaultOpts` | `delVault`, `delDamagedVault`, `DelDamagedVaultOpts`    |
| `retireIfIncoherent`, `Expectations.retirementOf`      | `delIfIncoherent`, `Expectations.deletionOf`            |
| `Expectations.lockboxMeets`, `TH.retiring`             | `Expectations.boxMeets`, `TH.deleting`                  |
| `Refusals.staleWrite('lockbox' \| 'retire')`           | `Refusals.staleWrite('box' \| 'del')`                   |
| `fetchOrCreateVaultProps`                              | `ensureVaultProps`                                      |
| `readVaultProps`, `updateVaultProps`                   | `getVaultProps`, `putVaultProps`                        |
| `readLease`, `writeLease`, `eraseLease`                | `getLease`, `putLease`, `delLease`                      |
| `readMark`, `writeMark`, `eraseMark`, `eraseAll`       | `getMark`, `putMark`, `delMark`, `delAll`               |
| `ensureOpen`, `ensureUnlocked`, `ensureSaltFits` and every `ensure` that only checks | `checkOpen`, `checkUnlocked`, `checkSaltFits`: a `check` (`ensureUnlocked` came back in the primitives sprint, for the call that makes the vault unlocked) |
| `VaultError.kind`, `isVaultError(err, kind)`           | `VaultError.refusalkind`, `isVaultError(err, refusalkind)` |
| Postgres `safebyok_lockboxes`, `safebyok_lockboxes_changed` | `safebyok_boxes`, `safebyok_boxes_changed`              |
| Convex table `safebyok_lockboxes`; tally `lockbox_count`, `lockbox_bytes` | `safebyok_boxes`; tally `box_count`, `box_bytes`        |
| GraphQL `SafebyokLockbox`, `SafebyokListedLockbox`, `SafebyokLockboxRetirement` | `SafebyokBox`, `SafebyokListedBox`, `SafebyokBoxDeletion` |
| GraphQL `safebyok{Read,Update,Retire}Box`, `safebyok{Read,FetchOrCreate,Update}VaultProps`, `safebyokRetireVault` | `safebyok{Get,Put,Del}Box`, `safebyok{Get,Ensure,Put}VaultProps`, `safebyokDelVault` |
| Convex `fetchOrCreateVaultProps`, `updateVaultProps`, `updateBox`, `retireBox`, `retireVault` | `ensureVaultProps`, `putVaultProps`, `putBox`, `delBox`, `delVault` |
| files `lockbox.ts`, `retire-damaged-vault.ts`          | `box.ts`, `del-damaged-vault.ts`                        |
| `vault_id`, `vaultId` (and `vaultIdMeets`, `Expectations.vaultIdMeets`; GraphQL, Convex and Postgres fields and columns of the same name) | `vault_tok`, `vaultTok`, `vaultTokMeets` |
| `unlock_epoch`, `unlockEpoch` (stored, wire and column names alike) | `gate_epoch`, `gateEpoch`                               |
| `Vault.make(opts)`, a vault's own options              | `Bank.make(opts)`, then `bank.ensureVault({ userId, vaultlabel })`: the bank has the options, the draft names the vault |
| handle (a `Vault` instance), `close()`, `tryClose()`, kind `vault_closed` | Vault object; `bank.closeVault(choice)`; kind `vault_gone` |
| state `opening` (no read yet), state `absent` (never made) | none: a Vault object is born from a read, and a vault never made is born `novel` |
| `Proof`, `PassphraseProof`, `Proof.parse`, a proof (what the user presents) | cleartext (what the user hands a gating's attempt), made into a `Proving` (`PassphraseProving`, `PasskeyProving`) |
| `Ask`, `getProof` (a `Vault.make` option)              | `Gating`, `requestCleartext` (a `Bank.make` option)     |
| `AskWhy` (`absent`, `locked`, `lease_ending`)          | `GatingKind` (`initialize_gate`, `unlock_vault`, ...), read as `gating.gatingkind` |
| `ProofAnswer` (`unlocked`, `declined`, `carry_on`)     | none: the gating's attempt settles it, `dismiss()` dismisses, and `requestCleartext` resolving dismisses what is still open |
| `carry_on`, `lease_ending`                             | none: `ensureUnlocked({ renewMinutes })` asks while the lease ends within that time |
| `ask.attempt(proof, { wayinId? })`                     | the gating's typed attempt: `attempt`, `attemptPassphrase`, `attemptPasskey` |
| `vault.unlock(proof)`, `tryUnlock`                     | `vault.ensureUnlocked()`, whose `unlock_vault` gating takes the cleartext |
| `ensureLease`, `tryEnsureLease`                        | `ensureUnlocked`, `tryEnsureUnlocked`                   |
| `vault.putWayin(proof, newProof, { wayinlabel })`, `vault.delWayin(proof, wayinId)` | `vault.putWayin(slotlabel)`, `vault.delWayin(slotlabel)`: each starts a gating |
| `wayin_id`, `wayinlabel`, `wayinId`                    | `slotlabel` (`'passphrase'` or `'passkey'`): a vault holds one of each |
| `getProof`'s throw, `unexpected_error` with its cause  | `requestCleartext`'s throw, `unexpected_error` carrying nothing of it |
| device mark, `DeviceMark`, `safebyok-mark-v5`, `getMark`, `putMark`, `delMark`, the seen vault | device record, `DeviceRecord`, `safebyok-device-v1`, `getDeviceRecord`, `raiseDeviceRecord`, `delDeviceRecord` |
| rolled back, kind `rolled_back` (a lower `gate_epoch` than the mark) | behind, kind `vault_behind` (a lower `vault_epoch` than the device record) |
| kind `created_elsewhere`                               | kind `gate_made_elsewhere`                              |
| kind `last_wayin`                                      | kind `passphrase_required`                              |
| kind `too_many_wayins`                                 | none: a new passkey replaces the passkey                |
| `vault.decryptWhisper(record)`, `tryDecryptWhisper`, `vault.openBox`, `box.tryOpen(vaultKey)`, `box.open` | `box.extractWhisper()`, `tryExtractWhisper`, under the vault's lease |
| `Lease.grant`, `lease.tryOpen`, `lease.wrapBoxKey`, `lease.unwrapBoxKey`, `lease.record` | `proving.grantLease()`; a lease taken up as read; `lease.cipheredWith` / `decipherWith` / `sealProps`; no public record |
| `Wayin.seal`, `Wayin.sealPassphrase`, `Wayin.sealPasskey`, `Wayin.tryOpenAmong`, `wayin.tryOpen` | `PassphraseProving.seal` / `PasskeyProving.seal`, then `proving.sealWayins`, `resealWayinFor`, `demandOpens` |
| `tryDemandConsistentWith`                              | `consistentWith` (the query) beside `demandConsistentWith` (throws) |
| `VaultDB.getVaultProps`, `ensureVaultProps`, `listBoxes`, `listBoxRecords` | `VaultDB.getVault`, `ensureVault`, `getVaultRecords`, `ensureVaultRecords` |
| `TH.makeGate`                                          | `TH.makeLatch`: a gate is the vault's ways in       |
| `userId` (a draft's field, `BankProvider`'s prop, `postgresVaultDB`'s option) | `user_id`, as stored |
| `PasskeyAnswer`'s `credentialId`, `prfSaltB64`          | `credential_id`, `prf_salt_b64`, as the wayin stores them |
| the snapshot's and `vault.askPassphraseAt`             | `ask_passphrase_at`, as the lease stores it             |
| vault props, `VaultProps`, `GatedVaultProps`, `GatelessVaultProps`; their flat `passphrase` and `passkey` | vault record, `VaultRecord`, its `gate` nested (`GateRecord`), null while novel |
| `Tombstone`, `VaultPropsExpectation`, `LeaseView`, `LeaseStanding` | `VaultTombstone`, `VaultRecordExpectation`, `LeaseSparse`, `Pick<VaultSparse, 'vault_tok' \| 'gate_epoch'>` |
| `Stamp`, `Stamped` (the scope, `vault_tok` and both epochs) | `VaultSparse`; `Pick<VaultSparse, 'vault_tok'> & Partial<VaultSparse>` written out |
| `TH.vaultPropsOf`, `TH.propsOf`, `gate.storedFields`   | `TH.vaultRecordOf` (and `TH.gateOf`), `TH.vaultRecordIn`, `gate.record` |
| standing, stands (the row a VaultDB call compares or reads); `standingVaultRecord`, `standingBox`, `StandingBoxSql` | stored: "the stored vault record", "no box is stored"; `storedVaultRecord`, `storedBox`, `StoredBoxSql` (Postgres's CTE `standing` is `prior`) |
| standing (the vault record in hand), the `standing` of `sealLeaseRecord` | the vault record in hand; `held` |
| the gating standing; a lease standing                  | the pending gating; a lease in force                    |
| `#checkStanding()`, `StandingGating`, `standsBeside`    | `#demandNotGone()`, `OutsideGating`, `leavesInForce`    |
| `VaultDB.getVault`, `ensureVault`, `getVaultRecords`, `ensureVaultRecords`, `putVaultRecord`, `getBox`, `putBox`, `getCapacity`, `delBox`, `delVault`, `delDamagedVault`, each resolving an `Outcome` | `tryGetVault`, `tryEnsureVault`, ... resolve the `Outcome`; `getVault`, `ensureVault`, ... resolve the answer or throw the refusal |
| `DeviceDB.getLease`, `putLease`, `delLease`, `getDeviceRecord`, `raiseDeviceRecord`, `delDeviceRecord`, `delAll`, each resolving an `Outcome` | `tryGetLease`, `tryPutLease`, ... resolve the `Outcome`; `getLease`, `putLease`, ... resolve the answer or throw what the datastore threw |
| `HeededVaultDB`'s `Thrown<>` mapping; `ProvingTools.putLease` | `Pick<VaultDB, ...>` of the throwing forms, then (2026-10-28, heed_inline) gone: `RefusalPolicy.heed` is deleted, and the vault calls each `VaultDB` `try` form itself; `ProvingTools.tryPutLease` |
| `StringStore.read`, `write`, `erase`; `readJson`         | `StringStore.get`, `put`, `del`; `getJson` (the rename pass of 2026-10-28: no operation is a `read` or a `write`) |
| `KeptLease.tryRead`                                    | `KeptLease.tryGet`                                      |
| `registerLeaseReader(vault, read)`                     | `registerLeaseGetter(vault, getLease)`                  |
| `Refusals.staleWrite('del')`, `StaleWriteVals`, `StaleWrite` | `Refusals.staleDel()`, `StaleDelMessage` (the kind is still `'stale_write'`) |
| `BirthRead`, `readAt`                                  | `Birth`, `refreshedAt`                                  |
| `applabel` (a scope's first name, stored and in every option; the scopepath's `vault^acme^u1^main`) | `banklabel`, and `user_id` now comes first in a scope: `vault^u1^acme^main` (2026-11-12, bank_world thread 1) |
| `ensureCachedBank`, `forgetBank`, `listRawBanks`, `BankRow`, `bankRow` (the deviceDB's bank row, and each `try*` and `do*` form of its verbs; the IndexedDB database `<dbName>:bank-v001-001-001`) | `ensureCachedDevice`, `forgetDevice`, `listRawDevices`, `DeviceRow`, `deviceRow` (the device row; `<dbName>:devicerow-v001-001-001`) (2026-11-12, bank_world thread 2) |
| `device_id`, `deviceId`, `useDeviceId` (an option, a prop, a wayin's header field, the device row) | `device_tok`, `deviceTok`, `useDeviceTok` (2026-11-12, bank_world thread 2) |
| `Bank.make(opts)`, `BankOpts`                          | `Device.make(opts)`, `DeviceOpts`; `device.ensureBank()` makes the bank (2026-11-12, device_owner) |
| `bank.hello()`, `bank.tryHello()`                      | `device.ensureBank()`, `device.tryEnsureBank()`, resolving to the bank (2026-11-12, device_owner) |
| `BankEvent`, `BankStage`, `BankAnnouncement`; the bank snapshot's `stage`, `err` and `openGating` | `DeviceEvent`, `DeviceStage`, `DeviceAnnouncement`; the device snapshot's (`DeviceSnapshot`) (2026-11-12, device_owner) |
| `bank.vacate()`, `bank.sweep()`, `bank.isEnabled`, `bank.autolockMinutes` | `device.vacate()`, `device.sweep()`, `device.isEnabled`, `device.autolockMinutes`; the one gating open, `device.openGating` (2026-11-12, device_owner) |
| `device_tok` (a `Bank.make` option); `useDeviceTok` (`safebyok-react`) | gone: the device asks the deviceDB for its row at `device.ensureBank()`; the bank has it as `bank.device_tok` (2026-11-12, device_owner) |
| `vault.hello()`, `vault.tryHello()`                    | `vault.beginWatch()`, `vault.tryBeginWatch()`; `helloedVaults` (`safebyok-react`'s context) is gone: the context is the device itself, and a vault's watch begins again at each new life (2026-11-12, plain_del; bank_world thread 12) |
| `vault.delVaultPrompt()`, `tryDelVaultPrompt()`; the `del_vault` gatingkind, its act and `vaultDelCleartexts` | `vault.del(vault)`, asking nobody, under an unlocked vault (2026-11-12, plain_del) |
| `DelVaultModal`'s `gating` prop (`safebyok-react`)    | `vault` and `onDone(deleted)`: a plain confirm the host mounts (2026-11-12, plain_del) |
| `VaultDB`, `AdapterVaultDB`, `MemoryVaultDB`, `IdbVaultDB`, `PostgresVaultDB`, `ConvexVaultDB`, `GraphQLVaultDB`, `describeVaultDBBattery`, `DevVaultDBInspector`, `SafebyokComponent`; a verb's answer `world`; the vault-world tables and their classifier | `BankDB`, `AdapterBankDB`, `MemoryBankDB`, `IdbBankDB`, `PostgresBankDB`, `ConvexBankDB`, `GraphQLBankDB`, `describeBankDBBattery`, none for the inspector, `SafebyokBankComponent`; `parent`; the bank-world tables (2026-11-12, bank_world thread 16) |
| `vaultKey`, `makeVaultKey` (the vault's key, and `vault_key_wayin_wrapped`, `vault_key_lease_wrapped` that wrap it) | `bankKey`, `makeBankKey`, `bank_key_wayin_wrapped`, `bank_key_lease_wrapped`: one key per bank, not per vault (2026-11-12, bank_world) |
| the `vault_locked` refusal kind                        | `bank_locked`, thrown by the one thrower `needUnlocked` (2026-11-12, bank_world thread 8b) |
| a vault's gate and lease: `vault.gate`, `vault.lock()`, `vault.ensureUnlocked()`, `vault.unlock()`, `vault.putWayin(slotlabel)`, `vault.delWayin(slotlabel)`, `slotlabel`, the gate's `passphrase_wayin` and `passkey_wayin` | the bank's, one each: `bank.maingate` (`bank.maingate.replacePassphrasePrompt()`, `addPasskeyPrompt()`, `revokePasskeyPrompt()`; its `wayins` are `main` and `passkey0`), `bank.lock()`, `bank.ensureUnlocked()`, `bank.unlock()`; `vault.isLocked` reads the bank's (2026-11-12, bank_world) |
| the `build_vault` and `unlock_vault` gatingkinds      | `build_bank` and `unlock_bank`; the others are `replace_passphrase`, `add_passkey`, `revoke_passkey` and `del_bank` (2026-11-12, bank_world) |
| a vault's own lease (`Vault.#revokeLease`)             | the bank's (`Bank.#revokeLease`) (2026-11-12, bank_world) |
| formats 6002 (vault), 5002 (box), 7002 (lease)         | `fmt` 6003 (vault), 5003 (box), 7003 (lease); a bank is 3001 and a gate 4001 (2026-11-12, bank_world) |

## The old design's names the new core does not have

These rows moved from VOCABULARY.md in the sweep of 2026-11-06. A row whose New column says "none yet" names
a thing the new core has not built. Where VOCABULARY.md's row was about the old design alone, it is
copied here whole.

| Old                                                    | New                                                     |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `box.record`                                           | none: a `Box` hands out no record                       |
| A Vault object born from one read of storage and this device's store; one never made born `novel` | `bank.ensureVault` returns a listed vault, or creates it if absent, with no gating (a locked bank will do); no Vault object stands for an absent vault |
| `putWayin('passphrase')`, which replaced the passphrase and removed the passkey | a `replace_passphrase` gating, which leaves the passkey wayin |
| `putWayin('passkey')`, which put or replaced the passkey; `delWayin('passkey')` | an `add_passkey` gating, which refuses `camped` while a passkey wayin is stored; a `revoke_passkey` gating |
| a gate's two slots, named by `slotlabel` (`'passphrase'`, `'passkey'`) | the bank's gate's `wayins`: `main` (the passphrase wayin) and `passkey0` (the passkey wayin), under `bank.maingate` |
| the snapshot's `gate` (`GateSparse`), each wayin's sparse shape (`PassphraseWayinSparse`, `PasskeyWayinSparse`) | none: `VaultSnapshot` shows no gate; a wayin's `WayinHeader` is all of it but its wrap |
| `WayinSummary`, a wayin's sparse shape and `vault_tok` in a log line | none yet                                                |
| a wayin's `registered_at` and `device_id` "of its sealing" | of the device that built it: only a box is sealed      |
| `PassphraseWayin`, `PasskeyWayin`, `Wayin.make`         | `Wayin`, over a `WayinRecord`                           |
| a gating's `lockLanded`                                | gone: a lock leaves a gating open                       |
| one gating pending per vault, every waiting call hearing how it settles | one gating open per bank; a second call refuses `already_asking` |
| `proving.grantLease()`, `wrappedWith`; a proving "reseals wayins" | `proving.buildLease()`, `proving.buildWayin()`; the wrap and unwrap are private |
| a lease taken up "until its `ask_passphrase_at`", then dropped from memory by a timer | a cached lease past autolock (`proved_at` plus `leaseMillis`) is never taken up; `bank.autolock()` locks |
| `lease.cipheredWith`, `lease.decipherWith`; a box "opened" | `lease.sealWith`, `lease.unsealWith`; a box is unsealed |
| a lease evicted at the listing's `goodbye`             | `lease.evict()`, which drops its keys and leaves its cached row |
| a box's `boxCtx` (its vault's stamp but for the format, and its own `BoxStamp`); a lease's `leaseCtx` | `cipherCtx([vaultStamp, stamp], purpose)`; a box's stamp is its sparse fields and sidecar (`boxStampOf`) |
| `LeaseStamp` with an `autolock_at`, "as a lease is granted for one span" | `LeaseStamp`: `fmt`, the vault's stamp, `gate_epoch`, `proved_at`, `wayinkind` |
| **vaultEpoch**: a counter on the vault that the store moves, never a writer: up by one on every write of the vault record and on `delVault`, and carried by the tombstone into the next life (`vault_epoch`). Standard term: rollback counter. | none: the new core keeps no vault epoch; `revision_seq` counts a record's revisions |
| **behind**: said of a vault storage serves at a lower vaultEpoch than this device's record has seen in its scope. | none                                                    |
| a deviceId minted per vault scope, the first time the device reads or makes it, kept across the vault's lives; "one per vault, so it links nothing the vault does not already link" | one `device_tok` per bank scope, minted by the deviceDB's `ensureCachedDevice` |
| **Made under**: each Box, Lease, Gate and Proving holds the scope, `vault_tok` and epochs of the vault it was made under (`VaultMadeUnder`), as the vault handed them in, and `vault.demandConsistentWith(thing)` compares them with the vault record it holds: the vault gone (`vault_gone`) or another life (`vault_mismatch`). A Vault object's own fields are its stamp alone, which `vault.stamp` hands out as one frozen plain object. `consistentWith` asks. | none by that name: a `Gate` has its `stamp`; `vault_gone` and `vault_mismatch` remain refusals |
| `UserId` (a type)                                      | none: `user_id`, `UserIdPattern`, `MaxUserIdChars`      |
| `getWhisper`, `useWhisper` (taking a boxlabel)         | `box.extractWhisper()`; `useWhisper` lives in `safebyok-react`, on the old design |
| a sidecar counted toward `maxWhisperBytes`              | counted with the whisper toward what storage keeps in one record (`box_too_large`) |
| the snapshot's `damagedBoxes`, each a `BoxDamaged` (`{ boxlabel, revision_tok, damage }`, its revision null when the record held none as text, its `damage` `damaged` or `newer_format`) | `damaged_rows`, each a `DamagedBox` with a `damagekind` (`damaged_row`, `format_mismatch`) |
| `putBox()` writes a fresh box over a damaged one; `delBox()` removes it | nothing in the library deletes one; `getBox()` and `delBox()` refuse it `damaged_row` |
| a box under a name the validators refuse "is not damaged: it lists and reads as any other" | listed among the damaged rows, under whatever boxlabel storage has for it |
| the vault record's format `safebyok-vault-v6`; its vaultEpoch; its gate `GateRecord`, null while `novel`, the gateEpoch 0 exactly then; "formerly the vault props" | `fmt` 6003; no vault epoch; the gate is the bank's own row (`GateRecord`, `fmt` 4001, minted `gate_tok`), not the vault's, and `gate_epoch` is gone |
| the lease record's format `safebyok-lease-v1`; its `ask_passphrase_at`; `KeptLease`, the record held closed until `kept.leaseOn(vault)` | `fmt` 7003; `proved_at`; the deviceDB's `peek`, then `Lease.buildFromCache` |
| **device record**: what a device kept of a vault's scope, locked or not, across the vault's lives (`DeviceRecord`, format `safebyok-device-v1`): its own deviceId for the scope, and the highest vaultEpoch it had seen. Raised at every read and every write of this device's own (`raiseDeviceRecord`, a store-side max), never lowered; `lock()` and `del()` left it, and `bank.clearCachedVault` erased it. | `DeviceRow`, `{ user_id, banklabel, device_tok, package_version }` per bank scope, cached by `ensureCachedDevice` |
| **novel**: said of a vault stored with no gate yet, its `gate_epoch` 0 and its snapshot's `gate` null. A Vault object was novel, **locked** (a gate, and no lease on this device: its snapshot's `ask_passphrase_at` null) or **unlocked** (a lease in force: `ask_passphrase_at` set); the snapshot named no state of its own. A novel vault's first gating was `build_vault`. | `isLocked`; a vault not yet stored has no Vault object |
| **freshness** (`VaultFreshness`): `timely` (read within `staleMinutes`), `aged` (read longer ago; the next hello reads), or `refused` (the last read failed) | **timely** (`isTimely`), within `vaultRefreshMinutes` or `boxRefreshMinutes` |
| a vault's **stage** in the bank's listing: `ready` (the bank held its Vault object) or `refused` (no Vault object was born, or it went gone; `err` said why). It said whether there was a thing to use; freshness said how far to trust it, so a vault `ready` in the listing was `refused` in freshness when a later hello failed. | none: only the device has a `stage` (`DeviceStage`) |
| **the bank's listing**: `bank.vaults`, one **BankVault** for each vault the bank was asked for and had not let go, sorted by `vaultlabel`, frozen, and the same array until one of them changed; `bank.bankVaultOf({ vaultlabel })` looked one up | `bank.vaultListing`; the bank's snapshot's `vaults`, one `VaultSnapshot` each; `bank.vaultAt({ vaultlabel })` |
| **BankVault**: one vault in the bank's listing, its scope flat and its `stage`, with `err` once `refused`; plain data holding no Vault object; `bank.vaultOf({ vaultlabel })` handed that out once `ready`; React's `useListedVault(vaultlabel)` handed one down | `VaultSnapshot`; `bank.vaultAt` |
| `putVaultRecord`; `getLease`, `putLease`, `delLease` as the three verbs of the deviceDB | `putVault`; the deviceDB's `cache`, `peek`, `vacate` |
| `delWayin` (a way in deleted)                          | a `revoke_passkey` gating                               |
| `delBox` under a `BoxDelExpectation`, resolving a `BoxDeletion` (`deleted`, `deleted_other` or `absent`); `delVault` and `delDamagedVault` under a `VaultDelExpectation` | `delBox` and `delVault`, answering the act `deleted`, `gone` or `void` |
| `vaultDB.ensureVault`; a check's triplet `consistentWith`, `demandConsistentWith`, `ensure...` | none; the triplet `isUnlocked`, `demandUnlocked`, `ensureUnlocked` |
| `localVaultDB`, `idbVaultDB` (supplied vaultDBs); every vaultDB write "with an expectation" | `MemoryVaultDB`; each vaultDB verb one transaction |
| `memoryDeviceDB`, `idbDeviceDB`; `getDeviceRecord`, `raiseDeviceRecord`, `delDeviceRecord` | `MemoryDeviceDB`; `cacheDeviceRecord`                   |
| **change bell**: how a write to a store in this browser told every listener, in this tab and in every other of the origin, to read again (`ChangeBell`, from `safebyok/idb`): a BroadcastChannel, and a bell inside the tab, carrying nothing but the news that something changed. `idbDeviceDB` and `safebyok-indexeddb` rang it after each write; a string store kept a bell of its own, inside the tab. | none yet                                                |
| **ask_passphrase_at**: the instant from which a device stopped honoring its lease and asked again, spelt so on the lease record and the snapshot alike; then the lease was dropped, by a timer, and the vault locked. It moved only when a gating's attempt unlocked the vault, or a passphrase proved a change to its wayins. An instant within a minute of `FarFuture` (`>= FarFuture - MinuteMillis`) meant "until it is locked". | `proved_at`, with `leaseMillis`; `bank.autolock()`      |
| **leaseHours**: the `Bank.make` option for how long a lease lasted after a gating unlocked. The default was 168 (`LeaseHours`), the most 588 (`MaxLeaseHours`, 24.5 days); `Infinity` meant until it is locked. A vault reported the lease it was made with as `leaseMillis`, in milliseconds; `Infinity` read as `ForeverMillis`. | `autolockMinutes`, by default 14 days (`DefaultLeaseMillis`); `Infinity` still means until it is locked |
| `browserOpts()`, supplying `zxcvbnStrengthChecker`, which asked for at least `MinPassphraseChars` (12) characters and a zxcvbn score of 3, turning away common passwords, patterns and the vault's own names; a strength checker run at each `putWayin` | none yet: the core supplies `DefaultStrengthChecker`, which refuses every new passphrase |
| **format**: the string tag at the head of every stored record (`safebyok-vault-v6`, `safebyok-box-v8`, `safebyok-lease-v1`, `safebyok-device-v1`, and a deleted vault's `safebyok-tombstone-v1`); "a test keeps each format's schema and fails when one changes under the same format" | **fmt**, a number: 3001 (bank), 4001 (gate), 5003 (box), 6003 (vault), 7003 (lease); no device-row or tombstone format of its own |
| `Scopepath` (a type); a host's key-value adapter filing rows by scopepath; a `StringStore` keeping text by them; an inspector's `IdbRow` | none: a listing finds each thing it holds by its scopepath |
| `vaultKey`, `makeVaultKey`, `vault_key_wayin_wrapped`, `vault_key_lease_wrapped`, and the purposes `vault_key_passphrase_wrapped`, `vault_key_passkey_wrapped` | `bankKey`, `makeBankKey`, `bank_key_wayin_wrapped`, `bank_key_lease_wrapped`, `bank_key_passphrase_wrapped`, `bank_key_passkey_wrapped` |
