/** The checks and types of the bank and the device: what each is made from and given, and the bank's drafts and answers. */

import type * as Z from 'zod'
import { CX, type Deriver, type EX, type Errors, type Logger, Validator } from 'safebyok-big/internals'
import type { Bank } from '../models/bank'
import type { DefaultOnBadNews, Device } from '../models/device'
import type { Proving } from '../models/proving'
import type { VaultDB } from '../storage/vault-db'
import type { GateDna, Gatingkind, RequestCleartext, StrengthChecker } from './shapes-gateish'
import type { DefaultQueryCacheOpts, QueryCacheOpts } from './shapes-minder'
import type { BoxCleartexts, LiveOf, ShellOf, UnsealedOf } from './shapes-sealers'
import type { BankStamp } from './shapes-stamps'
import type { BoxRecord } from './shapes-thing'
import type { BoxWriteAsk, GetAsk, ListAsk, WorldRecord } from './shapes-asks'
import type { EpochMillis, Labelpath } from './primitives'

// == [The bank's forms]: BankMakeRecord, BankDna, BoxUnsealed

/** The record {@link Bank.make} and a bank's birth take: the bank's Thing, with its main gate's Thing at `maingate` and its root box at `rootBox`.
 * The root box is whole, or its shell before the bank is born.
 */
export type BankMakeRecord = WorldRecord & Readonly<{ rootBox: LiveOf<BoxRecord> | ShellOf<BoxRecord> }>

/** The dna of a new bank: its stamp, and its main gate's dna. */
export type BankDna = BankStamp & { maingate: GateDna }

/** A box unsealed: its record with its whisper in place of the sealed one. A tombstone's whisper is empty. */
export type BoxUnsealed = UnsealedOf<BoxRecord, BoxCleartexts>
// --

// == [The bank's drafts and asks]: BankAskDraft, SealedBoxAsk

/** The draft of a get or list ask, for {@link Bank.makeGetAsk} or {@link Bank.makeListAsk}: a labelpath in the bank, and `ifAbsent`, the answer when nothing is stored there.
 * The bank fills in the rest of the {@link GetAsk} or {@link ListAsk}.
 */
export type BankAskDraft = Readonly<{ labelpath: Labelpath, ifAbsent?: EX.IfAbsent }>

/** The ask that writes the box {@link Bank.sealBox} sealed, `RecordT`: a put of a live box, or a del of a tombstone. */
export type SealedBoxAsk<RecordT extends BoxRecord = BoxRecord> = BoxWriteAsk & Readonly<{ record: RecordT }>
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

/** The options of a bank's birth, beside its record: {@link BankOpts}, and the `proving` of the main gate, built in the `birth_bank` attempt underway. */
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
  /** Ignored. Allowed so that `...browserOpts()` from `safebyok/browser` spreads in, though it carries a device database. */
  deviceDB?:        unknown
}
// --

// == [Snapshots]: bankStageVals, BankStage, RefusalSnapshot, BankSnapshot, PendingBank, OpenGatingSnapshot, DeviceSnapshot

/** The stages of a bank, as {@link BankStage} describes each. */
export const bankStageVals = ['signed_out', 'starting', 'unborn', 'locked', 'unlocked', 'swept', 'failed'] as const
/** Where the user stands with their bank, one of {@link bankStageVals}, as a host's screen switches on it:
 * - `'signed_out'` -- nobody is signed in, or the bank was vacated or signed out of
 * - `'starting'`   -- signed in, and the bank is being brought up
 * - `'unborn'`     -- no bank is stored for this user, or it was deleted
 * - `'locked'`     -- the bank is stored, and needs the passphrase or passkey before a whisper can be read
 * - `'unlocked'`   -- the bank holds a lease, and whispers can be read and written
 * - `'swept'`      -- everything was unloaded, and nothing follows until the host acts
 * - `'failed'`     -- bringing the bank up failed, as `lastErr` says
 */
export type BankStage = typeof bankStageVals[number]

/** A refusal as a snapshot shows it: its kind, its family and its message, which carry no secret material. */
export interface RefusalSnapshot {
  readonly refusalkind: Errors.Refusalkind
  readonly family:      Errors.RefusalFamily
  readonly message:     string
}

/** A bank as a host renders it: where the user stands, and when its lease ends. */
export interface BankSnapshot {
  readonly stage:       BankStage
  /** True at every stage but `'unlocked'`. */
  readonly isLocked:    boolean
  /** True once the bank has ended: it refuses every call, and its stage says where the user now stands. */
  readonly isEnded:     boolean
  /** The refusal every call on the bank meets once it has ended, the one `bank.endCause` returns; null while it has not. */
  readonly endCause:    Errors.VaultError | null
  /** When the lease ends, in epoch milliseconds, or null while locked. */
  readonly leaseEndsAt: EpochMillis | null
  /** Why the bank failed to come up, at stage `'failed'`; null at every other. */
  readonly lastErr:     RefusalSnapshot | null
}

// isLocked is true in the safe state, so it is spelled out: a snapshot left out would read as unlocked.
/** The bank snapshot a device reports before it holds a bank object: signed in, and the bank not yet started. */
export const PendingBank: BankSnapshot = Object.freeze({
  stage: 'starting', isLocked: true, isEnded: false, endCause: null, leaseEndsAt: null, lastErr: null,
})

/** The gating open on a device, as a host's dialog renders it. */
export interface OpenGatingSnapshot {
  readonly gatingkind:   Gatingkind
  /** Names this gating among those the device has opened: it grows with each one opened, and again as each ends. */
  readonly gatingseq:    number
  /** True while an attempt is under way. */
  readonly isAttempting: boolean
}

/** A device as a host renders it: its bank's snapshot, and the gating open on it. */
export interface DeviceSnapshot {
  /** The snapshot of the bank on this device, or {@link PendingBank} before one is made. */
  readonly bank:   BankSnapshot
  /** The gating open on this device, or null for none. */
  readonly gating: OpenGatingSnapshot | null
}
// --
