import { Clock, Crypto, type Errors, Phrases as BigPhrases, Validator } from 'safebyok-big/internals'
import { type Adoptable, Thing } from './thing'
import { Device } from './device'
import type { Gate } from './gate'
import type { BirthGating } from './gating'
import type { World } from './world'
import type { BirthCleartexts, BirthDna } from '../shapes/shapes-gateish'
import type { BankOpts, HostedVault } from '../shapes/shapes-bankish'
import type { ShellOf } from '../shapes/shapes-sealers'
import { type BankScope, type BankStamp, type GateStamp, StampChecks } from '../shapes/shapes-stamps'
import { type DeviceTok, type Lifetok, Labelpath, Lifeseq } from '../shapes/primitives'
import { type BankRecord, type BoxRecord, type Modelkind, ThingFormat, ThingMakeChecks } from '../shapes/shapes-thing'
import { BankChecks, GateChecks } from '../shapes/shapes-thingkinds'
import type { PutAskDraft } from '../shapes/shapes-asks'
import * as Throwers from '../refusals/throwers'

/** The signed-in user's bank on this device: its main gate and its root box.
 * Its roots, as last heard of, are the Things its device's world keeps.
 * Over the shell or a tombstone, what needs a live record refuses `absent_thing`: its stamp, its root box and a put.
 */
export class Bank extends Thing<BankRecord, BankScope, BankStamp, Adoptable<BankRecord>> {
  // == [Props]: #device, #world

  readonly #device:   Device

  /** The device's world, which locks, unlocks and ends this bank. */
  readonly #world: World
  // --

  // == [Body]: lifetok

  // we are under-using the lifetok at the moment
  // Read off the record adopted: the shell and a sparse tombstone lack it.
  /** The token minted when this bank was born, which tells this life of the bank from any other under its banklabel. Undefined over the shell or a sparse tombstone. */
  get lifetok(): Lifetok | undefined {
    const record = this.pickle()
    return ('lifetok' in record) ? record.lifetok : undefined
  }
  // --

  // == [Getters]: device, device_tok, scope, stamp, gate, rootBox

  /** The device this bank is on. */
  get device(): Device { return this.#device }

  /** This device's token, recorded in each wayin the bank builds. */
  get device_tok(): DeviceTok { return this.#device.device_tok }

  /** This bank's scope: its user and its `banklabel`. */
  get scope(): BankScope { return StampChecks.bankScope.parse(this) }

  /** This bank's {@link BankStamp}, which every ctx under it binds first. */
  get stamp(): BankStamp { return BankChecks.stamp.parse(this.demandLive()) }

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
    this.demandLive()
    const root = this.#world.rootBox?.pickle()
    if (root?.am !== 'a') { throw Throwers.worldNotHeard() }
    return root
  }
  // --

  // == [Construction]: make, constructor, mintStamps, makeRecord

  /** Make the bank of `record`, a whole bank record, live or a tombstone, or the bank's shell, on `opts.device`. Nothing is fetched or stored.
   * It is locked or unlocked as its device's world is, and finds its main gate there. Each subscriber is wrapped by `opts.bulletproofCallback`, where given.
   * Internal: the device's world makes the bank its VaultMinder keeps.
   */
  static make(record: BankRecord | ShellOf<BankRecord>, opts: BankOpts): Bank { return new Bank(record, opts) }

  // A bank models the very record it is handed, never the check's copy.
  private constructor(record: BankRecord | ShellOf<BankRecord>, opts: BankOpts) {
    const { opts: { device, bulletproofCallback } } = Checks.bankMakeArgs.parse({ record, opts })
    Validator.checkedConsistent(StampChecks.bankScope.parse(record), device.scope, { kind: 'record_conflict' })
    super(record, bulletproofCallback)
    this.#device = device
    this.#world  = device.world
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
    this.demandLive()
    return await this.#world.demandVaultMinder().putOnce(ask)
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

  // == [Guards]: isEnabled, endCause, isLocked, isUnlocked, demandEnabled

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
    opts:   ThingMakeChecks.thingMakeOpts.extend({
      device:  custom<Device>(),
    }),
  }),
}))
// --
