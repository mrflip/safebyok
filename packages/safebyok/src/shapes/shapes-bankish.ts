/** The checks and types of the bank and the device: what each is made from and given, and the bank's drafts and answers. */

import type * as Z from 'zod'
import { CX, type Deriver, type EX, type Errors, type Logger, Validator } from 'safebyok-big/internals'
import type { Bank } from '../models/bank'
import type { DefaultOnBadNews, Device } from '../models/device'
import type { Proving } from '../models/proving'
import type { BadAnswer, GoodAnswer, VaultDB } from '../storage/vault-db'
import type { GateDna, RequestCleartext, StrengthChecker } from './shapes-gateish'
import type { DefaultQueryCacheOpts, QueryCacheOpts } from './shapes-minder'
import type { BoxCleartexts, LiveOf, ShellOf, UnsealedOf } from './shapes-sealers'
import type { BankStamp } from './shapes-stamps'
import type { BoxRecord } from './shapes-thing'
import type { GetAsk, ListAsk, WorldRecord } from './shapes-asks'
import type { Labelpath } from './primitives'

// == [The bank's forms]: BankMakeRecord, BankDna, BoxUnsealed

/** The record {@link Bank.make} and {@link Bank.birth} take: the bank's Thing, with its main gate's Thing at `maingate` and its root box at `rootBox`.
 * The root box is whole, or its shell before the bank is born.
 */
export type BankMakeRecord = WorldRecord & Readonly<{ rootBox: LiveOf<BoxRecord> | ShellOf<BoxRecord> }>

/** The dna of a new bank: its stamp, and its main gate's dna. */
export type BankDna = BankStamp & { maingate: GateDna }

/** A box unsealed: its record with its whisper in place of the sealed one. A tombstone's whisper is empty. */
export type BoxUnsealed = UnsealedOf<BoxRecord, BoxCleartexts>
// --

// == [The bank's drafts and answers]: GetBoxAskDraft, BankAskDraft, GetBoxAnswer

/** The draft of a box's get ask, for {@link Bank.tryGetBox}: the box's labelpath, and `ifAbsent`, the answer when none is stored (default `'nil'`).
 * The bank fills in the rest of the {@link GetAsk}.
 */
export type GetBoxAskDraft = Readonly<{ labelpath: Labelpath, ifAbsent?: EX.IfAbsent | 'shell' }>

/** The draft of a get or list ask, for {@link Bank.makeGetAsk} or {@link Bank.makeListAsk}: a labelpath in the bank, and `ifAbsent`, the answer when nothing is stored there.
 * The bank fills in the rest of the {@link GetAsk} or {@link ListAsk}.
 */
export type BankAskDraft = Readonly<{ labelpath: Labelpath, ifAbsent?: EX.IfAbsent }>

/** The answer of {@link Bank.tryGetBox}: the box, live or a tombstone; `VoidT` under `gotvoid`, when none is stored; or a refusal. */
export type GetBoxAnswer<VoidT = null> = GoodAnswer<BoxRecord, 'gotlive' | 'gotgone'> | GoodAnswer<VoidT, 'gotvoid'> | BadAnswer
// --

// == [The bank's making]: BankOpts, BirthOpts

/** The options of {@link Bank.make}, beside its record. */
export interface BankOpts {
  /** The device the bank is on. Its scope must be the bank's. */
  device:  Device
  /** Where the bank's boxes are stored. */
  vaultDB: VaultDB
  /** The defaults this bank's minders set on their TanStack Query cache entries. A missing field defaults from {@link DefaultQueryCacheOpts}. */
  queryCacheOpts?: Partial<QueryCacheOpts>
}

/** The options of {@link Bank.birth}, beside its record: {@link BankOpts}, and the `proving` of the main gate, built in the gating attempt underway. */
export interface BirthOpts extends BankOpts {
  proving: Proving
}
// --

// == [The device]: BankishChecks, DeviceRecord, BadNews, BadNewsHandler, DeviceOpts

/** The check of a {@link DeviceRecord}. */
export const BankishChecks = Validator.Checkers('bad_record', ({ obj, user_id, banklabel, device_tok }) => ({
  deviceRecord: obj({ userid: user_id, banklabel, device_tok }).strict(),
}), [CX])

/** A device's record: the bank scope it serves, and its token there. */
export type DeviceRecord = Z.infer<typeof BankishChecks.deviceRecord>

/** What `onBadNews` hears: a refusal no caller waits on, and the device it reached. */
export interface BadNews {
  readonly news:   Errors.VaultError
  readonly device: Device
}

/** `Device.make`'s `onBadNews`: hears each refusal no caller waits on. */
export type BadNewsHandler = (badnews: BadNews) => unknown

/** The options of {@link Device.make}, beside the device's record. */
export interface DeviceOpts {
  /** Where this device's banks are stored: each bank made on it is given this vaultDB. */
  vaultDB:          VaultDB
  /** Makes a key from a passphrase: `argon2idWebV1Deriver` from `safebyok-big/browser`, or your own. */
  keyDeriver:       Deriver.KeyDeriver
  /** Judges each new passphrase before the bank accepts it. Without one, every new passphrase is too weak. */
  strengthChecker?: StrengthChecker | undefined
  /** Where the device reports what it has no caller to throw to. Default: the console. */
  logger?:          Logger.VaultLogger | undefined
  /** How long a lease lasts on this device, in minutes. `Infinity` lasts until locked. Default: 14 days. */
  autolockMinutes?: number | undefined
  /** Shows the host's dialog for each gating. Without one, the host renders the device's `openGating` itself. */
  requestCleartext?: RequestCleartext | undefined
  /** Hears each refusal no caller waits on. Default: {@link DefaultOnBadNews}, a warning on the device's logger. */
  onBadNews?:       BadNewsHandler | undefined
}
// --
