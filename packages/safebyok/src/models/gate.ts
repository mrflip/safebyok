import { Clock, Crypto, type Errors, Validator } from 'safebyok-big/internals'
import { type Adoptable, Thing } from './thing'
import type { Device } from './device'
import { AddPasskeyGating, ReplacePassphraseGating, RevokePasskeyGating, UnlockGating } from './gating'
import type { Lease } from './lease'
import type { Proving } from './proving'
import { Wayin } from './wayin'
import type { World } from './world'
import type {
  AddPasskeyDna, GateDna, GateGatingFriend, PasskeyAddCleartexts, PasskeyRevokeCleartexts, PassphraseReplaceCleartexts, ReplacePassphraseDna,
  RevokePasskeyDna, UnlockCleartexts, UnlockDna, WorldGateFriend,
} from '../shapes/shapes-gateish'
import type * as Sealers from '../shapes/shapes-sealers'
import { type BankStamp, type GateStamp, type LeaseLoggable, type LeaseStamp, StampChecks } from '../shapes/shapes-stamps'
import { type GateRecord, type Modelkind, type Sparse, type ThingRecord, type ThingScope, type Wayins, ThingChecks, ThingFormat } from '../shapes/shapes-thing'
import { type ThingMakeOpts, ThingMakeChecks } from '../shapes/shapes-bankish'
import { type VaultItemEvent, SeenChecks } from '../shapes/shapes-vault-event'
import { GateChecks } from '../shapes/shapes-thingkinds'
import type { PutAskDraft } from '../shapes/shapes-asks'
import { type EpochMillis, Labelpath } from '../shapes/primitives'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'

/** A bank's gate: its passphrase wayin and its passkey wayin if it has one.
 * Its form verbs prove the user's cleartexts against its wayins, and an `unlock` gating builds a lease, which it hands to its device's world.
 * A gate change writes the gate, and this object then models the revision written.
 * Over the shell or a tombstone, its stamp, `main` and `passkey0` refuse `absent_thing`, and so does a gating's attempt, though its maker still takes in the cleartexts.
 */
export class Gate extends Thing<GateRecord, ThingScope, GateStamp, Adoptable<GateRecord>> implements GateStamp {
  // == [Props]: #device, #world, #friend

  readonly #device:    Device
  /** The world that holds the leases this gate builds. */
  readonly #world:     World
  /** The world's lease verbs. */
  readonly #friend:    WorldGateFriend
  // --

  // == [Body]: wayins, auth, sigs, meta
  // Read off the record adopted: a field it lacks reads as undefined.

  /** The wayin records, frozen, or undefined over the shell. */
  get wayins(): Wayins | undefined { return wholeOf(this.pickle())?.wayins }
  /** Reserved, and empty, or undefined over the shell. */
  get auth(): GateRecord['auth'] | undefined { return wholeOf(this.pickle())?.auth }
  /** Reserved, and empty, or undefined over the shell. */
  get sigs(): GateRecord['sigs'] | undefined { return wholeOf(this.pickle())?.sigs }
  /** Reserved, and empty, or undefined over the shell. */
  get meta(): GateRecord['meta'] | undefined { return wholeOf(this.pickle())?.meta }
  // --

  // == [Getters]: device, main, passkey0, scope, stamp, bankStamp, leaseEndsAt, leaseLoggable

  /** The device this gate's bank is on. */
  get device(): Device { return this.#device }

  /** The passphrase wayin, a new Wayin on each read. */
  get main(): Wayin { return Wayin.make(this.demandLive().wayins.main) }

  /** The passkey wayin, a new Wayin on each read, or null if the gate has none. */
  get passkey0(): Wayin | null {
    const { passkey0 } = this.demandLive().wayins
    return (passkey0 === null) ? null : Wayin.make(passkey0)
  }

  /** This gate's scope: its bank's, and its `labelpath`. */
  get scope(): ThingScope { return ThingChecks.thingScope.parse(this) }

  /** This gate's stamp, fixed for its life. A wayin's wrapped bankKey is bound to it. */
  get stamp(): GateStamp { return GateChecks.stamp.parse(this.demandLive()) }

  /** The stamp of this gate's bank, from its world. A wayin's wrapped bankKey is bound to it, and to the gate's own `stamp`, and every ctx under the gate's lease binds it first. */
  get bankStamp(): BankStamp { return this.#world.bankStamp }

  /** When the world's lease stops unlocking the bank, or null while locked ({@link World.leaseEndsAt}). */
  get leaseEndsAt(): EpochMillis | null { return this.#world.leaseEndsAt }

  /** What a log wants of the world's lease, or null while locked ({@link World.leaseLoggable}). */
  get leaseLoggable(): LeaseLoggable | null { return this.#world.leaseLoggable }
  // --

  // == [Construction]: make, constructor, adopt, makeRecord, makeNextRecord

  /** Make the gate at `begun`, its shell, or an item event of its record, which it then receives, handing its leases to `opts.world` through `friend`. Locked, and nothing is fetched or stored.
   * Throws where it refuses `begun`'s record.
   * Internal: the device's world makes the gate its VaultMinder keeps.
   */
  static make(begun: Sealers.ShellOf<GateRecord> | VaultItemEvent<GateRecord>, opts: ThingMakeOpts, friend: WorldGateFriend): Gate {
    Checks.gateMakeArgs.parse({ begun, opts, friend })
    const { world } = opts
    const seen = ('eventkind' in begun) ? begun.val : begun
    // A gate's life is its own, so only the bank's scope is checked: a gate of another life of the bank passes.
    Validator.checkedConsistent(StampChecks.bankScope.parse(seen), world.device.scope, { kind: 'record_conflict' })
    const gate = new Gate(super.shellOf(seen), world, friend)
    if ('eventkind' in begun) { gate.receive(begun) }
    return gate
  }

  private constructor(shell: Sealers.ShellOf<GateRecord>, world: World, friend: WorldGateFriend) {
    super(shell, world.bulletproofCallback)
    this.#device    = world.device
    this.#world     = world
    this.#friend    = friend
  }

  // Thing's constructor calls this before this gate's own fields exist, so it reads and sets none of them.
  /** Model `record`, its wayins checked first where it has them. */
  protected override adopt(record: Adoptable<GateRecord>): void {
    if ('wayins' in record) { GateChecks.wayins.parse(record.wayins) }
    super.adopt(record)
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
    return GateChecks.record.parse({ ...citedRecord, ...super.revisionAfter(citedRecord, Clock.nowMillis()), wayins: wayinsOf(nextWayins) })
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
      putGate:         (ask: Omit<PutAskDraft<GateRecord>, 'track' | 'banktok'>) => this.#putGate(ask),
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

  /** Write `ask.record`, this gate's next revision, over `ask.cited`. Resolves this gate, which then models the revision written. */
  async #putGate(ask: Omit<PutAskDraft<GateRecord>, 'track' | 'banktok'>): Promise<this> {
    this.demandEnabled()
    await this.#world.demandVaultMinder().putOnce(ask)
    return this
  }
  // --

  // == [Locking]: lock

  /** Lock this gate's world: drop its lease and the keys in it ({@link World.lock}). */
  lock(): this {
    this.#world.lock()
    return this
  }
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

  /** True until its device ends. */
  get isEnabled(): boolean { return this.#world.isEnabled }

  /** The refusal every call on this gate meets once its device ends, or null while it is enabled. */
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
    if (this.demandLive().wayins.passkey0 !== null) { throw Throwers.passkeyAlreadyAdded() }
  }
  // --

  /** Always `'gate'`: this model's {@link Modelkind}. */
  get modelkind(): 'gate' { return 'gate' satisfies Modelkind }

  /** A gate's modelkind: the guards this class inherits answer for gates alone. */
  static override readonly modelkind = 'gate'
}

// == [Helpers]: wholeOf, wayinsOf

/** `record` where it has a gate's body, else undefined: the shell */
function wholeOf(record: Adoptable<GateRecord>): GateRecord | undefined { return ('wayins' in record) ? record : undefined }

// A Wayin's pickle is typed as either kind; the gate record's parse checks each is the kind its label wants.
/** The frozen records of `wayins`, its passkey0 null for none. */
function wayinsOf({ main, passkey0 }: GateDna['wayins']): Wayins {
  return Object.freeze({ main: main.pickle(), passkey0: passkey0?.pickle() ?? null }) as Wayins
}

// --

// == [Checks]: Checks

// Defined here, not with the shapes: they name a model class.
/** The checks of the arguments of {@link Gate.make}, {@link Gate.makeRecord} and {@link Gate.makeNextRecord}. */
const Checks = Validator.Checkers('bad_record', ({ obj, custom, fn, union }) => {
  const wayin = custom<Wayin>()
  const wayins = obj({ main: wayin, passkey0: wayin.nullable() })
  return {
    gateMakeArgs:   obj({
      begun:  union([GateChecks.shell, SeenChecks.itemEvent]).refine(({ labelpath }) => Labelpath.isOfModelkind(labelpath, 'gate'), Phrases.BegunOfOtherKind),
      opts:   ThingMakeChecks.thingMakeOpts,
      friend: obj({ leaseGateOf: fn<WorldGateFriend['leaseGateOf']>(), renewal: fn<WorldGateFriend['renewal']>(), attachLease: fn<WorldGateFriend['attachLease']>() }),
    }),
    makeRecordArgs: GateChecks.stamp.extend({ wayins }),
    nextRecordArgs: obj({ cited: GateChecks.record, wayins }),
  }
})
// --
