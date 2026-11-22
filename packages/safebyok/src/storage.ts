// safebyok/storage: what a storage adapter is written against. The vaultDB, where every kind is a Thing, its memory
// store, the asks it is given and the answers it gives, and from safebyok-big the acts, throwers and checkers an adapter's
// own code reaches for, re-exported so that each stays one binding across both packages.
export { type Received, AdapterVaultDB } from './storage/adapter-vault-db'
export { type Watcher, MemoryVaultDB } from './storage/memory-vault-db'
export { type Banklabel, type BoxLabelpath, type DeviceTok, type EpochMillis, type Lifenum, type Lifepath, type Lifetok, type Revtok, type Userid, Labelpath, Lifeseq, Revseq } from './shapes/primitives'
export {
  type AnyThingRecord, type BankRecord, type BoxRecord, type GateRecord, type Modelkind, type Sealed, type Sparse, type StoredCited, type ThingCited, type ThingFieldname, type ThingRecord, type ThingScope, type Thingkind,
  type VoidSentinel, type Wayins, Absent, Shell, ThingChecks, ThingFormat, isAbsent, thingkindVals,
} from './shapes/shapes-thing'
export { BankChecks, BoxChecks, GateChecks, ThingkindChecks } from './shapes/shapes-thingkinds'
export type { LiveOf, ShellOf, TombstoneOf } from './shapes/shapes-sealers'
export { type KindRecords, type Kinded, type LiveOfKind, type MembersOfKind, type RecordOfKind, type TombstoneOfKind, type VoidSentinelOfKind, type WholeOfKind, BaseThing } from './models/base-thing'
export { Thing } from './models/thing'
export {
  type AnyAsk, type BankRoots, type BankWriteAsk, type BirthBankAsk, type BirthPuts, type BoxWriteAsk, type CitedOf, type DelAskDraft, type GateWriteAsk, type GetAskDraft, type GetAsk, type ListAskDraft,
  type ListAsk, type LoggableAsk, type PutAskDraft, type ThingOptions, type ThingWatchScope, type Track, type Tracked, type WorldRecord, type WriteAsk, type WriteAskFlags, AskChecks, delAskOf, getAskOf,
  listAskOf, putAskOf,
} from './shapes/shapes-asks'
export * as Classifier from './storage/thing-classifier'
export { type BankScope, type BankStamp, type BoxStamp, type GateStamp, StampChecks } from './shapes/shapes-stamps'
export {
  type Actual, type Answer, type BadAct, type BadAnswer, type BirthBankActual, type BirthBankAnswer, type DamagedThing, type GetThingAnswer, type GoodAnswer,
  type KidEntry, type Kids, type ListThingsActual, type ListThingsAnswer, type ListedBeside, type ReadTc, type ThingNotice, type VaultDB, type WriteThingAnswer, isVaultDB,
} from './storage/vault-db'

// From safebyok-big: what an adapter's `do*` methods answer and are named with, its throwers, and the checkers it checks its
// own options and rows with.
export { storagePolicyVals, type Awaitable, type DelAct, type GoodAct, type GotAct, type PutAct, type StoragePolicy, type WriteAct } from 'safebyok-big/storage'
export type { IfAbsent, IfPresent, PutIfAbsent, RefusedAct } from 'safebyok-big/internals'
export { VaultError, isVaultError, type Capacity, type RefusalFamily, type RefusalMeta, type Refusalkind, type VaultErrorOpts } from 'safebyok-big'
export { fetchFailed, identityRevoked, sanitizeForeignError, storageFailed, storageRefusalOf, storageUnavailable, unexpectedError } from 'safebyok-big/storage'
export { storageIssue } from 'safebyok-big/refusals/throwers'
// An IndexedDB store's own: each call's one transaction, the row at a key within it, and the versioned database.
export { dbprefixOf, inOneStep, rowAt, versionedShelfOf, type VersionedShelfSpec } from 'safebyok-big/storage'
export { Checker, Checkers, objCheck, type ConsistencyRefusal, type ObjCheckOpts, type Refusing, type Story } from 'safebyok-big/storage'
