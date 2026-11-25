// safebyok/core: the device, its world, bank, gate, wayin and lease, the gate's form verbs and the methods that put its Things,
// and every type their signatures name; no caching, so neither the VaultTSQ nor TanStack Query. Private
// while it is built. The proving classes are exported as types alone: a proving's `buildLease` is public, and a proving is
// built only in a form verb's gating, which hands it to the gate's private verbs.
export { Bank } from './models/bank'
export { DefaultGateStaleMillis, DefaultJanitorMillis, DefaultLeaseMillis, DefaultOnBadNews, DefaultOnLifecycle, DefaultSoftlockMillis, Device, tellBadNewsTo } from './models/device'
export { type KindRecords, type Kinded, type LiveOfKind, type MembersOfKind, type RecordOfKind, type TombstoneOfKind, type VoidSentinelOfKind, type WholeOfKind, BaseThing } from './models/base-thing'
export { BaseBox } from './models/base-box'
export { Box } from './models/box'
export { Gate } from './models/gate'
export { type SomeThing, World } from './models/world'
export { type Adoptable, Thing } from './models/thing'
export { Lease, withoutSecrets } from './models/lease'
export type { Novel, PasskeyProving, PassphraseProving, Proving } from './models/proving'
export type {
  BodyOf, BoxCleartexts, BoxPublicProps, BoxTombstonePublicProps, LiveOf, LivePublicPropsOf, PublicPropsOf, RevisionOf, SealPurposes, SealTags, Sealable, Sealed,
  SealedOf, SealedPartsOf, Sealer, ShellOf, SparseOf, TombstoneOf, TombstonePublicProps, UnsealedOf,
} from './shapes/shapes-sealers'
export {
  type BankScope, type BankStamp, type BoxStamp, type GateStamp, type LeaseLabelpath, type LeaseLoggable, type LeaseRecord, type LeaseScope, type LeaseSparse, type LeaseStamp, type LeaseTombstone, type StampedGate,
  LeaseFormat, LeaseLifeRoot, StampChecks, leaseLabelpathOf, leaseLifepathOf, leaseScopeOf,
} from './shapes/shapes-stamps'
export { Wayin } from './models/wayin'
export { type PasskeyWayinHeader, type PasskeyWayinRecord, type PassphraseWayinHeader, type PassphraseWayinRecord, type WayinHeader, type WayinRecord, WayinChecks } from './shapes/shapes-wayin'
export type { AddPasskeyGating, BirthGating, Gating, ReplacePassphraseGating, RevokePasskeyGating, UnlockGating } from './models/gating'
export { vacateHanded } from './models/gating'
export { type Banklabel, type BoxLabelpath, type DeviceTok, type EpochMillis, type Lifenum, type Lifepath, type Lifetok, type Revtok, type Userid, Labelpath, Lifeseq, Revseq } from './shapes/primitives'
export {
  type Answer, type BadAct, type BadAnswer, type BirthBankAnswer, type DamagedThing, type GetThingAnswer, type GetWorldAnswer, type GoodAnswer, type KidEntry, type Kids, type ListThingsAnswer, type ListedBeside,
  type WriteThingAnswer,
} from './shapes/shapes-answers'
export { type VaultDB, isVaultDB } from './storage/vault-db'
export type { Agerank, ItemSeen, Liveness, ReadTc, VaultAgedEvent, VaultEvent, VaultEventOf, VaultEventkind, VaultItemEvent, VaultLifeEvent } from './shapes/shapes-vault-event'
export {
  type BadNews, type BadNewsHandler, type BankAskDraft, type BankStage, type BoxUnsealed, type DeviceAnnouncement, type DeviceEvent, type DeviceJSON, type DeviceOpts, type DeviceRecord,
  type HostedVault, type LifecycleHandler, type Lifecyclekind, type RefusalSnapshot, type RootShelf, type ThingMakeOpts, type WorldOpts, type WorldSnapshot,
  BankishChecks, DefaultBanklabel, PendingWorld, SignedOutWorld, ThingMakeChecks, bankStageVals, isRootShelf, isWorld, lifecyclekindVals,
} from './shapes/shapes-bankish'
export {
  type AddPasskeyDna, type BirthCleartexts, type BirthDna, type BirthGatingFriend, type DnaCheck, type GateDna, type GateGatingFriend, type GateRevisionedStamp, type GatingCleartexts, type GuardedKeyDeriver,
  type GuardedStrengthChecker, type HandedCleartexts, type LeaseGate, type LeaseOpts, type LeaseShellScope, type PasskeyAddCleartexts, type PasskeyRevokeCleartexts, type PassphraseReplaceCleartexts, type ProvedCleartexts, type ProvingDevice,
  type ProvingOpts, type ProvingParts, type ReplacePassphraseDna, type RevokePasskeyDna, type SecretFieldname, type StrengthChecker, type UnlockCleartexts, type UnlockDna, type WorldGateFriend, CleartextChecks,
  FormSecretFieldnames, GateishChecks, GatingChecks,
} from './shapes/shapes-gateish'
export {
  type BankRoots, type BankWriteAsk, type BirthBankAsk, type BoxWriteAsk, type CitedOf, type DelAskDraft, type GateWriteAsk, type GetAsk, type GetWorldAsk, type ListAsk, type LoggableAsk, type PutAskDraft, type WorldRoots,
  type ThingOptions, type ThingWatchScope, type Track, type Tracked, type WriteAsk, type WriteAskFlags, AskChecks, VoidTrack,
} from './shapes/shapes-asks'
export {
  type AnyThingRecord, type BankRecord, type BoxRecord, type BoxSparse, type GateRecord, type Modelkind, type Sparse, type ThingCited, type ThingFieldname, type ThingRecord, type ThingScope, type Thingkind, type Tombstone,
  type BulletproofCallback, type VoidSentinel, type Wayins, Shell, ThingChecks, thingkindVals,
} from './shapes/shapes-thing'
export { BankChecks, BoxChecks, GateChecks, ThingkindChecks } from './shapes/shapes-thingkinds'
// A device shows a devtool a masked view of the roots it keeps, its vault TSQ and its lease; the VaultTSQ itself is on the front door.
export { type MaskedRow, type MaskedView, type MaskedViewLease, EmptyMaskedView } from './shapes/shapes-masked-view'

// From safebyok-big, re-exported so that each stays one binding across both packages: its refusals and logger, what a
// device is handed, what a form verb, a wayin and a box carry, and the acts a vaultDB's answer reports.
export { IsVaultError, VaultError, isVaultError, type Capacity, type RefusalFamily, type RefusalFamilyForKind, type RefusalMeta, type Refusalkind, type VaultErrorOpts } from 'safebyok-big'
export { HostErrorSanitizer } from 'safebyok-big'
export type { BadOutcome, GoodOutcome, Outcome } from 'safebyok-big'
export { DefaultLogger, setDefaultLogger, type KeyDeriver, type VaultLogger } from 'safebyok-big'
export { PrfAnswerSize, type PasskeyAnswer, type PassphraseCleartext, type PassphraseVerdict, type Sidecar, type Whisper } from 'safebyok-big'
export type { Wayinkind } from 'safebyok-big'
export type { CipherCtxRecord, IfAbsent, IfPresent, KeyDeriverLabel, PassphraseSalt, PrfSalt, PutIfAbsent, RefusalRows } from 'safebyok-big/internals'
export { refusalkindVals, type DelAct, type GoodAct, type GotAct, type PutAct } from 'safebyok-big/storage'
