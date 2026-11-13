// Kept out of the main entry (`safebyok`), so a host's autocomplete never shows the adapter contract, and an adapter imports from one place.
/** `safebyok/storage`: what a storage adapter is written against, the AdapterBankDB and the DeviceDB. */

// == [The deviceDB]: DeviceDB, its brand and the one in memory
export { DeviceDB } from './device-db'
export { brandedDeviceDB, deviceOpts } from '../shapes/shapes-vaultish'
export { MemoryDeviceDB } from './memory-device-db'
export type { Awaitable } from '../helpers/helpers'
export { ckeyOf } from '../helpers/helpers'
// --

// == [The acts]: what an answer and its ask say of what happened
export { askOpVals, badActVals, boxVaultActVals, goodActVals, foundActVals, ifAbsentVals, leftoverVals, refusedActVals, writeActVals } from '../shapes/shapes-enums'
export type { AskOp, BadAct, DelAct, GotAct, ListAct, OkAct, PutAct, BoxAct, GoodAct, Leftover, ParentBankAct, VaultAct, WriteAct } from '../shapes/shapes-enums'
// --

// == [The bankDB]: AdapterBankDB, BankDB, their brands, the one in memory, and the rest of its contract as BX
export { AdapterBankDB } from './adapter-bank-db'
export { MemoryBankDB } from './memory-bank-db'
export type { BankDB } from './bank-db'
export type { Answer, BadAnswer, BoxAnswer, BoxesListed, GoodAnswer, Notice, Tidied, VaultAnswer } from './bank-db'
export { BankDBVerbnames } from './bank-db'
export { IsAdapterBankDB, IsBankDB, isAdapterBankDB, isBankDB } from '../helpers/consts'
export * as BX from './bankdb'
// --

// == [IndexedDB]: the single transaction of each IndexedDB call, the row at a scopepath within it, and the versioned shelf
export { inOneStep, rowAt } from './idb-transaction'
export { dbprefixOf, versionedShelfOf } from './idb-shelf'
export type { VersionedShelfSpec } from './idb-shelf'
export { DefaultMaxBoxes, DefaultMaxRecordSizeEst } from '../helpers/consts'
// --

// == [The rows]: shells, scopes, records, options and the helpers that read a row
export { BoxFormat, VoidLifeTok, VoidRevision, VoidRevisionSeq, VoidRevisionTok, VoidTime } from '../shapes/shapes-storage'
export { am, revision, times, vaulted, sparseBase } from '../shapes/shapes-storage'
export type { Revision, Times } from '../shapes/shapes-storage'
export { bankScope, vaultScope, boxscope } from '../shapes/shapes-core'
export type { BankScope, Boxscope, VaultScope } from '../shapes/shapes-core'
export { watchScope, boxTidy } from '../shapes/shapes-storage'
export type { BoxTidyAsk, WatchScope } from '../shapes/shapes-storage'
export { passphraseWayinRecord, passkeyWayinRecord } from '../shapes/shapes-storage'
export { capacity } from '../shapes/shapes-storage'
export type { Capacity } from '../shapes/shapes-storage'
export { boxSparse, boxRecord, boxTombstone } from '../shapes/shapes-storage'
export type { BoxRecord, BoxRow, BoxSparse, BoxTombstone, DamagedBox } from '../shapes/shapes-storage'
export type { Sidecar, WhisperJson } from '../shapes/shapes-core'
export { rowMeta, revisionOf, nextRevisionOf, isLiveRow } from '../shapes/shapes-storage'
export { makeLifeTok } from '../helpers/crypto'
export { leaseQuery, leaseDated, leaseRow, leaseScopepath, deviceRow } from '../shapes/shapes-storage'
export type { DeviceRow, LeaseDated, LeaseQuery, LeaseRow, LeaseScopepath, RawLease } from '../shapes/shapes-storage'
// --

// == [Validators]: the makers an adapter checks its own options and rows with
export { Checker, Checkers, objCheck, objStrict, objStrip, type AssertEqual, type CheckerInput } from '../helpers/validator'
export type { ConsistencyRefusal, ObjCheckOpts, RefusalOpts, Refusing, Story } from '../helpers/validator'
// --

// == [The refusals]: an adapter's throwers
export { sanitizeForeignError, storageBlocked, storageUnavailable, unexpectedError } from '../refusals/throwers'
export { actRefused, boxTooLarge, storageFull, deviceDBFailed } from '../refusals/throwers'
export { storageFailed, identityRevoked } from '../refusals/throwers'
export { VaultError, isVaultError, refusalkindVals } from '../refusals/errors'
export { IsVaultError, brand, brandOf } from '../helpers/consts'
export type { RefusalFamily, RefusalFamilyForKind, RefusalMeta, Refusalkind, Thrown, VaultErrorOpts } from '../refusals/errors'
export { outcomeOf, storageRefusalOf } from '../refusals/outcome'
export type { BadOutcome, GoodOutcome, Outcome } from '../refusals/outcome'
// --

// == [The phrases]: the sentences an adapter's own refusals say, kept with the core's so the wording is reviewed in one place
export { NoBrowserDatastore, TransactionAborted, DatabaseClosed, StorageWithheld, BrowserDatastoreFailed, SchemaNotServed, fetchFailed, WatchEnded, rowOfOtherAddress } from '../helpers/phrases'
// --
