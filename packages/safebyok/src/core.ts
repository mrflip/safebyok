// safebyok/core: the device, bank, gate, gating, wayin, proving and lease, and the bank's methods that put its boxes
// through its vaultDB; no caching. Private while it is built.
export { Bank } from './models/bank'
export { DefaultLeaseMillis, DefaultOnBadNews, Device, guardRequestCleartext, tellBadNewsTo } from './models/device'
export { BaseThing } from './models/base-thing'
export { CoreBox } from './models/core-box'
export { Gate } from './models/gate'
export { Gating } from './models/gating'
export { type Lease, withoutSecrets } from './models/lease'
export type { PasskeyProving, PassphraseProving, Proving } from './models/proving'
export type {
  BodyOf, BoxCleartexts, BoxPublicProps, BoxRecord, BoxTombstone, LiveOf, LivePublicPropsOf, PublicPropsOf, RevisionOf, SealPurposes, SealTags, Sealable, Sealed,
  SealedOf, SealedPartsOf, Sealer, TombstoneOf, TombstonePublicProps, UnsealedOf,
} from './shapes/shapes-sealers'
export {
  type BankScope, type BankStamp, type BoxStamp, type GateStamp, type LeaseRecord, type LeaseSparse, type LeaseStamp, type StampedGate,
  StampChecks,
} from './shapes/shapes-stamps'
export { Wayin } from './models/wayin'
export { type Banklabel, type DeviceTok, type EpochMillis, type Lifenum, type Lifepath, type Revtok, type Userid, Labelpath, Lifeseq } from './shapes/primitives'
export { type VaultDB, isVaultDB } from './storage/vault-db'
export {
  type BadNews, type BadNewsHandler, type BankAskDraft, type BankDna, type BankMakeRecord, type BankOpts, type BirthOpts, type BoxShell, type BoxUnsealed, type DeviceOpts, type DeviceRecord, type GetBoxAnswer,
  type GetBoxAskDraft, BankishChecks,
} from './shapes/shapes-bankish'
export {
  type AskUser, type CleartextsForGatingkind, type GateBank, type GateDna, type GateOpts, type GateRevisionedStamp, type GatingAttempt, type GatingOpts, type GatingRecord, type GatingSnapshot,
  type Gatingkind, type LeaseBank, type LeaseOpts, type ProvingDevice, type RequestCleartext, type SecretFieldname, GateishChecks, gatingkindVals,
} from './shapes/shapes-gateish'
export { type BankRecord, type WorldRecord, AskChecks } from './shapes/shapes-asks'
export {
  type BankThing, type BoxThing, type GateThing, type Sparse, type Thing, type ThingCited, type ThingRecord, type ThingScope, type Thingkind, type Tombstone, type VoidSentinel,
  BankChecks, BoxChecks, GateChecks, Shell, ThingChecks, cmpThings, haveSameScope, isGone, isSparse, isTombstone, isVoidSentinel, isWholeRecord, sparseOf, thingkindVals,
} from './shapes/shapes-thing'
