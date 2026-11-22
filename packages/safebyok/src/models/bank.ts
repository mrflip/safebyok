import { isEqual } from 'es-toolkit'
import { Clock, Crypto, type Errors, Outcome, Phrases as BigPhrases, Validator } from 'safebyok-big/internals'
import { Thing } from './thing'
import { BaseBox } from './base-box'
import { Device } from './device'
import { Gate } from './gate'
import type { BirthGating } from './gating'
import type { BirthCleartexts } from '../shapes/shapes-gateish'
import type { BankAskDraft, BankOpts, BankSnapshot, BankStage, BoxUnsealed, HostedVault } from '../shapes/shapes-bankish'
import type { BoxCleartexts, BoxPublicProps, BoxTombstonePublicProps, LiveOf, LivePublicPropsOf, Sealable, TombstoneOf } from '../shapes/shapes-sealers'
import { type BankScope, type BankStamp, type GateStamp, StampChecks } from '../shapes/shapes-stamps'
import { type DeviceTok, type Lifetok, Labelpath, Lifeseq } from '../shapes/primitives'
import { type BankRecord, type BoxRecord, type Modelkind, type ThingRecord, ThingChecks, ThingFormat } from '../shapes/shapes-thing'
import { BankChecks, BoxChecks, GateChecks } from '../shapes/shapes-thingkinds'
import { type BankRoots, type DelAskDraft, type GetAsk, type ListAsk, type PutAskDraft, type Track, type WriteAsk, delAskOf, getAskOf, listAskOf, putAskOf } from '../shapes/shapes-asks'
import type { VaultDB } from '../storage/vault-db'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'

/** The signed-in user's bank on this device: its main gate, which holds the lease while unlocked, and its root box.
 * Boxes are sealed and unsealed under its gate's lease, and stored in its vaultDB. Its roots, as last heard of, are its world in the device's BankMinder.
 */
export class Bank extends Thing<BankRecord, BankScope, BankStamp> implements BankStamp {
  // == [Props]: #device, #vaultDB, #gate, #vaults, #endCause, #snapshot, #getSnapshot

  readonly #device:   Device
  readonly #vaultDB:  VaultDB

  /** The main gate. */
  readonly #gate: Gate

  /** The vaults made on this bank, which its sweep sweeps. */
  readonly #vaults = new Set<HostedVault>()

  /** Why a sweep disabled the bank, or null until then. */
  #endCause: Errors.VaultError | null = null

  /** The current snapshot, which {@link getSnapshot} returns. */
  #snapshot: BankSnapshot
  readonly #getSnapshot = (): BankSnapshot => this.#snapshot
  // --

  // == [Getters]: lifetok, device, device_tok, vaultDB, scope, stamp, gate, rootBox, track, getSnapshot, subscribe

  // we are under-using the lifetok at the moment
  /** The token minted when this bank was born, which tells this life of the bank from any other under its banklabel. */
  get lifetok(): Lifetok { return this.pickle().lifetok }

  /** The device this bank is on. */
  get device(): Device { return this.#device }

  /** This device's token, recorded in each wayin the bank builds. */
  get device_tok(): DeviceTok { return this.#device.device_tok }

  /** Where this bank's Things are stored. */
  get vaultDB(): VaultDB { return this.#vaultDB }

  /** This bank's scope: its user and its `banklabel`. */
  get scope(): BankScope { return StampChecks.bankScope.parse(this) }

  /** This bank's {@link BankStamp}, which every ctx under it binds first. */
  get stamp(): BankStamp { return BankChecks.stamp.parse(this) }

  /** The bank's main gate: the wayins a user unlocks with, the form verbs that change them, and the lease. The same object across a gate change. */
  get gate(): Gate { return this.#gate }

  /** The root box, as last heard of. Every box of this bank is under it. */
  get rootBox(): BoxRecord { return this.#world.root }

  /** The revseq and lifepath this device last heard of the bank, its main gate and its root box, which every ask it makes tracks. */
  get track(): Track {
    const { bank, gate, root } = this.#world
    return { bank: trackPairOf(bank), [Labelpath.MainGate]: trackPairOf(gate), [Labelpath.RootBox]: trackPairOf(root) }
  }

  // A bank of a life replaced since reads the world of the life that replaced it: its boxes refuse as of another root box.
  /** The world of this bank in the device's BankMinder. */
  get #world(): BankRoots {
    const world = this.#device.bankMinder.worldAt()
    if (world === undefined) { throw Throwers.worldNotHeard() }
    return world
  }

  /** This bank's snapshot getter, already bound, as `useSyncExternalStore` wants it: the same frozen object until the snapshot changes. */
  get getSnapshot(): () => BankSnapshot { return this.#getSnapshot }

  /** Subscribe a listener to this bank's snapshot, returning its unsubscribe. Already bound, as `useSyncExternalStore` wants it.
   * The listener is called with no argument after each change: read the snapshot again. What it throws goes to {@link tellBadNews}.
   */
  override get subscribe(): (listener: () => void) => (() => void) { return super.subscribe }
  // --

  // == [Construction]: make, constructor, mintStamps, makeRecord

  /** Make the bank of `record`, with `opts.gate` as its main gate, on `opts.device`, with its boxes in `opts.vaultDB`. Nothing is fetched or stored.
   * The device's BankMinder must hold the world of `record`'s life, its root box live: fetch the world, or birth the bank, first.
   * It is locked or unlocked as its gate is. The device is not told of it: a device makes its own bank in its `hello`, and is handed the bank its birth makes.
   */
  static make(record: BankRecord, opts: BankOpts): Bank { return new Bank(record, opts) }

  private constructor(record: BankRecord, opts: BankOpts) {
    const { record: bankRecord, opts: { device, vaultDB, gate } } = Checks.bankMakeArgs.parse({ record, opts })
    Validator.checkedConsistent(StampChecks.bankScope.parse(bankRecord), device.scope, { kind: 'record_conflict' })
    Validator.checkedConsistent(gate.bankStamp, BankChecks.stamp.parse(bankRecord), { kind: 'record_conflict' })
    const world = device.bankMinder.worldAt()
    if (world === undefined) { throw Throwers.worldNotHeard() }
    Validator.checkedConsistent(BankChecks.stamp.parse(world.bank), BankChecks.stamp.parse(bankRecord), { kind: 'record_conflict' })
    BoxChecks.live.parse(world.root)
    super(bankRecord)
    this.#device = device
    this.#vaultDB = vaultDB
    this.#gate = gate
    this.#snapshot = this.#makeSnapshot()
    // The bank's sweep sweeps its gate, which then lets go of this listener.
    this.#gate.subscribe(() => { this.#align() })
    Object.freeze(this)
  }

  /** Fresh stamps for a new bank of `scope` and its main gate, both in their first life.
   * The bank's stamp carries a new lifetok. Mint one pair per gating that births a bank.
   */
  static mintStamps(scope: BankScope): { bankStamp: BankStamp, gateStamp: GateStamp } {
    const { userid, banklabel } = StampChecks.bankScope.parse(scope)
    const born_at = Clock.nowMillis()
    return {
      bankStamp: BankChecks.stamp.parse({ userid, banklabel, lifeseq: Lifeseq.ofLifenum(0), born_at, lifetok: Crypto.randomId() }),
      gateStamp: GateChecks.stamp.parse({ userid, banklabel, labelpath: 'gate', lifeseq: Lifeseq.ofLifenum(0), born_at }),
    }
  }

  /** The first record of a new bank's Thing, of `stamp`, born at its `born_at` with its `lifetok`. */
  static makeRecord(stamp: BankStamp): BankRecord {
    const { userid, banklabel, lifeseq, born_at, lifetok } = BankChecks.stamp.parse(stamp)
    return BankChecks.record.parse({
      userid, banklabel, labelpath: 'bank', label: 'bank', fmt: ThingFormat, revtok: Crypto.randomId(), lifetok, revseq: 0, am: 'a', born_at, written_at: born_at, lifeseq, lifepath: lifeseq,
    })
  }
  // --

  // == [Ask builders]: makeGetAsk, makeListAsk, makePutAsk, makeDelAsk, tellBadNews
  // Each fills in this bank's scope and its `track`, and the modelkind and default flags of `getAskOf` and the rest. The
  // track is this object's, which may be stale: the answer's `tracked` says so. Nothing is checked here: the verb does that.

  /** The get ask for the Thing at `ask.labelpath` in this bank. */
  makeGetAsk(ask: BankAskDraft): GetAsk { return getAskOf({ ...ask, ...this.scope, track: this.track }) }

  /** The list ask for the children of the Thing at `ask.labelpath` in this bank. */
  makeListAsk(ask: BankAskDraft): ListAsk { return listAskOf({ ...ask, ...this.scope, track: this.track }) }

  /** The put ask writing `ask.record` over `ask.cited`, in this bank. */
  makePutAsk<RecordT extends ThingRecord>(ask: Omit<PutAskDraft<RecordT>, 'track'>): WriteAsk<RecordT> {
    return { ...putAskOf<RecordT>({ ...ask, track: this.track }), ...this.scope }
  }

  /** The del ask writing the tombstone `ask.record` over `ask.cited`, in this bank. */
  makeDelAsk<RecordT extends ThingRecord>(ask: Omit<DelAskDraft<RecordT>, 'track'>): WriteAsk<RecordT> {
    return { ...delAskOf<RecordT>({ ...ask, track: this.track }), ...this.scope }
  }

  /** Tell the device's `onBadNews` of failures no caller is waiting on ({@link Device.tellBadNews}). Never throws. */
  tellBadNews(badnews: readonly unknown[]): void { this.#device.tellBadNews(badnews) }
  // --

  // == [Methods]: put

  /** Write `ask.record`, this bank's next revision, over `ask.cited`. Resolves the bank's Thing the store reports writing, and its world shows it. This Bank object is not updated. */
  async put(ask: PutAskDraft<BankRecord>): Promise<BankRecord> {
    this.demandEnabled()
    const answer = await this.#device.bankMinder.tryWrite({ ...this.makePutAsk(ask), labelpath: 'bank', modelkind: 'bank' })
    if (! answer.ok) { throw answer.err }
    // The ask's modelkind is the bank's, which the vaultDB checks what it answers against.
    return answer.val as BankRecord
  }
  // --

  // == [Gate verbs]: birthGating, birth, tryBirth, ensureUnlocked, dismissUnlock, lock
  // The gate's own, for a host's screen or a vault that wants the bank unlocked whichever way the user gets in. Every other
  // form verb is on the gate.

  /** The gating of {@link birth} over `cleartexts`, handing `attachBank`, where given, the bank it births. Internal: make a birth's gating with {@link Device.birthGating}.
   * Without `attachBank`, the bank it births is no device's: `device` does not show it.
   */
  static birthGating(device: Device, cleartexts: BirthCleartexts, attachBank?: (bank: Bank) => void): BirthGating { return Gate.birthGating(device, cleartexts, attachBank) }

  /** Birth the bank of `device`'s scope with the user's new passphrase and optional passkey, and resolve it unlocked. The device's bank is then this one.
   * A weak passphrase refuses `weak_passphrase`: show {@link Device.judgeStrength}'s verdict as the user types.
   * Where a live bank is already stored, it refuses `gate_made_elsewhere`, and the passphrase is not set.
   * Call it once the device's `hello` shows the stage `'unborn'`.
   */
  static async birth(device: Device, cleartexts: BirthCleartexts): Promise<Bank> { return await Checks.device.parse(device).birthGating(cleartexts).attempt() }

  /** {@link birth}, resolving an `Outcome` instead of throwing. */
  static tryBirth(device: Device, cleartexts: BirthCleartexts): Promise<Outcome.Outcome<Bank>> { return Outcome.outcomeOf(() => this.birth(device, cleartexts)) }

  /** Resolve this bank once its gate is unlocked ({@link Gate.ensureUnlocked}). While it waits, the snapshot's `isUnlockWanted` is true. */
  async ensureUnlocked(): Promise<this> {
    await this.#gate.ensureUnlocked()
    return this
  }

  /** Dismiss the awaited `unlock` gating ({@link Gate.dismissUnlock}): every call waiting in {@link ensureUnlocked} rejects `dismissed`. */
  dismissUnlock(): this {
    this.#gate.dismissUnlock()
    return this
  }

  /** Lock the bank: its gate drops its lease and the keys in it. */
  lock(): this {
    this.#gate.lock()
    return this
  }
  // --

  // == [Sweeping]: sweep, end, hostVault

  /** End this bank for good: sweep its gate and each vault made on it. Never throws.
   * Its subscribers hear of the end, and of nothing after.
   */
  sweep(): this {
    if (this.#endCause !== null) { return this }
    this.#end(this.#device.endCause ?? Throwers.bankSwept())
    return this
  }

  // Every end of a bank comes here. It shuts first, so that a subscriber told of the end, or a vault as it is swept, finds every call refusing.
  /** End this bank with `endCause`, sweep its gate and its vaults, and let go of them and its subscribers. */
  #end(endCause: Errors.VaultError): void {
    this.#endCause = endCause
    this.#gate.sweep(endCause)
    this.#align()
    for (const vault of this.#vaults) { vault.sweep() }
    this.#vaults.clear()
    this.dropSubscribers()
  }

  /** Sweep `vault` when this bank is swept. Internal.
   * Refuses once the bank is swept.
   */
  hostVault(vault: HostedVault): void {
    Checks.hostedVault.parse(vault)
    this.demandEnabled()
    this.#vaults.add(vault)
  }
  // --

  // == [Snapshot]: align, makeSnapshot

  /** Remake the snapshot, and tell each subscriber if it changed. */
  #align(): void {
    const next = this.#makeSnapshot()
    if (isEqual(next, this.#snapshot)) { return }
    this.#snapshot = next
    this.tellSubscribers((err) => { this.tellBadNews([err]) })
  }

  /** A new snapshot of this bank. */
  #makeSnapshot(): BankSnapshot {
    // A sweep is the one way a bank ends, so an ended bank's stage is 'swept'.
    const { endCause } = this
    const isEnded  = endCause !== null
    const isLocked = isEnded || this.#gate.isLocked
    let stage: BankStage = isLocked ? 'locked' : 'unlocked'
    if (isEnded) { stage = 'swept' }
    return Object.freeze({
      stage,
      isLocked,
      isEnded,
      endCause,
      leaseEndsAt:  isEnded ? null : this.#gate.leaseEndsAt,
      lastErr:      null,
      isUnlockWanted: this.#gate.isUnlockWanted,
    })
  }
  // --

  // == [Boxes]: sealBox, trySealBox, unsealBox, tryUnsealBox
  // The gate's seal and unseal, for this bank's own boxes: only the bank knows its root box, whose lifeseq begins each box's
  // lifepath. A vault writes what they seal, refusing a locked bank; only its withWhisper waits for the unlock.

  /** Seal and return the next revision of the box `donorProps`. Needs the bank unlocked.
   * The revision applies `publicProps`, and encrypts the whisper of `secretProps`. An unknown key in either refuses.
   * Pass `donorProps` as you have it: whole or sparse, sealed or unsealed, a tombstone or the shell. It must be a box of this bank.
   * A whole live box's revision keeps its sidecar unless `publicProps` gives one. Over a sparse box, a tombstone or the shell,
   * `publicProps` must give the sidecar. After a tombstone or the shell, the revision begins the box's next life.
   * Given `am: 'x'` in `publicProps`, it seals the tombstone of the live box instead, whose sealed empty whisper authenticates
   * it, and refuses `secretProps` or any sidecar but `{}`.
   * Its `written_at` is `publicProps.written_at`, or now.
   * @example
   *   const box = await bank.sealBox(donor, { sidecar: { account: 'work' } }, { whisper })
   */
  sealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxTombstonePublicProps): Promise<TombstoneOf<BoxRecord>>
  sealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: LivePublicPropsOf<BoxRecord, BoxCleartexts>, secretProps: BoxCleartexts): Promise<LiveOf<BoxRecord>>
  sealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxPublicProps, secretProps?: BoxCleartexts): Promise<BoxRecord>
  async sealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxPublicProps, secretProps?: BoxCleartexts): Promise<BoxRecord> {
    this.demandEnabled()
    this.#demandOwnBox(donorProps)
    return await this.#gate.seal(BaseBox, donorProps, publicProps, secretProps)
  }

  /** {@link sealBox}, resolving an `Outcome` instead of throwing. */
  trySealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxTombstonePublicProps): Promise<Outcome.Outcome<TombstoneOf<BoxRecord>>>
  trySealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: LivePublicPropsOf<BoxRecord, BoxCleartexts>, secretProps: BoxCleartexts): Promise<Outcome.Outcome<LiveOf<BoxRecord>>>
  trySealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxPublicProps, secretProps?: BoxCleartexts): Promise<Outcome.Outcome<BoxRecord>>
  trySealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxPublicProps, secretProps?: BoxCleartexts): Promise<Outcome.Outcome<BoxRecord>> {
    return Outcome.outcomeOf(() => this.sealBox(donorProps, publicProps, secretProps))
  }

  /** Unseal `box`, returning it with its whisper in place of the sealed one. Needs the bank unlocked.
   * It authenticates the box, all but its sidecar. For a tombstone, that checks its seal.
   */
  async unsealBox(box: BoxRecord): Promise<BoxUnsealed> {
    this.demandEnabled()
    this.#demandOwnBox(box)
    return await this.#gate.unseal(BaseBox, box)
  }

  /** {@link unsealBox}, resolving an `Outcome` instead of throwing. */
  tryUnsealBox(box: BoxRecord): Promise<Outcome.Outcome<BoxUnsealed>> { return Outcome.outcomeOf(() => this.unsealBox(box)) }
  // --

  // == [Guards]: isEnabled, endCause, isLocked, isUnlocked, demandEnabled, demandOwnBox

  /** True until this bank is swept or its device ends. */
  get isEnabled(): boolean { return this.endCause === null }

  /** The refusal every call on this bank meets once it is swept or its device ends, or null while it is enabled. */
  get endCause(): Errors.VaultError | null { return this.#endCause ?? this.#device.endCause }

  /** True while the bank's gate is locked. */
  get isLocked(): boolean { return this.#gate.isLocked }

  /** True while the bank's gate is unlocked. */
  get isUnlocked(): boolean { return this.#gate.isUnlocked }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    const { endCause } = this
    if (endCause !== null) { throw endCause }
    return this
  }

  /** Demand that `box` is a box of this bank, under its current root box. */
  #demandOwnBox(box: unknown): void {
    const { lifepath } = BoxChecks.sealable.parseConsistent(box, this.scope, { kind: 'record_conflict' })
    if (lifepath.split('/', 1)[0] !== this.rootBox.lifeseq) { throw Throwers.boxOfOtherRoot() }
  }
  // --

  /** Always `'bank'`: this model's {@link Modelkind}. */
  get modelkind(): 'bank' { return 'bank' satisfies Modelkind }

  /** A bank's modelkind: the guards this class inherits answer for banks alone. */
  static override readonly modelkind = 'bank'
}

// == [Helpers]: trackPairOf

/** The revseq and lifepath of a Thing: the pair a `track` has. */
function trackPairOf({ revseq, lifepath }: Pick<ThingRecord, 'revseq' | 'lifepath'>): Track['bank'] { return { revseq, lifepath } }
// --

// == [Checks]: Checks

// Defined here, not with the shapes: they name a model class.
/** The checks of {@link Bank.make}'s arguments, {@link Bank.birth}'s device, and {@link Bank.hostVault}'s vault. */
const Checks = Validator.Checkers('bad_record', ({ obj, custom }) => ({
  device:      custom<Device>((val) => val instanceof Device, BigPhrases.DeviceExpected),
  hostedVault: custom<HostedVault>((val) => typeof (val as Partial<HostedVault> | null)?.sweep === 'function', Phrases.HostedVaultExpected),
  bankMakeArgs: obj({
    record: BankChecks.record,
    opts:   obj({
      device:  custom<Device>((val) => val instanceof Device, BigPhrases.DeviceExpected),
      vaultDB: ThingChecks.vaultDBShape,
      gate:    custom<Gate>((val) => val instanceof Gate, Phrases.GateExpected),
    }),
  }),
}))
// --
