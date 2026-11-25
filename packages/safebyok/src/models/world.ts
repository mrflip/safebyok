import { isEqual, noop } from 'es-toolkit'
import { Clock, type Errors, Outcome, Phrases as BigPhrases, SX, Validator, VX } from 'safebyok-big/internals'
import { Bank } from './bank'
import { BaseThing } from './base-thing'
import { Box } from './box'
import { Device } from './device'
import { Gate } from './gate'
import { BirthGating } from './gating'
import { Lease } from './lease'
import type { Proving } from './proving'
import { bulletproofHandlerOf } from '../helpers/bulletproof'
import type { BankStage, HostedVault, RefusalSnapshot, RootShelf, ThingMakeOpts, WorldOpts, WorldSnapshot } from '../shapes/shapes-bankish'
import { PendingWorld, SignedOutWorld, WorldChecks, isRootShelf } from '../shapes/shapes-bankish'
import type { BirthCleartexts, BirthDna, BirthGatingFriend, GateRevisionedStamp, LeaseGate, LeaseShellScope, WorldGateFriend } from '../shapes/shapes-gateish'
import { type MaskedViewLease, EmptyMaskedView } from '../shapes/shapes-masked-view'
import type * as Sealers from '../shapes/shapes-sealers'
import { type BankStamp, type LeaseLoggable, type LeaseRecord, type LeaseScope, LeaseLabelpath, StampChecks } from '../shapes/shapes-stamps'
import { type BankRecord, type BoxRecord, type BulletproofCallback, type GateRecord, type Sparse, type ThingRecord, type Thingkind, type VoidSentinel, PerKindChecks } from '../shapes/shapes-thing'
import { BankChecks, BoxChecks, GateChecks } from '../shapes/shapes-thingkinds'
import { type ReadTc, type SeenThing, type VaultEvent, type VaultItemEvent, SeenChecks } from '../shapes/shapes-vault-event'
import type { VaultStats } from '../shapes/shapes-vault-stats'
import { MaxTimerMillis } from '../shapes/shapes-vault-tsq'
import { type EpochMillis, type Lifetok, Labelpath } from '../shapes/primitives'
import { peekRoots, stowRoots } from '../minding/root-shelf'
import { itemEventOf } from '../storage/agerank'
import type { VaultMinder } from '../minding/vault-minder'
import { type ReceivingThing, isVaultMinder } from '../shapes/shapes-vault-minder'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'

/** A Thing of the signed-in user's bank, as its world makes one: the bank, a gate or a box. */
export type SomeThing = Bank | Gate | Box

/** The signed-in user's bank as this device locks, unlocks and connects it: its lease, the wait for an unlock, and its snapshot, which a host renders.
 * Made with its device, it lives as long. Its gates build leases and hand them to it, and boxes are sealed and unsealed under the lease it holds, which no member hands out.
 * While connected, its lease is the one its device's deviceDB stores, which every tab given that deviceDB shares: an unlock, a renewal or a lock in one tab reaches the rest.
 * Its snapshot's stage is read from the bank, the main gate and the root box its VaultMinder keeps, each of which it subscribes to, and from the lease.
 */
export class World {
  // == [Props]: #device, #vaultMinder, #lease, #unlockWait, #isConnected, #unlisten, #janitor, #lastErr, #vaults, #snapshot, #subscribers, #getSnapshot, #subscribe, #bulletproofCallback

  readonly #device: Device

  /** The signed-in user's bank's records, sorted, from `signin`; null until then. */
  #vaultMinder: VaultMinder | null = null

  /** The attached lease, null while locked. */
  #lease: Lease | null = null

  /** The wait every call in {@link ensureUnlocked} shares, or null while none waits. */
  #unlockWait: Wait | null = null

  /** True from {@link connect} until {@link disconnect}. */
  #isConnected = false

  /** Stops the deviceDB's listener, which runs from {@link connect} until {@link disconnect}; null otherwise. */
  #unlisten: (() => void) | null = null

  /** The janitor's timer, running from {@link signin} until the device is disabled; null otherwise. */
  #janitor: ReturnType<typeof setInterval> | null = null

  /** Why sign-in failed, or null while it has not. */
  #lastErr: RefusalSnapshot | null = null

  /** The vaults made on the device's bank, which connect and disconnect with this world. */
  readonly #vaults = new Set<HostedVault>()

  /** The current snapshot, which {@link getSnapshot} returns. */
  #snapshot: WorldSnapshot
  /** The stage the world was last at, or null before its first. */
  #stage: BankStage | null = null
  /** Each subscriber, beside its bulletproofed form, which is what is called. */
  readonly #subscribers = new Map<() => void, () => void>()
  readonly #getSnapshot = (): WorldSnapshot => this.#snapshot
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#subscribers.set(VX.listener.parse(listener), this.#bulletproofCallback(listener))
    return () => { this.#subscribers.delete(listener) }
  }
  readonly #bulletproofCallback: BulletproofCallback = (callback) => bulletproofHandlerOf(callback, {
    ifError: 'tell', transformer: Throwers.refusalOfThrown, onBadNews: (news) => { this.#device.tellBadNews([news]) },
  })
  // --

  // == [Getters]: vaultMinder, bank, gate, rootBox, bankStamp, leaseEndsAt, leaseLoggable, getSnapshot, subscribe, bulletproofCallback, device

  /** The signed-in user's bank's records, sorted, as handed to {@link signin}, or null until then. */
  get vaultMinder(): VaultMinder | null { return this.#vaultMinder }

  /** The bank's Thing in the {@link vaultMinder}, of whatever life, or null where no record of it has been heard of. */
  get bank(): Bank | null {
    const thing = this.#thingAt('bank')
    return (thing instanceof Bank) ? thing : null
  }

  /** The main gate's Thing in the {@link vaultMinder}, of whatever life, or null where no record of it has been heard of. */
  get gate(): Gate | null {
    const thing = this.#thingAt(Labelpath.MainGate)
    return (thing instanceof Gate) ? thing : null
  }

  /** The root box's Thing in the {@link vaultMinder}, of whatever life, or null where no record of it has been heard of. */
  get rootBox(): Box | null {
    const thing = this.#thingAt(Labelpath.RootBox)
    return (thing instanceof Box) ? thing : null
  }

  /** The stamp of the bank's Thing, which every ctx under the bank binds first. Refuses `absent_thing` until a live bank is heard of. */
  get bankStamp(): BankStamp {
    const { bank } = this
    if (bank === null) { throw Throwers.thingNotLive('bank') }
    return bank.stamp
  }

  // Every read of the lease's end goes through here: the janitor's, and isSoftlocked's.
  /** When the attached lease stops unlocking the bank, or null while locked. */
  get leaseEndsAt(): EpochMillis | null { return this.#lease?.ends_at ?? null }

  /** What a log wants of the attached lease, or null while locked. */
  get leaseLoggable(): LeaseLoggable | null { return this.#lease?.loggable ?? null }

  /** This world's snapshot getter, already bound, as `useSyncExternalStore` wants it: the same frozen object until the snapshot changes.
   * Until the bank, its main gate and its root box are live, its stage is `'signed_out'`, `'starting'`, `'unborn'` or `'failed'`.
   */
  get getSnapshot(): () => WorldSnapshot { return this.#getSnapshot }

  /** Subscribe a listener to the snapshot, returning its unsubscribe. Already bound, as `useSyncExternalStore` wants it.
   * The listener is called with no argument after each change: read the snapshot again. What it throws goes to the device's `tellBadNews`.
   */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }

  /** Wrap `callback`, one the core keeps for someone else, so that what it throws goes to the device's `onBadNews`, never to whoever calls it. Already bound. */
  get bulletproofCallback(): BulletproofCallback { return this.#bulletproofCallback }

  /** The device this world is of. */
  get device(): Device { return this.#device }
  // --

  // == [Construction]: make, constructor, makeThing

  /** Make the world of `opts.device`, locked, showing nobody signed in. Internal: a device makes its own. */
  static make(opts: WorldOpts): World {
    const { device } = Checks.worldOpts.parse(opts)
    return new World(device)
  }

  private constructor(device: Device) {
    this.#device   = device
    this.#snapshot = this.#makeSnapshot()
    this.#setStage(this.#snapshot.stage)
    Object.freeze(this)
  }

  // A root's Thing is subscribed to before it receives its first record, so that this world hears of that record too.
  /** Make the Thing at `begun`, of the device's bank: a {@link Bank}, a {@link Gate} or a {@link Box}, by its modelkind. Nothing is fetched or stored.
   * Made from the shell, it holds the shell; made from an item event, it receives the event after, and throws where it refuses its record.
   * What its subscribers throw goes to the device's `onBadNews`.
   */
  makeThing(begun: VaultItemEvent<BankRecord>): Bank
  makeThing(begun: VaultItemEvent<GateRecord>): Gate
  makeThing(begun: VaultItemEvent<BoxRecord>): Box
  makeThing(begun: VoidSentinel | VaultItemEvent): SomeThing
  makeThing(begun: VoidSentinel | VaultItemEvent): SomeThing {
    SeenChecks.begun.parse(begun)
    const seen = ('eventkind' in begun) ? begun.val : begun
    Validator.checkedConsistent(StampChecks.bankScope.parse(seen), this.#device.scope, { kind: 'record_conflict' })
    const thingClass: ThingClass = thingClassOf(Labelpath.modelkindOf(seen.labelpath))
    const thing = thingClass.make(BaseThing.shellOf(seen), { world: this }, this.#gateFriend())
    if (RootLabelpaths.has(seen.labelpath)) { thing.subscribe(() => { this.#hearRoot() }) }
    if ('eventkind' in begun) { receiveFirst(thing, begun) }
    return thing
  }
  // --

  // == [Signing in]: signin, seedFromShelf, keepOnShelf, showSigninRefusal, birthGating, birthFriend

  // Its Things are seeded before it listens to keep them on the shelf, which would only put back what it read.
  /** Take `vaultMinder`, the signed-in user's bank's records, sorted, whose Things this world makes; seed them from the roots `shelf` keeps, and keep the roots there from then on. A second call does nothing.
   * With no shelf, the roots are kept nowhere between page loads. The janitor starts, and where this world is connected, the VaultMinder starts watching the vaultDB.
   */
  signin(vaultMinder: VaultMinder, shelf: RootShelf | null): void {
    Checks.signinArgs.parse({ vaultMinder, shelf })
    if (this.#vaultMinder !== null) { return }
    this.#vaultMinder = vaultMinder
    if (shelf !== null) {
      this.#seedFromShelf(vaultMinder, shelf)
      this.#keepOnShelf(vaultMinder, shelf)
    }
    if (this.#isConnected) { this.#startWatch() }
    this.#startJanitor()
    this.align()
  }

  // Each root is told apart, so a damaged one is news, and the rest still reach their Things.
  /** Hand `vaultMinder` each root `shelf` keeps of the device's bank, read when the shelf says it was. */
  #seedFromShelf(vaultMinder: VaultMinder, shelf: RootShelf): void {
    const roots   = peekRoots(shelf, this.#device.scope)
    const banktok = banktokOf(roots[0])
    for (const root of roots) {
      try { vaultMinder.receive(shelvedEventOf(Checks.shelvedRoot.parse(root), banktok)) } catch (err) { this.#device.tellBadNews([err]) }
    }
  }

  // The Things hear each root first, so the roots put are the ones this world shows.
  /** Put this world's roots on `shelf` at each root `vaultMinder` tells of, or remove them while they are not all live. */
  #keepOnShelf(vaultMinder: VaultMinder, shelf: RootShelf): void {
    const hear = this.#bulletproofCallback((event: VaultEvent) => {
      if ((event.eventkind === 'item') && RootLabelpaths.has(event.labelpath)) { stowRoots(shelf, this.#device.scope, this) }
    })
    // The onBadNews of the vault TSQ, listening beside it, tells the device of the same record refused.
    vaultMinder.listen({ hear, onBadNews: noop })
  }

  /** Show `err` as the snapshot's `lastErr`, at stage `'failed'`, while the bank's roots are not all live. Internal: the device's sign-in calls it. */
  showSigninRefusal(err: unknown): void {
    this.#lastErr = refusalSnapshotOf(err)
    this.align()
  }

  /** The gating of a birth of the device's bank over `params`: once its bank is live here, it unlocks this world. Internal: make one with `device.birthGating`. */
  birthGating(params: FormData | BirthDna | BirthCleartexts): BirthGating { return new BirthGating(this.#device, params, this.#birthFriend()) }

  /** This world's lease verbs, for a birth's gating to call. */
  #birthFriend(): BirthGatingFriend {
    return {
      leaseByProving: async (proving: Proving, bankStamp: BankStamp, cited: GateRevisionedStamp) => await proving.buildLease(this.#leaseGateOf(bankStamp), cited, await this.#leaseFollowed(cited)),
      attachLease:    (lease: Lease) => { this.#attachAndStow(lease) },
    }
  }
  // --

  // == [The awaited `unlock` gating]: ensureUnlocked, dismissUnlock, settleUnlockWait
  // One wait is shared by every caller, opened by the first and settled once: by any unlock, a dismissal or the device's disable.

  /** Resolve this world once it is unlocked and not softlocked ({@link isSoftlocked}): at once, or when an `unlock` gating or a gate change lands.
   * While it waits, {@link isUnlockWanted} is true: render the unlock form, and call the gate's `unlock` from it. Near the
   * lease's end, that is so even while the world shows unlocked, and the `unlock` gating renews the lease.
   * Rejects `dismissed` when {@link dismissUnlock} is called, and with the device's end cause when it is disabled. A {@link disconnect} leaves it waiting.
   */
  async ensureUnlocked(): Promise<this> {
    this.demandEnabled()
    if (! this.isSoftlocked) { return this }
    // Read here: a subscriber told of the wait may dismiss it, which clears #unlockWait.
    const wait = (this.#unlockWait ??= makeWait())
    this.align()
    await wait.promise
    return this
  }

  /** Dismiss the awaited `unlock` gating: every call waiting in {@link ensureUnlocked} rejects `dismissed`, and the world stays as it was, locked or near its lease's end.
   * Call it when the user closes the unlock form.
   */
  dismissUnlock(): this {
    this.#settleUnlockWait(Throwers.unlockDismissed())
    this.align()
    return this
  }

  /** Settle the wait for an `unlock` gating, if one is open: resolve it for null, or reject it with `refusal`. */
  #settleUnlockWait(refusal: Errors.VaultError | null): void {
    const wait = this.#unlockWait
    this.#unlockWait = null
    if (refusal === null) { wait?.resolve() } else { wait?.reject(refusal) }
  }
  // --

  // == [The gate's friend]: gateFriend, leaseGateOf, leaseFollowed, attachAndStow, attachLease, dropLease

  /** This world's lease verbs, for a gate it makes to call. */
  #gateFriend(): WorldGateFriend {
    return {
      leaseGateOf:   (bankStamp: BankStamp) => this.#leaseGateOf(bankStamp),
      leaseFollowed: async (gateScope: LeaseShellScope) => await this.#leaseFollowed(gateScope),
      attachLease:   (lease: Lease) => { this.#attachAndStow(lease) },
    }
  }

  /** This world as a lease granted under `bankStamp` reads it back. */
  #leaseGateOf(bankStamp: BankStamp): LeaseGate { return new WorldLeaseGate(this, bankStamp) }

  // A grant follows the deviceDB, so one after a lock in any tab starts the life after that lock's tombstone. It follows
  // this world's lease where that is newer, as a softlock not yet stowed is.
  /** The Thing fields a lease granted under the gate at `gateScope` follows: the lease record stored, or this world's lease where none is stored or this one is newer, or else the gate's lease shell. */
  async #leaseFollowed(gateScope: LeaseShellScope): Promise<Sparse<LeaseRecord>> {
    const shell  = Lease.shellOf(gateScope)
    const { userid, banklabel, labelpath } = shell
    const stored = await this.#peekStored({ userid, banklabel, labelpath })
    if (this.#isNewerThanLease(stored)) { return this.#endedIfStale(stored) }
    return this.#lease ?? shell
  }

  // A renewal happens only while a lease is granted: a grant after the stored lease has ended, as when every tab closed
  // past its end, starts the next life.
  /** The record a grant follows over `stored`: its tombstone, written now, where `stored` is live but can no longer unlock the bank, or else `stored` itself */
  #endedIfStale(stored: LeaseRecord): Sparse<LeaseRecord> {
    const isStale = (stored.am === 'a') && ! this.#canUnlock(stored)
    return isStale ? Lease.tombstoneOf(stored) : stored
  }

  /** Attach `lease`, and stow it in the deviceDB for every tab to take up. */
  #attachAndStow(lease: Lease): void {
    this.#attachLease(lease)
    void this.#stowLease(lease)
  }

  /** Attach `lease` in place of the current one, and resume every call waiting for an `unlock` gating, unless the lease is near its end ({@link isSoftlocked}).
   * On a disabled world, it evicts `lease` instead, and refuses.
   */
  #attachLease(lease: Lease): void {
    if (! this.isEnabled) {
      lease.evict()
      this.demandEnabled()
    }
    this.#lease?.evict()
    this.#lease = lease
    if (! this.isSoftlocked) { this.#settleUnlockWait(null) }
    this.align()
  }

  /** Drop this world's lease, and the keys in it, in this tab alone: the deviceDB keeps what it stores. */
  #dropLease(): void {
    this.#lease?.evict()
    this.#lease = null
    this.align()
  }
  // --

  // == [Locking and connecting]: lock, connect, disconnect, disable, hostVault, #startWatch, #startListening, #stopListening

  // #lock-is-intent: a lock asks the user again at the next promptable action, and is not an alarm. A seal under way
  // finishes; an unseal under way returns no cleartext.
  /** Lock the world: drop its lease and the keys in it, and stow the lease's tombstone in the deviceDB, which locks every tab sharing it. */
  lock(): this {
    const lease = this.#lease
    this.#dropLease()
    if (lease !== null) { void this.#stowTombstoneOf(lease) }
    return this
  }

  // The watch starts before the vaults hear it, so that what a vault refetches as it connects is fetched under the watch.
  /** Start what this world keeps running: its VaultMinder's watch of the vaultDB, once someone signs in, the deviceDB's listener, and each vault it hosts hearing the VaultMinder; and take up the lease the deviceDB stores. Never throws; a call once the device is disabled does nothing.
   * What the host's vaultDB or deviceDB throws goes to the device's `onBadNews`; a later call, or the janitor's next tick, starts the watch again. A call while the watch runs leaves it running.
   */
  connect(): this {
    if (! this.isEnabled) { return this }
    this.#isConnected = true
    this.#startWatch()
    this.#startListening()
    void this.#followStored()
    for (const vault of this.#vaults) { vault.connect() }
    return this
  }

  // A disconnect drops this tab's lease alone, and stows no tombstone: one tab unmounting its provider locks no other.
  // Only a lock, the janitor's autolock among them, ends the lease in every tab.
  /** Drop this world's lease in this tab alone, and stop what it keeps running: the deviceDB's listener, each vault it hosts hearing the VaultMinder, and the VaultMinder's watch of the vaultDB. Never throws; calling it twice in a row is the same as once.
   * The world stays enabled: its verbs still work, a call waiting in {@link ensureUnlocked} still waits, and {@link connect} resumes it, taking up the lease the deviceDB stores.
   * What the host's vaultDB or deviceDB throws as they stop goes to the device's `onBadNews`.
   */
  disconnect(): this {
    this.#isConnected = false
    this.#dropLease()
    this.#stopListening()
    for (const vault of this.#vaults) { vault.disconnect() }
    try { this.#vaultMinder?.disconnect() } catch (err) { this.#device.tellBadNews([err]) }
    return this
  }

  // Only a lock ends the lease in every tab: a disable, as a disconnect, drops this tab's lease alone.
  /** Reject every call waiting in {@link ensureUnlocked} with the device's end cause, stop the janitor, and {@link disconnect}. Internal: call `device.disable`, which ends the device first. */
  disable(): this {
    this.#settleUnlockWait(this.endCause)
    this.#stopJanitor()
    return this.disconnect()
  }

  /** Connect and disconnect `vault` with this world, from now on: at once, where this world is connected. Internal.
   * Refuses once the world has ended.
   */
  hostVault(vault: HostedVault): void {
    WorldChecks.hostedVault.parse(vault)
    this.demandEnabled()
    this.#vaults.add(vault)
    if (this.#isConnected) { vault.connect() }
  }

  /** Start the VaultMinder's watch, where someone has signed in, telling the device's `onBadNews` what the host's vaultDB throws, and announcing the watch's end where it ends of itself */
  #startWatch(): void {
    if (this.#vaultMinder === null) { return }
    try { this.#vaultMinder.connect(() => { this.#device.announce({ kind: 'watch_ended' }) }) } catch (err) { this.#device.tellBadNews([err]) }
  }

  /** Follow the lease the deviceDB stores each time any tab stows one, where the listener is not running already, telling the device's `onBadNews` what the deviceDB throws */
  #startListening(): void {
    try { this.#unlisten ??= this.#device.deviceDB.listen(() => { void this.#followStored() }) } catch (err) { this.#device.tellBadNews([err]) }
  }

  /** Stop the deviceDB's listener, where it runs, telling the device's `onBadNews` what the deviceDB throws */
  #stopListening(): void {
    try { this.#unlisten?.() } catch (err) { this.#device.tellBadNews([err]) }
    this.#unlisten = null
  }
  // --

  // == [Following the stored lease]: followStored, isNewerThanLease, takeUp, canUnlock, softlockPastGate, peekStored, stowLease, stowTombstoneOf
  // Each tab's lease is the one the deviceDB stores, compared by life, then revision. The newest stow wins there, so a
  // late stow never brings a locked lease back. A stow or a peek refused is bad news, and the tab keeps its lease.

  /** Make this world's lease the one the deviceDB stores for the main gate, where that one is newer, then softlock it where the gate has moved past it. Does nothing until the roots are live. Never throws: a refusal goes to the device's `onBadNews`. */
  async #followStored(): Promise<void> {
    if (! this.areRootsLive) { return }
    const stored = await this.#peekStored({ ...this.#device.scope, labelpath: LeaseLabelpath.of(Labelpath.MainGate) })
    try {
      if (this.#isNewerThanLease(stored)) { this.#takeUp(stored) }
      this.#softlockPastGate()
    } catch (err) {
      this.#device.tellBadNews([err])
    }
  }

  /** True of a lease record newer than this world's lease, by life then revision; any record is newer than none */
  #isNewerThanLease(stored: LeaseRecord | null): stored is LeaseRecord {
    return (stored !== null) && ((this.#lease === null) || (BaseThing.cmp(this.#lease, stored) > 0))
  }

  /** Attach the Lease of `stored` where it can unlock the bank, or else drop this world's lease where it has one, announcing either */
  #takeUp(stored: LeaseRecord): void {
    if ((stored.am === 'a') && this.#canUnlock(stored)) {
      this.#attachLease(Lease.make(stored, { gate: this.#leaseGateOf(this.bankStamp) }))
      this.#device.announce({ kind: 'lease_taken_up' })
    } else if (this.isUnlocked) {
      this.#dropLease()
      this.#device.announce({ kind: 'lock_taken_up' })
    }
  }

  /** True of a live lease record not past its end, granted under the main gate's life */
  #canUnlock(stored: Sealers.LiveOf<LeaseRecord>): boolean {
    const { gate } = this
    return (Clock.nowMillis() < stored.ends_at) && (stored.gate_labelpath === gate?.labelpath) && (stored.gate_lifeseq === gate.lifeseq)
  }

  // A softlock only ever brings the end nearer, so every tab that hears the same gate change writes the same revision,
  // and the first stow keeps it (notes/wontfix.md).
  /** Attach, stow and announce the next revision of this world's lease, ending the device's `softlockMillis` from now, where the gate has moved past the revision the lease cites and that end is the nearer */
  #softlockPastGate(): void {
    const lease = this.#lease
    const gateRevseq = this.gate?.revseq ?? SX.VoidRevisionSeq
    const ends_at = Clock.nowMillis() + this.#device.softlockMillis
    if ((lease === null) || (gateRevseq <= lease.gate_revseq) || (ends_at >= lease.ends_at)) { return }
    this.#attachAndStow(lease.nextEndingAt(ends_at))
    this.#device.announce({ kind: 'softlocked' })
  }

  /** The lease record the deviceDB stores at `leaseScope`, or null for none, or where the deviceDB refuses, which goes to the device's `onBadNews` */
  async #peekStored(leaseScope: LeaseScope): Promise<LeaseRecord | null> {
    try {
      return await this.#device.deviceDB.peekLease(leaseScope)
    } catch (err) {
      this.#device.tellBadNews([err])
      return null
    }
  }

  /** Stow `lease` in the deviceDB, telling the device's `onBadNews` where it refuses: this world keeps the lease either way */
  async #stowLease(lease: Lease): Promise<void> {
    try { await lease.stow(this.#device.deviceDB) } catch (err) { this.#device.tellBadNews([err]) }
  }

  /** Stow the tombstone of `lease` in the deviceDB, telling the device's `onBadNews` where it refuses */
  async #stowTombstoneOf(lease: Lease): Promise<void> {
    try { await this.#device.deviceDB.stowLease(Lease.tombstoneOf(lease)) } catch (err) { this.#device.tellBadNews([err]) }
  }
  // --

  // == [The janitor]: #startJanitor, #stopJanitor, #tidy, #lockPastLeaseEnd, #tidyConnected, #isGateStale, #refreshRoots
  // It runs from sign-in until the device is disabled, connected or not: a lease unlocked while disconnected still ends.

  /** Start the janitor, which tidies every `janitorMillis` of the device, unless the device is disabled; a second call does nothing */
  #startJanitor(): void {
    if ((this.#janitor !== null) || ! this.isEnabled) { return }
    this.#janitor = setInterval(() => { this.#tidy() }, Math.min(this.#device.janitorMillis, MaxTimerMillis))
  }

  /** Stop the janitor, where it runs */
  #stopJanitor(): void {
    if (this.#janitor !== null) { clearInterval(this.#janitor) }
    this.#janitor = null
  }

  /** Lock this world once its lease has passed its end, and, while connected, start a watch that is not running and read the roots again once the gate is stale. Never throws: a refusal goes to the device's `onBadNews`. */
  #tidy(): void {
    try {
      this.#lockPastLeaseEnd()
      if (this.#isConnected) { this.#tidyConnected() }
    } catch (err) {
      this.#device.tellBadNews([err])
    }
  }

  // #lock-is-intent: autolock is a best-effort time, not a deadline. A lease past its end still seals and unseals until
  // the next tick, which may come a janitor period late, or later while the page sleeps. Meanwhile isSoftlocked holds,
  // so a call to ensureUnlocked asks the user first.
  /** Lock this world, and announce it, where its lease has passed its end */
  #lockPastLeaseEnd(): void {
    const { leaseEndsAt } = this
    if ((leaseEndsAt === null) || (Clock.nowMillis() < leaseEndsAt)) { return }
    this.lock()
    this.#device.announce({ kind: 'autolocked' })
  }

  /** Start the VaultMinder's watch where it is not running, and read the roots again where the gate is stale */
  #tidyConnected(): void {
    if (! this.demandVaultMinder().isWatching) { this.#startWatch() }
    if (this.#isGateStale()) { void this.#refreshRoots() }
  }

  // Each tab judges for itself, by when it last read the gate: a gate never read is not stale.
  /** True where the main gate was last read more than the device's `gateStaleMillis` ago */
  #isGateStale(): boolean {
    const car = this.#vaultMinder?.carAt({ ...this.#device.scope, labelpath: Labelpath.MainGate })
    return (car !== undefined) && (Clock.nowMillis() - car.read_at > this.#device.gateStaleMillis)
  }

  /** Get the bank, the main gate and the root box from the vaultDB, past anything kept here, telling the device's `onBadNews` of a refusal */
  async #refreshRoots(): Promise<void> {
    try {
      const answer = await this.demandVaultMinder().tryGetWorldOnce()
      if (! answer.ok) { this.#device.tellBadNews([answer.err]) }
    } catch (err) {
      this.#device.tellBadNews([err])
    }
  }
  // --

  // == [Stats]: stats, tryStats

  /** The bank's storage stats, read from the vaultDB once: how many boxes and gates it stores, live and in all, their size in bytes, and the store's limits.
   * Needs no unlock. Nothing refuses a write for being over a limit.
   * @example
   *   const { box, gate, max } = await world.stats()
   *   const isNearlyFull = (box.size + gate.size) > 0.9 * max.size
   */
  async stats(): Promise<VaultStats> {
    this.demandRootsLive()
    this.demandEnabled()
    return Outcome.valOf(await this.demandVaultMinder().tryStatsOnce())
  }

  /** {@link stats}, resolving an `Outcome` instead of throwing. */
  tryStats(): Promise<Outcome.Outcome<VaultStats>> { return Outcome.outcomeOf(() => this.stats()) }
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

  // == [Guards]: isEnabled, endCause, isLocked, isSoftlocked, isUnlocked, isUnlockWanted, areRootsLive, demandEnabled, demandRootsLive, demandVaultMinder, demandLease, thingAt

  /** True until its device ends. */
  get isEnabled(): boolean { return this.endCause === null }

  /** The refusal every call meets once its device ends, or null while it is enabled. */
  get endCause(): Errors.VaultError | null { return this.#device.endCause }

  /** True when no lease is attached. */
  get isLocked(): boolean { return this.#lease === null }

  /** True when locked, or once the attached lease is within the device's `softlockMillis` of its end: {@link ensureUnlocked} then waits for an `unlock` gating, which renews the lease.
   * Seals and unseals still run until the world locks.
   */
  get isSoftlocked(): boolean {
    const { leaseEndsAt } = this
    return (leaseEndsAt === null) || (Clock.nowMillis() >= leaseEndsAt - this.#device.softlockMillis)
  }

  /** True when a lease is attached. */
  get isUnlocked(): boolean { return this.#lease !== null }

  /** True while a call waits in {@link ensureUnlocked}: render the unlock form while it is. */
  get isUnlockWanted(): boolean { return this.#unlockWait !== null }

  /** True while the bank's, the main gate's and the root box's Things each hold a live record. */
  get areRootsLive(): boolean { return isLive(this.bank) && isLive(this.gate) && isLive(this.rootBox) }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    const { endCause } = this
    if (endCause !== null) { throw endCause }
    return this
  }

  /** The bank's Thing, demanding that it, the main gate's and the root box's each hold a live record. */
  demandRootsLive(): Bank {
    const { bank } = this
    if (! isLive(bank)) { throw Throwers.thingNotLive('bank') }
    if (! isLive(this.gate)) { throw Throwers.thingNotLive(Labelpath.MainGate) }
    if (! isLive(this.rootBox)) { throw Throwers.thingNotLive(Labelpath.RootBox) }
    return bank
  }

  /** The {@link vaultMinder}, refusing until {@link signin}. */
  demandVaultMinder(): VaultMinder {
    if (this.#vaultMinder === null) { throw Throwers.nobodySignedIn() }
    return this.#vaultMinder
  }

  /** The attached lease. Demands that the world is enabled and unlocked. */
  #demandLease(): Lease {
    this.demandEnabled()
    if (this.#lease === null) { throw Throwers.needUnlocked() }
    return this.#lease
  }

  /** The Thing at `labelpath` in the signed-in user's bank's VaultMinder, or undefined for none */
  #thingAt(labelpath: Labelpath): unknown { return this.#vaultMinder?.thingAt({ ...this.#device.scope, labelpath }) }
  // --

  // == [Snapshot]: hearRoot, align, stageOf, setStage, makeSnapshot

  // The three roots may arrive in any order, one at a time: a set of them partly live is never shown as a stage of its
  // own. The last of them to land live brings `'locked'`, so a birth shows no stage between `'unborn'` and `'locked'`.
  // The softlock is at once, so a grant under way in this tab follows it; the lease stored is taken up once the roots
  // are live, as when they first arrive.
  /** Softlock the lease where the gate has moved past it; while connected, follow the lease the deviceDB stores; and realign, once all three roots are live or the bank holds no live record. */
  #hearRoot(): void {
    this.#softlockPastGate()
    if (this.#isConnected) { void this.#followStored() }
    if (this.areRootsLive || ! isLive(this.bank)) { this.align() }
  }

  /** Remake the snapshot, and tell each subscriber if it changed. Internal: the device calls it once someone signs in. */
  align(): void {
    const next = this.#makeSnapshot()
    if (isEqual(next, this.#snapshot)) { return }
    this.#snapshot = next
    this.#setStage(next.stage)
    for (const told of this.#subscribers.values()) { told() }
  }

  /** The stage the snapshot shows, the first that holds. */
  #stageOf(): BankStage {
    if (this.endCause !== null)       { return 'disabled' }
    if (this.#device.userid === null) { return 'signed_out' }
    if (this.areRootsLive)            { return this.isLocked ? 'locked' : 'unlocked' }
    if (this.#lastErr !== null)       { return 'failed' }
    const { bank } = this
    return ((bank === null) || isLive(bank)) ? 'starting' : 'unborn'
  }

  /** Record `stage` as the world's stage, announcing the crossing from the one before it. */
  #setStage(stage: BankStage): void {
    const from = this.#stage
    this.#stage = stage
    if ((from !== null) && (from !== stage)) { this.#device.announce({ kind: 'stage_crossed', from, to: stage }) }
  }

  /** A new snapshot of this world. */
  #makeSnapshot(): WorldSnapshot {
    const stage = this.#stageOf()
    if (stage === 'signed_out') { return SignedOutWorld }
    if (stage === 'starting')   { return PendingWorld }
    if (stage === 'unborn')     { return Object.freeze({ ...PendingWorld, stage }) }
    if (stage === 'failed')     { return Object.freeze({ ...PendingWorld, stage, lastErr: this.#lastErr }) }
    const { endCause } = this
    const isEnded = endCause !== null
    return Object.freeze({
      stage,
      isLocked:       stage !== 'unlocked',
      isEnded,
      endCause,
      leaseEndsAt:    isEnded ? null : this.leaseEndsAt,
      lastErr:        null,
      isUnlockWanted: this.isUnlockWanted,
    })
  }
  // --

  // == [A devtool's view]: inspectable

  // The world hands out no lease: what leaves is its loggable.
  /** The attached lease's loggable and when it ends, for a devtool, or only `active: false` while locked or while the roots are not all live.
   * For experimenting, never for an app's own logic: what it answers may change without notice.
   */
  inspectable(): MaskedViewLease {
    const { leaseLoggable, leaseEndsAt } = this
    if ((leaseLoggable === null) || (leaseEndsAt === null) || ! this.areRootsLive) { return EmptyMaskedView.lease }
    return { active: true, ...leaseLoggable, ends_at: leaseEndsAt }
  }
  // --
}

// == [Helpers]: RootLabelpaths, ShelvedSourcelabel, banktokOf, shelvedEventOf, ThingClass, receiveFirst, thingClassOf, isLive, refusalSnapshotOf, WorldLeaseGate, Wait, makeWait

/** The labelpaths of the bank's roots, which the stage is read from. */
const RootLabelpaths: ReadonlySet<Labelpath> = new Set(['bank', Labelpath.MainGate, Labelpath.RootBox])

/** The `sourcelabel` of the events of the roots a world read from its root shelf. */
const ShelvedSourcelabel = 'root_shelf'

/** The lifetok of the root shelved in `shelved`, where it is a live bank's record, else the void lifetok, as the events of the roots shelved carry it */
function banktokOf(shelved: unknown): Lifetok {
  const report = Checks.shelvedBank.safeParse(shelved)
  return (report.success && (report.data.record.am === 'a')) ? report.data.record.lifetok : SX.VoidLifeTok
}

/** The `item` event of `record`, a root read from a root shelf, read at its `read_tc` in the bank of `banktok`, with the vacant agerank */
function shelvedEventOf({ record, read_tc }: Readonly<{ record: SeenThing, read_tc: ReadTc }>, banktok: Lifetok): VaultEvent {
  return itemEventOf(record, { sourcelabel: ShelvedSourcelabel, read_tc, banktok })
}

/** The class a world makes a Thing of one kind from, as {@link World.makeThing} calls it. */
interface ThingClass {
  make(begun: VoidSentinel | VaultItemEvent, opts: ThingMakeOpts, friend: WorldGateFriend): SomeThing
}

/** Have `thing`, which has received nothing, receive `event` */
function receiveFirst(thing: ReceivingThing, event: VaultItemEvent): void { thing.receive(event) }

// Read as a world makes a Thing, not as this module loads: the model modules import one another, and a class may not be
// defined yet while this one loads.
/** The class of the Things of `modelkind` */
function thingClassOf(modelkind: Thingkind): ThingClass {
  return ({ bank: Bank, gate: Gate, box: Box } as const satisfies Record<Thingkind, ThingClass>)[modelkind]
}

/** True of a Thing holding a live record; false of one holding the shell or a tombstone, and of none */
function isLive<ThingT extends SomeThing>(thing: ThingT | null): thing is ThingT { return thing?.pickle().am === 'a' }

/** What a snapshot shows of `err`: its refusal's kind, family and message, anything but a refusal as an unexpected error */
function refusalSnapshotOf(err: unknown): RefusalSnapshot {
  const { refusalkind, family, message } = Throwers.refusalOfThrown(err)
  return Object.freeze({ refusalkind, family, message })
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

  /** How long a lease granted in the world lasts: its device's `leaseMillis`. */
  get leaseMillis(): number { return this.#world.device.leaseMillis }

  /** True until the world's device ends. */
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
/** The checks of {@link World.make}'s arguments, {@link World.signin}'s, and a root read from a root shelf. */
const Checks = Validator.Checkers('bad_record', ({ obj, custom, union }) => ({
  worldOpts:   obj({ device: custom<Device>((val) => val instanceof Device, BigPhrases.DeviceExpected) }),
  signinArgs:  obj({
    vaultMinder: custom<VaultMinder>(isVaultMinder, Phrases.VaultMinderExpected),
    shelf:       custom<RootShelf>(isRootShelf, Phrases.RootShelfExpected).nullable(),
  }),
  // The shelf keeps the roots only while all three are live, each whole.
  shelvedRoot: obj({ record: union([BankChecks.record, GateChecks.record, BoxChecks.record]), read_tc: SeenChecks.readTc }),
  shelvedBank: obj({ record: PerKindChecks.bankThing }),
}))
// --
