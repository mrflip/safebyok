---
"safebyok": minor
"safebyok-react": minor
"safebyok-convex": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
"safebyok-indexeddb": minor
---

**Renames every name for a box, a deletion and the store verbs, and changes the stored box format.** No behaviour changes: each call does what it did, under its new name.

A box written before this release is not read. Its record is `safebyok-lockbox-v5`, and its wrapped key field `lockbox_key_wrapped`; this release writes `safebyok-box-v6` with `box_key_wrapped`, and lists an old record as damaged. The Postgres table `safebyok_lockboxes` (and its trigger `safebyok_lockboxes_changed`) is now `safebyok_boxes` (`safebyok_boxes_changed`), and the Convex component's table `safebyok_lockboxes` is `safebyok_boxes`, its tally fields `box_count` and `box_bytes`. There is no migration: a host drops the old table, or renames it, and the boxes in it read as damaged; the user deletes them and stores them again.

| Was | Now |
| --- | --- |
| `Lockbox`, `LockboxSummary`, `DamagedLockbox`, `StoredLockbox` | `Box`, `BoxSummary`, `DamagedBox`, `StoredBox` |
| `LockboxExpectation`, `LockboxRetireExpectation`, `RetireExpectation` | `BoxExpectation`, `BoxDelExpectation`, `VaultDelExpectation` |
| `LockboxRetirement`, outcomes `retired`, `retired_other` | `BoxDeletion`, outcomes `deleted`, `deleted_other` |
| `MaxLockboxes`, the `maxLockboxes` option and adapter field | `MaxBoxes`, `maxBoxes` |
| refusal kinds `damaged_lockbox`, `lockbox_too_large` | `damaged_box`, `box_too_large` |
| `VaultError.kind`, `isVaultError(err, kind)` | `VaultError.refusalkind`, `isVaultError(err, refusalkind)` |
| `vault.storeBox`, `vault.readBox`, `vault.retireBox`, `vault.retireWayin`, `vault.retire()` | `vault.putBox`, `vault.getBox`, `vault.delBox`, `vault.delWayin`, `vault.del()` |
| VaultDB `readVaultProps`, `fetchOrCreateVaultProps`, `updateVaultProps` | `getVaultProps`, `ensureVaultProps`, `putVaultProps` |
| VaultDB `readBox`, `updateBox`, `retireBox`, `retireVault`, `retireDamagedVault` | `getBox`, `putBox`, `delBox`, `delVault`, `delDamagedVault` |
| `retireDamagedVault`, `RetireDamagedVaultOpts` | `delDamagedVault`, `DelDamagedVaultOpts` |
| DeviceDB `readLease`, `writeLease`, `eraseLease` | `getLease`, `putLease`, `delLease` |
| DeviceDB `readMark`, `writeMark`, `eraseMark`, `eraseAll` | `getMark`, `putMark`, `delMark`, `delAll` |
| `ensureSaltFits` | `checkSaltFits` |
| `Expectations.lockboxMeets`, `Expectations.retirementOf` | `Expectations.boxMeets`, `Expectations.deletionOf` |
| `safebyok/testing`'s `retiring` | `deleting` |
| `safebyok-react`'s `VaultProvider` `retireDamagedVault` | `delDamagedVault` |
| Convex functions `fetchOrCreateVaultProps`, `updateVaultProps`, `updateBox`, `retireBox`, `retireVault` | `ensureVaultProps`, `putVaultProps`, `putBox`, `delBox`, `delVault` |
| GraphQL `safebyokReadVaultProps`, `safebyokFetchOrCreateVaultProps`, `safebyokUpdateVaultProps` | `safebyokGetVaultProps`, `safebyokEnsureVaultProps`, `safebyokPutVaultProps` |
| GraphQL `safebyokReadBox`, `safebyokUpdateBox`, `safebyokRetireBox`, `safebyokRetireVault` | `safebyokGetBox`, `safebyokPutBox`, `safebyokDelBox`, `safebyokDelVault` |
| GraphQL types `SafebyokLockbox`, `SafebyokListedLockbox`, `SafebyokLockboxRetirement`, `SafebyokRetireOutcome`, and their inputs | `SafebyokBox`, `SafebyokListedBox`, `SafebyokBoxDeletion`, `SafebyokDelOutcome`, and theirs; the `lockbox` argument is `box` |

A GraphQL server and its browser client, or a Convex deployment and its client, move together: deploy the new schema or component with the new package.
