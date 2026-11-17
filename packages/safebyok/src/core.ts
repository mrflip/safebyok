// safebyok/core: the device, bank, gate, gating, wayin, proving and lease, and the bank's methods that put its boxes
// through its vaultDB; no caching. Private while it is built.
export { Bank, type BankAskDraft, type BankDna, type BankOpts, type BankMakeRecord, type BankRecord, type BirthOpts, type BoxShell, type BoxUnsealed, type GetBoxAnswer, type GetBoxAskDraft } from './models/bank'
export { type BadNews, type BadNewsHandler, DefaultLeaseMillis, DefaultOnBadNews, Device, type DeviceOpts, type DeviceRecord, guardRequestCleartext, tellBadNewsTo } from './models/device'
export { BaseThing } from './models/base-thing'
export { CoreBox } from './models/core-box'
export { Gate, type GateBank, type GateDna, type GateOpts } from './models/gate'
export { type AskUser, type CleartextsForGatingkind, Gating, type GatingAttempt, type GatingOpts, type GatingRecord, type GatingSnapshot, type Gatingkind, type RequestCleartext, gatingkindVals } from './models/gating'
export { type Lease, type LeaseBank, type LeaseOpts, type SecretFieldname, withoutSecrets } from './models/lease'
export type { PasskeyProving, PassphraseProving, Proving } from './models/proving'
export type {
  BodyOf, BoxCleartexts, BoxDonor, BoxRecord, BoxTombstone, DonorOf, LiveOf, LivePublicPropsOf, PublicPropsOf, RevisionOf, SealPurposes, SealTags, Sealed,
  SealedOf, SealedPartsOf, Sealer, TombstoneOf, TombstonePublicProps, UnsealedOf,
} from './models/sealers'
export {
  type BankScope, type BankStamp, type BoxStamp, type GateCited, type GateStamp, type LeaseRecord, type LeaseSparse, type LeaseStamp, type StampedGate,
  LeaseFormat, bankScope, bankStamp, boxStamp, gateCited, gateStamp, leaseRecord, leaseStamp, stampedGate,
} from './models/stamps'
export { Wayin } from './models/wayin'
export { type VaultDB, isVaultDB } from './storage/vault-db'
