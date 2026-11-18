import type { Consts } from 'safebyok-big/internals'
import { Clock, Crypto, Errors, Phrases as BigPhrases, Throwers, Validator } from 'safebyok-big/internals'
import { type QueryCacheOpts, MinderChecks } from '../shapes/shapes-minder'
import { BaseThing } from './base-thing'
import { CoreBox } from './core-box'
import { Device } from './device'
import { Gate } from './gate'
import type { Lease } from './lease'
import { Proving } from './proving'
import type { BankAskDraft, BankDna, BankMakeRecord, BankOpts, BirthOpts, BoxShell, BoxUnsealed, GetBoxAnswer, GetBoxAskDraft } from '../shapes/shapes-bankish'
import type { GateRevisionedStamp } from '../shapes/shapes-gateish'
import type { BoxCleartexts, BoxPublicProps, BoxRecord, BoxTombstone, LivePublicPropsOf, Sealable, TombstonePublicProps } from '../shapes/shapes-sealers'
import { type BankScope, type BankStamp, type GateStamp, StampChecks } from '../shapes/shapes-stamps'
import * as Phrases from '../phrases'
import { boxOfOtherRoot, otherThanBox } from '../refusals/throwers'
import type { DeviceTok } from '../shapes/primitives'
import {
  type BankThing, type BoxThing, type Thing, BankThingFormat, BoxThingFormat, MainGateLabelpath, RootBoxLabelpath, BankChecks, BoxChecks, GateChecks, ThingChecks, lifeseqOfLifenum, shellOf,
} from '../shapes/shapes-thing'
import { type DelAskDraft, type GetAsk, type ListAsk, type PutAskDraft, type Track, type WriteAsk, delAskOf, getAskOf, listAskOf, loggableAskOf, putAskOf } from '../shapes/shapes-asks'
import { type BadAnswer, type BirthBankAnswer, type ListThingsAnswer, type VaultDB, type WriteThingAnswer } from '../storage/vault-db'

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
  get scope(): BankScope { return StampChecks.bankScope.parse(this) }

  /** This bank's {@link BankStamp}, which every ctx under it binds first. */
  get stamp(): BankStamp { return StampChecks.bankStamp.parse(this) }

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
    const { record: { maingate, rootBox, ...rest }, opts: { device, vaultDB, queryCacheOpts } } = Checks.bankMakeArgs.parse({ record, opts })
    const bankRecord = BankChecks.record.parse(rest)
    Validator.checkedConsistent(StampChecks.bankScope.parse(bankRecord), device.scope, { kind: 'record_conflict' })
    Validator.checkedConsistent(rootBox, { ...StampChecks.bankScope.parse(bankRecord), labelpath: 'box' }, { kind: 'record_conflict' })
    super(bankRecord)
    this.#device = device
    this.#vaultDB = vaultDB
    this.#queryCacheOpts = Object.freeze(queryCacheOpts)
    this.#rootBox = Object.freeze(rootBox)
    this.#maingate = Gate.make(maingate, { bank: this })
    Object.freeze(this)
  }

  /** Fresh stamps for a new bank of `scope` and its main gate, both in their first life. Mint one pair per attempt to birth a bank. */
  static mintStamps(scope: BankScope): { bankStamp: BankStamp, gateStamp: GateStamp } {
    const { userid, banklabel } = StampChecks.bankScope.parse(scope)
    const born_at = Clock.nowMillis()
    return {
      bankStamp: StampChecks.bankStamp.parse({ userid, banklabel, lifeseq: lifeseqOfLifenum(0), born_at }),
      gateStamp: StampChecks.gateStamp.parse({ userid, banklabel, labelpath: 'gate', lifeseq: lifeseqOfLifenum(0), born_at }),
    }
  }

  /** The first record of a new bank, made from `dna`, with its main gate and its root box's shell. `Bank.birth` seals the root box over the shell. */
  static makeRecord(dna: BankDna): BankMakeRecord {
    const { userid, banklabel, lifeseq, born_at } = StampChecks.bankStamp.parse(dna)
    const bank = BankChecks.record.parse({
      userid, banklabel, labelpath: 'bank', label: 'bank', fmt: BankThingFormat, revtok: Crypto.randomId(), revseq: 0, am: 'a', born_at, written_at: born_at, lifeseq, lifepath: lifeseq,
    })
    const rootBox = BoxChecks.liveOrShell.parse(shellOf({ userid, banklabel, labelpath: RootBoxLabelpath }))
    return { ...bank, maingate: Gate.makeRecord(dna.maingate), rootBox }
  }
  // --

  // == [Ask builders]: makeGetAsk, makeListAsk, makePutAsk, makeDelAsk, tellBadNews
  // Each fills in this bank's scope and its `track`, and the modelkind and default flags of `getAskOf` and the rest. The
  // track is this object's, which may be stale: the answer's `tracked` says so. Nothing is checked here: the verb does that.

  /** The get ask for the Thing at `ask.labelpath` in this bank. */
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
    const baseAsk = { ...this.scope, op: 'birth' } as const
    const { endCause } = this.#device
    if (endCause !== null) { return disabledAnswerOf(baseAsk, endCause) }
    const lease  = await Checks.proving.parse(proved).buildLease(this, this.#maingate)
    const root   = await lease.seal(CoreBox, this.#rootBox, { sidecar: {} }, { whisper: {} })
    //
    const ask    = { ...baseAsk, bank: this.pickle(), gate: this.#maingate.pickle(), root }
    const answer = await this.#vaultDB.tryBirthBank(ask)
    if (answer.ok && (answer.val.bank.revtok === this.revtok) && lease.isEnabled) {
      this.#rootBox = Object.freeze(BoxChecks.live.parse(answer.val.root))
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
    Checks.proving.parse(proved)
    const lease = await proved.buildLease(this, cited)
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

  /** Fetch the box at `ask.labelpath` from VaultDB.
   * If none is stored:
   * - `ifAbsent: 'shell'` answers with a shell tombstone: "updating" it is a create operation.
   */
  tryGetBox(ask: GetBoxAskDraft & Readonly<{ ifAbsent: 'shell' }>): Promise<GetBoxAnswer<BoxShell>>
  tryGetBox(ask: GetBoxAskDraft): Promise<GetBoxAnswer>
  async tryGetBox(ask: GetBoxAskDraft): Promise<GetBoxAnswer<BoxShell | null>> {
    // Spread, so that an ask that is not a bag reaches the vaultDB's check and refuses in the answer.
    const { labelpath, ifAbsent } = { ...ask }
    const thingAsk = { ...this.makeGetAsk({ labelpath, ifAbsent: (ifAbsent === 'shell' || ifAbsent === undefined) ? 'nil' : ifAbsent }), modelkind: 'box' } as const
    const { endCause } = this.#device
    if (endCause !== null) { return disabledAnswerOf(thingAsk, endCause) }
    const answer = await this.#vaultDB.tryGetThing(thingAsk)
    if (! answer.ok) { return answer }
    if (answer.act === 'gotvoid') {
      if (ifAbsent !== 'shell') { return answer }
      // A box's labelpath, so its shell is a box's.
      return { ...answer, val: shellOf({ ...this.scope, labelpath }, this.#rootBox) as BoxShell }
    }
    const { val } = answer
    if (val.fmt !== BoxThingFormat) { return { ...answer, ok: false, act: 'unclassified_storing', dbhas: null, err: otherThanBox(answer) } }
    return { ...answer, val }
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
    const { lifepath } = BoxChecks.sealable.parseConsistent(box, this.scope, { kind: 'record_conflict' })
    if (lifepath.split('/', 1)[0] !== this.#rootBox.lifeseq) { throw boxOfOtherRoot() }
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

// == [Helpers]: trackPairOf, disabledAnswerOf

/** The revseq and lifepath of a Thing, as a `track` holds them. */
function trackPairOf({ revseq, lifepath }: Pick<Thing, 'revseq' | 'lifepath'>): Track['bank'] { return { revseq, lifepath } }

/** The refused answer to `ask` while the bank's device is disabled: its `err` is the device's `endCause`. */
function disabledAnswerOf(ask: unknown, endCause: Errors.VaultError): BadAnswer<null> {
  return { ok: false, ask: loggableAskOf(ask), act: 'unclassified_storing', world: null, dbhas: null, err: endCause }
}
// --

// == [Checks]: Checks

// Defined here, not with the shapes: they name a model class.
/** The checks of {@link Bank.make}'s arguments, and of the proving `unlockByProving` is given. */
const Checks = Validator.Checkers('bad_record', ({ obj, custom }) => ({
  // The bank's Thing is strict and refined, so it is checked apart, once the gate and root box are removed.
  bankMakeArgs: obj({
    record: obj({ maingate: GateChecks.record, rootBox: BoxChecks.liveOrShell }).loose(),
    opts:   obj({
      device:         custom<Device>((val) => val instanceof Device, BigPhrases.DeviceExpected),
      vaultDB:        ThingChecks.vaultDBShape,
      queryCacheOpts: MinderChecks.queryCacheOptsOrDefault,
    }),
  }),
  proving: custom<Proving>((val) => val instanceof Proving, Phrases.ProvingExpected),
}))
// --
