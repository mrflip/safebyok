// safebyok, the front door: what a host touches. Everything else stays behind the subpaths: `safebyok/core` keeps every
// class and the lease, proving and sealer machinery, and `safebyok/storage` the vaultDB. What a host needs that
// safebyok-big defines is re-exported from it, so that `VaultError` stays one class across both packages.
import type { BX } from 'safebyok-big/internals'

export { Bank, type BankRecord, type BoxUnsealed } from './models/bank'
export { DefaultLeaseMillis, Device, type DeviceOpts, type DeviceRecord } from './models/device'
export type { Gate } from './models/gate'
export { type AskUser, type CleartextsForGatingkind, type Gating, type GatingSnapshot, type Gatingkind, type RequestCleartext, gatingkindVals } from './models/gating'
export type { BoxAnte, BoxCleartexts } from './models/sealers'
export type { Wayin } from './models/wayin'

// From safebyok-big: its refusals, what a device is handed, and what a gating's dialog and a box carry.
export { IsVaultError, VaultError, isVaultError, type RefusalFamily, type RefusalMeta, type Refusalkind, type VaultErrorOpts } from 'safebyok-big'
export { DefaultLogger, setDefaultLogger, type KeyDeriver, type StrengthChecker, type VaultLogger } from 'safebyok-big'
export { PrfAnswerSize, type PasskeyAnswer, type PassphraseCleartext, type PassphraseVerdict, type Sidecar, type Whisper } from 'safebyok-big'

/** A box as it is stored, sealed: what `bank.sealBox` gives and `bank.unsealBox` takes. */
export type BoxRecord = BX.BoxRecord
