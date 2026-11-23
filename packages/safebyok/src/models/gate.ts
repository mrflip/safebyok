import { Clock, Crypto, Errors, Outcome, Phrases as BigPhrases, Validator } from 'safebyok-big/internals'
import { Thing } from './thing'
import type { Bank } from './bank'
import type { Device } from './device'
import { AddPasskeyGating, BirthGating, ReplacePassphraseGating, RevokePasskeyGating, UnlockGating } from './gating'
import type { Lease } from './lease'
import type { Proving } from './proving'
import { Wayin } from './wayin'
import type {
  BirthCleartexts, GateDna, GateGatingFriend, GateOpts, PasskeyAddCleartexts, PasskeyRevokeCleartexts, PassphraseReplaceCleartexts, UnlockCleartexts,
} from '../shapes/shapes-gateish'
import type * as Sealers from '../shapes/shapes-sealers'
import { type BankStamp, type GateStamp, type LeaseLoggable, StampChecks } from '../shapes/shapes-stamps'
import { type GateRecord, type Modelkind, type Sparse, type ThingRecord, type ThingScope, type Wayins, ThingChecks, ThingFormat } from '../shapes/shapes-thing'
import { BankChecks, GateChecks } from '../shapes/shapes-thingkinds'
import { type PutAskDraft, putAskOf } from '../shapes/shapes-asks'
import type { VaultDB } from '../storage/vault-db'
import type { EpochMillis } from '../shapes/primitives'
import * as Throwers from '../refusals/throwers'

/** A bank's gate: its passphrase wayin and its passkey wayin if it has one, and the lease an `unlock` gating grants it.
 * Its form verbs prove the user's cleartexts against its wayins. A gate change writes the gate, and this object then models the revision written.
 * Boxes are sealed and unsealed under its private lease, which no method hands out.
 */
export class Gate extends Thing<GateRecord, ThingScope, GateStamp> implements GateStamp {
  // == [Props]: #device, #vaultDB, #bankStamp, #main, #passkey0, #lease, #unlockWait, #endCause

  readonly #device:    Device
  readonly #vaultDB:   VaultDB
  readonly #bankStamp: BankStamp

  // Set again where a gate change lands, from the record written.
  /** The passphrase wayin. */
  #main:     Wayin
  /** The passkey wayin, or null for none. */
  #passkey0: Wayin | null

  /** The attached lease, null while locked. */
  #lease: Lease | null = null

  /** The wait every call in {@link ensureUnlocked} shares, or null while none waits. */
  #unlockWait: Wait | null = null

  /** Why a sweep disabled the gate, or null until then. */
  #endCause: Errors.VaultError | null = null
  // --

  // == [Getters]: device, vaultDB, wayins, main, passkey0, scope, stamp, bankStamp, leaseEndsAt, leaseLoggable

  /** The device this gate's bank is on. */
  get device(): Device { return this.#device }

  /** Where this gate is stored. */
  get vaultDB(): VaultDB { return this.#vaultDB }

  /** The wayin records, frozen. */
  get wayins(): Wayins { return this.pickle().wayins }

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

  /** When the attached lease stops unlocking the bank, or null while locked. */
  get leaseEndsAt(): EpochMillis | null { return (this.#lease === null) ? null : this.#lease.proved_at + this.#device.leaseMillis }

  /** What a log wants of the attached lease, or null while locked. */
  get leaseLoggable(): LeaseLoggable | null { return this.#lease?.loggable ?? null }
  // --

  // == [Construction]: make, constructor, makeRecord, makeNextRecord

  /** Make the gate of `record`, of the bank stamped `opts.bankStamp`, on `opts.device`, stored in `opts.vaultDB`. Locked, and nothing is fetched or stored. */
  static make(record: GateRecord, opts: GateOpts): Gate {
    const { record: gateRecord, opts: { device, vaultDB, bankStamp } } = Checks.gateMakeArgs.parse({ record, opts })
    // A gate's life is its own, so only the bank's scope is checked: a gate of another life of the bank passes.
    Validator.checkedConsistent(StampChecks.bankScope.parse(bankStamp), device.scope, { kind: 'record_conflict' })
    Validator.checkedConsistent(gateRecord, StampChecks.bankScope.parse(bankStamp), { kind: 'record_conflict' })
    return new Gate(gateRecord, { device, vaultDB, bankStamp })
  }

  private constructor(gateRecord: GateRecord, opts: GateOpts) {
    const main = Wayin.make(gateRecord.wayins.main)
    const passkey0 = (gateRecord.wayins.passkey0 === null) ? null : Wayin.make(gateRecord.wayins.passkey0)
    super({ ...gateRecord, wayins: wayinsOf({ main, passkey0 }) })
    this.#device    = opts.device
    this.#vaultDB   = opts.vaultDB
    this.#bankStamp = Object.freeze(opts.bankStamp)
    this.#main      = main
    this.#passkey0  = passkey0
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

  // == [Form verbs]: birthGating, unlockGating, unlock, tryUnlock, replacePassphraseGating, replacePassphrase, tryReplacePassphrase, addPasskeyGating, addPasskey, tryAddPasskey, revokePasskeyGating, revokePasskey, tryRevokePasskey, gatingFriend
  // Each maker hands the cleartexts a form collected, unread, to a gating in gating.ts, with a friend of this gate's private
  // verbs: no public method accepts a proving (G9). Each verb attempts the gating its maker makes, which is vacated
  // whatever its outcome, and changes nothing where it refuses.

  /** The gating of `Bank.birth` over `cleartexts`, handing `attachBank`, where given, the bank it births. Internal: make a birth's gating with `device.birthGating`. */
  static birthGating(device: Device, cleartexts: BirthCleartexts, attachBank?: (bank: Bank) => void): BirthGating {
    const attacher = Checks.attachBank.parse(attachBank)
    return new BirthGating(device, cleartexts, {
      unlockByProving: (gate: Gate, proving: Proving) => gate.#unlockByProving(proving),
      attachBank:      (bank: Bank) => { attacher?.(bank) },
    })
  }

  /** The gating of {@link unlock} over `cleartexts`, for a form mutation to attempt. */
  unlockGating(cleartexts: UnlockCleartexts): UnlockGating { return new UnlockGating(this, cleartexts, this.#gatingFriend()) }

  /** Unlock this gate by its passphrase or its passkey, resuming every call waiting in {@link ensureUnlocked}.
   * A wrong one refuses `wrong_passphrase` or `wrong_passkey`, and the gate is unchanged.
   */
  async unlock(cleartexts: UnlockCleartexts): Promise<this> {
    await this.unlockGating(cleartexts).attempt()
    return this
  }

  /** {@link unlock}, resolving an `Outcome` instead of throwing. */
  tryUnlock(cleartexts: UnlockCleartexts): Promise<Outcome.Outcome<this>> { return Outcome.outcomeOf(() => this.unlock(cleartexts)) }

  /** The gating of {@link replacePassphrase} over `cleartexts`, for a form mutation to attempt. */
  replacePassphraseGating(cleartexts: PassphraseReplaceCleartexts): ReplacePassphraseGating { return new ReplacePassphraseGating(this, cleartexts, this.#gatingFriend()) }

  /** Replace the passphrase, proved by the current passphrase or the passkey, and leave the gate unlocked.
   * The passkey stays, and the bankKey does not change.
   * A new passphrase that is weak, or the same as the current one, refuses (`weak_passphrase`, `same_passphrase`).
   */
  async replacePassphrase(cleartexts: PassphraseReplaceCleartexts): Promise<this> {
    await this.replacePassphraseGating(cleartexts).attempt()
    return this
  }

  /** {@link replacePassphrase}, resolving an `Outcome` instead of throwing. */
  tryReplacePassphrase(cleartexts: PassphraseReplaceCleartexts): Promise<Outcome.Outcome<this>> { return Outcome.outcomeOf(() => this.replacePassphrase(cleartexts)) }

  /** The gating of {@link addPasskey} over `cleartexts`, for a form mutation to attempt. */
  addPasskeyGating(cleartexts: PasskeyAddCleartexts): AddPasskeyGating { return new AddPasskeyGating(this, cleartexts, this.#gatingFriend()) }

  /** Add a passkey, proved by the passphrase, and leave the gate unlocked.
   * A gate has one passkey at most, so this refuses while it has one: revoke that one first.
   */
  async addPasskey(cleartexts: PasskeyAddCleartexts): Promise<this> {
    await this.addPasskeyGating(cleartexts).attempt()
    return this
  }

  /** {@link addPasskey}, resolving an `Outcome` instead of throwing. */
  tryAddPasskey(cleartexts: PasskeyAddCleartexts): Promise<Outcome.Outcome<this>> { return Outcome.outcomeOf(() => this.addPasskey(cleartexts)) }

  /** The gating of {@link revokePasskey} over `cleartexts`, for a form mutation to attempt. */
  revokePasskeyGating(cleartexts: PasskeyRevokeCleartexts): RevokePasskeyGating { return new RevokePasskeyGating(this, cleartexts, this.#gatingFriend()) }

  /** Revoke the passkey, proved by the passphrase or the passkey itself, and leave the gate unlocked.
   * With no passkey, the proof only unlocks the gate. The bankKey does not change.
   */
  async revokePasskey(cleartexts: PasskeyRevokeCleartexts): Promise<this> {
    await this.revokePasskeyGating(cleartexts).attempt()
    return this
  }

  /** {@link revokePasskey}, resolving an `Outcome` instead of throwing. */
  tryRevokePasskey(cleartexts: PasskeyRevokeCleartexts): Promise<Outcome.Outcome<this>> { return Outcome.outcomeOf(() => this.revokePasskey(cleartexts)) }

  /** This gate's private verbs, for a gating to call. */
  #gatingFriend(): GateGatingFriend {
    return {
      unlockByProving: (proved: Proving) => this.#unlockByProving(proved),
      putGate:         (ask: PutAskDraft<GateRecord>) => this.#putGate(ask),
    }
  }
  // --

  // == [The awaited `unlock` gating]: ensureUnlocked, dismissUnlock, settleUnlockWait
  // One wait is shared by every caller, opened by the first and settled once: by any unlock, a dismissal or the gate's end.

  /** Resolve this gate once it is unlocked: at once, or when an `unlock` gating or a gate change lands.
   * While it waits, {@link isUnlockWanted} is true: render the unlock form, and call {@link unlock} from it.
   * Rejects `dismissed` when {@link dismissUnlock} is called, and with the gate's `endCause` when the gate ends.
   */
  async ensureUnlocked(): Promise<this> {
    this.demandEnabled()
    if (this.isUnlocked) { return this }
    // Read here: a subscriber told of the wait may dismiss it or sweep the gate, which clears #unlockWait.
    const wait = (this.#unlockWait ??= makeWait())
    this.#tell()
    await wait.promise
    return this
  }

  /** Dismiss the awaited `unlock` gating: every call waiting in {@link ensureUnlocked} rejects `dismissed`, and the gate stays locked.
   * Call it when the user closes the unlock form.
   */
  dismissUnlock(): this {
    this.#settleUnlockWait(Throwers.unlockDismissed())
    this.#tell()
    return this
  }

  /** Settle the wait for an `unlock` gating, if one is open: resolve it for null, or reject it with `refusal`. */
  #settleUnlockWait(refusal: Errors.VaultError | null): void {
    const wait = this.#unlockWait
    this.#unlockWait = null
    if (refusal === null) { wait?.resolve() } else { wait?.reject(refusal) }
  }
  // --

  // == [The gatings' private verbs]: unlockByProving, putGate, adopt

  /** Unlock this gate under a lease `proved` builds, citing the revision this gate models.
   * A lease this gate holds is renewed: the new one keeps its `born_at`.
   */
  async #unlockByProving(proved: Proving): Promise<this> {
    const lease = await proved.buildLease(this, this, this.#lease)
    this.#attachLease(lease)
    return this
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
    this.adoptRecord({ ...record, wayins: wayinsOf({ main, passkey0 }) })
    this.#main     = main
    this.#passkey0 = passkey0
    this.#tell()
  }
  // --

  // == [Unlocking, locking and sweeping]: attachLease, lock, sweep, tell

  /** Attach `lease` in place of the current one, and resume every call waiting for an `unlock` gating.
   * On a disabled gate, it evicts `lease` instead, and refuses.
   */
  #attachLease(lease: Lease): void {
    if (! this.isEnabled) {
      lease.evict()
      this.demandEnabled()
    }
    this.#lease?.evict()
    this.#lease = lease
    this.#settleUnlockWait(null)
    this.#tell()
  }

  /** Lock the gate: drop its lease and the keys in it. */
  lock(): this {
    this.#lease?.evict()
    this.#lease = null
    this.#tell()
    return this
  }

  // It shuts first, so that a subscriber told of the end finds every call refusing.
  /** End this gate for good: drop its lease, and reject every call waiting for an `unlock` gating.
   * Every call after meets `endCause`, or, left out, the device's end cause or a `disabled` refusal. An `endCause` that is not a refusal refuses `bad_record`; nothing else throws.
   * Its subscribers hear of the end, and of nothing after.
   */
  sweep(endCause: Errors.VaultError | null = null): this {
    Checks.endCause.parse(endCause)
    if (this.#endCause !== null) { return this }
    this.#endCause = endCause ?? this.#device.endCause ?? Throwers.gateSwept()
    this.#lease?.sweep()
    this.#lease = null
    this.#settleUnlockWait(this.#endCause)
    this.#tell()
    this.dropSubscribers()
    return this
  }

  // A subscriber is told after an unlock, a lock, a gate change, a wait in ensureUnlocked opened or settled, and the gate's end.
  /** Tell each subscriber of a change, handing what one throws to the device's `onBadNews`. */
  #tell(): void { this.tellSubscribers((err) => { this.#device.tellBadNews([err]) }) }
  // --

  // == [Sealing under the lease]: seal, unseal

  /** Seal and return the next revision after `donorProps`, as the lease's `seal` does. Needs the gate unlocked.
   * The seal is bound to this gate's bank's stamp, the revision's stamp and the sealer's tags.
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

  /** Unseal `record`, returning it with the part `sealer` seals in cleartext, as the lease's `unseal` does. Needs the gate unlocked.
   * Unsealing authenticates the ciphertexts, the stamp and the tags together: a change to any of them refuses as damaged.
   */
  async unseal<RecordT extends Sparse<ThingRecord>, CleartextsT>(sealer: Sealers.Sealer<RecordT, CleartextsT>, record: RecordT): Promise<Sealers.UnsealedOf<RecordT, CleartextsT>> {
    return await this.#demandLease().unseal(sealer, record)
  }
  // --

  // == [Guards]: isEnabled, endCause, isLocked, isUnlocked, isUnlockWanted, demandEnabled, demandPasskeyAddable, demandLease

  /** True until this gate is swept or its device ends. */
  get isEnabled(): boolean { return this.endCause === null }

  /** The refusal every call on this gate meets once it is swept or its device ends, or null while it is enabled. */
  get endCause(): Errors.VaultError | null { return this.#endCause ?? this.#device.endCause }

  /** True when no lease is attached to this gate. */
  get isLocked(): boolean { return this.#lease === null }

  /** True when a lease is attached to this gate. */
  get isUnlocked(): boolean { return this.#lease !== null }

  /** True while a call waits in {@link ensureUnlocked}: render the unlock form while it is. */
  get isUnlockWanted(): boolean { return this.#unlockWait !== null }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    const { endCause } = this
    if (endCause !== null) { throw endCause }
    return this
  }

  /** Demand that this gate has no passkey wayin yet. */
  demandPasskeyAddable(): void {
    if (this.#passkey0 !== null) { throw Throwers.passkeyAlreadyAdded() }
  }

  /** The attached lease. Demands that the gate is enabled and unlocked. */
  #demandLease(): Lease {
    this.demandEnabled()
    if (this.#lease === null) { throw Throwers.needUnlocked() }
    return this.#lease
  }
  // --

  /** Always `'gate'`: this model's {@link Modelkind}. */
  get modelkind(): 'gate' { return 'gate' satisfies Modelkind }

  /** A gate's modelkind: the guards this class inherits answer for gates alone. */
  static override readonly modelkind = 'gate'
}

// == [Helpers]: wayinsOf, Wait, makeWait

// A Wayin's pickle is typed as either kind; the gate record's parse checks each is the kind its label wants.
/** The frozen records of `wayins`, its passkey0 null for none. */
function wayinsOf({ main, passkey0 }: GateDna['wayins']): Wayins {
  return Object.freeze({ main: main.pickle(), passkey0: passkey0?.pickle() ?? null }) as Wayins
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
/** The checks of the arguments of {@link Gate.make}, {@link Gate.makeRecord}, {@link Gate.makeNextRecord} and {@link Gate.sweep}, and of {@link Gate.birthGating}'s `attachBank`. */
const Checks = Validator.Checkers('bad_record', ({ obj, custom, fn }) => {
  const wayin = custom<Wayin>()
  const wayins = obj({ main: wayin, passkey0: wayin.nullable() })
  return {
    gateMakeArgs:   obj({
      record: GateChecks.record,
      opts:   obj({
        device:    custom<Device>(),
        vaultDB:   ThingChecks.vaultDBShape,
        bankStamp: BankChecks.stamp,
      }),
    }),
    makeRecordArgs: GateChecks.stamp.extend({ wayins }),
    nextRecordArgs: obj({ cited: GateChecks.record, wayins }),
    endCause:       custom<Errors.VaultError>(Errors.isVaultError, BigPhrases.VaultErrorExpected).nullable(),
    attachBank:     fn<(bank: Bank) => void>().optional(),
  }
})
// --
