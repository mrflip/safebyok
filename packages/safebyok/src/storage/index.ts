// Kept off the front door (`safebyok`) so a host's autocomplete never meets the adapter's contract, and an adapter's imports name one door.
/** `safebyok/storage`: what a storage adapter is written against: the VaultDB and DeviceDB it extends, the rows it stores, and the refusals it raises. */

// == [The stores]: VaultDB, DeviceDB, and the two in memory
export { VaultDB } from './vault-db-new'
export type { Answer, BadAnswer, BankListed, BoxesListed, DelAct, GoodAnswer, GotAct, Notice, PutAct, Tidied } from './vault-db-new'
export type { BoxesFetched, BoxFetched, BoxLanding, Heard, Landing, RowOfBox, RowOfVault } from './vault-db-new'
export { DeviceDB } from './device-db-new'
export { MemoryVaultDB } from './memory-vault-db'
export { MemoryDeviceDB } from './memory-device-db'
export type { Awaitable } from '../helpers/helpers'
export { ckeyOf } from '../helpers/helpers'
// --

// == [The rows]: sentinels, scopes, records, options and the helpers that read a row
export { BoxFormat, VaultFormat, VoidLifeTok, VoidRevision, VoidRevisionSeq, VoidRevisionTok, VoidTime } from '../shapes/shapes-storage'
export { am, revision, times, vaulted, sparseBase } from '../shapes/shapes-storage'
export type { Revision, Times } from '../shapes/shapes-storage'
export { bankScope, vaultScope, boxscope } from '../shapes/shapes-core'
export type { BankScope, Boxscope, VaultScope } from '../shapes/shapes-core'
export { vaultQuery, boxQuery, watchScope } from '../shapes/shapes-storage'
export type { BoxQuery, VaultQuery, WatchScope } from '../shapes/shapes-storage'
export { passphraseWayinRecord, passkeyWayinRecord, gate } from '../shapes/shapes-storage'
export type { Gate } from '../shapes/shapes-storage'
export { vaultSparse, vaultRecord, vaultTombstone, vaultRow, foundVaultRow } from '../shapes/shapes-storage'
export type { DamagedVault, VaultRecord, VaultRow, VaultSparse, VaultTombstone } from '../shapes/shapes-storage'
export { boxSparse, boxRecord, boxTombstone, boxRow, foundBoxRow } from '../shapes/shapes-storage'
export type { BoxRecord, BoxRow, BoxSparse, BoxTombstone, DamagedBox } from '../shapes/shapes-storage'
export { replacePassphraseParams, passkeyAddParams, revokePasskeyParams } from '../shapes/shapes-storage'
export type { AddPasskeyParams, ReplacePassphraseParams, RevokePasskeyParams } from '../shapes/shapes-storage'
export { ifAbsentOpts, putOpts, putVaultOpts, delOpts, reqParams, vaultDBOpts, memoryVaultDBOpts, capacity } from '../shapes/shapes-storage'
export type { Capacity, DelOpts, IfAbsentOpts, MemoryVaultDBOpts, PutOpts, PutOptsGiven, PutVaultOpts, ReqParams, VaultDBOpts } from '../shapes/shapes-storage'
export { rowPeek, fmtPeek, reqParamsOf, revisionOf, nextRevisionOf } from '../shapes/shapes-storage'
export { isRowAt, isLiveRow, isLiveRowUnder, isCheckedLiveVault, isLifeOver, isTombstoneRow, isNewerFormat } from '../shapes/shapes-storage'
export { sentinelVaultOf, sentinelBoxOf, damagedVaultOf, damagedBoxOf, isDamagedVaultAt, isDamagedBoxAt, boxTombstoneOf } from '../shapes/shapes-storage'
export { leaseQuery, leaseDated, leaseRow, cutoff } from '../shapes/shapes-storage'
export type { LeaseDated, LeaseQuery, LeaseRow } from '../shapes/shapes-storage'
// --

// == [The refusals]: the throwers an adapter raises, and how a refusal reads
export { sanitizeForeignError, storageUnavailable, unexpectedError } from '../refusals/throwers'
export { vaultEmpty, vaultMismatch, vaultGone, staleWrite, camped, absentBox, boxTooLarge, vaultFull, seqNotNext, storeFailed } from '../refusals/throwers'
export { VaultError, isVaultError, refusalkindVals } from '../refusals/errors'
export type { RefusalMeta, Refusalkind, Thrown, VaultErrorOpts } from '../refusals/errors'
export { outcomeOf, storageTroubleOf } from '../refusals/outcome'
export type { BadOutcome, GoodOutcome, Outcome } from '../refusals/outcome'
// --
