import { Clock, Crypto, type Errors, Validator } from 'safebyok-big/internals'
import { Thing } from './thing'
import type { Bank } from './bank'
import type { Device } from './device'
import { AddPasskeyGating, BirthGating, ReplacePassphraseGating, RevokePasskeyGating, UnlockGating } from './gating'
import type { Lease } from './lease'
import type { Proving } from './proving'
import { Wayin } from './wayin'
import type { World } from './world'
import type {
  AddPasskeyDna, BirthCleartexts, BirthDna, GateDna, GateGatingFriend, GateOpts, PasskeyAddCleartexts, PasskeyRevokeCleartexts, PassphraseReplaceCleartexts, ReplacePassphraseDna,
  RevokePasskeyDna, UnlockCleartexts, UnlockDna, WorldGateFriend,
} from '../shapes/shapes-gateish'
import type * as Sealers from '../shapes/shapes-sealers'
import { type BankStamp, type GateStamp, type LeaseLoggable, type LeaseStamp, StampChecks } from '../shapes/shapes-stamps'
import { type GateRecord, type Modelkind, type Sparse, type ThingRecord, type ThingScope, type Wayins, ThingChecks, ThingFormat } from '../shapes/shapes-thing'
import { BankChecks, GateChecks } from '../shapes/shapes-thingkinds'
import { type PutAskDraft, putAskOf } from '../shapes/shapes-asks'
import type { EpochMillis } from '../shapes/primitives'
import * as Throwers from '../refusals/throwers'

/** A bank's gate: its passphrase wayin and its passkey wayin if it has one.
 * Its form verbs prove the user's cleartexts against its wayins, and an `unlock` gating builds a lease, which it hands to its device's world.
 * A gate change writes the gate, and this object then models the revision written.
 */
export class Gate extends Thing<GateRecord, ThingScope, GateStamp> implements GateStamp {
  // == [Props]: wayins, #device, #world, #friend, #bankStamp, #main, #passkey0

  /** The wayin records, frozen. */
  declare readonly wayins: Wayins

  readonly #device:    Device
  /** The world that holds the leases this gate builds. */
  readonly #world:     World
  /** The world's lease verbs. */
  readonly #friend:    WorldGateFriend
  readonly #bankStamp: BankStamp

  // Set again where a gate change lands, from the record written.
  /** The passphrase wayin. */
  #main:     Wayin
  /** The passkey wayin, or null for none. */
  #passkey0: Wayin | null
  // --

  // == [Getters]: device, main, passkey0, scope, stamp, bankStamp, leaseEndsAt, leaseLoggable

  /** The device this gate's bank is on. */
  get device(): Device { return this.#device }

  /** The passphrase wayin. */
  get main(): Wayin { return this.#main }

  /** The passkey wayin, or null if the gate has none. */
  get passkey0(): Wayin | null { return this.#passkey0 }

  /** This gate's scope: its bank's, and its `labelpath`. */
  get scope(): ThingScope { return ThingChecks.thingScope.parse(this) }

  /** This gate's stamp, fixed for its life. A wayin's wrapped bankKey is bound to it. */
  get stamp(): GateStamp { return GateChecks.stamp.parse(this) }

  /** The stamp of this gate's bank. A wayin's wrapped bankKey is bound to it, and to the gate's own `stamp`, and every ctx under the gate's lease binds it first. */
  get bankStamp(): BankStamp { return this.#bankStamp }

  /** When the world's lease stops unlocking the bank, or null while locked ({@link World.leaseEndsAt}). */
  get leaseEndsAt(): EpochMillis | null { return this.#world.leaseEndsAt }

  /** What a log wants of the world's lease, or null while locked ({@link World.leaseLoggable}). */
  get leaseLoggable(): LeaseLoggable | null { return this.#world.leaseLoggable }
  // --

  // == [Construction]: make, constructor, makeRecord, makeNextRecord

  /** Make the gate of `record`, of the bank stamped `opts.bankStamp`, on `opts.device`, handing its leases to the world through `friend`. Locked, and nothing is fetched or stored.
   * Internal: make a gate with `device.world.makeGate`.
   */
  static make(record: GateRecord, opts: GateOpts, friend: WorldGateFriend): Gate {
    const { record: gateRecord, opts: { device, bankStamp }, friend: worldFriend } = Checks.gateMakeArgs.parse({ record, opts, friend })
    // A gate's life is its own, so only the bank's scope is checked: a gate of another life of the bank passes.
    Validator.checkedConsistent(StampChecks.bankScope.parse(bankStamp), device.scope, { kind: 'record_conflict' })
    Validator.checkedConsistent(gateRecord, StampChecks.bankScope.parse(bankStamp), { kind: 'record_conflict' })
    return new Gate(gateRecord, { device, bankStamp }, worldFriend)
  }

  private constructor(gateRecord: GateRecord, opts: GateOpts, friend: WorldGateFriend) {
    const main = Wayin.make(gateRecord.wayins.main)
    const passkey0 = (gateRecord.wayins.passkey0 === null) ? null : Wayin.make(gateRecord.wayins.passkey0)
    super({ ...gateRecord, wayins: wayinsOf({ main, passkey0 }) })
    this.#device    = opts.device
    this.#world     = opts.device.world
    this.#friend    = friend
    this.#bankStamp = Object.freeze(opts.bankStamp)
    this.#main      = main
    this.#passkey0  = passkey0
    // The world's sweep lets go of this listener.
    this.#world.subscribe(() => { this.#tell() })
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

  // == [Form verbs]: birthGating, unlockGating, gatingUnlockAttempt, unlock, replacePassphraseGating, gatingReplacePassphraseAttempt, replacePassphrase, addPasskeyGating, gatingAddPasskeyAttempt, addPasskey, revokePasskeyGating, gatingRevokePasskeyAttempt, revokePasskey, gatingFriend
  // Each maker hands what a form collected, unread, to a gating in gating.ts, with a friend of this gate's private
  // verbs: no public method accepts a proving (G9). Each verb attempts the gating its maker makes, which is vacated
  // whatever its outcome, and changes nothing where it refuses.
  // A maker takes a `FormData`, a dna in a form's fieldnames, or the cleartexts in the names a gating's body takes.

  /** The gating of `Bank.birth` over `params`, handing `attachBank`, where given, the bank it births. Internal: make a birth's gating with `device.birthGating`. */
  static birthGating(device: Device, params: FormData | BirthDna | BirthCleartexts, attachBank?: (bank: Bank) => void): BirthGating {
    const attacher = Checks.attachBank.parse(attachBank)
    return new BirthGating(device, params, {
      // A birth's lease is born when proved, and reaches the world only with the bank it births.
      leaseByProving: (gate: Gate, proving: Proving) => gate.#buildLease(proving, null),
      attachBank:     (bank: Bank, lease: Lease) => {
        bank.gate.#friend.attachLease(lease)
        attacher?.(bank)
      },
    })
  }

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

  // == [The gatings' private verbs]: unlockByProving, buildLease, putGate, adopt

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
    return await proved.buildLease(this.#friend.leaseGateOf(this.#bankStamp), this, renewed)
  }

  /** Write `ask.record`, this gate's next revision, over `ask.cited`, and model the revision written, which its bank's world then shows. Resolves this gate. */
  async #putGate(ask: PutAskDraft<GateRecord>): Promise<this> {
    this.demandEnabled()
    const answer = await this.#device.bankMinder.tryWrite({ ...putAskOf<GateRecord>(ask), modelkind: 'gate' })
    if (! answer.ok) { throw answer.err }
    // The ask's modelkind is the gate's, which the vaultDB checks what it answers against.
    this.#adopt(answer.val as GateRecord)
    return this
  }

  /** Model `record`, a newer revision of this gate's life: its Thing fields and its wayins. */
  #adopt(record: GateRecord): void {
    const main = Wayin.make(record.wayins.main)
    const passkey0 = (record.wayins.passkey0 === null) ? null : Wayin.make(record.wayins.passkey0)
    this.adopt({ ...record, wayins: wayinsOf({ main, passkey0 }) })
    this.#main     = main
    this.#passkey0 = passkey0
    this.#tell()
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

  // == [Guards]: isEnabled, endCause, isLocked, isUnlocked, isUnlockWanted, demandEnabled, demandPasskeyAddable

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
    if (this.#passkey0 !== null) { throw Throwers.passkeyAlreadyAdded() }
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
/** The checks of the arguments of {@link Gate.make}, {@link Gate.makeRecord} and {@link Gate.makeNextRecord}, and of {@link Gate.birthGating}'s `attachBank`. */
const Checks = Validator.Checkers('bad_record', ({ obj, custom, fn }) => {
  const wayin = custom<Wayin>()
  const wayins = obj({ main: wayin, passkey0: wayin.nullable() })
  return {
    gateMakeArgs:   obj({
      record: GateChecks.record,
      opts:   obj({
        device:    custom<Device>(),
        bankStamp: BankChecks.stamp,
      }),
      friend: obj({ leaseGateOf: fn<WorldGateFriend['leaseGateOf']>(), renewal: fn<WorldGateFriend['renewal']>(), attachLease: fn<WorldGateFriend['attachLease']>() }),
    }),
    makeRecordArgs: GateChecks.stamp.extend({ wayins }),
    nextRecordArgs: obj({ cited: GateChecks.record, wayins }),
    attachBank:     fn<(bank: Bank) => void>().optional(),
  }
})
// --
