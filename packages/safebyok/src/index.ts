// safebyok, the front door: what a host touches, and the ThingMinder the layers above the core build on. Everything else
// stays behind the subpaths: `safebyok/core` keeps every class and the lease, proving and sealer machinery, and
// `safebyok/storage` the vaultDB. What a host needs that
// safebyok-big defines is re-exported from it, so that `VaultError` stays one class across both packages.
export { Bank } from './models/bank'
export { DefaultLeaseMillis, DefaultOnBadNews, Device, tellBadNewsTo } from './models/device'
export type { BadNews, BadNewsHandler, BankAskDraft, BankMakeRecord, BoxShell, BoxUnsealed, DeviceOpts, DeviceRecord, GetBoxAnswer, GetBoxAskDraft } from './shapes/shapes-bankish'
export type { Gate } from './models/gate'
export type { Gating } from './models/gating'
export { type AskUser, type CleartextsForGatingkind, type GatingSnapshot, type Gatingkind, type GuardedStrengthChecker, type RequestCleartext, type StrengthChecker, gatingkindVals } from './shapes/shapes-gateish'
export type { BoxCleartexts, BoxPublicProps, BoxRecord, BoxTombstone, Sealable } from './shapes/shapes-sealers'
export type { Wayin } from './models/wayin'
export type { BankScope, BankStamp } from './shapes/shapes-stamps'
export type { Banklabel, DeviceTok, EpochMillis, Labelpath, Lifenum, Lifepath, Lifeseq, Revtok, Userid } from './shapes/primitives'
export { DefaultStrengthChecker, guardStrengthChecker } from './helpers/passphrase-strength'
export type { BadAnswer, GoodAnswer, ListThingsAnswer, VaultDB, WriteThingAnswer } from './storage/vault-db'
export {
  type BoxThing, type Tombstone, type VoidSentinel, isVoidSentinel,
} from './shapes/shapes-thing'
export {
  type BankRecord, type DelAskDraft, type PutAskDraft,
} from './shapes/shapes-asks'
export {
  type BankCar, type BoxCar, type CarAt, type CarFreshness, type DeliverableThing, type GateCar, type GotAnswer, type MinderOpts, type ScopeAt, type TSQAnswer, type TSQGotAnswer, type ThingAt, type ThingCar, carLivenessVals,
  DefaultQueryCacheOpts, FixedQueryCacheOpts, MaxTimerHours, MaxTimerMillis, type MinderFriend, type MinderGetOpts, type MinderTryAtOpts, type QueryCacheOpts, type TsqStaleTime,
} from './shapes/shapes-minder'
export { ThingMinder } from './minding/thing-minder'
export { carOf, dbHasNewer } from './minding/thing-car'

// From safebyok-big: its refusals, what a device is handed, and what a gating's dialog and a box carry.
export { IsVaultError, VaultError, isVaultError, type RefusalFamily, type RefusalMeta, type Refusalkind, type VaultErrorOpts } from 'safebyok-big'
export { DefaultLogger, setDefaultLogger, type KeyDeriver, type VaultLogger } from 'safebyok-big'
export { PrfAnswerSize, type PasskeyAnswer, type PassphraseCleartext, type PassphraseVerdict, type Sidecar, type Whisper } from 'safebyok-big'
