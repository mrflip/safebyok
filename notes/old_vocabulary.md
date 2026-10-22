# Old vocabulary

The names the reform of October 2026 retired, each beside the one that replaced it. It is for
whoever reads older code, a CHANGELOG, `winboard/` or a released changeset and meets a word
the current cast does not use. Nothing current uses these names: not the code, the docs, the
stored records or the tests, and a new thing is never named from this page. The current cast is
VOCABULARY.md.

A name in the New column that also stands in the Old one was renamed again, by the rename pass of
2026-10-19 (Box everywhere; get, put and del on every layer; `check` for a check): follow it down.
The last two rows are from the rename of 2026-10-21 (better_paths, streamline thread 1).

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
| `ensureOpen`, `ensureUnlocked`, `ensureSaltFits` and every `ensure` that only checks | `checkOpen`, `checkUnlocked`, `checkSaltFits`: a `check` |
| `VaultError.kind`, `isVaultError(err, kind)`           | `VaultError.refusalkind`, `isVaultError(err, refusalkind)` |
| Postgres `safebyok_lockboxes`, `safebyok_lockboxes_changed` | `safebyok_boxes`, `safebyok_boxes_changed`              |
| Convex table `safebyok_lockboxes`; tally `lockbox_count`, `lockbox_bytes` | `safebyok_boxes`; tally `box_count`, `box_bytes`        |
| GraphQL `SafebyokLockbox`, `SafebyokListedLockbox`, `SafebyokLockboxRetirement` | `SafebyokBox`, `SafebyokListedBox`, `SafebyokBoxDeletion` |
| GraphQL `safebyok{Read,Update,Retire}Box`, `safebyok{Read,FetchOrCreate,Update}VaultProps`, `safebyokRetireVault` | `safebyok{Get,Put,Del}Box`, `safebyok{Get,Ensure,Put}VaultProps`, `safebyokDelVault` |
| Convex `fetchOrCreateVaultProps`, `updateVaultProps`, `updateBox`, `retireBox`, `retireVault` | `ensureVaultProps`, `putVaultProps`, `putBox`, `delBox`, `delVault` |
| files `lockbox.ts`, `retire-damaged-vault.ts`          | `box.ts`, `del-damaged-vault.ts`                        |
| `vault_id`, `vaultId` (and `vaultIdMeets`, `Expectations.vaultIdMeets`; GraphQL, Convex and Postgres fields and columns of the same name) | `vault_tok`, `vaultTok`, `vaultTokMeets` |
| `unlock_epoch`, `unlockEpoch` (stored, wire and column names alike) | `gate_epoch`, `gateEpoch`                               |
