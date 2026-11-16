import type { Consts, EX } from 'safebyok-big/internals'
import { CX, Clock, Crypto, Errors, SX, Throwers, Validator } from 'safebyok-big/internals'
import { DefaultQueryCacheOpts, type QueryCacheOpts, queryCacheOpts } from '../minding/shapes-minder'
import { BaseThing } from './base-thing'
import { Device } from './device'
import { Gate, type GateDna } from './gate'
import type { Lease } from './lease'
import { Proving } from './proving'
import type { BoxCleartexts, BoxRecord, BoxSparse, BoxTombstone, UnsealedOf } from './sealers'
import { type BankScope, type BankStamp, type CitedGate, type GateStamp, bankScope, bankStamp, gateStamp } from './stamps'
import * as Phrases from '../phrases'
import {
  type BankThing, type BoxThing, type DelAskArgs, type LoggableAsk, type PutAskArgs, type Thing, type WorldRecord,
  BankThingFormat, BoxThingFormat, ShellCited, ShellLifeseq, bankThing, boxSparse, boxThing, childShellCited, gateThing, lifeseqOf, loggableAskOf, sparseOf,
} from '../storage/shapes-thing'
import { type BadAnswer, type BirthBankAnswer, type GoodAnswer, type ListThingsAnswer, type VaultDB, type WriteThingAnswer, isVaultDB } from '../storage/vault-db'

export type { BankRecord, WorldRecord } from '../storage/shapes-thing'

/** The record {@link Bank.make} and {@link Bank.birth} take: the bank's Thing, with its main gate's Thing as `maingate` and its root box's sparse record as `rootBox`. */
export type BankMakeRecord = WorldRecord & Readonly<{ rootBox: BoxSparse }>

/** The dna of a new bank: its stamp, and its main gate's dna. */
export type BankDna = BankStamp & { maingate: GateDna }

/** A box unsealed: its record with its whisper in place of the sealed one. A tombstone's whisper is empty. */
export type BoxUnsealed = UnsealedOf<BoxRecord | BoxTombstone, BoxCleartexts>

/** A box's shell: the void sparse record a box's first revision is sealed over and cites. */
export type BoxShell = BoxSparse & Readonly<{ am: 'x' }>

/** The arguments of {@link Bank.tryGetBox}: the box's labelpath, and `ifAbsent`, the answer when none is stored (default `'nil'`). */
export type GetBoxArgs = Readonly<{ labelpath: string, ifAbsent?: EX.IfAbsent | 'shell' }>

/** The answer of {@link Bank.tryGetBox}: the box, what `ifAbsent` gives when none is stored, or a refusal. */
export type GetBoxAnswer<ValT> = GoodAnswer<ValT, EX.GotAct> | BadAnswer

/** The options of {@link Bank.make}, beside its record. */
export interface BankOpts {
  /** The device the bank is on. Its scope must be the bank's. */
  device:  Device
  /** Where the bank's boxes are stored. */
  vaultDB: VaultDB
  /** The defaults this bank's minders set on their TanStack Query cache entries. A missing field defaults from {@link DefaultQueryCacheOpts}. */
  queryCacheOpts?: Partial<QueryCacheOpts>
}

/** The options of {@link Bank.birth}, beside its record: {@link BankOpts}, and the `proving` of the main gate, built in the gating attempt underway. */
export interface BirthOpts extends BankOpts {
  proving: Proving
}

// Defined here, not with the shapes: they name a model class.
/** The checks of {@link Bank.make}'s arguments, of the proving `unlockByProving` is given, and of the boxes a box method is given. */
const Checks = Validator.Checkers('bad_option', ({ obj, custom, orDefault }) => ({
  // The bank's Thing is strict and refined, so it is checked apart, once the gate and root box are removed.
  bankMakeArgs: obj({
    record: obj({ maingate: gateThing, rootBox: boxSparse }).loose(),
    opts:   obj({
      device:         custom<Device>((val) => val instanceof Device, 'Expected a Device'),
      vaultDB:        custom<VaultDB>(isVaultDB, Phrases.VaultDBExpected),
      queryCacheOpts: orDefault(queryCacheOpts, DefaultQueryCacheOpts),
    }),
  }),
  bankThing,
  proving: custom<Proving>((val) => val instanceof Proving, 'Expected a Proving'),
  boxSparse,
  boxThing,
}))

/** The signed-in user's bank on this device: its main gate, its root box, and its lease while unlocked.
 * Boxes are sealed and unsealed under its private lease, and stored in its vaultDB.
 */
export class Bank extends BaseThing<BankThing, BankScope, BankStamp> implements BankStamp {
  // == [Props]: #device, #vaultDB, #queryCacheOpts, #maingate, #rootBox, #lease

  readonly #device:   Device
  readonly #vaultDB:  VaultDB
  readonly #queryCacheOpts: Readonly<QueryCacheOpts>
  readonly #maingate: Gate

  // Set once more, where the bank's birth lands: from the shell to the root box stored.
  /** The root box's sparse record. */
  #rootBox: BoxSparse

  /** The attached lease, null while locked. */
  #lease: Lease | null = null
  // --

  // == [Getters]: device, device_tok, scope, stamp, maingate, rootBox, queryCacheOpts

  /** The device this bank is on. */
  get device(): Device { return this.#device }

  /** This device's token, recorded in each wayin the bank builds. */
  get device_tok(): string { return this.#device.device_tok }

  /** This bank's scope: its user and its `banklabel`. */
  get scope(): BankScope { return bankScope.parse(this) }

  /** This bank's {@link BankStamp}, which every ctx under it binds first. */
  get stamp(): BankStamp { return bankStamp.parse(this) }

  /** The bank's main gate: the wayins a user unlocks with. */
  get maingate(): Gate { return this.#maingate }

  /** The root box's sparse record: its shell until the bank is born. Every box of this bank is under it. */
  get rootBox(): BoxSparse { return this.#rootBox }

  /** The defaults this bank's minders set on their TanStack Query cache entries. */
  get queryCacheOpts(): Readonly<QueryCacheOpts> { return this.#queryCacheOpts }
  // --

  // == [Construction]: make, birth, constructor, mintStamps, makeRecord

  /** Make the bank of `record`, with its main gate and root box, on `opts.device`, keeping its boxes in `opts.vaultDB`. */
  static make(record: BankMakeRecord, opts: BankOpts): Bank {
    const { record: { maingate, rootBox, ...rest }, opts: checked } = Checks.bankMakeArgs.parse({ record, opts })
    const parsed = Checks.bankThing.parse(rest)
    // The device names its user `user_id`, and the bank's Thing `userid`.
    Validator.checkedConsistent({ user_id: parsed.userid, banklabel: parsed.banklabel }, checked.device.scope, { kind: 'record_conflict' })
    Validator.checkedConsistent(rootBox, { ...bankScope.parse(parsed), labelpath: 'box' }, { kind: 'record_conflict' })
    return new Bank(parsed, { maingate, rootBox }, checked)
  }

  /** Write a new bank of `record`, with its main gate and root box, and return it unlocked under a lease built from `opts.proving`.
   * Refuses `gate_made_elsewhere` if another bank is already stored at its scope.
   */
  static async birth(record: BankMakeRecord, opts: BirthOpts): Promise<Bank> {
    const { proving, ...bankOpts } = opts
    const bank = this.make(record, bankOpts)
    const born = await bank.#tryBirth(proving)
    if (! born.ok) { throw born.err }
    // The user must hear that their passphrase was not set: the bank stored is another's.
    if (born.val.bank.revtok !== bank.revtok) { throw Throwers.gateMadeElsewhere() }
    return bank
  }

  private constructor(parsed: BankThing, { maingate, rootBox }: Pick<BankMakeRecord, 'maingate' | 'rootBox'>, opts: BankOpts & { queryCacheOpts: QueryCacheOpts }) {
    super(parsed)
    this.#device = opts.device
    this.#vaultDB = opts.vaultDB
    this.#queryCacheOpts = Object.freeze(opts.queryCacheOpts)
    this.#rootBox = Object.freeze(rootBox)
    this.#maingate = Gate.make(maingate, { bank: this })
    Object.freeze(this)
  }

  /** Fresh stamps for a new bank of `scope` and its main gate, both in their first life. Mint one pair per attempt to birth a bank. */
  static mintStamps(scope: CX.BankScope): { bankStamp: BankStamp, gateStamp: GateStamp } {
    const { user_id, banklabel } = CX.bankScope.parse(scope)
    const born_at = Clock.nowMillis()
    return {
      bankStamp: bankStamp.parse({ userid: user_id, banklabel, lifeseq: lifeseqOf(0), born_at }),
      gateStamp: gateStamp.parse({ userid: user_id, banklabel, labelpath: 'gate', lifeseq: lifeseqOf(0), born_at }),
    }
  }

  /** The first record of a new bank, made from `dna`, with its main gate and its root box's shell. `Bank.birth` seals the root box over the shell. */
  static makeRecord(dna: BankDna): BankMakeRecord {
    const { userid, banklabel, lifeseq, born_at } = bankStamp.parse(dna)
    const bank = bankThing.parse({
      userid, banklabel, labelpath: 'bank', label: 'bank', fmt: BankThingFormat, revtok: Crypto.randomId(), revseq: 0, am: 'a', born_at, written_at: born_at, lifeseq, lifepath: lifeseq,
    })
    const rootBox = boxSparse.parse({
      userid, banklabel, labelpath: 'box', label: 'box', fmt: BoxThingFormat, ...ShellCited, lifeseq: ShellLifeseq, born_at: SX.VoidTime, written_at: SX.VoidTime,
    })
    return { ...bank, maingate: Gate.makeRecord(dna.maingate), rootBox }
  }
  // --

  // == [Methods]: put

  /** Write `args.record`, this bank's next revision, over `args.cited`. Resolves the bank's Thing the store reports writing. This Bank object is not updated. */
  async put(args: PutAskArgs<BankThing>): Promise<BankThing> {
    this.demandEnabled()
    const answer = await this.#vaultDB.tryWriteThing({ ...this.#vaultDB.putAsk(args), ...this.scope, labelpath: 'bank', modelkind: 'bank' })
    if (! answer.ok) { throw answer.err }
    // The ask's modelkind is the bank's, which the vaultDB checks what it answers against.
    return answer.val as BankThing
  }
  // --

  // == [The birth]: tryBirth

  /** Write the bank's three roots, sealing the root box under a lease built from `proved`. Unlocks the bank under that lease when its own roots were written. */
  async #tryBirth(proved: Proving): Promise<BirthBankAnswer> {
    const ask = { ...this.scope, op: 'birth' } as const
    const { endCause } = this.#device
    if (endCause !== null) { return disabledAnswerOf(ask, endCause) }
    const lease = await Checks.proving.parse(proved).buildLease(this, this.#maingate)
    const root = await lease.seal('BoxWhisper', { ...this.#rootBox, sidecar: {} }, { whisper: {} })
    const answer = await this.#vaultDB.tryBirthBank({ ...ask, bank: this.pickle(), gate: this.#maingate.pickle(), root })
    if (answer.ok && (answer.val.bank.revtok === this.revtok) && lease.isEnabled) {
      this.#rootBox = Object.freeze(sparseOf(answer.val.root))
      this.#attachLease(lease)
    } else {
      lease.evict()
    }
    return answer
  }
  // --

  // == [Unlocking and locking]: unlockByProving, attachLease, lock

  /** Unlock this bank with `proved`, a proving of its gate, built in the gating attempt underway.
   * The lease cites `cited`, by default this bank's main gate.
   */
  async unlockByProving(proved: Proving, cited: CitedGate = this.maingate): Promise<this> {
    this.demandEnabled()
    const lease = await Checks.proving.parse(proved).buildLease(this, cited)
    this.#attachLease(lease)
    return this
  }

  /** Attach `lease`, evicting the one it replaces */
  #attachLease(lease: Lease): void {
    this.#lease?.evict()
    this.#lease = lease
  }

  /** Lock the bank: drop its lease and the keys in it. */
  lock(): this {
    this.#lease?.evict()
    this.#lease = null
    return this
  }
  // --

  // == [Boxes]: sealBox, tombstoneBox, unsealBox

  /** Seal the box next after `prior`, ciphering its whisper under a fresh boxKey wrapped under the bankKey. Needs the bank unlocked.
   * Over a tombstone or the shell, it is the first revision of the next life. Only `prior`'s Thing fields and sidecar are read.
   */
  async sealBox(prior: BoxSparse & Pick<BoxRecord, 'sidecar'>, cleartexts: BoxCleartexts): Promise<BoxRecord> {
    const lease = this.#demandLease()
    this.#demandBox(prior, Checks.boxSparse)
    return lease.seal('BoxWhisper', prior, cleartexts)
  }

  /** Seal a tombstone for the live box `prior`, signed by an empty whisper ciphered under a fresh boxKey. Needs the bank unlocked. */
  async tombstoneBox(prior: BoxSparse): Promise<BoxTombstone> {
    const lease = this.#demandLease()
    this.#demandBox(prior, Checks.boxSparse)
    return lease.seal('BoxTombstone', prior, { whisper: {} })
  }

  /** Unseal `box`, returning it with its whisper in place of the sealed one. Needs the bank unlocked.
   * It authenticates the box, all but its sidecar. For a tombstone, that checks its signature.
   */
  async unsealBox(box: BoxRecord | BoxTombstone): Promise<BoxUnsealed> {
    const lease = this.#demandLease()
    const parsed = this.#demandBox(box, Checks.boxThing)
    const { whisper } = (parsed.am === 'a') ? await lease.unseal('BoxWhisper', parsed) : await lease.unseal('BoxTombstone', parsed)
    const { whisper_sealed: _sealed, ...unsealed } = parsed
    return Object.freeze({ ...unsealed, whisper })
  }
  // --

  // == [Boxes in the vaultDB]: tryListBoxes, tryGetBox, tryPutBox, tryDelBox, shellOf
  // Each fills in the bank's scope and the box modelkind, so that what is not this bank's box refuses. None throws:
  // while the device is disabled, each answers with its refusal.

  /** The boxes directly under the root box, tombstones included, with the root box as `parent`. */
  tryListBoxes(): Promise<ListThingsAnswer> {
    const ask = this.#vaultDB.listAsk({ ...this.scope, labelpath: 'box' })
    const { endCause } = this.#device
    if (endCause !== null) { return Promise.resolve({ ...disabledAnswerOf(ask, endCause), parent: null, damaged_rows: [] }) }
    return this.#vaultDB.tryListThings(ask)
  }

  /** The box at `args.labelpath`. If none is stored, `ifAbsent: 'shell'` answers its shell, which a first revision is sealed over and cites. */
  tryGetBox(args: GetBoxArgs & Readonly<{ ifAbsent: 'shell' }>): Promise<GetBoxAnswer<BoxThing | BoxShell>>
  tryGetBox(args: GetBoxArgs): Promise<GetBoxAnswer<BoxThing | null>>
  async tryGetBox(args: GetBoxArgs): Promise<GetBoxAnswer<BoxThing | BoxShell | null>> {
    const { ifAbsent, ...given } = { ...args }
    const ask = { ...this.#vaultDB.getAsk({ ...given, ...this.scope, ifAbsent: (ifAbsent === 'shell' || ifAbsent === undefined) ? 'nil' : ifAbsent }), modelkind: 'box' } as const
    const { endCause } = this.#device
    if (endCause !== null) { return disabledAnswerOf(ask, endCause) }
    const answer = await this.#vaultDB.tryGetThing(ask)
    if (! answer.ok) { return answer }
    if (answer.val === null) { return { ...answer, val: (ifAbsent === 'shell') ? this.#shellOf(given.labelpath) : null } }
    if (answer.val.fmt !== BoxThingFormat) { return { ...answer, ok: false, act: 'unclassified_storing', dbhas: null, err: otherThanBox(answer.ask, answer.val) } }
    return { ...answer, val: answer.val }
  }

  /** Write the live box `args.record` over the box `args.cited` cites: the one stored at its scope, or its shell. */
  tryPutBox(args: PutAskArgs<BoxThing>): Promise<WriteThingAnswer> {
    const ask = { ...this.#vaultDB.putAsk(args), ...this.scope, modelkind: 'box' } as const
    const { endCause } = this.#device
    if (endCause !== null) { return Promise.resolve(disabledAnswerOf(ask, endCause)) }
    return this.#vaultDB.tryWriteThing(ask)
  }

  /** Write the tombstone `args.record` over the live box `args.cited` cites. */
  tryDelBox(args: DelAskArgs<BoxThing>): Promise<WriteThingAnswer> {
    const ask = { ...this.#vaultDB.delAsk(args), ...this.scope, modelkind: 'box' } as const
    const { endCause } = this.#device
    if (endCause !== null) { return Promise.resolve(disabledAnswerOf(ask, endCause)) }
    return this.#vaultDB.tryWriteThing(ask)
  }

  // Only a child of the root box has its shell here: a deeper box's lifepath needs its parent's.
  /** The shell of the box at `labelpath`, one label under the root box */
  #shellOf(labelpath: string): BoxShell {
    return Object.freeze({
      ...this.scope, labelpath, label: labelpath.slice(labelpath.lastIndexOf('/') + 1), fmt: BoxThingFormat,
      ...childShellCited(this.#rootBox.lifepath), am: 'x', lifeseq: ShellLifeseq, born_at: SX.VoidTime, written_at: SX.VoidTime,
    })
  }
  // --

  // == [Guards]: isEnabled, isLocked, isUnlocked, demandEnabled, demandBox, demandLease

  /** True while this bank's device is enabled. */
  get isEnabled(): boolean { return this.#device.isEnabled }

  /** True when no lease is attached to this bank. */
  get isLocked(): boolean { return this.#lease === null }

  /** True when a lease is attached to this bank. */
  get isUnlocked(): boolean { return this.#lease !== null }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    this.#device.demandEnabled()
    return this
  }

  /** Parse `box` with `check`, demanding that it is of this bank's scope and under its root box. */
  #demandBox<BoxT extends BoxSparse>(box: unknown, check: BoxCheck<BoxT>): BoxT {
    const parsed = check.parseConsistent(box, this.scope, { kind: 'record_conflict' })
    if (parsed.lifepath.split('/', 1)[0] !== this.#rootBox.lifeseq) { throw new Errors.VaultError('record_conflict', Phrases.BoxOfOtherRoot) }
    return parsed
  }

  /** The attached lease. Demands that the bank is enabled and unlocked. */
  #demandLease(): Lease {
    this.demandEnabled()
    if (this.#lease === null) { throw Throwers.needUnlocked() }
    return this.#lease
  }
  // --

  /** Always `'bank'`: marks this model for a {@link Consts.Modelkind} check. */
  get modelkind(): 'bank' { return 'bank' satisfies Consts.Modelkind }
}

// == [Helpers]: BoxCheck, disabledAnswerOf, otherThanBox

/** The `parseConsistent` of a box validator, which `#demandBox` takes. */
type BoxCheck<BoxT extends BoxSparse> = Readonly<{ parseConsistent: (val: unknown, other: object, refusal: Partial<Validator.ConsistencyRefusal>) => BoxT }>

/** The refused answer to `ask` while the bank's device is disabled: its `err` is the device's `endCause`. */
function disabledAnswerOf(ask: unknown, endCause: Errors.VaultError): BadAnswer<null> {
  return { ok: false, ask: loggableAskOf(ask), act: 'unclassified_storing', world: null, dbhas: null, err: endCause }
}

// The row goes on the refusal's rows, which reach an answer and never a log: a gate's row has its wrapped bankKeys.
/** A `storage_issue` refusal: the vaultDB answered `row`, which is not a box, to a box's get. */
function otherThanBox(ask: LoggableAsk, row: Thing): Errors.VaultError {
  return new Errors.VaultError('storage_issue', Phrases.GotOtherThanBox, { meta: { ask, act: 'unclassified_storing' }, rows: { dbhas: row } })
}
// --
