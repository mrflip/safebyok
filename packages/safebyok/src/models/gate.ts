import { Clock, Crypto, type Errors, Helpers, Validator } from 'safebyok-big/internals'
import { type Adoptable, Thing } from './thing'
import type { Device } from './device'
import { AddPasskeyGating, ReplacePassphraseGating, RevokePasskeyGating, UnlockGating } from './gating'
import type { Lease } from './lease'
import type { Proving } from './proving'
import { Wayin } from './wayin'
import type { World } from './world'
import type {
  AddPasskeyDna, GateDna, GateGatingFriend, GateOpts, PasskeyAddCleartexts, PasskeyRevokeCleartexts, PassphraseReplaceCleartexts, ReplacePassphraseDna,
  RevokePasskeyDna, UnlockCleartexts, UnlockDna, WorldGateFriend,
} from '../shapes/shapes-gateish'
import type * as Sealers from '../shapes/shapes-sealers'
import { type BankStamp, type GateStamp, type LeaseLoggable, type LeaseStamp, StampChecks } from '../shapes/shapes-stamps'
import { type GateRecord, type Modelkind, type Sparse, type ThingRecord, type ThingScope, type Wayins, ThingChecks, ThingFormat } from '../shapes/shapes-thing'
import { GateChecks } from '../shapes/shapes-thingkinds'
import type { PutAskDraft } from '../shapes/shapes-asks'
import type { EpochMillis } from '../shapes/primitives'
import * as Throwers from '../refusals/throwers'

/** A bank's gate: its passphrase wayin and its passkey wayin if it has one.
 * Its form verbs prove the user's cleartexts against its wayins, and an `unlock` gating builds a lease, which it hands to its device's world.
 * A gate change writes the gate, and this object then models the revision written.
 * Over the shell or a tombstone, its stamp, `main` and `passkey0` refuse `absent_thing`, and so does a gating's attempt, though its maker still takes in the cleartexts.
 */
export class Gate extends Thing<GateRecord, ThingScope, GateStamp, Adoptable<GateRecord>> implements GateStamp {
  // == [Props]: wayins, #device, #world, #friend

  /** The wayin records, frozen, or absent over the shell or a sparse tombstone. */
  declare readonly wayins?: Wayins
  declare readonly auth?:   GateRecord['auth']
  declare readonly sigs?:   GateRecord['sigs']
  declare readonly meta?:   GateRecord['meta']

  readonly #device:    Device
  /** The world that holds the leases this gate builds. */
  readonly #world:     World
  /** The world's lease verbs. */
  readonly #friend:    WorldGateFriend
  // --

  // == [Getters]: device, main, passkey0, scope, stamp, bankStamp, leaseEndsAt, leaseLoggable

  /** The device this gate's bank is on. */
  get device(): Device { return this.#device }

  /** The passphrase wayin, a new Wayin on each read. */
  get main(): Wayin { return Wayin.make(this.#demandLive().wayins.main) }

  /** The passkey wayin, a new Wayin on each read, or null if the gate has none. */
  get passkey0(): Wayin | null {
    const { passkey0 } = this.#demandLive().wayins
    return (passkey0 === null) ? null : Wayin.make(passkey0)
  }

  /** This gate's scope: its bank's, and its `labelpath`. */
  get scope(): ThingScope { return ThingChecks.thingScope.parse(this) }

  /** This gate's stamp, fixed for its life. A wayin's wrapped bankKey is bound to it. */
  get stamp(): GateStamp { return GateChecks.stamp.parse(this.#demandLive()) }

  /** The stamp of this gate's bank, from its world. A wayin's wrapped bankKey is bound to it, and to the gate's own `stamp`, and every ctx under the gate's lease binds it first. */
  get bankStamp(): BankStamp { return this.#world.bankStamp }

  /** When the world's lease stops unlocking the bank, or null while locked ({@link World.leaseEndsAt}). */
  get leaseEndsAt(): EpochMillis | null { return this.#world.leaseEndsAt }

  /** What a log wants of the world's lease, or null while locked ({@link World.leaseLoggable}). */
  get leaseLoggable(): LeaseLoggable | null { return this.#world.leaseLoggable }
  // --

  // == [Construction]: make, constructor, adopt, makeRecord, makeNextRecord

  /** Make the gate of `record`, on `opts.device`, handing its leases to the world through `friend`. Locked, and nothing is fetched or stored.
   * `record` is a whole gate record or the gate's shell.
   * Internal: the device's world makes the gate its SortedVaultDB keeps.
   */
  static make(record: GateRecord | Sealers.ShellOf<GateRecord>, opts: GateOpts, friend: WorldGateFriend): Gate {
    const { opts: { device }, friend: worldFriend } = Checks.gateMakeArgs.parse({ record, opts, friend })
    // A gate's life is its own, so only the bank's scope is checked: a gate of another life of the bank passes.
    Validator.checkedConsistent(StampChecks.bankScope.parse(record), device.scope, { kind: 'record_conflict' })
    // A gate models the very record it is handed, never the check's copy.
    return new Gate(record, { device }, worldFriend)
  }

  private constructor(begun: GateRecord | Sealers.ShellOf<GateRecord>, opts: GateOpts, friend: WorldGateFriend) {
    super(begun)
    this.#device    = opts.device
    this.#world     = opts.device.world
    this.#friend    = friend
    // The world's sweep lets go of this listener.
    this.#world.subscribe(() => { this.#tell() })
  }

  // Thing's constructor calls this before this gate's own fields exist, so it reads and sets none of them.
  /** Model `record`, its wayins checked, and they and its reserved bags hidden read-only props: the shell and a sparse tombstone have none. */
  protected override adopt(record: Adoptable<GateRecord>): void {
    if ('wayins' in record) {
      const { wayins, auth, sigs, meta } = record
      GateChecks.wayins.parse(wayins)
      super.adopt(record)
      Helpers.decorate<Gate>(this, { wayins, auth, sigs, meta }, { writable: false })
    } else {
      super.adopt(record)
      for (const fieldname of ['wayins', 'auth', 'sigs', 'meta']) { Reflect.deleteProperty(this, fieldname) }
    }
  }

  /** The first record of a new main gate, made from `dna`, born at its stamp's `born_at`. */
  static makeRecord(dna: GateDna): GateRecord {
    const { wayins, ...stamp } = Checks.makeRecordArgs.parse(dna)
    return GateChecks.record.parse({
      ...stamp, label: stamp.labelpath, fmt: ThingFormat, revtok: Crypto.randomId(), revseq: 0, am: 'a',
      lifepath: stamp.lifeseq, written_at: stamp.born_at, wayins: wayinsOf(wayins), auth: {}, sigs: {}, meta: {},
    })
  }

  /** The record of the revision after `cited`, written now, with `wayins` in place of its own. */
  static makeNextRecord(cited: GateRecord, wayins: GateDna['wayins']): GateRecord {
    const { cited: citedRecord, wayins: nextWayins } = Checks.nextRecordArgs.parse({ cited, wayins })
    return GateChecks.record.parse({ ...citedRecord, revtok: Crypto.randomId(), revseq: citedRecord.revseq + 1, written_at: Clock.nowMillis(), wayins: wayinsOf(nextWayins) })
  }
  // --

  // == [Form verbs]: unlockGating, gatingUnlockAttempt, unlock, replacePassphraseGating, gatingReplacePassphraseAttempt, replacePassphrase, addPasskeyGating, gatingAddPasskeyAttempt, addPasskey, revokePasskeyGating, gatingRevokePasskeyAttempt, revokePasskey, gatingFriend
  // Each maker hands what a form collected, unread, to a gating in gating.ts, with a friend of this gate's private
  // verbs: no public method accepts a proving (G9). Each verb attempts the gating its maker makes, which is vacated
  // whatever its outcome, and changes nothing where it refuses.
  // A maker takes a `FormData`, a dna in a form's fieldnames, or the cleartexts in the names a gating's body takes.

  /** The gating of {@link unlock} over `params`, for a form mutation to attempt. A `FormData` loses its `passphrase` field, and `nextPassphrase` and `confirmation`, at once. */
  unlockGating(params: FormData | UnlockDna | UnlockCleartexts): UnlockGating { return new UnlockGating(this, params, this.#gatingFriend()) }

  /** Unlock this gate by the passphrase, or the passkey's answer, in a form or a dna, as {@link unlock} does.
   * A `FormData` loses its `passphrase`, `nextPassphrase` and `confirmation` fields before anything is awaited; its other fields stay. A dna's fields are never changed, but a passkey answer's PRF bytes are zeroed.
   * @example
   *   await gate.gatingUnlockAttempt(new FormData(formEl))
   * @example
   *   await gate.gatingUnlockAttempt({ passkeyAnswer: await askPasskey(header) })
   */
  async gatingUnlockAttempt(params: FormData | UnlockDna): Promise<Gate> { return await this.unlockGating(params).attempt() }

  /** Unlock this gate by its passphrase or its passkey, resuming every call waiting in {@link ensureUnlocked}.
   * A wrong one refuses `wrong_passphrase` or `wrong_passkey`, and the gate is unchanged.
   */
  async unlock(cleartexts: UnlockCleartexts): Promise<this> {
    await this.unlockGating(cleartexts).attempt()
    return this
  }

  /** The gating of {@link replacePassphrase} over `params`, for a form mutation to attempt. A `FormData` loses its `passphrase`, `nextPassphrase` and `confirmation` fields at once. */
  replacePassphraseGating(params: FormData | ReplacePassphraseDna | PassphraseReplaceCleartexts): ReplacePassphraseGating { return new ReplacePassphraseGating(this, params, this.#gatingFriend()) }

  /** Replace the passphrase by `nextPassphrase`, proved by the `passphrase` or the passkey's answer, in a form or a dna, as {@link replacePassphrase} does.
   * A `FormData` loses its `passphrase`, `nextPassphrase` and `confirmation` fields before anything is awaited; its other fields stay. A dna's fields are never changed, but a passkey answer's PRF bytes are zeroed.
   */
  async gatingReplacePassphraseAttempt(params: FormData | ReplacePassphraseDna): Promise<Gate> { return await this.replacePassphraseGating(params).attempt() }

  /** Replace the passphrase, proved by the current passphrase or the passkey, and leave the gate unlocked.
   * The passkey stays, and the bankKey does not change.
   * A new passphrase that is weak, or the same as the current one, refuses (`weak_passphrase`, `same_passphrase`).
   */
  async replacePassphrase(cleartexts: PassphraseReplaceCleartexts): Promise<this> {
    await this.replacePassphraseGating(cleartexts).attempt()
    return this
  }

  /** The gating of {@link addPasskey} over `params`, for a form mutation to attempt. */
  addPasskeyGating(params: FormData | AddPasskeyDna | PasskeyAddCleartexts): AddPasskeyGating { return new AddPasskeyGating(this, params, this.#gatingFriend()) }

  // A FormData cannot carry a passkey's answer, so only a dna can add one.
  /** Add the passkey whose answer is `nextPasskeyAnswer`, proved by the `passphrase`, as {@link addPasskey} does. The dna is never changed, but the answer's PRF bytes are zeroed. */
  async gatingAddPasskeyAttempt(params: AddPasskeyDna): Promise<Gate> { return await this.addPasskeyGating(params).attempt() }

  /** Add a passkey, proved by the passphrase, and leave the gate unlocked.
   * A gate has one passkey at most, so this refuses while it has one: revoke that one first.
   */
  async addPasskey(cleartexts: PasskeyAddCleartexts): Promise<this> {
    await this.addPasskeyGating(cleartexts).attempt()
    return this
  }

  /** The gating of {@link revokePasskey} over `params`, for a form mutation to attempt. A `FormData` loses its `passphrase`, `nextPassphrase` and `confirmation` fields at once. */
  revokePasskeyGating(params: FormData | RevokePasskeyDna | PasskeyRevokeCleartexts): RevokePasskeyGating { return new RevokePasskeyGating(this, params, this.#gatingFriend()) }

  /** Revoke the passkey, proved by the `passphrase` or the passkey's answer, in a form or a dna, as {@link revokePasskey} does.
   * A `FormData` loses its `passphrase`, `nextPassphrase` and `confirmation` fields before anything is awaited; its other fields stay. A dna's fields are never changed, but a passkey answer's PRF bytes are zeroed.
   */
  async gatingRevokePasskeyAttempt(params: FormData | RevokePasskeyDna): Promise<Gate> { return await this.revokePasskeyGating(params).attempt() }

  /** Revoke the passkey, proved by the passphrase or the passkey itself, and leave the gate unlocked.
   * With no passkey, the proof only unlocks the gate. The bankKey does not change.
   */
  async revokePasskey(cleartexts: PasskeyRevokeCleartexts): Promise<this> {
    await this.revokePasskeyGating(cleartexts).attempt()
    return this
  }

  /** This gate's private verbs, for a gating to call. */
  #gatingFriend(): GateGatingFriend {
    return {
      unlockByProving: (proved: Proving) => this.#unlockByProving(proved),
      putGate:         (ask: PutAskDraft<GateRecord>) => this.#putGate(ask),
    }
  }
  // --

  // == [The awaited `unlock` gating]: ensureUnlocked, dismissUnlock

  /** Resolve this gate once its world is unlocked ({@link World.ensureUnlocked}). While it waits, {@link isUnlockWanted} is true: render the unlock form, and call {@link unlock} from it. */
  async ensureUnlocked(): Promise<this> {
    await this.#world.ensureUnlocked()
    return this
  }

  /** Dismiss the awaited `unlock` gating ({@link World.dismissUnlock}): every call waiting in {@link ensureUnlocked} rejects `dismissed`. */
  dismissUnlock(): this {
    this.#world.dismissUnlock()
    return this
  }
  // --

  // == [The gatings' private verbs]: unlockByProving, buildLease, putGate

  /** Unlock this gate's world under a lease `proved` builds, citing the revision this gate models.
   * A lease the world holds is renewed: the new one keeps its `born_at`.
   */
  async #unlockByProving(proved: Proving): Promise<this> {
    const lease = await this.#buildLease(proved, this.#friend.renewal())
    this.#friend.attachLease(lease)
    return this
  }

  /** A lease `proved` builds, granted in this gate's world under its bank's stamp and citing the revision this gate models, keeping the `born_at` of `renewed` where given. */
  async #buildLease(proved: Proving, renewed: Pick<LeaseStamp, 'born_at'> | null): Promise<Lease> {
    return await proved.buildLease(this.#friend.leaseGateOf(this.bankStamp), this, renewed)
  }

  /** Write `ask.record`, this gate's next revision, over `ask.cited`, and tell this gate's subscribers. Resolves this gate, which then models the revision written. */
  async #putGate(ask: PutAskDraft<GateRecord>): Promise<this> {
    this.demandEnabled()
    await this.#world.demandSortedVaultDB().putOnce(ask)
    this.#tell()
    return this
  }
  // --

  // == [Locking and sweeping]: lock, sweep, tell

  /** Lock this gate's world: drop its lease and the keys in it ({@link World.lock}). */
  lock(): this {
    this.#world.lock()
    return this
  }

  /** End this gate's world for good, and with it the bank ({@link World.sweep}). An `endCause` that is not a refusal refuses `bad_record`; nothing else throws. */
  sweep(endCause: Errors.VaultError | null = null): this {
    this.#world.sweep(endCause)
    return this
  }

  // A subscriber is told after a gate change, and after each change to the world's snapshot: an unlock, a lock, a wait in
  // ensureUnlocked opened or settled, and the world's end.
  /** Tell each subscriber of a change, handing what one throws to the device's `onBadNews`. */
  #tell(): void { this.tellSubscribers((err) => { this.#device.tellBadNews([err]) }) }
  // --

  // == [Sealing under the lease]: seal, unseal

  /** Seal and return the next revision after `donorProps`, under the world's lease ({@link World.seal}). Needs the world unlocked. */
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
    return await this.#world.seal(sealer, donorProps, publicProps, secretProps)
  }

  /** Unseal `record` under the world's lease ({@link World.unseal}). Needs the world unlocked. */
  async unseal<RecordT extends Sparse<ThingRecord>, CleartextsT>(sealer: Sealers.Sealer<RecordT, CleartextsT>, record: RecordT): Promise<Sealers.UnsealedOf<RecordT, CleartextsT>> {
    return await this.#world.unseal(sealer, record)
  }
  // --

  // == [Guards]: isEnabled, endCause, isLocked, isUnlocked, isUnlockWanted, demandEnabled, demandPasskeyAddable, demandLive

  /** True until this gate's world is swept or its device ends. */
  get isEnabled(): boolean { return this.#world.isEnabled }

  /** The refusal every call on this gate meets once its world is swept or its device ends, or null while it is enabled. */
  get endCause(): Errors.VaultError | null { return this.#world.endCause }

  /** True while this gate's world holds no lease. */
  get isLocked(): boolean { return this.#world.isLocked }

  /** True while this gate's world holds a lease. */
  get isUnlocked(): boolean { return this.#world.isUnlocked }

  /** True while a call waits in {@link ensureUnlocked}: render the unlock form while it is. */
  get isUnlockWanted(): boolean { return this.#world.isUnlockWanted }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    this.#world.demandEnabled()
    return this
  }

  /** Demand that this gate has no passkey wayin yet. */
  demandPasskeyAddable(): void {
    if (this.#demandLive().wayins.passkey0 !== null) { throw Throwers.passkeyAlreadyAdded() }
  }

  /** The live record this gate models, refusing the shell or a tombstone */
  #demandLive(): GateRecord {
    const record = this.pickle()
    if (record.am !== 'a') { throw Throwers.thingNotLive(this.labelpath) }
    return record
  }
  // --

  /** Always `'gate'`: this model's {@link Modelkind}. */
  get modelkind(): 'gate' { return 'gate' satisfies Modelkind }

  /** A gate's modelkind: the guards this class inherits answer for gates alone. */
  static override readonly modelkind = 'gate'
}

// == [Helpers]: wayinsOf

// A Wayin's pickle is typed as either kind; the gate record's parse checks each is the kind its label wants.
/** The frozen records of `wayins`, its passkey0 null for none. */
function wayinsOf({ main, passkey0 }: GateDna['wayins']): Wayins {
  return Object.freeze({ main: main.pickle(), passkey0: passkey0?.pickle() ?? null }) as Wayins
}

// --

// == [Checks]: Checks

// Defined here, not with the shapes: they name a model class.
/** The checks of the arguments of {@link Gate.make}, {@link Gate.makeRecord} and {@link Gate.makeNextRecord}. */
const Checks = Validator.Checkers('bad_record', ({ obj, custom, fn }) => {
  const wayin = custom<Wayin>()
  const wayins = obj({ main: wayin, passkey0: wayin.nullable() })
  return {
    gateMakeArgs:   obj({
      record: GateChecks.recordOrShell,
      opts:   obj({ device: custom<Device>() }),
      friend: obj({ leaseGateOf: fn<WorldGateFriend['leaseGateOf']>(), renewal: fn<WorldGateFriend['renewal']>(), attachLease: fn<WorldGateFriend['attachLease']>() }),
    }),
    makeRecordArgs: GateChecks.stamp.extend({ wayins }),
    nextRecordArgs: obj({ cited: GateChecks.record, wayins }),
  }
})
// --
