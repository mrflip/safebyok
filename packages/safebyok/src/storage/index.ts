// Kept out of the main entry (`safebyok`), so a host's autocomplete never shows the adapter contract, and an adapter imports from one place.
/** `safebyok/storage`: what a storage adapter is written against, the AdapterVaultDB and the DeviceDB. */

// == [The databases]: AdapterVaultDB, VaultDB, DeviceDB, their brands, and the two in memory
export { AdapterVaultDB } from './adapter-vault-db'
export type { Answer, BadAnswer, BankListed, BoxesListed, DelAct, GoodAnswer, GotAct, ListAct, Notice, PutAct, Tidied } from './vault-db'
export type { BoxAnswer, OkAct, VaultAnswer, VaultDB } from './vault-db'
export type { BoxesFetched, Heard, RowOfBox, RowOfVault } from './adapter-vault-db'
export { boxActOf, boxVaultActOf, boxWorldOf, cappedActOf, classifyBox, classifyVault, isBirthAct, isOkAct, isWriteAct, presenceVals, vaultActOf } from './classifier'
export type { BoxClassified, BoxFetched, Presence, VaultClassified, VaultFetched } from './classifier'
export type { BoxAsk, BoxDelAsk, BoxGetAsk, BoxPutAsk, VaultAsk, VaultDelAsk, VaultGetAsk, VaultPutAsk } from '../shapes/shapes-storage'
export { boxVaultActVals, foundActVals, gateVerbVals, refusedActVals, writeActVals } from '../shapes/shapes-enums'
export { boxAsk, boxDel, boxGet, boxPut, vaultAsk, vaultDel, vaultGet, vaultPut } from '../shapes/shapes-storage'
export type { BoxAct, GateVerb, VaultAct, WriteAct } from '../shapes/shapes-enums'
export { VaultDBVerbnames, badAnswerOf } from './vault-db'
export { IsAdapterVaultDB, IsVaultDB, isAdapterVaultDB, isVaultDB } from '../helpers/consts'
export { DeviceDB } from './device-db'
export { bankOpts, brandedDeviceDB } from '../shapes/shapes-vaultish'
export { MemoryVaultDB } from './memory-vault-db'
export { MemoryDeviceDB } from './memory-device-db'
export type { Awaitable } from '../helpers/helpers'
export { ckeyOf } from '../helpers/helpers'
// --

// == [IndexedDB]: the single transaction of each IndexedDB call, the row at a scopepath within it, and the versioned shelf
export { inOneStep, rowAt } from './idb-transaction'
export { versionedShelfOf } from './idb-shelf'
export type { VersionedShelfSpec } from './idb-shelf'
export { DefaultMaxBoxes, DefaultMaxRecordSizeEst, VaultsDBVersion } from '../helpers/consts'
// --

// == [The rows]: shells, scopes, records, options and the helpers that read a row
export { BoxFormat, VaultFormat, VoidLifeTok, VoidRevision, VoidRevisionSeq, VoidRevisionTok, VoidTime } from '../shapes/shapes-storage'
export { am, revision, times, vaulted, sparseBase } from '../shapes/shapes-storage'
export type { Revision, Times } from '../shapes/shapes-storage'
export { bankScope, vaultScope, boxscope } from '../shapes/shapes-core'
export type { BankScope, Boxscope, VaultScope } from '../shapes/shapes-core'
export { vaultQuery, boxQuery, watchScope } from '../shapes/shapes-storage'
export type { BoxQuery, VaultQuery, WatchScope } from '../shapes/shapes-storage'
export { passphraseWayinRecord, passkeyWayinRecord, gate } from '../shapes/shapes-storage'
export type { Gate } from '../shapes/shapes-storage'
export { vaultSparse, vaultRecord, vaultTombstone, vaultRow, storedVaultRowOrNull, storedVaultRow } from '../shapes/shapes-storage'
export type { DamagedVault, VaultRecord, VaultRow, VaultSparse, VaultTombstone } from '../shapes/shapes-storage'
export { boxSparse, boxRecord, boxTombstone, boxRow, storedBoxRowOrNull, storedBoxRow } from '../shapes/shapes-storage'
export type { BoxRecord, BoxRow, BoxSparse, BoxTombstone, DamagedBox } from '../shapes/shapes-storage'
export type { Sidecar, WhisperJson } from '../shapes/shapes-core'
export { passkeyAddRecord, passkeyRevokeRecord } from '../shapes/shapes-storage'
export { ifAbsentOpts, putOptsGiven, putOpts, gateVerbOpts, delOpts, reqParams, adapterVaultDBOpts, memoryVaultDBOpts, capacity } from '../shapes/shapes-storage'
export type { AdapterVaultDBOpts, Capacity, DelOpts, GateVerbOpts, IfAbsentOpts, MemoryVaultDBOpts, PutOpts, PutOptsGiven, ReqParams } from '../shapes/shapes-storage'
export { rowMeta, reqParamsOf, revisionOf, nextRevisionOf } from '../shapes/shapes-storage'
export { makeLifeTok } from '../helpers/crypto'
export { isRowAt, isLiveRow, isLiveVaultRecord, isLiveBoxRecord, isVaultPutAllowed, isBoxPutAllowed, isLifeOver, isTombstoneRow } from '../shapes/shapes-storage'
export { shellVaultOf, shellBoxOf, damagedVaultOf, damagedBoxOf, boxTombstoneOf } from '../shapes/shapes-storage'
export { leaseQuery, leaseDated, leaseRow, leaseScopepath, bankRow } from '../shapes/shapes-storage'
export type { BankRow, LeaseDated, LeaseQuery, LeaseRow, LeaseScopepath, RawLease } from '../shapes/shapes-storage'
// --

// == [Answers over a wire]: the validators a vaultDB client parses each answer with, which read an absent field as null
export { crossedErr, crossedReqParams, damagedVault, damagedBox, crossedNotice } from '../shapes/shapes-answers'
export { listVaultsAnswer, getVaultAnswer, putVaultAnswer, replacePassphraseAnswer, addPasskeyAnswer, revokePasskeyAnswer, delVaultAnswer } from '../shapes/shapes-answers'
export { listBoxesAnswer, getBoxAnswer, putBoxAnswer, delBoxAnswer, tidyGoneAnswer } from '../shapes/shapes-answers'
export type { CrossedErr, CrossedReqParams } from '../shapes/shapes-answers'
// --

// == [Validators]: the makers an adapter checks its own options and rows with
export { Checker, Checkers, objCheck, objStrict, objStrip, type AssertEqual, type CheckerInput } from '../helpers/validator'
export type { ConsistencyRefusal, ObjCheckOpts, RefusalOpts, Refusing, Story } from '../helpers/validator'
// --

// == [The refusals]: an adapter's throwers
export { sanitizeForeignError, storageBlocked, storageUnavailable, unexpectedError } from '../refusals/throwers'
export { actRefused, vaultEmpty, vaultReborn, vaultGone, staleWrite, camped, absentBox, boxTooLarge, vaultFull, storageFull, seqNotNext, deviceDBFailed } from '../refusals/throwers'
export { storageFailed, identityRevoked } from '../refusals/throwers'
export { VaultError, isVaultError, refusalkindVals } from '../refusals/errors'
export { IsVaultError, brand, brandOf } from '../helpers/consts'
export type { RefusalFamily, RefusalFamilyForKind, RefusalMeta, Refusalkind, Thrown, VaultErrorOpts } from '../refusals/errors'
export { outcomeOf, storageTroubleOf } from '../refusals/outcome'
export type { BadOutcome, GoodOutcome, Outcome } from '../refusals/outcome'
// --

// == [The phrases]: the sentences an adapter's own refusals say, kept with the core's so the wording is reviewed in one place
export { NoBrowserDatastore, TransactionAborted, DatabaseClosed, StorageWithheld, BrowserDatastoreFailed, SchemaNotServed, fetchFailed, WatchEnded, rowOfOtherAddress } from '../helpers/phrases'
// --
