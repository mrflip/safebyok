// safebyok, the front door: what a host touches, the ThingMinder the layers above the core build on, and, generously, the
// models, record types, checker bundles and guards a host or an adapter is likely to reach for. The rest stays behind the subpaths:
// `safebyok/core` keeps every class and the lease, proving and sealer machinery, and
// `safebyok/storage` the vaultDB. What a host needs that
// safebyok-big defines is re-exported from it, so that `VaultError` stays one class across both packages.
export { Bank } from './models/bank'
export { DefaultLeaseMillis, DefaultOnBadNews, Device, tellBadNewsTo } from './models/device'
export { type BadNews, type BadNewsHandler, type BankAskDraft, type BankMakeRecord, type BoxUnsealed, type DeviceOpts, type DeviceRecord, type GetBoxAnswer, type GetBoxAskDraft, BankishChecks } from './shapes/shapes-bankish'
export type { Gate } from './models/gate'
export type { Gating } from './models/gating'
export { type AskUser, type CleartextsForGatingkind, type GatingSnapshot, type Gatingkind, type GuardedStrengthChecker, type RequestCleartext, type StrengthChecker, GateishChecks, gatingkindVals } from './shapes/shapes-gateish'
export type { BoxCleartexts, BoxPublicProps, LiveOf, Sealable, ShellOf, TombstoneOf } from './shapes/shapes-sealers'
export type { Wayin } from './models/wayin'
export { type BankScope, type BankStamp, type BoxStamp, type GateStamp, StampChecks } from './shapes/shapes-stamps'
export { type Banklabel, type DeviceTok, type EpochMillis, type Lifenum, type Lifepath, type Revtok, type Userid, Labelpath, Lifeseq } from './shapes/primitives'
export { DefaultStrengthChecker, guardStrengthChecker } from './helpers/passphrase-strength'
export { type BadAnswer, type GoodAnswer, type ListThingsAnswer, type VaultDB, type WriteThingAnswer, isVaultDB } from './storage/vault-db'
export { MemoryVaultDB } from './storage/memory-vault-db'
export {
  type BankRecord, type BoxRecord, type GateRecord, type Sparse, type ThingCited, type ThingRecord, type ThingScope, type Thingkind, type Tombstone, type VoidSentinel,
  BankChecks, BoxChecks, GateChecks, Shell, ThingChecks, cmpThings, haveSameScope, isGone, isSparse, isTombstone, isVoidSentinel, isWholeRecord, sparseOf, thingkindVals,
} from './shapes/shapes-thing'
export {
  type DelAskDraft, type PutAskDraft, type WorldRecord, AskChecks,
} from './shapes/shapes-asks'
export {
  type BankCar, type BoxCar, type CarAt, type CarFreshness, type DeliverableThing, type GateCar, type GotAnswer, type MinderOpts, type ScopeAt, type TSQAnswer, type TSQGotAnswer, type ThingAt, type ThingCar, carLivenessVals,
  DefaultQueryCacheOpts, FixedQueryCacheOpts, MaxTimerHours, MaxTimerMillis, MinderChecks, type MinderFriend, type MinderGetOpts, type MinderTryAtOpts, type QueryCacheOpts, type TsqStaleTime,
} from './shapes/shapes-minder'
export { ThingMinder } from './minding/thing-minder'
export { carOf, dbHasNewer } from './minding/thing-car'

// From safebyok-big: its refusals, what a device is handed, and what a gating's dialog and a box carry.
export { IsVaultError, VaultError, isVaultError, type RefusalFamily, type RefusalMeta, type Refusalkind, type VaultErrorOpts } from 'safebyok-big'
export { DefaultLogger, setDefaultLogger, type KeyDeriver, type VaultLogger } from 'safebyok-big'
export { PrfAnswerSize, type PasskeyAnswer, type PassphraseCleartext, type PassphraseVerdict, type Sidecar, type Whisper } from 'safebyok-big'
