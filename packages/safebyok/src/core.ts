// safebyok/core: the device, bank, gate, wayin and lease, the bank's form verbs and the methods that seal its boxes and put
// its Things, and every type their signatures name; no caching, so neither the ThingMinder nor TanStack Query. Private while
// it is built. The proving classes are exported as types alone: a proving's `buildLease` is public, and a proving is built
// only in a form verb's attempt, which hands it to the bank's private verbs.
export { Bank } from './models/bank'
export { DefaultLeaseMillis, DefaultOnBadNews, Device, tellBadNewsTo } from './models/device'
export { type KindRecords, type Kinded, type LiveOfKind, type MembersOfKind, type RecordOfKind, type TombstoneOfKind, type VoidSentinelOfKind, type WholeOfKind, BaseThing } from './models/base-thing'
export { BaseBox } from './models/base-box'
export { Gate } from './models/gate'
export { Thing } from './models/thing'
export { Lease, withoutSecrets } from './models/lease'
export type { Novel, PasskeyProving, PassphraseProving, Proving } from './models/proving'
export type {
  BodyOf, BoxCleartexts, BoxPublicProps, BoxTombstonePublicProps, LiveOf, LivePublicPropsOf, PublicPropsOf, RevisionOf, SealPurposes, SealTags, Sealable, Sealed,
  SealedOf, SealedPartsOf, Sealer, ShellOf, TombstoneOf, TombstonePublicProps, UnsealedOf,
} from './shapes/shapes-sealers'
export {
  type BankScope, type BankStamp, type BoxStamp, type GateStamp, type LeaseRecord, type LeaseSparse, type LeaseStamp, type StampedGate,
  StampChecks,
} from './shapes/shapes-stamps'
export { Wayin } from './models/wayin'
export { Cloak, cloak } from './helpers/cloak'
export { type Banklabel, type BoxLabelpath, type DeviceTok, type EpochMillis, type Lifenum, type Lifepath, type Revtok, type Userid, Labelpath, Lifeseq, Revseq } from './shapes/primitives'
export {
  type Answer, type BadAct, type BadAnswer, type BirthBankAnswer, type DamagedThing, type GetThingAnswer, type GoodAnswer, type ListThingsAnswer, type ListedBeside,
  type ThingNotice, type VaultDB, type WriteThingAnswer, isVaultDB,
} from './storage/vault-db'
export {
  type BadNews, type BadNewsHandler, type BankAskDraft, type BankDna, type BankMakeRecord, type BankOpts, type BankSnapshot, type BankStage, type BirthOpts, type BoxUnsealed, type DeviceOpts, type DeviceRecord,
  type DeviceSnapshot, type HostedVault, type RefusalSnapshot, type SealedBoxAsk,
  BankishChecks, PendingBank, bankStageVals,
} from './shapes/shapes-bankish'
export {
  type BankGatingFriend, type BirthCleartexts, type BirthFriend, type CloakCleartexts, type GateBank, type GateDna, type GateOpts, type GateRevisionedStamp, type GuardedKeyDeriver, type GuardedStrengthChecker,
  type LeaseBank, type LeaseOpts, type PasskeyAddCleartexts, type PasskeyRevokeCleartexts, type PassphraseReplaceCleartexts, type ProvedCleartexts, type ProvingDevice, type ProvingOpts, type ProvingParts,
  type SecretFieldname, type StrengthChecker, type UnlockCleartexts, CleartextChecks, GateishChecks,
} from './shapes/shapes-gateish'
export {
  type BankRoots, type BankWriteAsk, type BirthBankAsk, type BoxWriteAsk, type CitedOf, type DelAskDraft, type GateWriteAsk, type GetAsk, type ListAsk, type LoggableAsk, type PutAskDraft,
  type ThingOptions, type ThingWatchScope, type Track, type Tracked, type WorldRecord, type WriteAsk, type WriteAskFlags, AskChecks,
} from './shapes/shapes-asks'
export {
  type AnyThingRecord, type BankRecord, type BoxRecord, type GateRecord, type Modelkind, type Sparse, type ThingCited, type ThingFieldname, type ThingRecord, type ThingScope, type Thingkind, type Tombstone,
  type VoidSentinel, type Wayins, Shell, ThingChecks, thingkindVals,
} from './shapes/shapes-thing'
export { BankChecks, BoxChecks, GateChecks, ThingkindChecks } from './shapes/shapes-thingkinds'
// A bank is made with the defaults its minders set on their cache entries; the minder itself is on the front door.
export type { QueryCacheOpts } from './shapes/shapes-minder'

// From safebyok-big, re-exported so that each stays one binding across both packages: its refusals and logger, what a
// device is handed, what a form verb, a wayin and a box carry, and the acts a vaultDB's answer reports.
export { IsVaultError, VaultError, isVaultError, type Capacity, type RefusalFamily, type RefusalFamilyForKind, type RefusalMeta, type Refusalkind, type VaultErrorOpts } from 'safebyok-big'
export { HostErrorSanitizer } from 'safebyok-big'
export type { BadOutcome, GoodOutcome, Outcome } from 'safebyok-big'
export { DefaultLogger, setDefaultLogger, type KeyDeriver, type VaultLogger } from 'safebyok-big'
export { PrfAnswerSize, type PasskeyAnswer, type PassphraseCleartext, type PassphraseVerdict, type Sidecar, type Whisper } from 'safebyok-big'
export type { PasskeyWayinHeader, PassphraseWayinHeader, WayinHeader, Wayinkind } from 'safebyok-big'
export type { CipherCtxRecord, IfAbsent, IfPresent, KeyDeriverLabel, PasskeyWayinRecord, PassphraseSalt, PassphraseWayinRecord, PrfSalt, PutIfAbsent, RefusalRows, WayinRecord } from 'safebyok-big/internals'
export { refusalkindVals, type DelAct, type GoodAct, type GotAct, type PutAct } from 'safebyok-big/storage'
