/** `VaultMinder`, which answers a vaultDB's verbs over another, and tells one bank's records that are news as an ordered feed. */

import { once } from 'es-toolkit'
import { type Errors, SX } from 'safebyok-big/internals'
import { type Lifetok, Labelpath } from '../shapes/primitives'
import {
  type AnyAsk, type BirthBankAsk, type CitedOf, type DelAskDraft, type GetAsk, type GetWorldAsk, type ListAsk, type PutAskDraft, type Track, type Tracked, type WriteAsk,
  delAskOf, getAskOf, listAskOf, putAskOf,
} from '../shapes/shapes-asks'
import type { BankAskDraft } from '../shapes/shapes-bankish'
import { type BankRecord, type ThingRecord, type ThingScope, Shell, ThingChecks } from '../shapes/shapes-thing'
import type { BankScope } from '../shapes/shapes-stamps'
import { type CarWorld, type DelOnceArgs, type PutOnceArgs, type ReceivingThing, type VaultMinderListener, type VaultMinderOpts, VaultMinderChecks } from '../shapes/shapes-vault-minder'
import { type ReadTc, type SeenThing, type VaultEvent, SeenChecks, VaultDBSourcelabel } from '../shapes/shapes-vault-event'
import * as Throwers from '../refusals/throwers'
import { BaseThing } from '../models/base-thing'
import { itemEventOf } from '../storage/agerank'
import { refusedAnswerOf } from '../storage/refused-answer'
import { ThingCar } from './thing-car'
import type { BadAnswer, BirthBankAnswer, GetThingAnswer, GetWorldAnswer, Kids, ListThingsAnswer, WriteThingAnswer } from '../shapes/shapes-answers'
import type { VaultDB } from '../storage/vault-db'

// == [VaultMinder]: Dispatch, Listening, Told, VaultMinder

/** Who dispatched a record, when it was read, and its bank's lifetok, the void one where none is known: every event of it carries all three. */
type Dispatch = Readonly<{ sourcelabel: string, read_tc: ReadTc, banktok: Lifetok }>

/** One call of `listen`, holding its listener: a listener that listens twice is told twice, and each end stops one. */
type Listening = Readonly<{ listener: VaultMinderListener }>

/** A vaultDB's answer, its records told, and the refusal the record it carries at the ask's labelpath raised, or null. */
type Told<AnswerT> = Readonly<{ answer: AnswerT, refusal: Errors.VaultError | null }>

/** A vaultDB's verbs over another vaultDB, for one bank, telling its listeners each record it learns of that is news, in order.
 * It learns of the records each answer carries, of what the wrapped vaultDB's watch notifies, and of the events a device database rings, handed to its `receive`.
 * It keeps a Thing for each labelpath it learns of a record at, for as long as it lives, and each Thing's `receive` says what is news.
 * Beside each Thing it keeps the refusal the Thing last raised at a record, and when its last news was read: {@link carAt}.
 * It builds the bank's asks, and its once verbs send them, each answering only once its records have been told.
 * It watches the wrapped vaultDB from when it is made until its `sweep`. A record it learns of while no one listens is
 * taken all the same, and reaches no one, then or later: listen before asking it anything.
 */
export class VaultMinder<ThingT extends ReceivingThing = ReceivingThing> implements Omit<VaultDB, 'watch'> {
  // == [Props]: VaultDBSourcelabel, #vaultDB, #scope, #world, #cars, #listenings, #newestBanktok, #unwatchWrapped

  /** The `sourcelabel` of each event of a record from the wrapped vaultDB, from an answer or its watch. */
  static get VaultDBSourcelabel(): typeof VaultDBSourcelabel { return VaultDBSourcelabel }

  /** The wrapped vaultDB. */
  readonly #vaultDB: VaultDB
  /** The bank this vaultDB serves. */
  readonly #scope: BankScope
  /** The world that makes each Thing kept. */
  readonly #world: CarWorld<ThingT>
  /** The car of the Thing at each labelpath a record was learned of at. */
  readonly #cars = new Map<Labelpath, ThingCar<ThingT>>()
  readonly #listenings = new Set<Listening>()
  /** The `banktok` of the newest answer that read the bank, for a notice or an event rung that carries the void lifetok: the void lifetok until one has. */
  #newestBanktok: Lifetok = SX.VoidLifeTok
  /** The stop of the wrapped vaultDB's watch, which runs once. */
  readonly #unwatchWrapped: () => void
  // --

  // == [Construction]: make, constructor

  /** Wrap `opts.vaultDB` for the bank at `scope`, and start watching it. */
  static make<ThingT extends ReceivingThing>(scope: BankScope, opts: VaultMinderOpts<ThingT>): VaultMinder<ThingT> { return new VaultMinder(scope, opts) }

  private constructor(scope: BankScope, opts: VaultMinderOpts<ThingT>) {
    const { scope: bankScope, opts: { vaultDB } } = VaultMinderChecks.makeArgs.parse({ scope, opts })
    this.#vaultDB   = vaultDB
    this.#scope     = Object.freeze({ userid: bankScope.userid, banklabel: bankScope.banklabel })
    this.#world     = opts.world
    this.#unwatchWrapped = once(vaultDB.watch(bankScope, (notice) => { this.#tellNotice(notice) }, (news) => { this.#tellBadNews(news, null) }))
    Object.freeze(this)
  }
  // --

  // == [Verbs]: tryGetThing, tryWriteThing, tryListThings, tryBirthBank, tryGetWorld
  // Each verb refuses an ask of another bank, by its userid and banklabel, and hands any other to the wrapped vaultDB, which
  // checks the rest, its banktok among it, and answers a refusal rather than throwing. Each returns that answer unchanged.
  // The records it carries are told first, out to in, at the answer's read_tc.

  /** {@link VaultDB.tryGetThing}: a get that finds nothing tells the shell its answer carries. */
  async tryGetThing(ask: GetAsk): Promise<GetThingAnswer> {
    const { answer } = await this.#doTryGetThing(ask)
    return answer
  }

  /** The answer to the get `ask`, told */
  async #doTryGetThing(ask: GetAsk): Promise<Told<GetThingAnswer>> {
    try { this.#checkOwnAsk(ask) } catch (err) { return { answer: refusedAnswerOf(ask, err), refusal: null } }
    const answer = await this.#vaultDB.tryGetThing(ask)
    return { answer, refusal: this.#tellAnswer(answer, rootsOf(answer), gotRecordsOf(answer)) }
  }

  /** {@link VaultDB.tryWriteThing}: a write refused over nothing stored tells the shell its answer carries. */
  async tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer> {
    const { answer } = await this.#doTryWriteThing(ask)
    return answer
  }

  /** The answer to the write `ask`, told */
  async #doTryWriteThing(ask: WriteAsk): Promise<Told<WriteThingAnswer>> {
    try { this.#checkOwnAsk(ask) } catch (err) { return { answer: refusedAnswerOf(ask, err), refusal: null } }
    const answer = await this.#vaultDB.tryWriteThing(ask)
    return { answer, refusal: this.#tellAnswer(answer, rootsOf(answer), writtenRecordsOf(answer)) }
  }

  /** {@link VaultDB.tryListThings}: the parent and each Thing listed are told in labelpath order, or a refusal's tombstone or shell. */
  async tryListThings(ask: ListAsk): Promise<ListThingsAnswer> {
    try { this.#checkOwnAsk(ask) } catch (err) { return { ...refusedAnswerOf(ask, err), parentage: [], deltas: [], damaged_rows: [] } }
    const answer = await this.#vaultDB.tryListThings(ask)
    this.#tellAnswer(answer, rootsOf(answer), listedRecordsOf(answer))
    return answer
  }

  /** {@link VaultDB.tryBirthBank} */
  async tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer> {
    try { this.#checkOwnAsk(ask) } catch (err) { return refusedAnswerOf(ask, err) }
    const answer = await this.#vaultDB.tryBirthBank(ask)
    this.#tellAnswer(answer, rootsOf(answer), bornRecordsOf(answer))
    return answer
  }

  // The answer's tracked is read in the same step as its three roots, so they are told as those alone: a root its Thing
  // refuses is then refused once.
  /** {@link VaultDB.tryGetWorld}: the three roots it answers are told in root order, the shell where none is stored. */
  async tryGetWorld(ask: GetWorldAsk): Promise<GetWorldAnswer> {
    try { this.#checkOwnAsk(ask) } catch (err) { return refusedAnswerOf(ask, err) }
    const answer = await this.#vaultDB.tryGetWorld(ask)
    this.#tellAnswer(answer, [], worldRootsOf(answer))
    return answer
  }

  /** Refuse an ask of another bank than this vaultDB's */
  #checkOwnAsk(ask: AnyAsk): void { ThingChecks.bankScope.parseConsistent(ask, this.#scope) }
  // --

  // == [Once verbs]: tryGetWorldOnce, tryGetOnce, getOnce, tryListOnce, listOnce, tryPutOnce, putOnce, tryDelOnce, delOnce
  // Each sends the wrapped vaultDB one ask of this bank's, and answers once the records the answer carries are told. Each
  // `try` form answers the vaultDB's whole answer, a refusal included, unless the record it carries at the ask's labelpath
  // is refused as it is told: then it answers that refusal. The other form throws the refusal, and `getOnce` refuses too
  // where the Thing is known only sparse in its newest life.

  // A get of the world has no labelpath of its own: a root refused as it is told reaches each listener's onBadNews alone.
  /** Get this bank's three roots once, in one step. */
  async tryGetWorldOnce(): Promise<GetWorldAnswer> {
    return await this.tryGetWorld({ ...this.#scope, op: 'getworld', ...this.#bankFields() })
  }

  /** Get the Thing at `scoped`, of this bank, once. */
  async tryGetOnce(scoped: ThingScope): Promise<GetThingAnswer> {
    let ask: GetAsk
    try { ask = this.makeGetAsk({ labelpath: this.#labelpathOf(scoped), ifAbsent: 'nil' }) } catch (err) { return refusedAnswerOf(scoped, err) }
    const { answer, refusal } = await this.#doTryGetThing(ask)
    return (refusal === null) ? answer : ownRefusedAnswerOf(answer, refusal)
  }

  /** Get the Thing at `scoped`, of this bank, once, resolving the record it then holds: live, a tombstone or the shell, the Thing's own frozen object.
   * Refuses `stale_read` where the Thing is known only sparse in its newest life, as where storage answers an earlier one. Call `thingAt` for the Thing.
   */
  async getOnce(scoped: ThingScope): Promise<ReturnType<ThingT['pickle']>> {
    const answer = await this.tryGetOnce(scoped)
    if (! answer.ok) { throw answer.err }
    // A good answer's own record was told and taken, so a Thing is kept at its labelpath.
    const thing = this.thingAt(scoped)!
    if (thing.agekind === 'bare') { throw Throwers.thingSoonestBare(this.#labelpathOf(scoped)) }
    return thing.pickle() as ReturnType<ThingT['pickle']>
  }

  /** List the children of the live Thing at `labelpath` once. A parent deleted or never stored refuses `absent_thing`. A child stored damaged is told to each listener's `onBadNews`. */
  async tryListOnce(labelpath: Labelpath): Promise<ListThingsAnswer> {
    const ask    = this.makeListAsk({ labelpath })
    const answer = await this.tryListThings(ask)
    if (answer.damaged_rows.length > 0) { this.#tellBadNews(Throwers.childrenStoredDamaged(ask, answer.damaged_rows), null) }
    return answer
  }

  /** List the children of the Thing at `labelpath` once, as {@link tryListOnce} does, resolving the listing. */
  async listOnce(labelpath: Labelpath): Promise<Kids> {
    const answer = await this.tryListOnce(labelpath)
    if (! answer.ok) { throw answer.err }
    return answer.val
  }

  /** Write `args.record` over `args.cited` once. */
  async tryPutOnce<RecordT extends ThingRecord>(args: PutOnceArgs<RecordT>): Promise<WriteThingAnswer> {
    let ask: WriteAsk<RecordT>
    try { ask = this.makePutAsk<RecordT>({ ...args, cited: args.cited ?? this.#citableAt(args.record) }) } catch (err) { return refusedAnswerOf(args, err) }
    const { answer, refusal } = await this.#doTryWriteThing(ask)
    return (refusal === null) ? answer : ownRefusedAnswerOf(answer, refusal)
  }

  /** Write `args.record` over `args.cited` once, resolving the record the vaultDB reports stored. */
  async putOnce<RecordT extends ThingRecord>(args: PutOnceArgs<RecordT>): Promise<RecordT> {
    const answer = await this.tryPutOnce(args)
    if (! answer.ok) { throw answer.err }
    // The ask's modelkind is the record's, which the vaultDB checks what it answers against.
    return answer.val as RecordT
  }

  /** Write the tombstone `args.record` over `args.cited` once. */
  async tryDelOnce<RecordT extends ThingRecord>(args: DelOnceArgs<RecordT>): Promise<WriteThingAnswer> {
    let ask: WriteAsk<RecordT>
    try { ask = this.makeDelAsk<RecordT>({ ...args, cited: args.cited ?? this.#citableAt(args.record) }) } catch (err) { return refusedAnswerOf(args, err) }
    const { answer, refusal } = await this.#doTryWriteThing(ask)
    return (refusal === null) ? answer : ownRefusedAnswerOf(answer, refusal)
  }

  /** Write the tombstone `args.record` over `args.cited` once, resolving the tombstone the vaultDB reports stored. */
  async delOnce<RecordT extends ThingRecord>(args: DelOnceArgs<RecordT>): Promise<RecordT> {
    const answer = await this.tryDelOnce(args)
    if (! answer.ok) { throw answer.err }
    // The ask's modelkind is the record's, which the vaultDB checks what it answers against.
    return answer.val as RecordT
  }

  // The act tables read a revseq of -1 and the void revtok as citing nothing stored. The cited lives above it are the
  // record's, as the ask's checks demand, so a record of a life after the first refuses there.
  /** The citable of the car kept at `record`'s labelpath, as a write of `record` cites it, or the void revision where none is kept */
  #citableAt<RecordT extends ThingRecord>(record: RecordT): CitedOf<RecordT> {
    return (this.carAt(record)?.citable ?? Shell.citedInParentLivesOf(record)) as CitedOf<RecordT>
  }

  /** The labelpath of `scoped`, refusing a scope of another bank */
  #labelpathOf(scoped: ThingScope): Labelpath { return ThingChecks.thingScope.parseConsistent(scoped, this.#scope).labelpath }
  // --

  // == [Asks]: makeGetAsk, makeListAsk, makePutAsk, makeDelAsk, knownRoots, #trackPairAt, #bankFields
  // Each fills in the modelkind and default flags `getAskOf` and the rest give it, and the verb checks the rest. A bank
  // not yet heard of live, as at sign-in or before a birth, has asks with the void banktok, which only a get may carry,
  // and a root not yet heard of stored is tracked at the void revision.

  /** The get ask for the Thing at `draft.labelpath` in this bank. */
  makeGetAsk(draft: BankAskDraft): GetAsk { return getAskOf({ ...draft, ...this.#scope, ...this.#bankFields() }) }

  /** The list ask for the children of the Thing at `draft.labelpath` in this bank. */
  makeListAsk(draft: Omit<BankAskDraft, 'ifAbsent'>): ListAsk { return listAskOf({ ...draft, ...this.#scope, ...this.#bankFields() }) }

  /** The put ask writing `draft.record` over `draft.cited`, in this bank. */
  makePutAsk<RecordT extends ThingRecord>(draft: Omit<PutAskDraft<RecordT>, 'track' | 'banktok'>): WriteAsk<RecordT> {
    return { ...putAskOf<RecordT>({ ...draft, ...this.#bankFields() }), ...this.#scope }
  }

  /** The del ask writing the tombstone `draft.record` over `draft.cited`, in this bank. */
  makeDelAsk<RecordT extends ThingRecord>(draft: Omit<DelAskDraft<RecordT>, 'track' | 'banktok'>): WriteAsk<RecordT> {
    return { ...delAskOf<RecordT>({ ...draft, ...this.#bankFields() }), ...this.#scope }
  }

  // A root known newer only sparse is given at its older whole record, so that the answer sends it whole. A root's
  // shell is at the void revision, as Shell.Cited is.
  /** The roots this bank's asks track: the revision of the whole record each root's Thing holds, or the void revision where no Thing is kept. */
  get knownRoots(): Track {
    return { bank: this.#trackPairAt('bank'), [Labelpath.MainGate]: this.#trackPairAt(Labelpath.MainGate), [Labelpath.RootBox]: this.#trackPairAt(Labelpath.RootBox) }
  }

  /** The revseq and lifepath of the record the Thing at `labelpath` holds, or of the void revision where none is kept */
  #trackPairAt(labelpath: Labelpath): Track['bank'] { return trackPairOf(this.#cars.get(labelpath)?.thing.pickle() ?? Shell.Cited) }

  /** The `banktok` and `track` of this bank's asks: the lifetok of the bank's Thing while it holds a live record, else the void lifetok, and its {@link knownRoots}. */
  #bankFields(): { banktok: Lifetok, track: Track } {
    const bank = this.#cars.get('bank')?.thing.pickle()
    // The record held at the bank's labelpath is a bank's: the vaultDB checked it as one.
    const banktok = (bank?.am === 'a') ? (bank as BankRecord).lifetok : SX.VoidLifeTok
    return { banktok, track: this.knownRoots }
  }
  // --

  // == [Listening]: listen

  /** Tell `listener` each event of this bank's records that is news, and of trouble, until the function it returns is called.
   * - Each event is a {@link VaultEvent} with its `sourcelabel`, `read_tc` and `banktok`. An answer's events carry the
   *   answer's `banktok`; a notice's or an event rung's carry its own, else, where that is the void lifetok, that of the
   *   newest answer that read the bank.
   * - The events of a verb's answer reach every listener, in order, before the verb resolves.
   * - Of the records an answer carries, the bank comes first, then the main gate, the root box, a list's parent and the
   *   Things it lists, and last the answer's own record.
   * - A record no newer than one seen of its Thing is told to no one, unless it is the newest revision seen, read in a
   *   later span of 65.536 seconds than that revision was last seen in.
   * - What `hear` throws goes to the listener's own `onBadNews`, of no labelpath; a record refused goes to every listener's, with its labelpath.
   */
  listen(listener: VaultMinderListener): () => void {
    VaultMinderChecks.listener.parse(listener)
    const listening: Listening = Object.freeze({ listener })
    this.#listenings.add(listening)
    return () => { this.#listenings.delete(listening) }
  }
  // --

  // == [Receiving]: receive

  /** Take an event a device database rang, and tell every listener, before returning, the events of its `val` that are news, at its `sourcelabel`, `read_tc` and `banktok`.
   * An `item` event's `val` is taken as an answer's record is, a void sentinel at the lifepath it carries.
   * A `life` or `aged` event tells nothing, and its agerank is never read: the Thing at its labelpath keeps its own.
   * Refuses an event of another bank.
   */
  receive(event: VaultEvent): void {
    const rung = VaultMinderChecks.rungEvent.parseConsistent(event, this.#scope)
    if (event.eventkind !== 'item') { return }
    const { liveness } = VaultMinderChecks.rungItem.parse(event)
    if (liveness === 'void') { VaultMinderChecks.rungVoid.parseConsistent(event.val, rung) } else { VaultMinderChecks.rungThing.parseConsistent(event.val, rung) }
    this.#tell([event.val], { sourcelabel: rung.sourcelabel, read_tc: rung.read_tc, banktok: this.#banktokOr(rung.banktok) })
  }
  // --

  // == [Reading]: thingAt, carAt

  /** The Thing at `scoped`, a labelpath of this vaultDB's bank, or undefined where no record of it has been learned of. The same object across records and lives. */
  thingAt(scoped: ThingScope): ThingT | undefined { return this.carAt(scoped)?.thing }

  /** The Thing at `scoped`, the refusal it last raised at a record and when its last news was read, or undefined where {@link thingAt} is.
   * Its `lastErr` is for a devtool, never for an app's own logic.
   */
  carAt(scoped: ThingScope): ThingCar<ThingT> | undefined {
    const { labelpath } = ThingChecks.thingScope.parseConsistent(scoped, this.#scope)
    return this.#cars.get(labelpath)
  }
  // --

  // == [Ending]: sweep

  /** Stop watching the wrapped vaultDB, for good: what its watch notifies after reaches no one. A second call does nothing.
   * Its answers still pass through, and their records are still told. What the wrapped vaultDB's stop throws is thrown.
   */
  sweep(): this {
    this.#unwatchWrapped()
    return this
  }
  // --

  // == [Telling]: #tellAnswer, #tellNotice, #banktokOr, #tell, #receiveAtThing, #ensureCar, #tellBadNews

  /** Tell every listener the events of `roots` then `owns`, the records `answer` carries, from the wrapped vaultDB at the answer's `read_tc` and `banktok`.
   * Returns the first refusal a record of `owns` raised, or null.
   */
  #tellAnswer(answer: { banktok: Lifetok, read_tc: ReadTc }, roots: readonly SeenThing[], owns: readonly SeenThing[]): Errors.VaultError | null {
    const { banktok, read_tc } = answer
    if (banktok !== SX.VoidLifeTok) { this.#newestBanktok = banktok }
    const dispatch = { sourcelabel: VaultDBSourcelabel, read_tc, banktok }
    this.#tell(roots, dispatch)
    return this.#tell(owns, dispatch)
  }

  /** Tell every listener the events of the record in `notice`, a notice of the wrapped vaultDB's watch. */
  #tellNotice(notice: VaultEvent): void {
    if (notice.eventkind !== 'item') { return }
    this.#tell([notice.val], { sourcelabel: VaultDBSourcelabel, read_tc: notice.read_tc, banktok: this.#banktokOr(notice.banktok) })
  }

  /** `banktok`, or where it is the void lifetok, that of the newest answer that read the bank */
  #banktokOr(banktok: Lifetok): Lifetok { return (banktok === SX.VoidLifeTok) ? this.#newestBanktok : banktok }

  /** Tell every listener each event the Things return for `seens`, in order, each carrying `dispatch`, and return the first refusal a record raised, or null.
   * A record refused goes to every listener's `onBadNews`, with its labelpath, or null where that is refused too.
   */
  #tell(seens: readonly SeenThing[], dispatch: Dispatch): Errors.VaultError | null {
    let firstRefusal: Errors.VaultError | null = null
    for (const seen of seens) {
      let labelpath: Labelpath | null = null
      let events: readonly VaultEvent[]
      try {
        ({ labelpath } = SeenChecks.seenCited.parseConsistent(seen, this.#scope))
        events = this.#receiveAtThing(labelpath, seen, dispatch)
      } catch (err) {
        const refusal = Throwers.refusalOfThrown(err)
        this.#tellBadNews(refusal, labelpath)
        firstRefusal ??= refusal
        continue
      }
      for (const event of events) {
        for (const { listener } of this.#listenings) {
          // A listener whose hear throws has a bug in the host's code, not trouble in storage.
          try { listener.hear(event) } catch (err) { listener.onBadNews(Throwers.refusalOfThrown(err), null) }
        }
      }
    }
    return firstRefusal
  }

  /** The events the Thing at `labelpath`, `seen`'s, returns for `seen` at `dispatch`, its car kept first where there is none */
  #receiveAtThing(labelpath: Labelpath, seen: SeenThing, dispatch: Dispatch): readonly VaultEvent[] {
    return this.#ensureCar(labelpath, seen).receive(itemEventOf(seen, dispatch))
  }

  // The car is kept before its Thing receives a record, so that a subscriber the Thing tells finds it here, and stays
  // where that record is refused, its Thing holding the shell.
  /** The car at `labelpath`, made and kept where there is none, its Thing holding the shell in the lives `seen` names above it */
  #ensureCar(labelpath: Labelpath, seen: SeenThing): ThingCar<ThingT> {
    const kept = this.#cars.get(labelpath)
    if (kept !== undefined) { return kept }
    const car = ThingCar.make(BaseThing.shellOf(seen), { world: this.#world })
    this.#cars.set(labelpath, car)
    return car
  }

  /** Tell `news`, of the record at `labelpath` or of none, to every listener's `onBadNews`. */
  #tellBadNews(news: Errors.VaultError, labelpath: Labelpath | null): void {
    for (const { listener } of this.#listenings) { listener.onBadNews(news, labelpath) }
  }
  // --
}
// --

// == [Roots]: trackPairOf

/** The revseq and lifepath of `record`: the pair a `track` has. */
function trackPairOf({ revseq, lifepath }: Pick<ThingRecord, 'revseq' | 'lifepath'>): Track['bank'] { return { revseq, lifepath } }
// --

// == [Refused once]: ownRefusedAnswerOf

// A good answer's act names what the datastore did, which no refused answer may carry.
/** `answer` refused with `err`, the refusal the record it carries at the ask's labelpath raised as it was told, that record as its `dbhas` */
function ownRefusedAnswerOf(answer: GetThingAnswer | WriteThingAnswer, err: Errors.VaultError): BadAnswer {
  if (! answer.ok) { return { ...answer, err } }
  const { ask, banktok, tracked, read_tc } = answer
  const dbhas = ((answer.act === 'gotgone') || (answer.act === 'gotvoid')) ? answer.dbhas : answer.val
  return { ok: false, ask, act: 'unclassified_storing', banktok, tracked, read_tc, dbhas, err }
}
// --

// == [Records of an answer]: rootsOf, gotRecordsOf, writtenRecordsOf, listedRecordsOf, bornRecordsOf, worldRootsOf

// Unspecified for a missing or damaged row: notes/wontfix.md.
/** The roots `answer` carries: each root its `tracked` reports other than `'same'`, the bank first and the root box last. */
function rootsOf({ tracked }: { tracked: Tracked | 'unread' }): ThingRecord[] {
  if (tracked === 'unread') { return [] }
  return [tracked.bank, tracked[Labelpath.MainGate], tracked[Labelpath.RootBox]].filter((root) => root !== 'same')
}

/** The record a get's `answer` carries of its own Thing: the live Thing, the tombstone or shell, or a refusal's dbhas, none where the verb threw. */
function gotRecordsOf(answer: GetThingAnswer): SeenThing[] {
  if (! answer.ok) { return (answer.dbhas === null) ? [] : [answer.dbhas] }
  return (answer.act === 'gotlive') ? [answer.val] : [answer.dbhas]
}

/** The record a write's `answer` carries of its own Thing: the Thing written or found, or a refusal's dbhas, the shell where none is stored, none where the verb threw. */
function writtenRecordsOf(answer: WriteThingAnswer): SeenThing[] {
  if (answer.ok) { return [answer.val] }
  return (answer.dbhas === null) ? [] : [answer.dbhas]
}

/** The records a list's `answer` carries of its own: the parent and each child listed, or a refusal's dbhas, none where it names none or the verb threw. */
function listedRecordsOf(answer: ListThingsAnswer): SeenThing[] {
  if (answer.ok) { return [...answer.parentage, ...answer.deltas] }
  return (answer.dbhas === null) ? [] : [answer.dbhas]
}

/** The records a birth's `answer` carries of its own: the three roots, or a refusal's dbhas, none where the verb threw. */
function bornRecordsOf(answer: BirthBankAnswer): SeenThing[] {
  if (answer.ok) { return [answer.val.bank, answer.val.gate, answer.val.root] }
  return (answer.dbhas === null) ? [] : [answer.dbhas]
}

/** The records a get of the world's `answer` carries of its own: the three roots, each the shell where none is stored, or a refusal's dbhas, none where the verb threw. */
function worldRootsOf(answer: GetWorldAnswer): SeenThing[] {
  if (answer.ok) { return [answer.val.bank, answer.val.gate, answer.val.root] }
  return (answer.dbhas === null) ? [] : [answer.dbhas]
}
// --
