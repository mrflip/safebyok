import { isEqual } from 'es-toolkit'
import { Errors, Phrases as BigPhrases, Validator, VX } from 'safebyok-big/internals'
import { Bank } from './bank'
import { BaseThing } from './base-thing'
import { Box } from './box'
import type { Device } from './device'
import { Gate } from './gate'
import type { Lease } from './lease'
import { type Adoptable, SeenChecks } from './thing'
import type { BankSnapshot, BankStage, HostedVault, WorldOpts } from '../shapes/shapes-bankish'
import { SignedOutBank } from '../shapes/shapes-bankish'
import type { LeaseGate, WorldGateFriend } from '../shapes/shapes-gateish'
import type * as Sealers from '../shapes/shapes-sealers'
import { type BankStamp, type LeaseLoggable, StampChecks } from '../shapes/shapes-stamps'
import { type BankRecord, type BoxRecord, type GateRecord, type Sparse, type ThingRecord, type Thingkind, Shell } from '../shapes/shapes-thing'
import type { SeenThing } from '../shapes/shapes-vault-event'
import { type EpochMillis, Labelpath } from '../shapes/primitives'
import { type SortedVaultDB, isSortedVaultDB } from '../storage/sorted-vault-db'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'

/** A Thing of the signed-in user's bank, as its world makes one: the bank, a gate or a box. */
export type WorldThing = Bank | Gate | Box

/** The signed-in user's bank as this device locks, unlocks and ends it: its lease, the wait for an unlock, its end, and its snapshot.
 * Made with its device, it lives as long. Its gates build leases and hand them to it, and boxes are sealed and unsealed under the lease it holds, which no member hands out.
 */
export class World {
  // == [Props]: #device, #sortedVaultDB, #lease, #unlockWait, #endCause, #vaults, #standIn, #snapshot, #subscribers, #getSnapshot, #subscribe

  readonly #device: Device

  /** The signed-in user's bank's records, sorted, from `hello`; null until then. */
  #sortedVaultDB: SortedVaultDB | null = null

  /** The attached lease, null while locked. */
  #lease: Lease | null = null

  /** The wait every call in {@link ensureUnlocked} shares, or null while none waits. */
  #unlockWait: Wait | null = null

  /** Why a sweep disabled the world, or null until then. */
  #endCause: Errors.VaultError | null = null

  /** The vaults made on the device's bank, which a sweep sweeps. */
  readonly #vaults = new Set<HostedVault>()

  /** The snapshot shown while the device has no bank, or null once it has one. */
  #standIn: BankSnapshot | null = SignedOutBank

  /** The current snapshot, which {@link getSnapshot} returns. */
  #snapshot: BankSnapshot
  readonly #subscribers = new Set<() => void>()
  readonly #getSnapshot = (): BankSnapshot => this.#snapshot
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#subscribers.add(VX.listener.parse(listener))
    return () => { this.#subscribers.delete(listener) }
  }
  // --

  // == [Getters]: sortedVaultDB, bank, gate, bankStamp, leaseEndsAt, leaseLoggable, getSnapshot, subscribe

  /** The signed-in user's bank's records, sorted, as handed to {@link hello}, or null until then. */
  get sortedVaultDB(): SortedVaultDB | null { return this.#sortedVaultDB }

  /** The bank's Thing in the {@link sortedVaultDB}, of whatever life, or null where no record of it has been heard of. */
  get bank(): Bank | null {
    const thing = this.#thingAt('bank')
    return (thing instanceof Bank) ? thing : null
  }

  /** The main gate's Thing in the {@link sortedVaultDB}, of whatever life, or null where no record of it has been heard of. */
  get gate(): Gate | null {
    const thing = this.#thingAt(Labelpath.MainGate)
    return (thing instanceof Gate) ? thing : null
  }

  /** The stamp of the bank's Thing, which every ctx under the bank binds first. Refuses `absent_thing` until a live bank is heard of. */
  get bankStamp(): BankStamp {
    const { bank } = this
    if (bank === null) { throw Throwers.thingNotLive('bank') }
    return bank.stamp
  }

  /** When the attached lease stops unlocking the bank, or null while locked. */
  get leaseEndsAt(): EpochMillis | null { return (this.#lease === null) ? null : this.#lease.proved_at + this.#device.leaseMillis }

  /** What a log wants of the attached lease, or null while locked. */
  get leaseLoggable(): LeaseLoggable | null { return this.#lease?.loggable ?? null }

  /** The snapshot getter of the device's bank, already bound, as `useSyncExternalStore` wants it: the same frozen object until the snapshot changes.
   * While the device has no bank, it is a stand-in at stage `'signed_out'`, `'starting'`, `'unborn'` or `'failed'`.
   */
  get getSnapshot(): () => BankSnapshot { return this.#getSnapshot }

  /** Subscribe a listener to the snapshot, returning its unsubscribe. Already bound, as `useSyncExternalStore` wants it.
   * The listener is called with no argument after each change: read the snapshot again. What it throws goes to the device's `tellBadNews`.
   */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  // --

  // == [Construction]: make, constructor, makeThing, makeGate, hello

  /** Make the world of `opts.device`, locked, showing nobody signed in. Internal: a device makes its own. */
  static make(opts: WorldOpts): World {
    const { device } = Checks.worldOpts.parse(opts)
    return new World(device)
  }

  private constructor(device: Device) {
    this.#device   = device
    this.#snapshot = this.#makeSnapshot()
    Object.freeze(this)
  }

  /** Make the Thing of `seen`, a record of the device's bank: a {@link Bank}, a {@link Gate} or a {@link Box}, by its modelkind. Nothing is fetched or stored.
   * Begun from a record that is not whole, the Thing holds its kind's shell, under the lives the record names above it: have it receive the record after.
   */
  makeThing(seen: BankRecord): Bank
  makeThing(seen: GateRecord): Gate
  makeThing(seen: BoxRecord): Box
  makeThing(seen: SeenThing): WorldThing
  makeThing(seen: SeenThing): WorldThing {
    const { labelpath } = SeenChecks.seenCited.parse(seen)
    Validator.checkedConsistent(StampChecks.bankScope.parse(seen), this.#device.scope, { kind: 'record_conflict' })
    const begun = BaseThing.isWhole(seen) ? seen : Shell.inParentLivesOf(seen)
    const thingClass: ThingClass = thingClassOf(Labelpath.modelkindOf(labelpath))
    return thingClass.make(begun, { device: this.#device }, this.#gateFriend())
  }

  // Scaffolding until a birth makes no gate before its record: a gate made here holds the bank's stamp it is
  // handed, where no bank's record may have been heard of yet.
  /** Make the gate of `record`, a whole gate record or its shell, of the bank stamped `bankStamp`, whose leases this world holds. Locked, and nothing is fetched or stored. */
  makeGate(record: GateRecord | Sealers.ShellOf<GateRecord>, bankStamp: BankStamp): Gate { return Gate.make(record, { device: this.#device, bankStamp }, this.#gateFriend()) }

  /** Take `sortedVaultDB`, the signed-in user's bank's records, sorted. A second call does nothing. */
  hello(sortedVaultDB: SortedVaultDB): void {
    Checks.sortedVaultDB.parse(sortedVaultDB)
    this.#sortedVaultDB ??= sortedVaultDB
  }
  // --

  // == [Stand-ins]: showStandIn, showBank
  // The device says what it has found of its bank; the world shows it.

  /** Show `standIn` as the snapshot while the device has no bank. Internal. */
  showStandIn(standIn: BankSnapshot): void {
    this.#standIn = standIn
    this.#align()
  }

  /** Show the device's bank, now that it has one, in place of a stand-in. Internal. */
  showBank(): void {
    this.#standIn = null
    this.#align()
  }
  // --

  // == [The awaited `unlock` gating]: ensureUnlocked, dismissUnlock, settleUnlockWait
  // One wait is shared by every caller, opened by the first and settled once: by any unlock, a dismissal or the world's end.

  /** Resolve this world once it is unlocked: at once, or when an `unlock` gating or a gate change lands.
   * While it waits, {@link isUnlockWanted} is true: render the unlock form, and call the gate's `unlock` from it.
   * Rejects `dismissed` when {@link dismissUnlock} is called, and with the world's `endCause` when it ends.
   */
  async ensureUnlocked(): Promise<this> {
    this.demandEnabled()
    if (this.isUnlocked) { return this }
    // Read here: a subscriber told of the wait may dismiss it or sweep the world, which clears #unlockWait.
    const wait = (this.#unlockWait ??= makeWait())
    this.#align()
    await wait.promise
    return this
  }

  /** Dismiss the awaited `unlock` gating: every call waiting in {@link ensureUnlocked} rejects `dismissed`, and the world stays locked.
   * Call it when the user closes the unlock form.
   */
  dismissUnlock(): this {
    this.#settleUnlockWait(Throwers.unlockDismissed())
    this.#align()
    return this
  }

  /** Settle the wait for an `unlock` gating, if one is open: resolve it for null, or reject it with `refusal`. */
  #settleUnlockWait(refusal: Errors.VaultError | null): void {
    const wait = this.#unlockWait
    this.#unlockWait = null
    if (refusal === null) { wait?.resolve() } else { wait?.reject(refusal) }
  }
  // --

  // == [The gate's friend]: gateFriend, leaseGateOf, attachLease

  /** This world's lease verbs, for a gate it makes to call. */
  #gateFriend(): WorldGateFriend {
    return {
      leaseGateOf: (bankStamp: BankStamp) => this.#leaseGateOf(bankStamp),
      renewal:     () => ((this.#lease === null) ? null : { born_at: this.#lease.born_at }),
      attachLease: (lease: Lease) => { this.#attachLease(lease) },
    }
  }

  /** This world as a lease granted under `bankStamp` reads it back. */
  #leaseGateOf(bankStamp: BankStamp): LeaseGate { return new WorldLeaseGate(this, bankStamp) }

  /** Attach `lease` in place of the current one, and resume every call waiting for an `unlock` gating.
   * On a disabled world, it evicts `lease` instead, and refuses.
   */
  #attachLease(lease: Lease): void {
    if (! this.isEnabled) {
      lease.evict()
      this.demandEnabled()
    }
    this.#lease?.evict()
    this.#lease = lease
    this.#settleUnlockWait(null)
    this.#align()
  }
  // --

  // == [Locking and sweeping]: lock, sweep, hostVault

  /** Lock the world: drop its lease and the keys in it. */
  lock(): this {
    this.#lease?.evict()
    this.#lease = null
    this.#align()
    return this
  }

  // It shuts first, so that a subscriber told of the end, or a vault as it is swept, finds every call refusing.
  /** End this world for good: drop its lease, reject every call waiting for an `unlock` gating, and sweep each vault it hosts.
   * Every call after meets `endCause`, or, left out, the device's end cause or a `disabled` refusal. An `endCause` that is not a refusal refuses `bad_record`; nothing else throws.
   * Its subscribers hear of the end, and of nothing after.
   */
  sweep(endCause: Errors.VaultError | null = null): this {
    Checks.endCause.parse(endCause)
    if (this.#endCause !== null) { return this }
    this.#endCause = endCause ?? this.#device.endCause ?? Throwers.bankSwept()
    this.#lease?.sweep()
    this.#lease = null
    this.#settleUnlockWait(this.#endCause)
    this.#align()
    for (const vault of this.#vaults) { vault.sweep() }
    this.#vaults.clear()
    this.#subscribers.clear()
    return this
  }

  /** Sweep `vault` when this world is swept. Internal.
   * Refuses once the world is swept.
   */
  hostVault(vault: HostedVault): void {
    Checks.hostedVault.parse(vault)
    this.demandEnabled()
    this.#vaults.add(vault)
  }
  // --

  // == [Sealing under the lease]: seal, unseal

  /** Seal and return the next revision after `donorProps`, as the lease's `seal` does. Needs the world unlocked.
   * The seal is bound to the stamp of the lease's bank, the revision's stamp and the sealer's tags.
   */
  seal<RecordT extends Sparse<ThingRecord>, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donorProps: Sealers.Sealable<RecordT>, publicProps: Sealers.TombstonePublicProps & Partial<Sealers.BodyOf<RecordT, CleartextsT>>,
  ): Promise<Sealers.TombstoneOf<RecordT>>
  seal<RecordT extends Sparse<ThingRecord>, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donorProps: Sealers.Sealable<RecordT>, publicProps: Sealers.LivePublicPropsOf<RecordT, CleartextsT>, secretProps: CleartextsT,
  ): Promise<Sealers.LiveOf<RecordT>>
  seal<RecordT extends Sparse<ThingRecord>, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donorProps: Sealers.Sealable<RecordT>, publicProps: Sealers.PublicPropsOf<RecordT, CleartextsT>, secretProps?: CleartextsT,
  ): Promise<RecordT>
  async seal<RecordT extends Sparse<ThingRecord>, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donorProps: Sealers.Sealable<RecordT>, publicProps: Sealers.PublicPropsOf<RecordT, CleartextsT>, secretProps?: CleartextsT,
  ): Promise<RecordT> {
    return await this.#demandLease().seal(sealer, donorProps, publicProps, secretProps)
  }

  /** Unseal `record`, returning it with the part `sealer` seals in cleartext, as the lease's `unseal` does. Needs the world unlocked.
   * Unsealing authenticates the ciphertexts, the stamp and the tags together: a change to any of them refuses as damaged.
   */
  async unseal<RecordT extends Sparse<ThingRecord>, CleartextsT>(sealer: Sealers.Sealer<RecordT, CleartextsT>, record: RecordT): Promise<Sealers.UnsealedOf<RecordT, CleartextsT>> {
    return await this.#demandLease().unseal(sealer, record)
  }
  // --

  // == [Guards]: isEnabled, endCause, isLocked, isUnlocked, isUnlockWanted, demandEnabled, demandRootsLive, demandLease, thingAt

  /** True until this world is swept or its device ends. */
  get isEnabled(): boolean { return this.endCause === null }

  /** The refusal every call meets once this world is swept or its device ends, or null while it is enabled. */
  get endCause(): Errors.VaultError | null { return this.#endCause ?? this.#device.endCause }

  /** True when no lease is attached. */
  get isLocked(): boolean { return this.#lease === null }

  /** True when a lease is attached. */
  get isUnlocked(): boolean { return this.#lease !== null }

  /** True while a call waits in {@link ensureUnlocked}: render the unlock form while it is. */
  get isUnlockWanted(): boolean { return this.#unlockWait !== null }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    const { endCause } = this
    if (endCause !== null) { throw endCause }
    return this
  }

  /** The bank's Thing, demanding that it, the main gate's and the root box's each hold a live record. */
  demandRootsLive(): Bank {
    const { bank, gate } = this
    if (bank?.pickle().am !== 'a') { throw Throwers.thingNotLive('bank') }
    if (gate?.pickle().am !== 'a') { throw Throwers.thingNotLive(Labelpath.MainGate) }
    const root = this.#thingAt(Labelpath.RootBox)
    if (! ((root instanceof Box) && (root.pickle().am === 'a'))) { throw Throwers.thingNotLive(Labelpath.RootBox) }
    return bank
  }

  /** The attached lease. Demands that the world is enabled and unlocked. */
  #demandLease(): Lease {
    this.demandEnabled()
    if (this.#lease === null) { throw Throwers.needUnlocked() }
    return this.#lease
  }

  /** The Thing at `labelpath` in the signed-in user's bank's SortedVaultDB, or undefined for none */
  #thingAt(labelpath: Labelpath): unknown { return this.#sortedVaultDB?.thingAt({ ...this.#device.scope, labelpath }) }
  // --

  // == [Snapshot]: align, makeSnapshot

  /** Remake the snapshot, and tell each subscriber if it changed. */
  #align(): void {
    const next = this.#makeSnapshot()
    if (isEqual(next, this.#snapshot)) { return }
    this.#snapshot = next
    for (const listener of this.#subscribers) {
      try {
        listener()
      } catch (err) {
        this.#device.tellBadNews([err])
      }
    }
  }

  /** A new snapshot of the device's bank, or the stand-in while it has none. */
  #makeSnapshot(): BankSnapshot {
    if (this.#standIn !== null) { return this.#standIn }
    // A sweep is the one way a bank ends, so an ended bank's stage is 'swept'.
    const { endCause } = this
    const isEnded  = endCause !== null
    const isLocked = isEnded || this.isLocked
    let stage: BankStage = isLocked ? 'locked' : 'unlocked'
    if (isEnded) { stage = 'swept' }
    return Object.freeze({
      stage,
      isLocked,
      isEnded,
      endCause,
      leaseEndsAt:    isEnded ? null : this.leaseEndsAt,
      lastErr:        null,
      isUnlockWanted: this.isUnlockWanted,
    })
  }
  // --
}

// == [Helpers]: ThingClass, thingClassOf, WorldLeaseGate, Wait, makeWait

/** The class a world makes a Thing of one kind from, as {@link World.makeThing} calls it. */
interface ThingClass {
  make(record: Adoptable<ThingRecord>, opts: { device: Device }, friend: WorldGateFriend): WorldThing
}

// Read as a world makes a Thing, not as this module loads: the model modules import one another, and a class may not be
// defined yet while this one loads.
/** The class of the Things of `modelkind` */
function thingClassOf(modelkind: Thingkind): ThingClass {
  return ({ bank: Bank, gate: Gate, box: Box } as const satisfies Record<Thingkind, ThingClass>)[modelkind]
}

// The stamp is pinned once per lease: every ctx under a lease binds the stamp it was granted under.
/** A world as one lease reads it back: the stamp of the bank the lease was granted under, and the world's lock and guards. */
class WorldLeaseGate implements LeaseGate {
  readonly bankStamp: BankStamp
  readonly #world:    World

  constructor(world: World, bankStamp: BankStamp) {
    this.bankStamp = Object.freeze(bankStamp)
    this.#world    = world
    Object.freeze(this)
  }

  /** True until the world is swept or its device ends. */
  get isEnabled(): boolean { return this.#world.isEnabled }

  /** Drop the world's lease, and the keys in it. */
  lock(): void { this.#world.lock() }

  /** Throw unless the world is enabled. */
  demandEnabled(): void { this.#world.demandEnabled() }
}

/** A promise, beside the functions that settle it. */
interface Wait {
  readonly promise: Promise<void>
  readonly resolve: () => void
  readonly reject:  (refusal: Errors.VaultError) => void
}

/** A new {@link Wait}, unsettled. */
function makeWait(): Wait {
  // The executor runs at once, so both are assigned before the promise is returned.
  let resolve!: Wait['resolve']
  let reject!:  Wait['reject']
  const promise = new Promise<void>((resolveWith, rejectWith) => {
    resolve = resolveWith
    reject  = rejectWith
  })
  return { promise, resolve, reject }
}
// --

// == [Checks]: Checks

// Defined here, not with the shapes: they name a model class.
/** The checks of {@link World.make}'s arguments, {@link World.hello}'s, {@link World.sweep}'s and {@link World.hostVault}'s. */
const Checks = Validator.Checkers('bad_record', ({ obj, custom }) => ({
  worldOpts:     obj({ device: custom<Device>() }),
  sortedVaultDB: custom<SortedVaultDB>(isSortedVaultDB, Phrases.SortedVaultDBExpected),
  endCause:      custom<Errors.VaultError>(Errors.isVaultError, BigPhrases.VaultErrorExpected).nullable(),
  hostedVault:   custom<HostedVault>((val) => typeof (val as Partial<HostedVault> | null)?.sweep === 'function', Phrases.HostedVaultExpected),
}))
// --
