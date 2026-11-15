// safebyok/core: the device, bank, gate, gating, wayin, proving and lease, and the bank's methods that put its boxes
// through its vaultDB; no caching. Private while it is built.
export { Bank, type BankDna, type BankOpts, type BankRecord, type BirthOpts, type BoxShell, type BoxUnsealed, type GetBoxAnswer, type GetBoxArgs } from './models/bank'
export { DefaultLeaseMillis, Device, type DeviceOpts, type DeviceRecord, guardRequestCleartext } from './models/device'
export { BaseThing } from './models/base-thing'
export { Gate, type GateBank, type GateDna, type GateOpts } from './models/gate'
export { type AskUser, type CleartextsForGatingkind, Gating, type GatingAttempt, type GatingOpts, type GatingRecord, type GatingSnapshot, type Gatingkind, type RequestCleartext, gatingkindVals } from './models/gating'
export type { CleartextsOf, Lease, LeaseBank, LeaseOpts, PriorOf, RecordOf } from './models/lease'
export type { PasskeyProving, PassphraseProving, Proving } from './models/proving'
export {
  type BoxCleartexts, type BoxRecord, type BoxSparse, type BoxTombstone, type SealPurposes, type SealTags, type Sealed, type SealedOf, type Sealer, type SealerKinds,
  type Sealerkind, type UnsealedOf, sealerkindVals,
} from './models/sealers'
export {
  type BankScope, type BankStamp, type CitedGate, type GateStamp, type LeaseRecord, type LeaseSparse, type LeaseStamp, type StampedGate,
  LeaseFormat, bankScope, bankStamp, citedGate, gateStamp, leaseRecord, leaseStamp, stampedGate,
} from './models/stamps'
export { Wayin } from './models/wayin'
export { type VaultDB, isVaultDB } from './storage/vault-db'
