import { Clock, Crypto, type Errors, Helpers, Outcome, Phrases as BigPhrases, Validator } from 'safebyok-big/internals'
import { type Adoptable, Thing } from './thing'
import { BaseBox } from './base-box'
import { Device } from './device'
import type { Gate } from './gate'
import type { BirthGating } from './gating'
import type { World } from './world'
import type { BirthCleartexts, BirthDna } from '../shapes/shapes-gateish'
import type { BankOpts, BankSnapshot, BoxUnsealed, HostedVault } from '../shapes/shapes-bankish'
import type { BoxCleartexts, BoxPublicProps, BoxTombstonePublicProps, LiveOf, LivePublicPropsOf, Sealable, ShellOf, TombstoneOf } from '../shapes/shapes-sealers'
import { type BankScope, type BankStamp, type GateStamp, StampChecks } from '../shapes/shapes-stamps'
import { type DeviceTok, type Lifetok, Labelpath, Lifeseq } from '../shapes/primitives'
import { type BankRecord, type BoxRecord, type Modelkind, ThingFormat } from '../shapes/shapes-thing'
import { BankChecks, BoxChecks, GateChecks } from '../shapes/shapes-thingkinds'
import type { PutAskDraft } from '../shapes/shapes-asks'
import * as Throwers from '../refusals/throwers'

/** The signed-in user's bank on this device: its main gate and its root box.
 * Boxes are sealed and unsealed under the lease its device's world holds. Its roots, as last heard of, are the Things its device's world keeps.
 * Over the shell or a tombstone, what needs a live record refuses `absent_thing`: its stamp, its root box, a seal, an unseal and a put.
 */
export class Bank extends Thing<BankRecord, BankScope, BankStamp, Adoptable<BankRecord>> {
  // == [Props]: lifetok, #device, #world

  // we are under-using the lifetok at the moment
  /** The token minted when this bank was born, which tells this life of the bank from any other under its banklabel. Absent over the shell. */
  declare readonly lifetok?: Lifetok

  readonly #device:   Device

  /** The device's world, which locks, unlocks and ends this bank. */
  readonly #world: World
  // --

  // == [Getters]: device, device_tok, scope, stamp, gate, rootBox, getSnapshot, subscribe

  /** The device this bank is on. */
  get device(): Device { return this.#device }

  /** This device's token, recorded in each wayin the bank builds. */
  get device_tok(): DeviceTok { return this.#device.device_tok }

  /** This bank's scope: its user and its `banklabel`. */
  get scope(): BankScope { return StampChecks.bankScope.parse(this) }

  /** This bank's {@link BankStamp}, which every ctx under it binds first. */
  get stamp(): BankStamp { return BankChecks.stamp.parse(this.#demandLive()) }

  /** The bank's main gate: the wayins a user unlocks with, and the form verbs that change them. The same object across a gate change.
   * Refuses `absent_thing` until the device's world has heard of it.
   */
  get gate(): Gate {
    const { gate } = this.#world
    if (gate === null) { throw Throwers.thingNotLive(Labelpath.MainGate) }
    return gate
  }

  // A bank of a life replaced since reads the root box of the life that replaced it: its boxes refuse as of another root box.
  /** The root box, as last heard of. Every box of this bank is under it. */
  get rootBox(): BoxRecord {
    this.#demandLive()
    const root = this.#world.rootBox?.pickle()
    if (root?.am !== 'a') { throw Throwers.worldNotHeard() }
    return root
  }

  /** The snapshot getter of the device's world ({@link World.getSnapshot}), already bound, as `useSyncExternalStore` wants it. */
  get getSnapshot(): () => BankSnapshot { return this.#world.getSnapshot }

  /** Subscribe a listener to the snapshot of the device's world ({@link World.subscribe}), returning its unsubscribe. Already bound, as `useSyncExternalStore` wants it. */
  override get subscribe(): (listener: () => void) => (() => void) { return this.#world.subscribe }
  // --

  // == [Construction]: make, constructor, adopt, mintStamps, makeRecord

  /** Make the bank of `record`, a whole bank record, live or a tombstone, or the bank's shell, on `opts.device`. Nothing is fetched or stored.
   * It is locked or unlocked as its device's world is, and finds its main gate there. Internal: the device's world makes the bank its SortedVaultDB keeps.
   */
  static make(record: BankRecord | ShellOf<BankRecord>, opts: BankOpts): Bank { return new Bank(record, opts) }

  // A bank models the very record it is handed, never the check's copy.
  private constructor(record: BankRecord | ShellOf<BankRecord>, opts: BankOpts) {
    const { opts: { device } } = Checks.bankMakeArgs.parse({ record, opts })
    Validator.checkedConsistent(StampChecks.bankScope.parse(record), device.scope, { kind: 'record_conflict' })
    super(record)
    this.#device = device
    this.#world  = device.world
  }

  // Thing's constructor calls this before this bank's own fields exist, so it reads and sets none of them.
  /** Model `record`, its lifetok a hidden read-only prop: the shell and a sparse tombstone have none. */
  protected override adopt(record: Adoptable<BankRecord>): void {
    super.adopt(record)
    if ('lifetok' in record) {
      Helpers.decorate<Bank>(this, { lifetok: record.lifetok }, { writable: false })
    } else {
      Reflect.deleteProperty(this, 'lifetok')
    }
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

  // == [Telling the host]: tellBadNews

  /** Tell the device's `onBadNews` of failures no caller is waiting on ({@link Device.tellBadNews}). Never throws. */
  tellBadNews(badnews: readonly unknown[]): void { this.#device.tellBadNews(badnews) }
  // --

  // == [Methods]: put

  /** Write `ask.record`, this bank's next revision, over `ask.cited`. Resolves the bank's Thing the store reports writing, which the bank in the device's world then models. */
  async put(ask: PutAskDraft<BankRecord>): Promise<BankRecord> {
    this.demandEnabled()
    this.#demandLive()
    return await this.#world.demandSortedVaultDB().putOnce(ask)
  }
  // --

  // == [Gate verbs]: birthGating, birth, ensureUnlocked, dismissUnlock, lock
  // The world's own, for a host's screen or a vault that wants the bank unlocked whichever way the user gets in. Every
  // other form verb is on the gate.

  /** The gating of {@link birth} over `params` ({@link World.birthGating}). Internal: make a birth's gating with {@link Device.birthGating}. */
  static birthGating(device: Device, params: FormData | BirthDna | BirthCleartexts): BirthGating { return Checks.device.parse(device).world.birthGating(params) }

  /** Birth the bank of `device`'s scope with the user's new passphrase and optional passkey, and resolve it unlocked. The device's bank is then this one.
   * A weak passphrase refuses `weak_passphrase`: show {@link Device.judgeStrength}'s verdict as the user types.
   * Where a live bank is already stored, it refuses `gate_made_elsewhere`, and the passphrase is not set.
   * Call it once the device's `signin` shows the stage `'unborn'`.
   */
  static async birth(device: Device, cleartexts: BirthCleartexts): Promise<Bank> { return await Checks.device.parse(device).birthGating(cleartexts).attempt() }

  /** Resolve this bank once its device's world is unlocked ({@link World.ensureUnlocked}). While it waits, the snapshot's `isUnlockWanted` is true. */
  async ensureUnlocked(): Promise<this> {
    await this.#world.ensureUnlocked()
    return this
  }

  /** Dismiss the awaited `unlock` gating ({@link World.dismissUnlock}): every call waiting in {@link ensureUnlocked} rejects `dismissed`. */
  dismissUnlock(): this {
    this.#world.dismissUnlock()
    return this
  }

  /** Lock the bank: its device's world drops its lease and the keys in it ({@link World.lock}). */
  lock(): this {
    this.#world.lock()
    return this
  }
  // --

  // == [Sweeping]: sweep, hostVault

  /** End this bank for good, with its device's world ({@link World.sweep}). Never throws. */
  sweep(): this {
    this.#world.sweep()
    return this
  }

  /** Sweep `vault` when this bank's world is swept ({@link World.hostVault}). Internal. */
  hostVault(vault: HostedVault): void { this.#world.hostVault(vault) }
  // --

  // == [Boxes]: sealBox, trySealBox, unsealBox, tryUnsealBox
  // The world's seal and unseal, for this bank's own boxes: only the bank knows its root box, whose lifeseq begins each box's
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
    return await this.#world.seal(BaseBox, donorProps, publicProps, secretProps)
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
    return await this.#world.unseal(BaseBox, box)
  }

  /** {@link unsealBox}, resolving an `Outcome` instead of throwing. */
  tryUnsealBox(box: BoxRecord): Promise<Outcome.Outcome<BoxUnsealed>> { return Outcome.outcomeOf(() => this.unsealBox(box)) }
  // --

  // == [Guards]: isEnabled, endCause, isLocked, isUnlocked, demandEnabled, demandLive, demandOwnBox

  /** True until this bank's world is swept or its device ends. */
  get isEnabled(): boolean { return this.#world.isEnabled }

  /** The refusal every call on this bank meets once its world is swept or its device ends, or null while it is enabled. */
  get endCause(): Errors.VaultError | null { return this.#world.endCause }

  /** True while the device's world holds no lease. */
  get isLocked(): boolean { return this.#world.isLocked }

  /** True while the device's world holds a lease. */
  get isUnlocked(): boolean { return this.#world.isUnlocked }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    this.#world.demandEnabled()
    return this
  }

  /** The live record this bank models, refusing the shell or a tombstone */
  #demandLive(): BankRecord {
    const record = this.pickle()
    if (record.am !== 'a') { throw Throwers.thingNotLive(this.labelpath) }
    return record
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

// == [Checks]: Checks

// Defined here, not with the shapes: they name a model class.
/** The checks of {@link Bank.make}'s arguments, and of the device {@link Bank.birth} and {@link Bank.birthGating} are handed. */
const Checks = Validator.Checkers('bad_record', ({ obj, custom }) => ({
  device:      custom<Device>((val) => val instanceof Device, BigPhrases.DeviceExpected),
  bankMakeArgs: obj({
    record: BankChecks.recordOrShell,
    opts:   obj({
      device:  custom<Device>(),
    }),
  }),
}))
// --
