import { Clock, type Errors, Validator } from 'safebyok-big/internals'
import { type Adoptable, Thing } from './thing'
import type { Device } from './device'
import { AddPasskeyGating, ReplacePassphraseGating, RevokePasskeyGating, UnlockGating } from './gating'
import type { Proving } from './proving'
import { Wayin } from './wayin'
import type { Bank } from './bank'
import type {
  AddPasskeyCleartexts, AddPasskeyDna, GateDna, GateGatingFriend, ReplacePassphraseCleartexts, ReplacePassphraseDna, RevokePasskeyCleartexts,
  RevokePasskeyDna, UnlockCleartexts, UnlockDna, BankGateFriend,
} from '../shapes/shapes-gateish'
import type * as Sealers from '../shapes/shapes-sealers'
import type { LiveOf } from '../shapes/shapes-sealers'
import { type GateLife, type GateStamp, type LeaseLoggable, StampChecks } from '../shapes/shapes-stamps'
import { type GateRecord, type Modelkind, type ThingCited, type ThingScope, type ThingShaped, type Wayins, Shell, ThingChecks, ThingFormat } from '../shapes/shapes-thing'
import { type ThingMakeOpts, ThingMakeChecks } from '../shapes/shapes-bankish'
import { type VaultItemEvent, SeenChecks } from '../shapes/shapes-vault-event'
import { GateChecks } from '../shapes/shapes-thingkinds'
import type { PutAskDraft } from '../shapes/shapes-asks'
import { type EpochMillis, Lifeseq } from '../shapes/primitives'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'

/** A bank's gate: its passphrase wayin and its passkey wayin if it has one.
 * Its form verbs prove the user's cleartexts against its wayins, and an `unlock` gating builds a lease, which it attaches to its device's bank.
 * A gate change puts the gate's next revision, and this object then models the revision put.
 * Over the shell or a tombstone, its stamp, its life, `main` and `passkey0` refuse `absent_thing`, and so does a gating's attempt. A gating can still be made, and it still accepts the cleartexts.
 */
export class Gate extends Thing<GateRecord, ThingScope, GateStamp, Adoptable<GateRecord>> implements GateStamp {
  // == [Props]: #bank, #friend

  /** The bank that the leases this gate builds are attached to. */
  readonly #bank:   Bank
  /** The bank's lease verbs. */
  readonly #friend: BankGateFriend
  // --

  // == [Body]: wayins, auth, sigs, meta
  // Read off the record adopted: a field it lacks reads as undefined.

  /** The wayin records, frozen: each null over a tombstone, and undefined over the shell. */
  get wayins(): GateRecord['wayins'] | undefined { return wholeOf(this.pickle())?.wayins }
  /** Reserved, and empty, or undefined over the shell. */
  get auth(): GateRecord['auth'] | undefined { return wholeOf(this.pickle())?.auth }
  /** Reserved, and empty, or undefined over the shell. */
  get sigs(): GateRecord['sigs'] | undefined { return wholeOf(this.pickle())?.sigs }
  /** Reserved, and empty, or undefined over the shell. */
  get meta(): GateRecord['meta'] | undefined { return wholeOf(this.pickle())?.meta }
  // --

  // == [Getters]: device, main, passkey0, scope, stamp, life, leaseEndsAt, leaseLoggable

  /** The device this gate's bank is on. */
  get device(): Device { return this.#bank.device }

  /** The passphrase wayin, a new Wayin on each read. */
  get main(): Wayin { return Wayin.make(this.demandLive().wayins.main) }

  /** The passkey wayin, a new Wayin on each read, or null if the gate has none. */
  get passkey0(): Wayin | null {
    const { passkey0 } = this.demandLive().wayins
    return (passkey0 === null) ? null : Wayin.make(passkey0)
  }

  /** This gate's scope: its bank's, and its `labelpath`. */
  get scope(): ThingScope { return ThingChecks.thingScope.parse(this) }

  /** This gate's stamp: every Thing field of the revision it models but its `label` and `lifeseq`. A lease cites it. */
  get stamp(): GateStamp { return GateChecks.stamp.parse(this.demandLive()) }

  /** This gate's life, fixed until its bank's end: the part of the gate that a wayin's stamp and a lease's stamp bind. */
  get life(): GateLife { return GateChecks.life.parse(this.demandLive()) }

  /** When the bank's lease stops unlocking the bank, or null while locked ({@link Bank.leaseEndsAt}). */
  get leaseEndsAt(): EpochMillis | null { return this.#bank.leaseEndsAt }

  /** The bank's lease's loggable, or null while locked ({@link Bank.leaseLoggable}). */
  get leaseLoggable(): LeaseLoggable | null { return this.#bank.leaseLoggable }
  // --

  // == [Construction]: make, constructor, adopt, makeRecord, makeNextRecord

  /** Make the gate at `begun`, its shell or an item event of its record, which it then receives. Locked, and nothing is fetched or stored.
   * The leases it builds are attached to `opts.bank` through `friend`.
   * Throws where it refuses `begun`'s record.
   * Internal: the device's bank makes the gate its VaultMinder caches.
   */
  static make(begun: Sealers.ShellOf<GateRecord> | VaultItemEvent<GateRecord>, opts: ThingMakeOpts, friend: BankGateFriend): Gate {
    Checks.gateMakeArgs.parse({ begun, opts, friend })
    const { bank } = opts
    const seen = ('eventkind' in begun) ? begun.val : begun
    // A gate's life is its own, so only the bank's scope is checked: a gate of another life of the bank passes.
    Validator.demandConsistent(StampChecks.bankScope.parse(seen), bank.device.scope, { kind: 'record_conflict' })
    const gate = new Gate(super.shellOf(seen), bank, friend)
    if ('eventkind' in begun) { gate.receive(begun) }
    return gate
  }

  private constructor(shell: Sealers.ShellOf<GateRecord>, bank: Bank, friend: BankGateFriend) {
    super(shell, bank.bulletproofCallback)
    this.#bank   = bank
    this.#friend = friend
  }

  // Thing's constructor calls this before this gate's own fields exist, so it reads and sets none of them.
  /** Model `record`, its wayins checked first where it is live. */
  protected override adopt(record: Adoptable<GateRecord>): void {
    if (record.am === 'a') { GateChecks.wayins.parse(record.wayins) }
    super.adopt(record)
  }

  /** The first record of a new life of a bank's gate, made from `dna`: the revision after `found`, its tombstone or its shell, born at its life's `born_at` with its life's `banktok`. */
  static makeRecord(dna: GateDna, found: Pick<ThingCited, 'revseq'> = Shell.Cited): LiveOf<GateRecord> {
    const { dna: { wayins, ...life }, found: prior } = Checks.makeRecordArgs.parse({ dna, found })
    return GateChecks.live.parse({
      ...life, modelkind: 'gate', label: life.labelpath, lifeseq: Lifeseq.ofLifepath(life.lifepath), fmt: ThingFormat, ...super.revisionAfter(prior, life.born_at), am: 'a',
      wayins: wayinsOf(wayins), auth: {}, sigs: {}, meta: {},
    })
  }

  /** The record of the revision after `cited`, written now, with `wayins` in place of its own. */
  static makeNextRecord(cited: LiveOf<GateRecord>, wayins: GateDna['wayins']): LiveOf<GateRecord> {
    const { cited: citedRecord, wayins: nextWayins } = Checks.nextRecordArgs.parse({ cited, wayins })
    return GateChecks.live.parse({ ...citedRecord, ...super.revisionAfter(citedRecord, Clock.nowMillis()), wayins: wayinsOf(nextWayins) })
  }
  // --

  // == [Form verbs]: unlockGating, gatingUnlockAttempt, unlock, replacePassphraseGating, gatingReplacePassphraseAttempt, replacePassphrase, addPasskeyGating, gatingAddPasskeyAttempt, addPasskey, revokePasskeyGating, gatingRevokePasskeyAttempt, revokePasskey, gatingFriend
  // Each maker hands what a form collected, unread, to a gating in gating.ts, with a friend of this gate's private
  // verbs: no public method accepts a proving (G9). Each verb attempts the gating its maker makes, which is vacated
  // whatever its outcome, and changes nothing where it refuses.
  // A maker takes a `FormData`, a dna in a form's fieldnames, or the cleartexts in the names a gating's body takes.

  /** The gating of {@link unlock} over `params`, for a form mutation to attempt. A `FormData` loses its `passphrase` field, and `nextPassphrase` and `confirmation`, at once. */
  unlockGating(params: FormData | UnlockDna | UnlockCleartexts): UnlockGating { return new UnlockGating(this, params, this.#gatingFriend()) }

  /** Unlock this gate by the passphrase, or the passkey's answer, in a form or a dna. See {@link unlock}.
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
  replacePassphraseGating(params: FormData | ReplacePassphraseDna | ReplacePassphraseCleartexts): ReplacePassphraseGating { return new ReplacePassphraseGating(this, params, this.#gatingFriend()) }

  /** Replace the passphrase by `nextPassphrase`, proved by the `passphrase` or the passkey's answer, in a form or a dna. See {@link replacePassphrase}.
   * A `FormData` loses its `passphrase`, `nextPassphrase` and `confirmation` fields before anything is awaited; its other fields stay. A dna's fields are never changed, but a passkey answer's PRF bytes are zeroed.
   */
  async gatingReplacePassphraseAttempt(params: FormData | ReplacePassphraseDna): Promise<Gate> { return await this.replacePassphraseGating(params).attempt() }

  /** Replace the passphrase, proved by the current passphrase or the passkey, and leave the gate unlocked.
   * The passkey stays, and the bankKey does not change.
   * A new passphrase that is weak, or the same as the current one, refuses (`weak_passphrase`, `same_passphrase`).
   */
  async replacePassphrase(cleartexts: ReplacePassphraseCleartexts): Promise<this> {
    await this.replacePassphraseGating(cleartexts).attempt()
    return this
  }

  /** The gating of {@link addPasskey} over `params`, for a form mutation to attempt. */
  addPasskeyGating(params: FormData | AddPasskeyDna | AddPasskeyCleartexts): AddPasskeyGating { return new AddPasskeyGating(this, params, this.#gatingFriend()) }

  // A FormData cannot carry a passkey's answer, so only a dna can add one.
  /** Add the passkey whose answer is `nextPasskeyAnswer`, proved by the `passphrase` (see {@link addPasskey}). The dna is never changed, but the answer's PRF bytes are zeroed. */
  async gatingAddPasskeyAttempt(params: AddPasskeyDna): Promise<Gate> { return await this.addPasskeyGating(params).attempt() }

  /** Add a passkey, proved by the passphrase, and leave the gate unlocked.
   * A gate has one passkey at most, so this refuses while it has one: revoke that one first.
   */
  async addPasskey(cleartexts: AddPasskeyCleartexts): Promise<this> {
    await this.addPasskeyGating(cleartexts).attempt()
    return this
  }

  /** The gating of {@link revokePasskey} over `params`, for a form mutation to attempt. A `FormData` loses its `passphrase`, `nextPassphrase` and `confirmation` fields at once. */
  revokePasskeyGating(params: FormData | RevokePasskeyDna | RevokePasskeyCleartexts): RevokePasskeyGating { return new RevokePasskeyGating(this, params, this.#gatingFriend()) }

  /** Revoke the passkey, proved by the `passphrase` or the passkey's answer, in a form or a dna. See {@link revokePasskey}.
   * A `FormData` loses its `passphrase`, `nextPassphrase` and `confirmation` fields before anything is awaited; its other fields stay. A dna's fields are never changed, but a passkey answer's PRF bytes are zeroed.
   */
  async gatingRevokePasskeyAttempt(params: FormData | RevokePasskeyDna): Promise<Gate> { return await this.revokePasskeyGating(params).attempt() }

  /** Revoke the passkey, proved by the passphrase or the passkey itself, and leave the gate unlocked.
   * With no passkey, the proof only unlocks the gate. The bankKey does not change.
   */
  async revokePasskey(cleartexts: RevokePasskeyCleartexts): Promise<this> {
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

  /** Resolve this gate once its bank is unlocked, its lease not near its end ({@link Bank.ensureUnlocked}). While it waits, {@link isUnlockWanted} is true: render the unlock form, and call {@link unlock} from it. */
  async ensureUnlocked(): Promise<this> {
    await this.#bank.ensureUnlocked()
    return this
  }

  /** Dismiss the awaited `unlock` gating ({@link Bank.dismissUnlock}): every call waiting in {@link ensureUnlocked} rejects `dismissed`. */
  dismissUnlock(): this {
    this.#bank.dismissUnlock()
    return this
  }
  // --

  // == [The gatings' private verbs]: unlockByProving, putGate

  /** Unlock this gate's bank under a lease `proved` builds, citing the revision this gate models, and stow the lease in the deviceDB for every tab. */
  async #unlockByProving(proved: Proving): Promise<this> {
    const followed = await this.#friend.leaseFollowed(this)
    const lease    = await proved.buildLease(this.#bank, this, followed)
    this.#friend.attachLease(lease)
    return this
  }

  /** Put `ask.record`, this gate's next revision, over `ask.cited`. Resolves this gate, which then models the revision put. */
  async #putGate(ask: Omit<PutAskDraft<GateRecord>, 'track' | 'banktok'>): Promise<this> {
    this.demandEnabled()
    await this.#bank.demandVaultMinder().putOnce(ask)
    return this
  }
  // --

  // == [Locking]: lock

  // #lock-is-intent: a lock asks the user again at the next promptable action, and is not an alarm.
  /** Lock this gate's bank: drop its lease and the keys in it ({@link Bank.lock}). */
  lock(): this {
    this.#bank.lock()
    return this
  }
  // --

  // == [Sealing under the lease]: seal, unseal

  /** Seal and return the next revision after `donorProps`, under the bank's lease ({@link Bank.seal}). Needs the bank unlocked. */
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
    return await this.#bank.seal(sealer, donorProps, publicProps, secretProps)
  }

  /** Unseal `record` under the bank's lease ({@link Bank.unseal}). Needs the bank unlocked. */
  async unseal<RecordT extends ThingShaped, CleartextsT>(sealer: Sealers.Sealer<RecordT, CleartextsT>, record: RecordT): Promise<Sealers.UnsealedOf<RecordT, CleartextsT>> {
    return await this.#bank.unseal(sealer, record)
  }
  // --

  // == [Guards]: isEnabled, endCause, isLocked, isSoftlocked, isUnlocked, isUnlockWanted, demandEnabled, demandPasskeyAddable

  /** True until its device ends. */
  get isEnabled(): boolean { return this.#bank.isEnabled }

  /** The refusal every call on this gate meets once its device ends, or null while it is enabled. */
  get endCause(): Errors.VaultError | null { return this.#bank.endCause }

  /** True while this gate's bank has no lease attached. */
  get isLocked(): boolean { return this.#bank.isLocked }

  /** True while this gate's bank is locked, or its lease is near its end ({@link Bank.isSoftlocked}): {@link ensureUnlocked} then waits for an `unlock` gating. */
  get isSoftlocked(): boolean { return this.#bank.isSoftlocked }

  /** True while this gate's bank has a lease attached. */
  get isUnlocked(): boolean { return this.#bank.isUnlocked }

  /** True while a call waits in {@link ensureUnlocked}: render the unlock form while it is. */
  get isUnlockWanted(): boolean { return this.#bank.isUnlockWanted }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    this.#bank.demandEnabled()
    return this
  }

  /** Demand that this gate has no passkey wayin yet. */
  demandPasskeyAddable(): void {
    if (this.demandLive().wayins.passkey0 !== null) { throw Throwers.passkeyAlreadyAdded() }
  }
  // --

  /** Always `'gate'`: this model's {@link Modelkind}, and its record's. */
  declare readonly modelkind: 'gate'

  /** A gate's modelkind: the guards this class inherits answer for gates alone. */
  static override readonly modelkind = 'gate'
}

// == [Helpers]: wholeOf, wayinsOf

/** `record` where it has a gate's body, else undefined: the shell */
function wholeOf(record: Adoptable<GateRecord>): GateRecord | undefined { return ('wayins' in record) ? record : undefined }

// A Wayin's pickle is typed as either kind; the gate record's parse checks each is the kind its label wants.
/** The frozen records of `wayins`, with `passkey0` null where there is none. */
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
      begun:  union([GateChecks.shell, SeenChecks.itemEvent]).refine(({ modelkind }) => modelkind === 'gate', Phrases.BegunOfOtherKind),
      opts:   ThingMakeChecks.thingMakeOpts,
      friend: obj({ leaseFollowed: fn<BankGateFriend['leaseFollowed']>(), attachLease: fn<BankGateFriend['attachLease']>() }),
    }),
    makeRecordArgs: obj({ dna: GateChecks.life.extend({ wayins }), found: ThingChecks.thingCited.pick({ revseq: true }) }),
    nextRecordArgs: obj({ cited: GateChecks.live, wayins }),
  }
})
// --
