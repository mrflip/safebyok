// safebyok, the front door: what a host touches, and the ThingMinder the layers above the core build on. Everything else
// stays behind the subpaths: `safebyok/core` keeps every class and the lease, proving and sealer machinery, and
// `safebyok/storage` the vaultDB. What a host needs that
// safebyok-big defines is re-exported from it, so that `VaultError` stays one class across both packages.
export { Bank, type BankAskDraft, type BankMakeRecord, type BankRecord, type BoxShell, type BoxUnsealed, type GetBoxAnswer, type GetBoxAskDraft } from './models/bank'
export { type BadNews, type BadNewsHandler, DefaultLeaseMillis, DefaultOnBadNews, Device, type DeviceOpts, type DeviceRecord, tellBadNewsTo } from './models/device'
export type { Gate } from './models/gate'
export { type AskUser, type CleartextsForGatingkind, type Gating, type GatingSnapshot, type Gatingkind, type RequestCleartext, gatingkindVals } from './models/gating'
export type { BoxCleartexts, BoxPublicProps, BoxRecord, BoxTombstone, Sealable } from './models/sealers'
export type { Wayin } from './models/wayin'
export type { BankScope, BankStamp } from './models/stamps'
export type { BadAnswer, GoodAnswer, ListThingsAnswer, VaultDB, WriteThingAnswer } from './storage/vault-db'
export type { BoxThing, DelAskDraft, PutAskDraft, VoidSentinel } from './storage/shapes-thing'
export { DefaultQueryCacheOpts, FixedQueryCacheOpts, type MinderAskOpts, type MinderFriend, type MinderGetAsk, type MinderGetAskOpts, type QueryCacheOpts, type ThingTies } from './minding/shapes-minder'
export { type DeliverableThing, type MinderOpts, type TSQAnswer, type TSQGotAnswer, ThingMinder } from './minding/thing-minder'

// From safebyok-big: its refusals, what a device is handed, and what a gating's dialog and a box carry.
export { IsVaultError, VaultError, isVaultError, type RefusalFamily, type RefusalMeta, type Refusalkind, type VaultErrorOpts } from 'safebyok-big'
export { DefaultLogger, setDefaultLogger, type KeyDeriver, type StrengthChecker, type VaultLogger } from 'safebyok-big'
export { PrfAnswerSize, type PasskeyAnswer, type PassphraseCleartext, type PassphraseVerdict, type Sidecar, type Whisper } from 'safebyok-big'
