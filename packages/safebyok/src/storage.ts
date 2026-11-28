// safebyok/storage: what a storage adapter is written against. The vaultDB, where every kind is a Thing, its memory
// vaultDB, the asks it is given and the answers it gives; the deviceDB, which has each gate's lease record, and its memory
// deviceDB; and from safebyok-big the acts, throwers and checkers an adapter's own code reaches for, re-exported so that
// each stays one binding across both packages.
import { EX } from 'safebyok-big/internals'

export { AdapterVaultDB, frozenAnswerOf, noticeOf } from './storage/adapter-vault-db'
export { bulletproofHandlerOf } from './helpers/bulletproof'
export { MemoryVaultDB } from './storage/memory-vault-db'
export { type BankRows, type Watcher, MemoryDatastore, isBirthWritable, isWritable } from './storage/memory-datastore'
export { type Banklabel, type BoxLabelpath, type Devicetok, type EpochMillis, type Lifenum, type Lifepath, type Banktok, type Revtok, type Userid, Labelpath, Lifeseq, Revseq } from './shapes/primitives'
export {
  type AnyThingRecord, type BoxRecord, type BoxSparse, type GateRecord, type Modelkind, type Sealed, type Sparse, type ThingCited, type ThingFieldname, type TableScope, type ThingRecord, type ThingScope, type ThingShaped, type Thingkind,
  type VoidSentinel, type Wayins, Shell, ThingChecks, ThingFormat, isLabelpathOfKind, thingkindVals,
} from './shapes/shapes-thing'
export { BankChecks, BoxChecks, GateChecks, ThingkindChecks } from './shapes/shapes-thingkinds'
export type { LiveOf, ShellOf, SparseOf, TombstoneOf } from './shapes/shapes-sealers'
export { type KindRecords, type Kinded, type LiveOfKind, type MembersOfKind, type RecordOfKind, type TombstoneOfKind, type VoidSentinelOfKind, type WholeOfKind, BaseThing } from './models/base-thing'
export { type Adoptable, Thing } from './models/thing'
export {
  type AnyAsk, type BankRoots, type BirthBankAsk, type BirthCited, type BirthPuts, type BoxWriteAsk, type CitedOf, type DelAskDraft, type GateWriteAsk, type GetAskDraft, type GetAsk, type GetBankAsk, type StatsAsk, type ActualRoots, type ListAskDraft,
  type ListAsk, type LoggableAsk, type PutAskDraft, type ThingOptions, type ThingWatchScope, type Track, type Tracked, type WriteAsk, type WriteAskFlags, AskChecks, VoidTrack, birthPutsOf, checkedBirthBankAsk,
  checkedWriteAsk, delAskOf, getAskOf, listAskOf, loggableAskOf, putAskOf, RootModelkinds, rootLabelpathsOf, rootScopesOf,
} from './shapes/shapes-asks'
// A datastore's contract (notes/vault-adapter-contract.md): the manifest each verb's step hands back, the tags in it, and the functions that make them in TypeScript.
export * as ManifestTags from './storage/manifest-tags'
export {
  type AnteWayins, type BankObserved, type BirthManifest, type BirthTags, type CheckedBankObserved, type CheckedBirthManifest, type CheckedGetManifest, type CheckedListManifest, type CheckedManifestRows, type CheckedRoots,
  type CheckedStatsManifest, type CheckedGetBankManifest, type CheckedWriteManifest, type GetManifest, type GetTags, type ListManifest, type ListedChild, type PolicyTag, type PolicyVerdict, type PolicyVerdicts, type Presence,
  type Received, type Refusaltag, type RevseqCmp, type RevtokCmp, type RootRows, type RootTags, type SameCmp, type ScribedBirthManifest, type ScribedGetManifest, type ScribedListManifest, type ScribedWriteManifest, type StatsManifest,
  type GetBankManifest, type WriteManifest, type WriteTags, ManifestChecks,
} from './shapes/shapes-manifest'
export { PolicyPhrases } from './phrases'
export { GatePolicies } from './storage/policies'
export { VacantAgerank, readAtOf, readTcNow } from './storage/agerank'
export {
  type BankLife, type BankScope, type BoxStamp, type GateLife, type GateStamp, type LeaseRecord, type LeaseScope, type LeaseStamp, type LeaseTombstone, LeaseFormat, LeaseLabelpath, LeaseLifeRoot, StampChecks, leaseLifepathOf,
} from './shapes/shapes-stamps'
// The deviceDB, which has each gate's lease record on this device, and its memory deviceDB. The IndexedDB deviceDB is on `safebyok/browser`.
export { DeviceDB } from './storage/device-db'
export { MemoryDeviceDB } from './storage/memory-device-db'
export { type DevicetokScopepath, type LeaseListener, type LeaseScopepath, DeviceDBChecks } from './shapes/shapes-device-db'
export {
  type Answer, type BadAct, type BadAnswer, type BirthBankAnswer, type IncompatibleThing, type GetThingAnswer, type GetBankAnswer, type GoodAnswer, type KidEntry, type Kids, type ListThingsAnswer, type ListedBeside,
  type StatsAnswer, type WriteThingAnswer,
} from './shapes/shapes-answers'
export { type VaultDB, isVaultDB } from './storage/vault-db'
// A bank's storage stats, as `tryStats` answers them, and how a concrete adapter measures them.
export { type FiledRaw, type StoreLimits, type ThingkindStats, type VaultStats, StoreLimitCap, StoreLimitFloor, StoreLimitLeastBoxes, VaultStatsChecks, storeLimitsOf } from './shapes/shapes-vault-stats'
export { rowWeightOf, vaultStatsOf } from './storage/vault-stats'
// The events a vaultDB's watcher is notified with.
export {
  type Agekind, type Agerank, type ItemSeen, type Lifekind, type Liveness, type ReadTc, type SeenThing, type VaultAgedEvent, type VaultEvent, type VaultEventOf, type VaultEventkind, type VaultItemEvent, type VaultLifeEvent,
  SeenChecks, VaultDBSourcelabel, agekindVals, lifekindVals, livenessVals, vaultEventkindVals,
} from './shapes/shapes-vault-event'

// From safebyok-big: what an adapter's `do*` methods answer and are named with, its throwers, and the checkers it checks its
// own options and rows with.
export { VoidLifeTok as VoidBanktok, storagePolicyVals, type Awaitable, type DelAct, type GoodAct, type GotAct, type PutAct, type StoragePolicy, type WriteAct } from 'safebyok-big/storage'
export type { IfAbsent, IfPresent, PutIfAbsent, RefusedAct } from 'safebyok-big/internals'
// The values of an ask's flags, of each verb's acts and of a refusal's kind, for an adapter that names them on a wire.
export { badActVals, ifAbsentVals, refusedActVals, refusalkindVals } from 'safebyok-big/storage'
/** The values of a put's `ifPresent` and `ifAbsent`, and of a get's, a put's and a del's acts. */
export const { delActVals, gotActVals, ifPresentVals, putActVals, putIfAbsentVals } = EX
export { VaultError, isVaultError, type Capacity, type RefusalFamily, type RefusalMeta, type Refusalkind, type VaultErrorOpts } from 'safebyok-big'
export { fetchFailed, identityRevoked, sanitizeForeignError, storageFailed, storageRefusalOf, storageUnavailable, unexpectedError } from 'safebyok-big/storage'
export { storageIssue } from 'safebyok-big/refusals/throwers'
export { refusalOfThrown, storageCallRefused, storeQuotaTooSmall } from './refusals/throwers'
// What crosses a wire, for an adapter whose server runs a whole vaultDB: a refusal, and the parts of an answer that have no check of their own.
export { type CrossedAct, type CrossedAnswered, type CrossedErr, CrossedChecks, crossedErrOf, refusedOverWire } from './shapes/shapes-crossed'
// An IndexedDB adapter's own: each call's one transaction, the row at a key within it, and the versioned database.
export { dbprefixOf, inOneStep, rowAt, versionedShelfOf, type VersionedShelfSpec } from 'safebyok-big/storage'
export { Checker, Checkers, objCheck, type AssertEqual, type CheckerInput, type ConsistencyRefusal, type ObjCheckOpts, type Refusing, type Story } from 'safebyok-big/storage'
