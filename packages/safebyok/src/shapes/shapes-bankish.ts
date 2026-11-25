/** The checks and types of the bank and the device: what each is made from and given, and the bank's drafts and answers. */

import type { QueryClient } from '@tanstack/query-core'
import type * as Z from 'zod'
import { CX, type Deriver, type EX, type Errors, type Logger, Validator } from 'safebyok-big/internals'
import type { Bank } from '../models/bank'
import type { DefaultOnBadNews, DefaultOnLifecycle, Device } from '../models/device'
import type { World } from '../models/world'
import type { DeviceDB } from '../storage/device-db'
import type { VaultDB } from '../storage/vault-db'
import type { StrengthChecker } from './shapes-gateish'
import type { BoxCleartexts, UnsealedOf } from './shapes-sealers'
import type { BoxRecord } from './shapes-thing'
import type { GetAsk, ListAsk } from './shapes-asks'
import type { Banklabel, Devicetok, EpochMillis, Labelpath, Userid } from './primitives'
import * as Phrases from '../phrases'

// == [The bank's forms]: BoxUnsealed

/** A box unsealed: its record with its whisper in place of the sealed one. A tombstone's whisper is empty. */
export type BoxUnsealed = UnsealedOf<BoxRecord, BoxCleartexts>
// --

// == [The bank's drafts and asks]: BankAskDraft

/** The draft of a get or list ask, for `VaultMinder.makeGetAsk` or `makeListAsk`: a labelpath in the bank, and for a get, `ifAbsent`, the answer when nothing is stored there.
 * The VaultMinder fills in the rest of the {@link GetAsk} or {@link ListAsk}.
 */
export type BankAskDraft = Readonly<{ labelpath: Labelpath, ifAbsent?: EX.IfAbsent }>
// --

// == [The bank's making]: ThingMakeOpts, ThingMakeChecks, isWorld, WorldMembernames, WorldOpts, HostedVault, WorldChecks, isHostedVault

/** The options every kind of Thing is made with, beside the shell or item event it is made from. */
export type ThingMakeOpts = Readonly<{
  /** The device's world, which the Thing's bank is locked, unlocked and ended in, and whose `bulletproofCallback` wraps each of its subscribers. */
  world: World
}>

/** The check of {@link ThingMakeOpts}. */
export const ThingMakeChecks = Validator.Checkers('bad_record', ({ obj, custom }) => ({
  thingMakeOpts: obj({ world: custom<World>(isWorld, Phrases.WorldExpected) }),
}))

/** True for an object with a function for each of {@link World}'s verbs. */
export function isWorld(val: unknown): val is World {
  if ((typeof val !== 'object') || (val === null)) { return false }
  const members: Partial<Record<string, unknown>> = val
  return WorldMembernames.every((membername) => typeof members[membername] === 'function')
}

/** The members of {@link World} that are functions. */
const WorldMembernames = ['makeThing', 'seal', 'unseal', 'lock', 'connect', 'disconnect', 'signin', 'ensureUnlocked', 'dismissUnlock', 'demandEnabled', 'hostVault', 'bulletproofCallback'] as const satisfies readonly (keyof World)[]

/** The options of {@link World.make}. */
export interface WorldOpts {
  /** The device the world is made with. */
  device: Device
}

// `safebyok/core` carries no caching, so the bank knows its vaults by this method alone, not by the Vault class.
/** A vault a world hosts: it connects and disconnects with the world. */
export interface HostedVault {
  /** Start what the vault keeps running, as its world connects. */
  connect(): unknown
  /** Stop what the vault keeps running, as its world disconnects. */
  disconnect(): unknown
}

/** The check of the vault `World.hostVault` is handed. */
export const WorldChecks = Validator.Checkers('bad_record', ({ custom }) => ({
  hostedVault: custom<HostedVault>(isHostedVault, Phrases.HostedVaultExpected),
}))

/** True for an object with a `connect` and a `disconnect` function. */
function isHostedVault(val: unknown): val is HostedVault {
  const members = val as Partial<HostedVault> | null
  return (typeof members?.connect === 'function') && (typeof members.disconnect === 'function')
}
// --

// == [The device]: BankishChecks, DefaultBanklabel, DeviceRecord, DeviceJSON, BadNews, BadNewsHandler, leasekindVals, lifecyclekindVals, Lifecyclekind, LeaseAnnouncement, StageCrossing, WatchEnding, DeviceAnnouncement, DeviceEvent, LifecycleHandler, GuardedLifecycleHandler, RootShelf, isRootShelf, RootShelfMethodnames, DeviceOpts

/** The banklabel of the bank a device serves where its record names none. */
export const DefaultBanklabel = 'main'

/** The checks of a {@link DeviceRecord}, of the userid `Device.signin` is handed, and of a devicetok. */
export const BankishChecks = Validator.Checkers('bad_record', ({ obj, user_id, banklabel, devicetok }) => ({
  deviceRecord: obj({ banklabel: banklabel.default(DefaultBanklabel) }).strict(),
  userid:       user_id,
  devicetok,
}), [CX])

/** A device's record, as `Device.make` takes it: the banklabel of the bank it serves each user, `'main'` where left out. */
export type DeviceRecord = Z.input<typeof BankishChecks.deviceRecord>

/** A device as it serializes: its record, and the user signed in on it, or null for none. */
export type DeviceJSON = Readonly<{ userid: Userid | null, banklabel: Banklabel }>

/** The argument of `onBadNews`: a refusal no caller waits on, and the device it reached. */
export interface BadNews {
  readonly news:   Errors.VaultError
  readonly device: Device
}

/** `Device.make`'s `onBadNews`: hears each refusal no caller waits on. */
export type BadNewsHandler = (badnews: BadNews) => unknown

/** The kinds of {@link LeaseAnnouncement}. */
export const leasekindVals = ['lease_taken_up', 'lock_taken_up', 'autolocked', 'softlocked'] as const

/** The kinds of {@link DeviceAnnouncement}. */
export const lifecyclekindVals = [...leasekindVals, 'stage_crossed', 'watch_ended'] as const

/** One of {@link lifecyclekindVals}. */
export type Lifecyclekind = typeof lifecyclekindVals[number]

// #lock-is-intent: each is news of what happened, never an alarm.
/** What changed a device's lease, other than its own lock, unlock or disable, by its `kind`:
 * - `'lease_taken_up'` -- this tab took up the lease the deviceDB stores, newer than its own: an unlock, a renewal or a softlock in another tab, or, as it signs in or connects, one stowed before
 * - `'lock_taken_up'`  -- this tab dropped its lease, as the deviceDB stores one that no longer unlocks the bank: a lock in another tab, its autolock among them
 * - `'autolocked'`     -- this tab's janitor locked the lease past its end, in every tab
 * - `'softlocked'`     -- the bank's gate changed, so this tab brought its lease's end to `softlockMinutes` from now
 */
export type LeaseAnnouncement = Readonly<{ kind: typeof leasekindVals[number] }>

/** A change of the world's stage, from the stage it was at to the one it is at now. The tab that caused it hears it too. */
export type StageCrossing = Readonly<{ kind: 'stage_crossed', from: BankStage, to: BankStage }>

/** The device's watch of its bank ended of itself, before anything stopped it. */
export type WatchEnding = Readonly<{ kind: 'watch_ended' }>

/** What a device announces to `onLifecycle`, by its `kind`: a {@link LeaseAnnouncement}, a {@link StageCrossing} or a {@link WatchEnding}. */
export type DeviceAnnouncement = LeaseAnnouncement | StageCrossing | WatchEnding

/** What `onLifecycle` hears: a {@link DeviceAnnouncement}, and the device it happened to. */
export type DeviceEvent = DeviceAnnouncement & Readonly<{ device: Device }>

/** `Device.make`'s `onLifecycle`: hears each {@link DeviceAnnouncement}. */
export type LifecycleHandler = (event: DeviceEvent) => unknown

/** `onLifecycle` as a device keeps it, wrapped by `guardOnLifecycle`. It never throws. */
export type GuardedLifecycleHandler = (event: DeviceEvent) => Promise<void>

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
  vaultDB:           VaultDB
  /** Makes a key from a passphrase: `argon2idWebV1Deriver` from `safebyok-big/browser`, or your own. */
  keyDeriver:        Deriver.KeyDeriver
  /** Judges each new passphrase before the bank accepts it. Without one, every new passphrase is too weak. */
  strengthChecker?:  StrengthChecker | undefined
  /** Where the device reports what it has no caller to throw to. Default: the console. */
  logger?:           Logger.VaultLogger | undefined
  /** How long a lease lasts on this device, in minutes. `Infinity` lasts until locked. Default: 14 days. */
  autolockMinutes?:  number | undefined
  /** How near its end a lease asks the user again, in minutes: from then on, a call that wants the bank unlocked waits for an `unlock` gating, which renews the lease. At most a twentieth of the lease, and none under a minute. Default: 10. */
  softlockMinutes?:  number | undefined
  /** How often the device locks a lease past its end, and, while connected, starts the watch where it is not running and checks whether its gate is stale, in minutes. Autolock is a best-effort time, not a deadline. Default: 10. */
  janitorMinutes?:   number | undefined
  /** How long after this device last read the bank's gate it reads the gate again, with the bank and root box, in minutes. Default: 720, twelve hours. */
  gateStaleMinutes?: number | undefined
  /** Hears each refusal no caller waits on. Default: {@link DefaultOnBadNews}, a warning on the device's logger. */
  onBadNews?:        BadNewsHandler | undefined
  /** Hears what changed the device's lease, other than your own lock, unlock or disable: a lease taken up as the device signs in or connects, a lock or an unlock in another tab, the autolock, a softlock. Your own gate verb (replacing the passphrase, adding or revoking a passkey) announces `softlocked` in its own tab. Also hears each crossing from one stage to another as a `stage_crossed`, including those your own lock, unlock or disable cause, and a `watch_ended` where the device's watch of its bank ends of itself. What it throws or rejects with is reported to the platform. Default: {@link DefaultOnLifecycle}, which logs each announcement. */
  onLifecycle?:      LifecycleHandler | undefined
  /** The QueryClient the signed-in user's boxes are kept in, under their bank's key: your own, so one client serves your queries and the vault's. Default: one the device makes. */
  queryClient?:      QueryClient | undefined
  /** Where the device keeps the signed-in bank's three roots between page loads: hand it `localStorage`. Without one, nothing is kept, and each page load waits on the vaultDB for the bank. */
  rootShelf?:        RootShelf | undefined
  /** Where the device keeps the signed-in bank's lease, which every tab given the same one shares, and which outlasts a page load: `browserOpts()` from `safebyok/browser` hands an `IdbDeviceDB`. Default: one in the device's memory, so this tab's lease is its own and ends with the page. It keeps this device's devicetok for each user too. */
  deviceDB?:         DeviceDB | undefined
  /** The token each wayin this device builds records, a UUID, visible in storage. Default: the one the deviceDB keeps for the signed-in user, made at its first use. Make it at random, and another for each user: one shared by users, or derived from anything about the device, would link records the vault does not link. */
  devicetok?:        Devicetok | undefined
}
// --

// == [Snapshots]: bankStageVals, BankStage, RefusalSnapshot, WorldSnapshot, PendingWorld, SignedOutWorld

/** The stages of a bank, each described at {@link BankStage}. */
export const bankStageVals = ['signed_out', 'starting', 'unborn', 'locked', 'unlocked', 'disabled', 'failed'] as const
/** Where the user stands with their bank, for a host's screen to switch on:
 * - `'signed_out'` -- nobody is signed in, or the bank was vacated or signed out of
 * - `'starting'`   -- signed in, and the device's sign-in has not answered
 * - `'unborn'`     -- no bank is stored for this user, or it was deleted
 * - `'locked'`     -- the bank is stored, and needs the passphrase or passkey before a whisper can be read
 * - `'unlocked'`   -- the bank has a lease, and whispers can be read and written
 * - `'disabled'`   -- the device was disabled for good: everything was unloaded, and nothing follows
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
