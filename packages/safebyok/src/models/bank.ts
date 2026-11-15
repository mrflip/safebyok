import type * as Z from 'zod'
import type { Consts, EX } from 'safebyok-big/internals'
import { BX, CX, Clock, Crypto, Errors, GX, Helpers, SX, Throwers, Validator } from 'safebyok-big/internals'
import { Device } from './device'
import { Gate, type GateDna } from './gate'
import type { Lease } from './lease'
import { Proving } from './proving'
import type { BoxCleartexts, BoxRecord, BoxSparse, BoxTombstone, UnsealedOf } from './sealers'
import { type BankScope, type BankStamp, bankScope, bankStamp } from './stamps'
import * as Phrases from '../phrases'
import {
  type BankThing, type BoxThing, type DelAskArgs, type PutAskArgs,
  BankThingFormat, BoxThingFormat, ShellLifeseq, bankThing, boxSparse, boxThing, childShellCited, lifeseqOf, loggableAskOf,
} from '../storage/shapes-thing'
import { type BadAnswer, type GoodAnswer, type ListThingsAnswer, type VaultDB, type WriteThingAnswer, isVaultDB } from '../storage/vault-db'

/** A bank's record: its Thing, with its main gate's record as `maingate` and its root box's sparse record as `rootBox`. */
export type BankRecord = BankThing & { maingate: BX.GateRecord, rootBox: BoxSparse }

/** What a new bank is made of: its stamp, and its main gate's dna. */
export type BankDna = BankStamp & { maingate: GateDna }

/** A box unsealed: its record with its whisper in place of the sealed one. A tombstone's whisper is empty. */
export type BoxUnsealed = UnsealedOf<BoxRecord | BoxTombstone, BoxCleartexts>

/** A box's shell: the void sparse record a box's first revision is sealed over and cites. */
export type BoxShell = BoxSparse & Readonly<{ am: 'x' }>

/** What {@link Bank.tryGetBox} is given: the box's labelpath, and what to answer where none is stored (default `'nil'`). */
export type GetBoxArgs = Readonly<{ labelpath: string, ifAbsent?: EX.IfAbsent | 'shell' }>

/** What {@link Bank.tryGetBox} resolves: the box, or what `ifAbsent` gives where none is stored; or a refusal. */
export type GetBoxAnswer<ValT> = GoodAnswer<ValT, EX.GotAct> | BadAnswer

/** How {@link Bank.put} meets a live bank already stored at its scope: `'fail'` refuses `camped`. */
export interface BankPutOpts {
  ifPresent: 'fail'
}

/** What {@link Bank.make} is given besides its record. */
export interface BankOpts {
  /** The device the bank is on, which must be of the bank's scope. */
  device:  Device
  /** Where the bank's boxes are stored. */
  vaultDB: VaultDB
}

// Defined here, not with the shapes: they name a model class.
/** The checks of {@link Bank.make}'s arguments, of the proving `unlockByProving` is given, and of the boxes a box method is given. */
const Checks = Validator.Checkers('bad_option', ({ obj, custom }) => ({
  // The bank's Thing is strict and refined, so it is checked apart, once the gate and root box are removed.
  bankMakeArgs: obj({
    record: obj({ maingate: BX.gateRecord, rootBox: boxSparse }).loose(),
    opts:   obj({ device: custom<Device>((val) => val instanceof Device, 'Expected a Device'), vaultDB: custom<VaultDB>(isVaultDB, Phrases.VaultDBExpected) }),
  }),
  bankThing,
  proving: custom<Proving>((val) => val instanceof Proving, 'Expected a Proving'),
  boxSparse,
  boxThing,
}))

/** The signed-in user's bank on this device: its main gate, its root box, and its lease while unlocked.
 * Boxes are sealed and unsealed under the lease, which the bank keeps private, and stored in its vaultDB.
 */
export class Bank implements BankStamp {
  // == [Props]: userid, banklabel, lifeseq, born_at, #device, #vaultDB, #record, #maingate, #rootBox, #lease

  /** The user's id; with `banklabel`, this bank's scope. */
  declare readonly userid:    string
  declare readonly banklabel: string
  /** This bank's life: a bank built again has the next. */
  declare readonly lifeseq:   string
  declare readonly born_at:   number

  readonly #device:   Device
  readonly #vaultDB:  VaultDB
  readonly #record:   BankThing
  readonly #maingate: Gate
  readonly #rootBox:  BoxSparse

  /** The lease attached to this bank; null means locked. */
  #lease: Lease | null = null
  // --

  // == [Getters]: device, device_tok, scope, stamp, maingate, rootBox, revtok, revseq, written_at

  /** The device this bank is on. */
  get device(): Device { return this.#device }

  /** The token of this device's row, which each wayin it builds records. */
  get device_tok(): string { return this.#device.device_tok }

  /** This bank's scope: its user and its `banklabel`. */
  get scope(): BankScope { return bankScope.parse(this) }

  /** This bank's {@link BankStamp}, which every ctx under it binds first. */
  get stamp(): BankStamp { return bankStamp.parse(this) }

  /** The bank's main gate: the wayins a user unlocks with. */
  get maingate(): Gate { return this.#maingate }

  /** The root box's sparse record, as the bank was made with it. Every box of this bank is under it. */
  get rootBox(): BoxSparse { return this.#rootBox }

  /** The revision of the bank's Thing in hand. */
  get revtok(): string { return this.#record.revtok }

  /** The sequence number of the revision in hand, counting from 0 at its birth. */
  get revseq(): number { return this.#record.revseq }

  /** When the revision in hand was written, in epoch milliseconds. */
  get written_at(): number { return this.#record.written_at }
  // --

  // == [Construction]: make, constructor, mintStamps, makeRecord

  /** The bank of `record`, with its main gate and root box, on `opts.device`, putting its boxes in `opts.vaultDB`. */
  static make(record: BankRecord, opts: BankOpts): Bank { return new Bank(record, opts) }

  private constructor(record: BankRecord, opts: BankOpts) {
    const { record: { maingate, rootBox, ...rest }, opts: { device, vaultDB } } = Checks.bankMakeArgs.parse({ record, opts })
    const parsed = Checks.bankThing.parse(rest)
    // The device names its user `user_id`, and the bank's Thing `userid`.
    Validator.checkedConsistent({ user_id: parsed.userid, banklabel: parsed.banklabel }, device.scope, { kind: 'record_conflict' })
    Validator.checkedConsistent(rootBox, { ...bankScope.parse(parsed), labelpath: 'box' }, { kind: 'record_conflict' })
    this.#device = device
    this.#vaultDB = vaultDB
    this.#record = Object.freeze(parsed)
    this.#rootBox = Object.freeze(rootBox)
    Helpers.tattoo(this, bankStamp.parse(parsed), { configurable: false })
    this.#maingate = Gate.make(maingate, { bank: this })
    Object.freeze(this)
  }

  /** Fresh stamps for a new bank of `scope`, in its first life, and its main gate. Mint one pair per attempt to birth a bank. */
  static mintStamps(scope: CX.BankScope): { bankStamp: BankStamp, gateStamp: GX.GateStamp } {
    const { user_id, banklabel } = CX.bankScope.parse(scope)
    const born_at = Clock.nowMillis()
    return {
      bankStamp: bankStamp.parse({ userid: user_id, banklabel, lifeseq: lifeseqOf(0), born_at }),
      gateStamp: GX.gateStamp.parse({ user_id, banklabel, gatelabel: 'main', gate_tok: Crypto.makeLifeTok(), registered_at: born_at }),
    }
  }

  // The root box here is the first revision of its life as a seal of its shell would make it, sealed and stored by
  // nothing: a bank's birth, which would seal and write it, is not built.
  /** The first record of a new bank, its main gate and its root box, made of `dna`, each born when the bank is. */
  static makeRecord(dna: BankDna): BankRecord {
    const { userid, banklabel, lifeseq, born_at } = bankStamp.parse(dna)
    const firstRevision = { revseq: 0, am: 'a', born_at, written_at: born_at } as const
    const bank = bankThing.parse({ userid, banklabel, labelpath: 'bank', label: 'bank', fmt: BankThingFormat, revtok: Crypto.randomId(), ...firstRevision, lifeseq, lifepath: lifeseq })
    const rootBox = boxSparse.parse({
      userid, banklabel, labelpath: 'box', label: 'box', fmt: BoxThingFormat, revtok: Crypto.randomId(), ...firstRevision, lifeseq: lifeseqOf(0), lifepath: lifeseqOf(0),
    })
    return { ...bank, maingate: Gate.makeRecord(bank, dna.maingate), rootBox }
  }
  // --

  // == [Methods]: pickle, put

  /** This bank's Thing, frozen. */
  pickle(): BankThing { return this.#record }

  // A bank's birth through the vaultDB is not built in this layer: a test stubs this.
  /** Store this bank and its main gate. Refuses `camped` where a live bank is stored at its scope. */
  put(_opts: BankPutOpts): Promise<this> { return Promise.reject(new Errors.VaultError('unexpected_error', Phrases.PutNotBuilt)) }
  // --

  // == [Unlocking and locking]: unlockByProving, attachLease, lock

  /** Unlock this bank with `proved`, a proving of its gate, built in the gating attempt underway.
   * The lease cites `cited`, by default the main gate in hand.
   */
  async unlockByProving(proved: Proving, cited: GX.CitedGate = this.maingate): Promise<this> {
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

  /** The live box next after `prior`, its whisper sealed under this bank's key. Needs the bank unlocked.
   * Over a live box it is the next revision; over a tombstone or the shell, the first revision of the next life.
   * Only the Thing fields and the sidecar of `prior` are read, so a stored box spread with a new sidecar will do.
   */
  async sealBox(prior: BoxSparse & Pick<BoxRecord, 'sidecar'>, cleartexts: BoxCleartexts): Promise<BoxRecord> {
    const lease = this.#demandLease()
    this.#demandBox(prior, Checks.boxSparse)
    return lease.seal('BoxWhisper', prior, cleartexts)
  }

  /** The tombstone of the live box `prior`, signed by an empty whisper sealed under this bank's key. Needs the bank unlocked. */
  async tombstoneBox(prior: BoxSparse): Promise<BoxTombstone> {
    const lease = this.#demandLease()
    this.#demandBox(prior, Checks.boxSparse)
    return lease.seal('BoxTombstone', prior, { whisper: {} })
  }

  /** `box` with its whisper unsealed in place of the sealed one. Needs the bank unlocked.
   * Unsealing authenticates the box, all but its sidecar: for a tombstone, whose whisper is empty, that is the check of its signature.
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

  /** The boxes directly under the root box, tombstones among them, with the root box as `parent`. */
  tryListBoxes(): Promise<ListThingsAnswer> {
    const ask = this.#vaultDB.listAsk({ ...this.scope, labelpath: 'box' })
    if (! this.isEnabled) { return Promise.resolve({ ...disabledAnswerOf(ask), parent: null, damaged_rows: [] }) }
    return this.#vaultDB.tryListThings(ask)
  }

  /** The box at `args.labelpath`. Where none is stored, `ifAbsent: 'shell'` gives its shell, for its first revision to be sealed over and cite. */
  tryGetBox(args: GetBoxArgs & Readonly<{ ifAbsent: 'shell' }>): Promise<GetBoxAnswer<BoxThing | BoxShell>>
  tryGetBox(args: GetBoxArgs): Promise<GetBoxAnswer<BoxThing | null>>
  async tryGetBox(args: GetBoxArgs): Promise<GetBoxAnswer<BoxThing | BoxShell | null>> {
    const { ifAbsent, ...given } = { ...args }
    const ask = { ...this.#vaultDB.getAsk({ ...given, ...this.scope, ifAbsent: (ifAbsent === 'shell' || ifAbsent === undefined) ? 'nil' : ifAbsent }), modelkind: 'box' } as const
    if (! this.isEnabled) { return disabledAnswerOf(ask) }
    const answer = await this.#vaultDB.tryGetThing(ask)
    if (! answer.ok) { return answer }
    if (answer.val === null) { return { ...answer, val: (ifAbsent === 'shell') ? this.#shellOf(given.labelpath) : null } }
    if (answer.val.fmt !== BoxThingFormat) { return { ...answer, ok: false, act: 'unclassified_storing', dbhas: answer.val, err: new Errors.VaultError('unexpected_error', Phrases.GotOtherThanBox) } }
    return { ...answer, val: answer.val }
  }

  /** Write the live box `args.record` over `args.cited`, the box stored at its scope, or its shell. */
  tryPutBox(args: PutAskArgs<BoxThing>): Promise<WriteThingAnswer> {
    const ask = { ...this.#vaultDB.putAsk(args), ...this.scope, modelkind: 'box' } as const
    if (! this.isEnabled) { return Promise.resolve(disabledAnswerOf(ask)) }
    return this.#vaultDB.tryWriteThing(ask)
  }

  /** Write the tombstone `args.record` over `args.cited`, the live box stored at its scope. */
  tryDelBox(args: DelAskArgs<BoxThing>): Promise<WriteThingAnswer> {
    const ask = { ...this.#vaultDB.delAsk(args), ...this.scope, modelkind: 'box' } as const
    if (! this.isEnabled) { return Promise.resolve(disabledAnswerOf(ask)) }
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

  /** `box`, parsed by `check`, or throw `record_conflict` unless it is of this bank's scope and under its root box */
  #demandBox<BoxT extends BoxSparse>(box: unknown, check: Z.ZodType<BoxT>): BoxT {
    const parsed = Validator.checkedConsistent(check.parse(box), this.scope, { kind: 'record_conflict' })
    if (parsed.lifepath.split('/', 1)[0] !== this.#rootBox.lifeseq) { throw new Errors.VaultError('record_conflict', Phrases.BoxOfOtherRoot) }
    return parsed
  }

  /** The attached lease, or throw while locked */
  #demandLease(): Lease {
    this.demandEnabled()
    if (this.#lease === null) { throw Throwers.needUnlocked() }
    return this.#lease
  }
  // --

  /** Always `'bank'`: marks this model for a {@link Consts.Modelkind} check. */
  get modelkind(): 'bank' { return 'bank' satisfies Consts.Modelkind }
}

/** The refused answer to `ask` while the bank's device is disabled, with the device's refusal as its err. */
function disabledAnswerOf(ask: unknown): BadAnswer<null> {
  return { ok: false, ask: loggableAskOf(ask), act: 'unclassified_storing', world: null, dbhas: null, err: Throwers.deviceDisabled() }
}
