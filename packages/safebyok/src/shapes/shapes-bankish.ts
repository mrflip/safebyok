/** The checks and types of the bank and the device: what each is made from and given, and the bank's drafts and answers. */

import type { QueryClient } from '@tanstack/query-core'
import type * as Z from 'zod'
import { CX, type Deriver, type EX, Errors, type Logger, Phrases as BigPhrases, Validator } from 'safebyok-big/internals'
import type { Bank } from '../models/bank'
import type { DefaultOnBadNews, Device } from '../models/device'
import type { World } from '../models/world'
import type { VaultDB } from '../storage/vault-db'
import type { StrengthChecker } from './shapes-gateish'
import type { BoxCleartexts, UnsealedOf } from './shapes-sealers'
import type { BoxRecord, ThingMakeOpts } from './shapes-thing'
import type { GetAsk, ListAsk } from './shapes-asks'
import type { Banklabel, DeviceTok, EpochMillis, Labelpath, Userid } from './primitives'
import * as Phrases from '../phrases'

// == [The bank's forms]: BoxUnsealed

/** A box unsealed: its record with its whisper in place of the sealed one. A tombstone's whisper is empty. */
export type BoxUnsealed = UnsealedOf<BoxRecord, BoxCleartexts>
// --

// == [The bank's drafts and asks]: BankAskDraft

/** The draft of a get or list ask, for `VaultMinder.makeGetAsk` or `makeListAsk`: a labelpath in the bank, and `ifAbsent`, the answer when nothing is stored there.
 * The VaultMinder fills in the rest of the {@link GetAsk} or {@link ListAsk}.
 */
export type BankAskDraft = Readonly<{ labelpath: Labelpath, ifAbsent?: EX.IfAbsent }>
// --

// == [The bank's making]: BankOpts, WorldOpts, HostedVault, WorldChecks

/** The options of {@link Bank.make}, beside its record. */
export interface BankOpts extends ThingMakeOpts {
  /** The device the bank is on. Its scope must be the bank's. */
  device:  Device
}

/** The options of {@link World.make}. */
export interface WorldOpts {
  /** The device the world is made with. */
  device: Device
}

// `safebyok/core` carries no caching, so the bank knows its vaults by this method alone, not by the Vault class.
/** A vault a world hosts: the world's sweep sweeps it. */
export interface HostedVault {
  /** End the vault, as its world ends. */
  sweep(): unknown
}

/** The checks of the end cause `World.sweep` is handed, and of the vault `World.hostVault` is. */
export const WorldChecks = Validator.Checkers('bad_record', ({ custom }) => ({
  endCause:    custom<Errors.VaultError>(Errors.isVaultError, BigPhrases.VaultErrorExpected).nullable(),
  hostedVault: custom<HostedVault>((val) => typeof (val as Partial<HostedVault> | null)?.sweep === 'function', Phrases.HostedVaultExpected),
}))
// --

// == [The device]: BankishChecks, DefaultBanklabel, DeviceRecord, DeviceJSON, BadNews, BadNewsHandler, RootShelf, isRootShelf, RootShelfMethodnames, DeviceOpts

/** The banklabel of the bank a device serves where its record names none. */
export const DefaultBanklabel = 'main'

/** The checks of a {@link DeviceRecord}, and of the userid `Device.signin` is handed. */
export const BankishChecks = Validator.Checkers('bad_record', ({ obj, user_id, banklabel, device_tok }) => ({
  deviceRecord: obj({ banklabel: banklabel.default(DefaultBanklabel), device_tok }).strict(),
  userid:       user_id,
}), [CX])

/** A device's record, as `Device.make` takes it: the banklabel of the bank it serves each user, `'main'` where left out, and its token. */
export type DeviceRecord = Z.input<typeof BankishChecks.deviceRecord>

/** A device as it serializes: its record, and the user signed in on it, or null for none. */
export type DeviceJSON = Readonly<{ userid: Userid | null, banklabel: Banklabel, device_tok: DeviceTok }>

/** The argument of `onBadNews`: a refusal no caller waits on, and the device it reached. */
export interface BadNews {
  readonly news:   Errors.VaultError
  readonly device: Device
}

/** `Device.make`'s `onBadNews`: hears each refusal no caller waits on. */
export type BadNewsHandler = (badnews: BadNews) => unknown

/** Where a device keeps the signed-in bank's three roots between page loads: `localStorage`, or anything with its three methods. */
export type RootShelf = Readonly<{
  getItem:    (ckey: string) => string | null
  setItem:    (ckey: string, val: string) => void
  removeItem: (ckey: string) => void
}>

/** True for an object with a function for each of a {@link RootShelf}'s three methods. */
export function isRootShelf(val: unknown): val is RootShelf {
  if ((typeof val !== 'object') || (val === null)) { return false }
  const members: Partial<Record<string, unknown>> = val
  return RootShelfMethodnames.every((methodname) => typeof members[methodname] === 'function')
}

/** The methods of a {@link RootShelf}. */
const RootShelfMethodnames = ['getItem', 'setItem', 'removeItem'] as const

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
  /** Hears each refusal no caller waits on. Default: {@link DefaultOnBadNews}, a warning on the device's logger. */
  onBadNews?:       BadNewsHandler | undefined
  /** The QueryClient the signed-in user's boxes are kept in, under their bank's key: your own, so one client serves your queries and the vault's. Default: one the device makes. */
  queryClient?:     QueryClient | undefined
  /** Where the device keeps the signed-in bank's three roots between page loads: hand it `localStorage`. Without one, nothing is kept, and each page load waits on the vaultDB for the bank. */
  rootShelf?:       RootShelf | undefined
  /** Ignored. Allowed so that `...browserOpts()` from `safebyok/browser` spreads in, though it carries a device database. */
  deviceDB?:        unknown
}
// --

// == [Snapshots]: bankStageVals, BankStage, RefusalSnapshot, WorldSnapshot, PendingWorld, SignedOutWorld

/** The stages of a bank, each described at {@link BankStage}. */
export const bankStageVals = ['signed_out', 'starting', 'unborn', 'locked', 'unlocked', 'swept', 'failed'] as const
/** Where the user stands with their bank, for a host's screen to switch on:
 * - `'signed_out'` -- nobody is signed in, or the bank was vacated or signed out of
 * - `'starting'`   -- signed in, and the device's sign-in has not answered
 * - `'unborn'`     -- no bank is stored for this user, or it was deleted
 * - `'locked'`     -- the bank is stored, and needs the passphrase or passkey before a whisper can be read
 * - `'unlocked'`   -- the bank has a lease, and whispers can be read and written
 * - `'swept'`      -- everything was unloaded, and nothing follows until the host acts
 * - `'failed'`     -- bringing the bank up failed, as `lastErr` says
 */
export type BankStage = typeof bankStageVals[number]

/** A refusal, for a snapshot to show. None of its fields carries secret material. */
export interface RefusalSnapshot {
  readonly refusalkind: Errors.Refusalkind
  readonly family:      Errors.RefusalFamily
  readonly message:     string
}

/** Where the user stands with their bank, as the device's world shows it, for a host to render. */
export interface WorldSnapshot {
  readonly stage:       BankStage
  /** True at every stage but `'unlocked'`. */
  readonly isLocked:    boolean
  /** True once the bank has ended. An ended bank refuses every call, and its stage says where the user stands. */
  readonly isEnded:     boolean
  /** The refusal every call meets once the bank has ended, or null before then. */
  readonly endCause:    Errors.VaultError | null
  /** When the lease ends, in epoch milliseconds, or null while locked. */
  readonly leaseEndsAt: EpochMillis | null
  /** Why the bank failed to come up, at stage `'failed'`, or null at every other stage. */
  readonly lastErr:     RefusalSnapshot | null
  /** True while a call waits in {@link Bank.ensureUnlocked}: render the unlock form while it is.
   * It goes false when the bank is unlocked, {@link Bank.dismissUnlock} is called, or the bank ends.
   */
  readonly isUnlockWanted: boolean
}

// isLocked is true in the safe state, so it is spelled out: a snapshot left out would read as unlocked.
/** The world snapshot a device shows from `signin` until it finds its user's bank stored or not. */
export const PendingWorld: WorldSnapshot = Object.freeze({
  stage: 'starting', isLocked: true, isEnded: false, endCause: null, leaseEndsAt: null, lastErr: null, isUnlockWanted: false,
})

/** The world snapshot a device shows until `signin`, while nobody is signed in on it. */
export const SignedOutWorld: WorldSnapshot = Object.freeze({ ...PendingWorld, stage: 'signed_out' })
// --
