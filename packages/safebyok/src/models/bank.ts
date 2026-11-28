import { isEqual, noop } from 'es-toolkit'
import { Clock, Crypto, type Errors, Outcome, Phrases as BigPhrases, SX, Validator, VX } from 'safebyok-big/internals'
import { BaseThing } from './base-thing'
import { Box } from './box'
import { Device } from './device'
import { Gate } from './gate'
import { BirthGating } from './gating'
import { Lease } from './lease'
import type { Proving } from './proving'
import { bulletproofHandlerOf } from '../helpers/bulletproof'
import type { BankStage, HostedVault, RefusalSnapshot, RootShelf, ThingMakeOpts, BankOpts, BankSnapshot } from '../shapes/shapes-bankish'
import { PendingBank, SignedOutBank, HostedVaultChecks, isRootShelf } from '../shapes/shapes-bankish'
import type { BirthCleartexts, BirthDna, BirthGatingFriend, GateFound, LeaseShellScope, BankGateFriend } from '../shapes/shapes-gateish'
import { type MaskedViewLease, EmptyMaskedView } from '../shapes/shapes-masked-view'
import type * as Sealers from '../shapes/shapes-sealers'
import { type BankLife, type BankScope, type GateLife, type GateStamp, type LeaseLoggable, type LeaseRecord, type LeaseScope, StampChecks } from '../shapes/shapes-stamps'
import { type BoxRecord, type BulletproofCallback, type GateRecord, type Sparse, type ThingScope, type ThingShaped, type Thingkind, type VoidSentinel, ThingChecks } from '../shapes/shapes-thing'
import { BankChecks, BoxChecks, GateChecks } from '../shapes/shapes-thingkinds'
import { rootScopesOf } from '../shapes/shapes-asks'
import { type ReadTc, type SeenThing, type VaultEvent, type VaultItemEvent, SeenChecks } from '../shapes/shapes-vault-event'
import type { VaultStats } from '../shapes/shapes-vault-stats'
import { MaxTimerMillis } from '../shapes/shapes-vault-tsq'
import { type EpochMillis, type Banktok, Labelpath } from '../shapes/primitives'
import { peekRoots, stowRoots } from '../minding/root-shelf'
import { itemEventOf } from '../storage/agerank'
import type { VaultMinder } from '../minding/vault-minder'
import { type ReceivingThing, isVaultMinder } from '../shapes/shapes-vault-minder'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'

/** A Thing of the signed-in user's bank, as the bank makes one: its gate or a box. */
export type SomeThing = Gate | Box

/** The signed-in user's bank on this device: its gate and its root box, its lease, the awaited `unlock` gating, and its snapshot, which a host renders.
 * It exists once its device is made, labelled and unstored. From sign-in on it has a gate and a root box, each modelling the shell until its record is received: it seals, unseals and unlocks only once both are live.
 * Made with its device, it lives as long. Its gate builds leases and attaches them to it, and boxes are sealed and unsealed under the attached lease, which no member hands out.
 * While connected, its lease is the one its device's deviceDB has, which every tab given that deviceDB shares: an unlock, a renewal or a lock in one tab reaches the rest.
 */
export class Bank {
  // == [Props]: #device, #vaultMinder, #lease, #unlockWait, #isConnected, #unlisten, #janitor, #lastErr, #vaults, #snapshot, #subscribers, #getSnapshot, #subscribe, #bulletproofCallback

  readonly #device: Device

  /** The VaultMinder of the signed-in user's bank, from `signin`; null until then. */
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

  /** The vaults made on this bank, which connect and disconnect with it. */
  readonly #vaults = new Set<HostedVault>()

  /** The current snapshot, which {@link getSnapshot} returns. */
  #snapshot: BankSnapshot
  /** The stage the bank was last at, or null before its first. */
  #stage: BankStage | null = null
  /** Each subscriber, beside its bulletproofed form, which is what is called. */
  readonly #subscribers = new Map<() => void, () => void>()
  readonly #getSnapshot = (): BankSnapshot => this.#snapshot
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#subscribers.set(VX.listener.parse(listener), this.#bulletproofCallback(listener))
    return () => { this.#subscribers.delete(listener) }
  }
  readonly #bulletproofCallback: BulletproofCallback = (callback) => bulletproofHandlerOf(callback, {
    ifError: 'tell', transformer: Throwers.refusalOfThrown, onBadNews: (news) => { this.#device.tellBadNews([news]) },
  })
  // --

  // == [Getters]: vaultMinder, scope, gate, rootBox, life, banktok, leaseEndsAt, leaseLoggable, getSnapshot, subscribe, bulletproofCallback, device

  /** The VaultMinder of the signed-in user's bank, as handed to {@link signin}, or null until then. */
  get vaultMinder(): VaultMinder | null { return this.#vaultMinder }

  /** This bank's scope: its `userid` and `banklabel`. Refuses `absent_vault` until someone signs in. */
  get scope(): BankScope { return this.#device.scope }

  /** The bank's gate: the wayins a user unlocks with, and the form verbs that change them.
   * The same object from sign-in on, whatever its record: it models the shell until a gate is stored.
   * Refuses `absent_vault` until someone signs in.
   */
  get gate(): Gate {
    const { thing } = this.#rootCars().gate
    if (! (thing instanceof Gate)) { throw Throwers.rootOfOtherKind() }
    return thing
  }

  // A bank of a life replaced since reads the root box of the life that replaced it: its boxes refuse as of another root box.
  /** The root box's record, as last received. Every box of this bank is under it. Refuses `record_conflict` until a live root box is received. */
  get rootBox(): BoxRecord {
    const root = this.#rootBoxThing().pickle()
    if (root.am !== 'a') { throw Throwers.rootBoxNotHeard() }
    return root
  }

  // The bank's life is its gate's: its lifeseq, born_at and banktok are the gate's record's.
  /** This bank's {@link BankLife}: its scope, and the lifeseq, `born_at` and `banktok` of its gate's life. Refuses while its gate models the shell. */
  get life(): BankLife { return BankChecks.life.parse(this.gate.pickle()) }

  /** The token minted when this bank was born, which tells this life of the bank from any other under its banklabel: the void banktok while its gate models the shell. */
  get banktok(): Banktok { return this.gate.banktok }

  // Every read of the lease's end goes through here: the janitor's, and isSoftlocked's.
  /** When the attached lease stops unlocking the bank, or null while locked. */
  get leaseEndsAt(): EpochMillis | null { return this.#lease?.ends_at ?? null }

  /** What a log wants of the attached lease, or null while locked. */
  get leaseLoggable(): LeaseLoggable | null { return this.#lease?.loggable ?? null }

  /** This bank's snapshot getter, already bound, as `useSyncExternalStore` wants it: the same frozen object until the snapshot changes.
   * Until its gate and its root box are live, its stage is `'signed_out'`, `'starting'`, `'unborn'` or `'failed'`.
   */
  get getSnapshot(): () => BankSnapshot { return this.#getSnapshot }

  /** Subscribe a listener to the snapshot, returning its unsubscribe. Already bound, as `useSyncExternalStore` wants it.
   * The listener is called with no argument after each change: read the snapshot again. What it throws goes to the device's `tellBadNews`.
   */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }

  /** Wrap `callback` so that what it throws goes to the device's `onBadNews`, never to whoever calls it. Already bound. */
  get bulletproofCallback(): BulletproofCallback { return this.#bulletproofCallback }

  /** The device this bank is on. */
  get device(): Device { return this.#device }
  // --

  // == [Construction]: make, constructor, mintLife, makeThing

  /** Make the bank of `opts.device`, locked, showing nobody signed in. Internal: a device makes its own. */
  static make(opts: BankOpts): Bank {
    const { device } = Checks.bankOpts.parse(opts)
    return new Bank(device)
  }

  private constructor(device: Device) {
    this.#device   = device
    this.#snapshot = this.#makeSnapshot()
    this.#setStage(this.#snapshot.stage)
    Object.freeze(this)
  }

  /** Mint a fresh life of a bank's gate, born now: the life after `found`, the gate's tombstone or its shell, with a new banktok. Mint one per gating that births a bank. */
  static mintLife(found: GateFound): GateLife {
    const { userid, banklabel, ...lives } = Checks.mintLifeArgs.parse(found)
    const { lifepath } = BaseThing.nextLifeOf(lives)
    return GateChecks.life.parse({ userid, banklabel, labelpath: Labelpath.gateOf(banklabel), lifepath, born_at: Clock.nowMillis(), banktok: Crypto.randomId() })
  }

  // A root's Thing is subscribed to before it receives its first record, so that this bank hears of that record too.
  /** Make the Thing at `begun`, of this bank: a {@link Gate} or a {@link Box}, by its modelkind. Nothing is fetched or stored.
   * Made from the shell, it models the shell; made from an item event, it receives the event after, and throws where it refuses its record.
   * What its subscribers throw goes to the device's `onBadNews`.
   */
  makeThing(begun: VaultItemEvent<GateRecord>): Gate
  makeThing(begun: VaultItemEvent<BoxRecord>): Box
  makeThing(begun: VoidSentinel | VaultItemEvent): SomeThing
  makeThing(begun: VoidSentinel | VaultItemEvent): SomeThing {
    SeenChecks.begun.parse(begun)
    const seen = ('eventkind' in begun) ? begun.val : begun
    Validator.demandConsistent(StampChecks.bankScope.parse(seen), this.#device.scope, { kind: 'record_conflict' })
    const thingClass: ThingClass = thingClassOf(seen.modelkind)
    const thing = thingClass.make(BaseThing.shellOf(seen), { bank: this }, this.#gateFriend())
    if (this.#isRootScope(seen)) { thing.subscribe(() => { this.#hearRoot() }) }
    if ('eventkind' in begun) { receiveFirst(thing, begun) }
    return thing
  }
  // --

  // == [Signing in]: signin, seedFromShelf, startShelving, showSigninRefusal, birthGating, birth, birthFriend

  // The roots are seeded from the shelf before the bank listens for them, so that seeding does not put each root it peeked straight back on the shelf.
  /** Give this bank `vaultMinder`, the VaultMinder of the signed-in user's bank; where `shelf` is given, seed it from the roots on `shelf` and put the roots there as they change. A second call does nothing.
   * With no shelf, the roots are stowed nowhere between page loads. The janitor starts, and where this bank is connected, the VaultMinder starts watching the vaultDB.
   */
  signin(vaultMinder: VaultMinder, shelf: RootShelf | null): void {
    Checks.signinArgs.parse({ vaultMinder, shelf })
    if (this.#vaultMinder !== null) { return }
    this.#vaultMinder = vaultMinder
    // The stage is `'starting'` before any root is received, the shelved ones included.
    this.align()
    if (shelf !== null) {
      this.#seedFromShelf(vaultMinder, shelf)
      this.#startShelving(vaultMinder, shelf)
    }
    if (this.#isConnected) { this.#startWatch() }
    this.#startJanitor()
    this.align()
  }

  // Each root is told apart, so an incompatible one is news, and the rest still reach their Things.
  /** Hand `vaultMinder` each root of this bank that `shelf` has, each with the `read_tc` it was shelved at. */
  #seedFromShelf(vaultMinder: VaultMinder, shelf: RootShelf): void {
    const roots   = peekRoots(shelf, this.#device.scope)
    const banktok = banktokOf(roots[0])
    for (const root of roots) {
      try { vaultMinder.receive(shelvedEventOf(Checks.shelvedRoot.parse(root), banktok)) } catch (err) { this.#device.tellBadNews([err]) }
    }
  }

  // Each root's Thing receives it before this listener hears of it, so the roots stowed are the ones this bank shows.
  /** Stow this bank's roots on `shelf` each time `vaultMinder` delivers an item event of a root. */
  #startShelving(vaultMinder: VaultMinder, shelf: RootShelf): void {
    const hear = this.#bulletproofCallback((event: VaultEvent) => {
      if ((event.eventkind === 'item') && this.#isRootScope(event)) { stowRoots(shelf, this.#device.scope, this) }
    })
    // A refused record goes to every listener's onBadNews, and the vault TSQ's tells the device: this one tells nothing.
    vaultMinder.listen({ hear, onBadNews: noop })
  }

  /** Show `err` as the snapshot's `lastErr`, at stage `'failed'`, while the bank's roots are not both live. Internal: the device's sign-in calls it. */
  showSigninRefusal(err: unknown): void {
    this.#lastErr = refusalSnapshotOf(err)
    this.align()
  }

  /** The gating of a birth of this bank over `params`: once its roots are live here, it unlocks this bank. Internal: make one with `device.birthGating`. */
  birthGating(params: FormData | BirthDna | BirthCleartexts): BirthGating { return new BirthGating(this.#device, params, this.#birthFriend()) }

  /** The gating of {@link birth} over `params`: {@link Device.birthGating}, which refuses until `device`'s sign-in has answered. */
  static birthGating(device: Device, params: FormData | BirthDna | BirthCleartexts): BirthGating { return Checks.device.parse(device).birthGating(params) }

  /** Birth the bank of `device`'s scope with the user's new passphrase and optional passkey, and resolve it unlocked: the device's bank.
   * A weak passphrase refuses `weak_passphrase`: show {@link Device.judgeStrength}'s verdict as the user types.
   * Where a live gate is already stored, it refuses `gate_made_elsewhere`, and the passphrase is not set.
   * Call it once the device's `signin` shows the stage `'unborn'`.
   */
  static async birth(device: Device, cleartexts: BirthCleartexts): Promise<Bank> { return await Checks.device.parse(device).birthGating(cleartexts).attempt() }

  /** This bank's lease verbs, for a birth's gating to call. */
  #birthFriend(): BirthGatingFriend {
    return {
      leaseByProving: async (proving: Proving, cited: GateStamp) => await proving.buildLease(this, cited, await this.#leaseFollowed(cited)),
      attachLease:    (lease: Lease) => { this.#attachAndStow(lease) },
    }
  }
  // --

  // == [Telling the host]: tellBadNews

  /** Tell the device's `onBadNews` of failures no caller is waiting on ({@link Device.tellBadNews}). Never throws. */
  tellBadNews(badnews: readonly unknown[]): void { this.#device.tellBadNews(badnews) }
  // --

  // == [The awaited `unlock` gating]: ensureUnlocked, dismissUnlock, settleUnlockWait
  // One wait is shared by every caller, opened by the first and settled once: by any unlock, a dismissal or the device's disable.

  /** Resolve this bank once it is unlocked and not softlocked ({@link isSoftlocked}): at once, or when an `unlock` gating or a gate change lands.
   * While it waits, {@link isUnlockWanted} is true: render the unlock form, and call the gate's `unlock` from it. Near the
   * lease's end, that is so even while the bank shows unlocked, and the `unlock` gating renews the lease.
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

  /** Dismiss the awaited `unlock` gating: every call waiting in {@link ensureUnlocked} rejects `dismissed`, and the bank stays as it was, locked or near its lease's end.
   * Call it when the user closes the unlock form.
   */
  dismissUnlock(): this {
    this.#settleUnlockWait(Throwers.unlockDismissed())
    this.align()
    return this
  }

  /** Settle the wait for an `unlock` gating, if one is open: resolve it where `refusal` is null, else reject it with `refusal`. */
  #settleUnlockWait(refusal: Errors.VaultError | null): void {
    const wait = this.#unlockWait
    this.#unlockWait = null
    if (refusal === null) { wait?.resolve() } else { wait?.reject(refusal) }
  }
  // --

  // == [The gate's friend]: gateFriend, leaseFollowed, attachAndStow, attachLease, dropLease

  /** This bank's lease verbs, for a gate it makes to call. */
  #gateFriend(): BankGateFriend {
    return {
      leaseFollowed: async (gateScope: LeaseShellScope) => await this.#leaseFollowed(gateScope),
      attachLease:   (lease: Lease) => { this.#attachAndStow(lease) },
    }
  }

  // A grant follows the deviceDB, so one after a lock in any tab starts the life after that lock's tombstone. It follows
  // this bank's lease where that is newer, as a softlock not yet stowed is.
  /** The Thing fields a lease granted under the gate at `gateScope` follows: the lease record stored, or this bank's lease where none is stored or this one is newer, or else the gate's lease shell. */
  async #leaseFollowed(gateScope: LeaseShellScope): Promise<Sparse<LeaseRecord>> {
    const shell       = Lease.shellOf(gateScope)
    const stowedLease = await this.#peekStored(shell)
    if (this.#isNewerThanLease(stowedLease)) { return this.#endedIfStale(stowedLease) }
    return this.#lease ?? shell
  }

  // A renewal happens only while a lease is granted: a grant after the stored lease has ended, as when every tab closed
  // past its end, starts the next life.
  /** The record a grant follows over `stowedLease`: its tombstone, written now, where `stowedLease` is live but can no longer unlock the bank, or else `stowedLease` itself */
  #endedIfStale(stowedLease: LeaseRecord): Sparse<LeaseRecord> {
    const isStale = (stowedLease.am === 'a') && ! this.#canUnlock(stowedLease)
    return isStale ? Lease.tombstoneOf(stowedLease) : stowedLease
  }

  /** Attach `lease`, and stow it in the deviceDB for every tab to adopt. */
  #attachAndStow(lease: Lease): void {
    this.#attachLease(lease)
    void this.#stowLease(lease)
  }

  /** Attach `lease` in place of the current one, and resume every call waiting for an `unlock` gating, unless the lease is near its end ({@link isSoftlocked}).
   * On a disabled bank, it evicts `lease` instead, and refuses.
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

  /** Drop this bank's lease, and the keys in it, in this tab alone: the deviceDB's lease record is left as it is. */
  #dropLease(): void {
    this.#lease?.evict()
    this.#lease = null
    this.align()
  }
  // --

  // == [Locking and connecting]: lock, connect, disconnect, disable, hostVault, #startWatch, #startListening, #stopListening

  // #lock-is-intent: a lock asks the user again at the next promptable action, and is not an alarm. A seal under way
  // finishes; an unseal under way returns no cleartext.
  /** Lock the bank: drop its lease and the keys in it, and stow the lease's tombstone in the deviceDB, which locks every tab sharing it. */
  lock(): this {
    const lease = this.#lease
    this.#dropLease()
    if (lease !== null) { void this.#stowTombstoneOf(lease) }
    return this
  }

  // The watch starts before the vaults hear it, so that what a vault refetches as it connects is fetched under the watch.
  /** Start this bank's watch and listeners, and adopt the lease the deviceDB has. Never throws.
   * A call once the device is disabled does nothing.
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
  /** Drop this bank's lease in this tab alone, and stop its watch and listeners. Never throws, and calling it twice in a row is the same as once.
   * The bank stays enabled: its verbs still work, a call waiting in {@link ensureUnlocked} still waits, and {@link connect} resumes it, adopting the lease the deviceDB has.
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

  /** Connect and disconnect `vault` with this bank, from now on: at once, where this bank is connected. Internal.
   * Refuses once the bank has ended.
   */
  hostVault(vault: HostedVault): void {
    HostedVaultChecks.hostedVault.parse(vault)
    this.demandEnabled()
    this.#vaults.add(vault)
    if (this.#isConnected) { vault.connect() }
  }

  /** Start the VaultMinder's watch, where someone has signed in. */
  #startWatch(): void {
    if (this.#vaultMinder === null) { return }
    try { this.#vaultMinder.connect(() => { this.#device.announce({ kind: 'watch_ended' }) }) } catch (err) { this.#device.tellBadNews([err]) }
  }

  /** Follow the lease the deviceDB has each time any tab stows one, where the listener is not running already, telling the device's `onBadNews` what the deviceDB throws */
  #startListening(): void {
    try { this.#unlisten ??= this.#device.deviceDB.listen(() => { void this.#followStored() }) } catch (err) { this.#device.tellBadNews([err]) }
  }

  /** Stop the deviceDB's listener, where it runs, telling the device's `onBadNews` what the deviceDB throws */
  #stopListening(): void {
    try { this.#unlisten?.() } catch (err) { this.#device.tellBadNews([err]) }
    this.#unlisten = null
  }
  // --

  // == [Following the stored lease]: followStored, isNewerThanLease, attachOrDropLease, canUnlock, softlockPastGate, peekStored, stowLease, stowTombstoneOf
  // Each tab's lease is the one the deviceDB has, compared by life, then revision. The newest stow wins there, so a
  // late stow never brings a locked lease back. A stow or a peek refused is bad news, and the tab's lease is unchanged.

  /** Make this bank's lease the one the deviceDB has for its gate, where that one is newer, then softlock it where the gate has moved past it. Does nothing until the roots are live. Never throws: a refusal goes to the device's `onBadNews`. */
  async #followStored(): Promise<void> {
    if (! this.areRootsLive) { return }
    const stowedLease = await this.#peekStored(Lease.shellOf(this.gate))
    try {
      if (this.#isNewerThanLease(stowedLease)) { this.#attachOrDropLease(stowedLease) }
      this.#softlockPastGate()
    } catch (err) {
      this.#device.tellBadNews([err])
    }
  }

  /** True of a lease record newer than this bank's lease, by life then revision; any record is newer than none */
  #isNewerThanLease(stowedLease: LeaseRecord | null): stowedLease is LeaseRecord {
    return (stowedLease !== null) && ((this.#lease === null) || (BaseThing.cmp(this.#lease, stowedLease) > 0))
  }

  /** Attach the Lease of `stowedLease` where it can unlock the bank, or else drop this bank's lease where it has one, announcing either */
  #attachOrDropLease(stowedLease: LeaseRecord): void {
    if ((stowedLease.am === 'a') && this.#canUnlock(stowedLease)) {
      this.#attachLease(Lease.make(stowedLease, { bank: this, gateLife: this.gate.life }))
      this.#device.announce({ kind: 'lease_taken_up' })
    } else if (this.isUnlocked) {
      this.#dropLease()
      this.#device.announce({ kind: 'lock_taken_up' })
    }
  }

  /** True of a live lease record not past its end, granted under the gate's life */
  #canUnlock(stowedLease: Sealers.LiveOf<LeaseRecord>): boolean {
    const { gate } = this
    return (Clock.nowMillis() < stowedLease.ends_at) && (stowedLease.gate_labelpath === gate.labelpath) && (stowedLease.gate_lifepath === gate.lifepath)
  }

  // A softlock only ever brings the end nearer, so every tab that hears the same gate change writes the same revision,
  // and the first stow wins (notes/wontfix.md).
  /** Attach, stow and announce the next revision of this bank's lease, ending the device's `softlockMillis` from now, where the gate has moved past the revision the lease cites and that end is the nearer */
  #softlockPastGate(): void {
    const lease = this.#lease
    const ends_at = Clock.nowMillis() + this.#device.softlockMillis
    if ((lease === null) || (this.gate.revseq <= lease.gate_revseq) || (ends_at >= lease.ends_at)) { return }
    this.#attachAndStow(lease.nextEndingAt(ends_at))
    this.#device.announce({ kind: 'softlocked' })
  }

  /** The lease record the deviceDB has at `leaseScope`, or null for none, or where the deviceDB refuses, which goes to the device's `onBadNews` */
  async #peekStored(leaseScope: LeaseScope): Promise<LeaseRecord | null> {
    try {
      return await this.#device.deviceDB.peekLease(leaseScope)
    } catch (err) {
      this.#device.tellBadNews([err])
      return null
    }
  }

  /** Stow `lease` in the deviceDB, telling the device's `onBadNews` where it refuses: the lease stays attached either way */
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

  /** Lock this bank once its lease has passed its end, and, while connected, start a watch that is not running and get the roots again once the gate is stale. Never throws: a refusal goes to the device's `onBadNews`. */
  #tidy(): void {
    try {
      this.#lockPastLeaseEnd()
      if (this.#isConnected) { this.#tidyConnected() }
    } catch (err) {
      this.#device.tellBadNews([err])
    }
  }

  // #lock-is-intent: autolock is a best-effort time, not a deadline. A lease past its end still seals and unseals until
  // the next tick, which may come a janitor period late, or later while the page sleeps. Meanwhile isSoftlocked is true,
  // so a call to ensureUnlocked asks the user first.
  /** Lock this bank, and announce it, where its lease has passed its end */
  #lockPastLeaseEnd(): void {
    const { leaseEndsAt } = this
    if ((leaseEndsAt === null) || (Clock.nowMillis() < leaseEndsAt)) { return }
    this.lock()
    this.#device.announce({ kind: 'autolocked' })
  }

  /** Start the VaultMinder's watch where it is not running, and get the roots again where the gate is stale */
  #tidyConnected(): void {
    if (! this.demandVaultMinder().isWatching) { this.#startWatch() }
    if (this.#isGateStale()) { void this.#refreshRoots() }
  }

  // Each tab judges for itself, by when it last read the gate: a gate never read is not stale.
  /** True where the gate was last read more than the device's `gateStaleMillis` ago */
  #isGateStale(): boolean { return this.#isGateRead() && (Clock.nowMillis() - this.#rootCars().gate.read_at > this.#device.gateStaleMillis) }

  /** Get the gate and the root box from the vaultDB, past anything cached here, telling the device's `onBadNews` of a refusal */
  async #refreshRoots(): Promise<void> {
    try {
      const answer = await this.demandVaultMinder().tryGetBankOnce()
      if (! answer.ok) { this.#device.tellBadNews([answer.err]) }
    } catch (err) {
      this.#device.tellBadNews([err])
    }
  }
  // --

  // == [Stats]: stats, tryStats

  /** The bank's storage stats, read from the vaultDB once: how many boxes and gates it has, live and in all, their size in bytes, and the datastore's limits.
   * Works on a locked bank. Nothing refuses a write for being over a limit.
   * @example
   *   const { box, gate, max } = await bank.stats()
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

  /** Seal and return the next revision after `donorProps`. Needs the bank unlocked.
   * The seal is bound to the stamp of the lease's bank, the revision's stamp and the sealer's tags.
   */
  seal<RecordT extends ThingShaped, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donorProps: Sealers.Sealable<RecordT>, publicProps: Sealers.TombstonePublicProps & Partial<Sealers.BodyOf<RecordT, CleartextsT>>,
  ): Promise<Sealers.TombstoneOf<RecordT>>
  seal<RecordT extends ThingShaped, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donorProps: Sealers.Sealable<RecordT>, publicProps: Sealers.LivePublicPropsOf<RecordT, CleartextsT>, secretProps: CleartextsT,
  ): Promise<Sealers.LiveOf<RecordT>>
  seal<RecordT extends ThingShaped, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donorProps: Sealers.Sealable<RecordT>, publicProps: Sealers.PublicPropsOf<RecordT, CleartextsT>, secretProps?: CleartextsT,
  ): Promise<RecordT>
  async seal<RecordT extends ThingShaped, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donorProps: Sealers.Sealable<RecordT>, publicProps: Sealers.PublicPropsOf<RecordT, CleartextsT>, secretProps?: CleartextsT,
  ): Promise<RecordT> {
    return await this.#demandLease().seal(sealer, donorProps, publicProps, secretProps)
  }

  /** Unseal `record`, returning it with the part `sealer` seals in cleartext. Needs the bank unlocked.
   * Unsealing authenticates the ciphertexts, the stamp and the tags together: a change to any of them refuses as damaged.
   */
  async unseal<RecordT extends ThingShaped, CleartextsT>(sealer: Sealers.Sealer<RecordT, CleartextsT>, record: RecordT): Promise<Sealers.UnsealedOf<RecordT, CleartextsT>> {
    return await this.#demandLease().unseal(sealer, record)
  }
  // --

  // == [Guards]: isEnabled, endCause, isLocked, isSoftlocked, isUnlocked, isUnlockWanted, areRootsLive, demandEnabled, demandRootsLive, demandVaultMinder, demandLease, rootCars, rootBoxThing, isGateRead, isRootScope

  /** True until its device ends. */
  get isEnabled(): boolean { return this.endCause === null }

  /** The refusal every call meets once its device ends, or null while it is enabled. */
  get endCause(): Errors.VaultError | null { return this.#device.endCause }

  /** True when no lease is attached. */
  get isLocked(): boolean { return this.#lease === null }

  /** True when locked, or once the attached lease is within the device's `softlockMillis` of its end: {@link ensureUnlocked} then waits for an `unlock` gating, which renews the lease.
   * Seals and unseals still run until the bank locks.
   */
  get isSoftlocked(): boolean {
    const { leaseEndsAt } = this
    return (leaseEndsAt === null) || (Clock.nowMillis() >= leaseEndsAt - this.#device.softlockMillis)
  }

  /** True when a lease is attached. */
  get isUnlocked(): boolean { return this.#lease !== null }

  /** True while a call waits in {@link ensureUnlocked}: render the unlock form while it is. */
  get isUnlockWanted(): boolean { return this.#unlockWait !== null }

  /** True while the gate and the root box each model a live record. False until someone signs in. */
  get areRootsLive(): boolean { return (this.#vaultMinder !== null) && isLive(this.gate) && isLive(this.#rootBoxThing()) }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    const { endCause } = this
    if (endCause !== null) { throw endCause }
    return this
  }

  /** Demand that the gate and the root box each model a live record, and return this bank. */
  demandRootsLive(): this {
    for (const root of [this.gate, this.#rootBoxThing()]) {
      if (! isLive(root)) { throw Throwers.thingNotLive(root.labelpath) }
    }
    return this
  }

  /** Demand that someone has signed in, and return the {@link vaultMinder}. */
  demandVaultMinder(): VaultMinder {
    if (this.#vaultMinder === null) { throw Throwers.nobodySignedIn() }
    return this.#vaultMinder
  }

  /** The attached lease. Demands that the bank is enabled and unlocked. */
  #demandLease(): Lease {
    this.demandEnabled()
    if (this.#lease === null) { throw Throwers.needUnlocked() }
    return this.#lease
  }

  /** The cars of the gate and the root box in the {@link vaultMinder}. Demands that someone has signed in. */
  #rootCars(): ReturnType<VaultMinder['ensureRootCars']> { return this.demandVaultMinder().ensureRootCars() }

  /** The root box's Thing: the same object from sign-in on, modelling the shell until a root box is stored. Demands that someone has signed in. */
  #rootBoxThing(): Box {
    const { thing } = this.#rootCars().root
    if (! (thing instanceof Box)) { throw Throwers.rootOfOtherKind() }
    return thing
  }

  /** True once the vaultDB's answer for the gate has been received, whatever it found */
  #isGateRead(): boolean { return this.#rootCars().gate.agekind !== 'vacant' }

  /** True of the scope of this bank's gate or root box */
  #isRootScope(scope: ThingScope): boolean { return Object.values(rootScopesOf(this.#device.scope)).some((root) => BaseThing.haveSameScope(root, scope)) }
  // --

  // == [Snapshot]: hearRoot, align, stageOf, setStage, makeSnapshot

  // The two roots may arrive in either order, one at a time: one live alone is never shown as a stage of its own. The
  // last of them to arrive live brings `'locked'`, so a birth shows no stage between `'unborn'` and `'locked'`.
  // The softlock is at once, so a grant under way in this tab follows it; the lease stored is adopted once the roots
  // are live, as when they first arrive.
  /** Bring the lease and the snapshot up to date with a change to a root. */
  #hearRoot(): void {
    this.#softlockPastGate()
    if (this.#isConnected) { void this.#followStored() }
    if (this.areRootsLive || ! isLive(this.gate)) { this.align() }
  }

  /** Remake the snapshot, and tell each subscriber if it changed. Internal: the device calls it once someone signs in. */
  align(): void {
    const next = this.#makeSnapshot()
    if (isEqual(next, this.#snapshot)) { return }
    this.#snapshot = next
    this.#setStage(next.stage)
    for (const told of this.#subscribers.values()) { told() }
  }

  /** The stage the snapshot shows: the first of these that applies. */
  #stageOf(): BankStage {
    if (this.endCause !== null)       { return 'disabled' }
    if (this.#device.userid === null) { return 'signed_out' }
    if (this.areRootsLive)            { return this.isLocked ? 'locked' : 'unlocked' }
    if (this.#lastErr !== null)       { return 'failed' }
    return (this.#isGateRead() && ! isLive(this.gate)) ? 'unborn' : 'starting'
  }

  /** Record `stage` as the bank's stage, announcing the crossing from the one before it. */
  #setStage(stage: BankStage): void {
    const from = this.#stage
    this.#stage = stage
    if ((from !== null) && (from !== stage)) { this.#device.announce({ kind: 'stage_crossed', from, to: stage }) }
  }

  /** A new snapshot of this bank. */
  #makeSnapshot(): BankSnapshot {
    const stage = this.#stageOf()
    if (stage === 'signed_out') { return SignedOutBank }
    if (stage === 'starting')   { return PendingBank }
    if (stage === 'unborn')     { return Object.freeze({ ...PendingBank, stage }) }
    if (stage === 'failed')     { return Object.freeze({ ...PendingBank, stage, lastErr: this.#lastErr }) }
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

  // The bank hands out no lease: what leaves is its loggable.
  /** The attached lease's loggable and when it ends, for a devtool, or only `active: false` while locked or while the roots are not all live.
   * For experimenting, never for an app's own logic: what it answers may change without notice.
   */
  inspectable(): MaskedViewLease {
    const lease = this.#lease
    if ((lease === null) || ! this.areRootsLive) { return EmptyMaskedView.lease }
    return { active: true, ...lease.loggable, ends_at: lease.ends_at }
  }
  // --
}

// == [Helpers]: ShelvedSourcelabel, banktokOf, shelvedEventOf, ThingClass, receiveFirst, thingClassOf, isLive, refusalSnapshotOf, Wait, makeWait

/** The `sourcelabel` of the events of the roots a bank read from its root shelf. */
const ShelvedSourcelabel = 'root_shelf'

/** The banktok of the shelved root `shelved`, where it is a gate's record, else the void banktok. */
function banktokOf(shelved: unknown): Banktok {
  const gateReport = Checks.shelvedGate.safeParse(shelved)
  return gateReport.success ? gateReport.data.record.banktok : SX.VoidLifeTok
}

/** The `item` event of `record`, a root peeked from the root shelf, at the `read_tc` it was shelved with and in the bank of `banktok`, with the vacant agerank. */
function shelvedEventOf({ record, read_tc }: Readonly<{ record: SeenThing, read_tc: ReadTc }>, banktok: Banktok): VaultEvent {
  return itemEventOf(record, { sourcelabel: ShelvedSourcelabel, read_tc, banktok })
}

/** The class a bank makes a Thing of one kind from, as {@link Bank.makeThing} calls it. */
interface ThingClass {
  make(begun: VoidSentinel | VaultItemEvent, opts: ThingMakeOpts, friend: BankGateFriend): SomeThing
}

/** Have `thing`, which has received nothing, receive `event` */
function receiveFirst(thing: ReceivingThing, event: VaultItemEvent): void { thing.receive(event) }

// Read as a bank makes a Thing, not as this module loads: the model modules import one another, and a class may not be
// defined yet while this one loads.
/** The class of the Things of `modelkind` */
function thingClassOf(modelkind: Thingkind): ThingClass {
  return ({ gate: Gate, box: Box } as const satisfies Record<Thingkind, ThingClass>)[modelkind]
}

/** True of a Thing modelling a live record; false of one modelling the shell or a tombstone */
function isLive(thing: SomeThing): boolean { return thing.pickle().am === 'a' }

/** What a snapshot shows of `err`: its refusal's kind, family and message, anything but a refusal as an unexpected error */
function refusalSnapshotOf(err: unknown): RefusalSnapshot {
  const { refusalkind, family, message } = Throwers.refusalOfThrown(err)
  return Object.freeze({ refusalkind, family, message })
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
/** The checks of the arguments of {@link Bank.make}, {@link Bank.signin}, {@link Bank.birth}, {@link Bank.birthGating} and {@link Bank.mintLife}, and of a root peeked from the root shelf. */
const Checks = Validator.Checkers('bad_record', ({ obj, lit, custom, union }) => {
  const device = custom<Device>((val) => val instanceof Device, BigPhrases.DeviceExpected)
  return {
    device,
    bankOpts:     obj({ device }),
    signinArgs:   obj({
      vaultMinder: custom<VaultMinder>(isVaultMinder, Phrases.VaultMinderExpected),
      shelf:       custom<RootShelf>(isRootShelf, Phrases.RootShelfExpected).nullable(),
    }),
    // The shelf has the roots only while both are live, each whole.
    shelvedRoot:  obj({ record: union([GateChecks.record, BoxChecks.record]), read_tc: SeenChecks.readTc }),
    shelvedGate:  obj({ record: GateChecks.record }),
    // A birth is never over a live gate: its gating refuses that first.
    mintLifeArgs: obj({ ...StampChecks.bankScope.shape, am: lit('x'), lifeseq: ThingChecks.anyLifeseq, lifepath: ThingChecks.anyLifepath }),
  }
})
// --
