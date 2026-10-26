# Old vocabulary

The names the reform of October 2026 retired, each beside the one that replaced it. It is for
whoever reads older code, a CHANGELOG, `winboard/` or a released changeset and meets a word
the current cast does not use. Nothing current uses these names: not the code, the docs, the
stored records or the tests, and a new thing is never named from this page. The current cast is
VOCABULARY.md.

A name in the New column that also stands in the Old one was renamed again, by the rename pass of
2026-10-19 (Box everywhere; get, put and del on every layer; `check` for a check): follow it down.
The two rows on `vault_id` and `unlock_epoch` are from the rename of 2026-10-21 (better_paths,
streamline thread 1); the rows after them, from the primitives sprint of 2026-10-22 and 23
(`whiteboard/20261022-primitives/`); the rows after `TH.makeLatch`, from the restyle of 2026-10-26
(`whiteboard/20261025-restyle/`).

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
| `damaged_lockbox`, `lockbox_too_large`                 | `damaged_box`, `box_too_large`                          |
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
| `Vault.make(opts)`, a vault's own options              | `Bank.make(opts)`, then `bank.ensureVault({ userId, vaultlabel })`: the bank holds the options, the draft names the vault |
| handle (a `Vault` instance), `close()`, `tryClose()`, kind `vault_closed` | Vault object; `bank.closeVault(choice)`; kind `vault_gone` |
| state `opening` (no read yet), state `absent` (never made) | none: a Vault object is born from a read, and a vault never made is born `novel` |
| `Proof`, `PassphraseProof`, `Proof.parse`, a proof (what the user presents) | cleartext (what the user hands a gating's attempt), made into a `Proving` (`PassphraseProving`, `PasskeyProving`) |
| `Ask`, `getProof` (a `Vault.make` option)              | `Gating`, `requestCleartext` (a `Bank.make` option)     |
| `AskWhy` (`absent`, `locked`, `lease_ending`)          | `GatingKind` (`initialize_gate`, `unlock_vault`, ...), read as `gating.gatingkind` |
| `ProofAnswer` (`unlocked`, `declined`, `carry_on`)     | none: the gating's attempt settles it, `decline()` declines, and `requestCleartext` resolving declines what is still open |
| `carry_on`, `lease_ending`                             | none: `ensureUnlocked({ renewMinutes })` asks while the lease ends within that time |
| `ask.attempt(proof, { wayinId? })`                     | the gating's typed attempt: `attempt`, `attemptPassphrase`, `attemptPasskey` |
| `vault.unlock(proof)`, `tryUnlock`                     | `vault.ensureUnlocked()`, whose `unlock_vault` gating takes the cleartext |
| `ensureLease`, `tryEnsureLease`                        | `ensureUnlocked`, `tryEnsureUnlocked`                   |
| `vault.putWayin(proof, newProof, { wayinlabel })`, `vault.delWayin(proof, wayinId)` | `vault.putWayin(slotlabel)`, `vault.delWayin(slotlabel)`: each raises a gating |
| `wayin_id`, `wayinlabel`, `wayinId`                    | `slotlabel` (`'passphrase'` or `'passkey'`): a vault holds one of each |
| `getProof`'s throw, `unexpected_error` with its cause  | `requestCleartext`'s throw, `unexpected_error` carrying nothing of it |
| device mark, `DeviceMark`, `safebyok-mark-v5`, `getMark`, `putMark`, `delMark`, the seen vault | device record, `DeviceRecord`, `safebyok-device-v1`, `getDeviceRecord`, `raiseDeviceRecord`, `delDeviceRecord` |
| rolled back, kind `rolled_back` (a lower `gate_epoch` than the mark) | behind, kind `vault_behind` (a lower `vault_epoch` than the device record) |
| kind `created_elsewhere`                               | kind `gate_made_elsewhere`                              |
| kind `last_wayin`                                      | kind `passphrase_required`                              |
| kind `too_many_wayins`                                 | none: a new passkey replaces the passkey                |
| `vault.decryptWhisper(record)`, `tryDecryptWhisper`, `vault.openBox`, `box.tryOpen(vaultKey)`, `box.open` | `box.extractWhisper()`, `tryExtractWhisper`, under the vault's lease |
| `Lease.grant`, `lease.tryOpen`, `lease.wrapBoxKey`, `lease.unwrapBoxKey`, `lease.record` | `proving.grantLease()`; a lease taken up as read; `lease.cipheredWith` / `decipherWith` / `sealProps`; no public record |
| `Wayin.seal`, `Wayin.sealPassphrase`, `Wayin.sealPasskey`, `Wayin.tryOpenAmong`, `wayin.tryOpen` | `PassphraseProving.seal` / `PasskeyProving.seal`, then `proving.sealWayins`, `resealWayinFor`, `checkWayin` |
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
