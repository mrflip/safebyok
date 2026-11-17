import type { Consts, EX } from 'safebyok-big/internals'
import { CX, Clock, Crypto, Errors, Throwers, Validator } from 'safebyok-big/internals'
import { DefaultQueryCacheOpts, type QueryCacheOpts, queryCacheOpts } from '../minding/shapes-minder'
import { BaseThing } from './base-thing'
import { CoreBox } from './core-box'
import { Device } from './device'
import { Gate, type GateDna } from './gate'
import type { Lease } from './lease'
import { type GateRevisionedStamp, Proving } from './proving'
import type { BoxCleartexts, BoxPublicProps, BoxRecord, BoxTombstone, LivePublicPropsOf, Sealable, TombstonePublicProps, UnsealedOf } from './sealers'
import { type BankScope, type BankStamp, type GateStamp, bankScope, bankStamp, gateStamp } from './stamps'
import * as Phrases from '../phrases'
import type { DeviceTok, Labelpath } from '../storage/primitives'
import {
  type BankThing, type BoxThing, type DelAskDraft, type GetAsk, type ListAsk, type PutAskDraft, type Thing, type Track, type WorldRecord,
  type Sparse, type WriteAsk, BankThingFormat, BoxThingFormat, MainGateLabelpath, RootBoxLabelpath, bankThing, boxRecord, boxRecordOrShell, boxSealable, delAskOf, gateThing, getAskOf, lifeseqOfLifenum,
  listAskOf, loggableAskOf, putAskOf, shellOf,
} from '../storage/shapes-thing'
import { type BadAnswer, type BirthBankAnswer, type GoodAnswer, type ListThingsAnswer, type VaultDB, type WriteThingAnswer, isVaultDB } from '../storage/vault-db'

export type { BankRecord, WorldRecord } from '../storage/shapes-thing'

/** The record {@link Bank.make} and {@link Bank.birth} take: the bank's Thing, with its main gate's Thing at `maingate` and its root box at `rootBox`.
 * The root box is whole, or its shell before the bank is born.
 */
export type BankMakeRecord = WorldRecord & Readonly<{ rootBox: BoxRecord | BoxShell }>

/** The dna of a new bank: its stamp, and its main gate's dna. */
export type BankDna = BankStamp & { maingate: GateDna }

/** A box unsealed: its record with its whisper in place of the sealed one. A tombstone's whisper is empty. */
export type BoxUnsealed = UnsealedOf<BoxThing, BoxCleartexts>

/** A box's shell: the void sparse record a box's first revision is sealed over and cites. */
export type BoxShell = Sparse<BoxTombstone>

/** The draft of a box's get ask, for {@link Bank.tryGetBox}: the box's labelpath, and `ifAbsent`, the answer when none is stored (default `'nil'`).
 * The bank fills in the rest of the {@link GetAsk}.
 */
export type GetBoxAskDraft = Readonly<{ labelpath: Labelpath, ifAbsent?: EX.IfAbsent | 'shell' }>

/** The draft of a get or list ask, for {@link Bank.makeGetAsk} or {@link Bank.makeListAsk}: a labelpath in the bank, and `ifAbsent`, the answer when nothing is stored there.
 * The bank fills in the rest of the {@link GetAsk} or {@link ListAsk}.
 */
export type BankAskDraft = Readonly<{ labelpath: Labelpath, ifAbsent?: EX.IfAbsent }>

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
/** The checks of {@link Bank.make}'s arguments, of the proving `unlockByProving` is given, and of the box a box method is given. */
const Checks = Validator.Checkers('bad_option', ({ obj, custom, orDefault }) => ({
  // The bank's Thing is strict and refined, so it is checked apart, once the gate and root box are removed.
  bankMakeArgs: obj({
    record: obj({ maingate: gateThing, rootBox: boxRecordOrShell }).loose(),
    opts:   obj({
      device:         custom<Device>((val) => val instanceof Device, 'Expected a Device'),
      vaultDB:        custom<VaultDB>(isVaultDB, Phrases.VaultDBExpected),
      queryCacheOpts: orDefault(queryCacheOpts, DefaultQueryCacheOpts),
    }),
  }),
  bankThing,
  proving: custom<Proving>((val) => val instanceof Proving, 'Expected a Proving'),
  boxSealable,
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
  /** The root box: its shell until the bank is born, then its stored record. */
  #rootBox: BoxRecord | BoxShell

  /** The attached lease, null while locked. */
  #lease: Lease | null = null
  // --

  // == [Getters]: device, device_tok, scope, stamp, maingate, rootBox, track, queryCacheOpts

  /** The device this bank is on. */
  get device(): Device { return this.#device }

  /** This device's token, recorded in each wayin the bank builds. */
  get device_tok(): DeviceTok { return this.#device.device_tok }

  /** This bank's scope: its user and its `banklabel`. */
  get scope(): BankScope { return bankScope.parse(this) }

  /** This bank's {@link BankStamp}, which every ctx under it binds first. */
  get stamp(): BankStamp { return bankStamp.parse(this) }

  /** The bank's main gate: the wayins a user unlocks with. */
  get maingate(): Gate { return this.#maingate }

  /** The root box: its shell until the bank is born, then its stored record. Every box of this bank is under it. */
  get rootBox(): BoxRecord | BoxShell { return this.#rootBox }

  /** The revseq and lifepath this object holds of the bank, its main gate and its root box, which every ask it makes tracks. */
  get track(): Track {
    return { bank: trackPairOf(this), [MainGateLabelpath]: trackPairOf(this.#maingate), [RootBoxLabelpath]: trackPairOf(this.#rootBox) }
  }

  /** The defaults this bank's minders set on their TanStack Query cache entries. */
  get queryCacheOpts(): Readonly<QueryCacheOpts> { return this.#queryCacheOpts }
  // --

  // == [Construction]: make, birth, constructor, mintStamps, makeRecord

  /** Make the bank of `record`, with its main gate and root box, on `opts.device`, keeping its boxes in `opts.vaultDB`. */
  static make(record: BankMakeRecord, opts: BankOpts): Bank { return new Bank(record, opts) }

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

  private constructor(record: BankMakeRecord, opts: BankOpts) {
    const { record: { maingate, rootBox, ...rest }, opts: checked } = Checks.bankMakeArgs.parse({ record, opts })
    const parsed = Checks.bankThing.parse(rest)
    // The device names its user `user_id`, and the bank's Thing `userid`.
    Validator.checkedConsistent({ user_id: parsed.userid, banklabel: parsed.banklabel }, checked.device.scope, { kind: 'record_conflict' })
    Validator.checkedConsistent(rootBox, { ...bankScope.parse(parsed), labelpath: 'box' }, { kind: 'record_conflict' })
    super(parsed)
    this.#device = checked.device
    this.#vaultDB = checked.vaultDB
    this.#queryCacheOpts = Object.freeze(checked.queryCacheOpts)
    this.#rootBox = Object.freeze(rootBox)
    this.#maingate = Gate.make(maingate, { bank: this })
    Object.freeze(this)
  }

  /** Fresh stamps for a new bank of `scope` and its main gate, both in their first life. Mint one pair per attempt to birth a bank. */
  static mintStamps(scope: CX.BankScope): { bankStamp: BankStamp, gateStamp: GateStamp } {
    const { user_id, banklabel } = CX.bankScope.parse(scope)
    const born_at = Clock.nowMillis()
    return {
      bankStamp: bankStamp.parse({ userid: user_id, banklabel, lifeseq: lifeseqOfLifenum(0), born_at }),
      gateStamp: gateStamp.parse({ userid: user_id, banklabel, labelpath: 'gate', lifeseq: lifeseqOfLifenum(0), born_at }),
    }
  }

  /** The first record of a new bank, made from `dna`, with its main gate and its root box's shell. `Bank.birth` seals the root box over the shell. */
  static makeRecord(dna: BankDna): BankMakeRecord {
    const { userid, banklabel, lifeseq, born_at } = bankStamp.parse(dna)
    const bank = bankThing.parse({
      userid, banklabel, labelpath: 'bank', label: 'bank', fmt: BankThingFormat, revtok: Crypto.randomId(), revseq: 0, am: 'a', born_at, written_at: born_at, lifeseq, lifepath: lifeseq,
    })
    const rootBox = boxRecordOrShell.parse(shellOf({ userid, banklabel, labelpath: RootBoxLabelpath }))
    return { ...bank, maingate: Gate.makeRecord(dna.maingate), rootBox }
  }
  // --

  // == [Ask builders]: makeGetAsk, makeListAsk, makePutAsk, makeDelAsk, tellBadNews
  // Each fills in this bank's scope and its `track`, and the modelkind and default flags of `getAskOf` and the rest. The
  // track is this object's, which may be stale: the answer's `tracked` says so. Nothing is checked here: the verb does that.

  /** The get ask for the Thing at `ask.labelpath` in this bank.
   * A ThingMinder sends it to the vaultDB exactly as given, in the get ask it is handed.
   */
  makeGetAsk(ask: BankAskDraft): GetAsk { return getAskOf({ ...ask, ...this.scope, track: this.track }) }

  /** The list ask for the children of the Thing at `ask.labelpath` in this bank. */
  makeListAsk(ask: BankAskDraft): ListAsk { return listAskOf({ ...ask, ...this.scope, track: this.track }) }

  /** The put ask writing `ask.record` over `ask.cited`, in this bank. */
  makePutAsk<RecordT extends Thing>(ask: Omit<PutAskDraft<RecordT>, 'track'>): WriteAsk<RecordT> {
    return { ...putAskOf<RecordT>({ ...ask, track: this.track }), ...this.scope }
  }

  /** The del ask writing the tombstone `ask.record` over `ask.cited`, in this bank. */
  makeDelAsk<RecordT extends Thing>(ask: Omit<DelAskDraft<RecordT>, 'track'>): WriteAsk<RecordT> {
    return { ...delAskOf<RecordT>({ ...ask, track: this.track }), ...this.scope }
  }

  /** Tell the device's `onBadNews` of failures no caller is waiting on ({@link Device.tellBadNews}). Never throws. */
  tellBadNews(badnews: readonly unknown[]): void { this.#device.tellBadNews(badnews) }
  // --

  // == [Methods]: put

  /** Write `ask.record`, this bank's next revision, over `ask.cited`. Resolves the bank's Thing the store reports writing. This Bank object is not updated. */
  async put(ask: PutAskDraft<BankThing>): Promise<BankThing> {
    this.demandEnabled()
    const answer = await this.#vaultDB.tryWriteThing({ ...this.makePutAsk(ask), labelpath: 'bank', modelkind: 'bank' })
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
    const root = await lease.seal(CoreBox, this.#rootBox, { sidecar: {} }, { whisper: {} })
    const answer = await this.#vaultDB.tryBirthBank({ ...ask, bank: this.pickle(), gate: this.#maingate.pickle(), root })
    if (answer.ok && (answer.val.bank.revtok === this.revtok) && lease.isEnabled) {
      this.#rootBox = Object.freeze(boxRecord.parse(answer.val.root))
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
  async unlockByProving(proved: Proving, cited: GateRevisionedStamp = this.maingate): Promise<this> {
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

  /** Seal and return the next revision of the box `donorProps`, with `publicProps` applied and the whisper of `secretProps` encrypted. Needs the bank unlocked.
   * The seal checks its arguments (an unknown key in `publicProps` or `secretProps` refuses) and the box it returns, so pass `donorProps` as you have it: whole, sealed or unsealed, a tombstone or the shell. It must be a box of this bank.
   * After a tombstone or the shell, the revision begins the box's next life. Its sidecar is `publicProps.sidecar`, or else the sidecar of `donorProps`.
   * Given `am: 'x'` in `publicProps`, it seals the tombstone of the live box instead ({@link tombstoneBox}), and refuses a sidecar or `secretProps`.
   * Its `written_at` is `publicProps.written_at`, or now.
   * @example
   *   await bank.sealBox(box, { sidecar: { account: 'work' } }, { whisper })
   */
  sealBox(donorProps: Sealable<BoxRecord>, publicProps: TombstonePublicProps): Promise<BoxTombstone>
  sealBox(donorProps: Sealable<BoxRecord>, publicProps: LivePublicPropsOf<BoxThing, BoxCleartexts>, secretProps: BoxCleartexts): Promise<BoxRecord>
  sealBox(donorProps: Sealable<BoxRecord>, publicProps: BoxPublicProps, secretProps?: BoxCleartexts): Promise<BoxThing>
  async sealBox(donorProps: Sealable<BoxRecord>, publicProps: BoxPublicProps, secretProps?: BoxCleartexts): Promise<BoxThing> {
    const lease = this.#demandLease()
    this.#demandOwnBox(donorProps)
    return lease.seal(CoreBox, donorProps, publicProps, secretProps)
  }

  /** Seal the tombstone of the live box `donorProps`. Needs the bank unlocked.
   * Its sealed empty whisper authenticates it. Its `written_at` is `publicProps.written_at`, or now.
   */
  tombstoneBox(donorProps: Sealable<BoxRecord>, publicProps: Partial<TombstonePublicProps> = {}): Promise<BoxTombstone> {
    return this.sealBox(donorProps, { ...publicProps, am: 'x' })
  }

  /** Unseal `box`, returning it with its whisper in place of the sealed one. Needs the bank unlocked.
   * It authenticates the box, all but its sidecar. For a tombstone, that checks its signature.
   */
  async unsealBox(box: BoxThing): Promise<BoxUnsealed> {
    const lease = this.#demandLease()
    this.#demandOwnBox(box)
    return lease.unseal(CoreBox, box)
  }
  // --

  // == [Boxes in the vaultDB]: tryListBoxes, tryGetBox, tryPutBox, tryDelBox
  // Each fills in the bank's scope and the box modelkind, so that what is not this bank's box refuses. None throws:
  // while the device is disabled, each answers with its refusal.

  /** The boxes directly under the root box, tombstones included, with the root box as `parent`. */
  tryListBoxes(): Promise<ListThingsAnswer> {
    const ask = this.makeListAsk({ labelpath: RootBoxLabelpath })
    const { endCause } = this.#device
    if (endCause !== null) { return Promise.resolve({ ...disabledAnswerOf(ask, endCause), parent: null, damaged_rows: [] }) }
    return this.#vaultDB.tryListThings(ask)
  }

  /** The box at `ask.labelpath`. If none is stored, `ifAbsent: 'shell'` answers its shell, which a first revision is sealed over and cites. */
  tryGetBox(ask: GetBoxAskDraft & Readonly<{ ifAbsent: 'shell' }>): Promise<GetBoxAnswer<BoxThing | BoxShell>>
  tryGetBox(ask: GetBoxAskDraft): Promise<GetBoxAnswer<BoxThing | null>>
  async tryGetBox(ask: GetBoxAskDraft): Promise<GetBoxAnswer<BoxThing | BoxShell | null>> {
    const { ifAbsent, ...given } = { ...ask }
    const thingAsk = { ...this.makeGetAsk({ ...given, ifAbsent: (ifAbsent === 'shell' || ifAbsent === undefined) ? 'nil' : ifAbsent }), modelkind: 'box' } as const
    const { endCause } = this.#device
    if (endCause !== null) { return disabledAnswerOf(thingAsk, endCause) }
    const answer = await this.#vaultDB.tryGetThing(thingAsk)
    if (! answer.ok) { return answer }
    // A box's labelpath, so its shell is a box's.
    if (answer.val === null) { return { ...answer, val: (ifAbsent === 'shell') ? shellOf({ ...this.scope, labelpath: given.labelpath }, this.#rootBox) as BoxShell : null } }
    if (answer.val.fmt !== BoxThingFormat) { return { ...answer, ok: false, act: 'unclassified_storing', dbhas: null, err: otherThanBox(answer) } }
    return { ...answer, val: answer.val }
  }

  /** Write the live box `ask.record` over the box `ask.cited` cites: the one stored at its scope, or its shell. */
  tryPutBox(ask: PutAskDraft<BoxThing>): Promise<WriteThingAnswer> {
    const thingAsk = { ...this.makePutAsk(ask), modelkind: 'box' } as const
    const { endCause } = this.#device
    if (endCause !== null) { return Promise.resolve(disabledAnswerOf(thingAsk, endCause)) }
    return this.#vaultDB.tryWriteThing(thingAsk)
  }

  /** Write the tombstone `ask.record` over the live box `ask.cited` cites. */
  tryDelBox(ask: DelAskDraft<BoxThing>): Promise<WriteThingAnswer> {
    const thingAsk = { ...this.makeDelAsk(ask), modelkind: 'box' } as const
    const { endCause } = this.#device
    if (endCause !== null) { return Promise.resolve(disabledAnswerOf(thingAsk, endCause)) }
    return this.#vaultDB.tryWriteThing(thingAsk)
  }
  // --

  // == [Guards]: isEnabled, isLocked, isUnlocked, demandEnabled, demandOwnBox, demandLease

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

  /** Demand that `box` is a box of this bank, under its current root box. */
  #demandOwnBox(box: unknown): void {
    const { lifepath } = Checks.boxSealable.parseConsistent(box, this.scope, { kind: 'record_conflict' })
    if (lifepath.split('/', 1)[0] !== this.#rootBox.lifeseq) { throw new Errors.VaultError('record_conflict', Phrases.BoxOfOtherRoot) }
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

// == [Helpers]: trackPairOf, disabledAnswerOf, otherThanBox

/** The revseq and lifepath of a Thing, as a `track` holds them. */
function trackPairOf({ revseq, lifepath }: Pick<Thing, 'revseq' | 'lifepath'>): Track['bank'] { return { revseq, lifepath } }

/** The refused answer to `ask` while the bank's device is disabled: its `err` is the device's `endCause`. */
function disabledAnswerOf(ask: unknown, endCause: Errors.VaultError): BadAnswer<null> {
  return { ok: false, ask: loggableAskOf(ask), act: 'unclassified_storing', world: null, dbhas: null, err: endCause }
}

// The row goes on the refusal's rows, which reach an answer and never a log: a gate's row has its wrapped bankKeys.
/** A `storage_issue` refusal of `answer`, the vaultDB's to a box's get, whose Thing is not a box. */
function otherThanBox({ ask, val }: GoodAnswer<Thing, EX.GotAct>): Errors.VaultError {
  return new Errors.VaultError('storage_issue', Phrases.GotOtherThanBox, { meta: { ask, act: 'unclassified_storing' }, rows: { dbhas: val } })
}
// --
