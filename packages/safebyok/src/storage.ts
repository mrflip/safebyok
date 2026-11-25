// safebyok/storage: what a storage adapter is written against. The vaultDB, where every kind is a Thing, its memory
// store, the asks it is given and the answers it gives; the deviceDB, which has each gate's lease record, and its memory
// store; and from safebyok-big the acts, throwers and checkers an adapter's own code reaches for, re-exported so that
// each stays one binding across both packages.
export { AdapterVaultDB } from './storage/adapter-vault-db'
export { type Watcher, MemoryVaultDB } from './storage/memory-vault-db'
export { type Banklabel, type BoxLabelpath, type DeviceTok, type EpochMillis, type Lifenum, type Lifepath, type Lifetok, type Revtok, type Userid, Labelpath, Lifeseq, Revseq } from './shapes/primitives'
export {
  type AnyThingRecord, type BankRecord, type BoxRecord, type BoxSparse, type GateRecord, type Modelkind, type Sealed, type Sparse, type StoredCited, type ThingCited, type ThingFieldname, type ThingRecord, type ThingScope, type Thingkind,
  type VoidSentinel, type Wayins, Shell, ThingChecks, ThingFormat, thingkindVals,
} from './shapes/shapes-thing'
export { BankChecks, BoxChecks, GateChecks, ThingkindChecks } from './shapes/shapes-thingkinds'
export type { LiveOf, ShellOf, SparseOf, TombstoneOf } from './shapes/shapes-sealers'
export { type KindRecords, type Kinded, type LiveOfKind, type MembersOfKind, type RecordOfKind, type TombstoneOfKind, type VoidSentinelOfKind, type WholeOfKind, BaseThing } from './models/base-thing'
export { type Adoptable, Thing } from './models/thing'
export {
  type AnyAsk, type BankRoots, type BankWriteAsk, type BirthBankAsk, type BirthPuts, type BoxWriteAsk, type CitedOf, type DelAskDraft, type GateWriteAsk, type GetAskDraft, type GetAsk, type GetWorldAsk, type WorldRoots, type ListAskDraft,
  type ListAsk, type LoggableAsk, type PutAskDraft, type ThingOptions, type ThingWatchScope, type Track, type Tracked, type WriteAsk, type WriteAskFlags, AskChecks, VoidTrack, delAskOf, getAskOf,
  listAskOf, putAskOf,
} from './shapes/shapes-asks'
export * as Classifier from './storage/thing-classifier'
export { VacantAgerank, readAtOf, readTcNow } from './storage/agerank'
export {
  type BankScope, type BankStamp, type BoxStamp, type GateStamp, type LeaseLabelpath, type LeaseRecord, type LeaseScope, type LeaseStamp, type LeaseTombstone, LeaseFormat, LeaseLifeRoot, StampChecks, leaseLabelpathOf, leaseLifepathOf, leaseScopeOf,
} from './shapes/shapes-stamps'
// The deviceDB, which has each gate's lease record on this device, and its memory store. The IndexedDB store is on `safebyok/browser`.
export { DeviceDB } from './storage/device-db'
export { MemoryDeviceDB } from './storage/memory-device-db'
export { type LeaseListener, type LeaseScopepath, DeviceDBChecks } from './shapes/shapes-device-db'
export {
  type Actual, type ActualBeside, type Answer, type BadAct, type BadAnswer, type BirthBankActual, type BirthBankAnswer, type DamagedThing, type GetThingAnswer, type GetWorldActual, type GetWorldAnswer, type GoodAnswer, type GotActual,
  type KidEntry, type Kids, type ListThingsActual, type ListThingsAnswer, type ListedBeside, type Received, type WriteThingAnswer, type WroteActual, ActualChecks,
} from './shapes/shapes-answers'
export { type VaultDB, isVaultDB } from './storage/vault-db'
// The events a vaultDB's watcher is notified with.
export {
  type Agekind, type Agerank, type ItemSeen, type Lifekind, type Liveness, type ReadTc, type SeenThing, type VaultAgedEvent, type VaultEvent, type VaultEventOf, type VaultEventkind, type VaultItemEvent, type VaultLifeEvent,
  VaultDBSourcelabel, agekindVals, lifekindVals, livenessVals, vaultEventkindVals,
} from './shapes/shapes-vault-event'

// From safebyok-big: what an adapter's `do*` methods answer and are named with, its throwers, and the checkers it checks its
// own options and rows with.
export { VoidLifeTok, storagePolicyVals, type Awaitable, type DelAct, type GoodAct, type GotAct, type PutAct, type StoragePolicy, type WriteAct } from 'safebyok-big/storage'
export type { IfAbsent, IfPresent, PutIfAbsent, RefusedAct } from 'safebyok-big/internals'
export { VaultError, isVaultError, type Capacity, type RefusalFamily, type RefusalMeta, type Refusalkind, type VaultErrorOpts } from 'safebyok-big'
export { fetchFailed, identityRevoked, sanitizeForeignError, storageFailed, storageRefusalOf, storageUnavailable, unexpectedError } from 'safebyok-big/storage'
export { storageIssue } from 'safebyok-big/refusals/throwers'
// An IndexedDB store's own: each call's one transaction, the row at a key within it, and the versioned database.
export { dbprefixOf, inOneStep, rowAt, versionedShelfOf, type VersionedShelfSpec } from 'safebyok-big/storage'
export { Checker, Checkers, objCheck, type ConsistencyRefusal, type ObjCheckOpts, type Refusing, type Story } from 'safebyok-big/storage'
