/** `VaultMinder`, which answers a vaultDB's verbs over another, and tells one bank's records that are news as an ordered feed. */

import { type Errors, SX } from 'safebyok-big/internals'
import { type Banktok, Labelpath } from '../shapes/primitives'
import {
  type ActualRoots, type AnyAsk, type BirthBankAsk, type CitedOf, type DelAskDraft, type GetAsk, type GetBankAsk, type ListAsk, type PutAskDraft, type StatsAsk, type Track, type Tracked, type WriteAsk,
  delAskOf, getAskOf, listAskOf, putAskOf, rootScopesOf,
} from '../shapes/shapes-asks'
import type { BankAskDraft } from '../shapes/shapes-bankish'
import { type GateRecord, type ThingRecord, type ThingScope, type Thingkind, type VoidSentinel, Shell, ThingChecks } from '../shapes/shapes-thing'
import type { BankScope } from '../shapes/shapes-stamps'
import { type CarBank, type DelOnceArgs, type PutOnceArgs, type ReceivingThing, type VaultMinderListener, type VaultMinderOpts, VaultMinderChecks } from '../shapes/shapes-vault-minder'
import { type ReadTc, type SeenThing, type VaultEvent, SeenChecks, VaultDBSourcelabel } from '../shapes/shapes-vault-event'
import * as Throwers from '../refusals/throwers'
import { BaseThing } from '../models/base-thing'
import { itemEventOf } from '../storage/agerank'
import { refusedAnswerOf } from '../storage/refused-answer'
import { ThingCar } from './thing-car'
import type { BadAnswer, BirthBankAnswer, GetThingAnswer, GetBankAnswer, Kids, ListThingsAnswer, StatsAnswer, WriteThingAnswer } from '../shapes/shapes-answers'
import type { VaultDB } from '../storage/vault-db'

// == [VaultMinder]: Dispatch, Listening, Told, VaultMinder

/** Who dispatched a record, when it was read, and its bank's banktok, the void one where none is known: every event of it carries all three. */
type Dispatch = Readonly<{ sourcelabel: string, read_tc: ReadTc, banktok: Banktok }>

/** One call of `listen`, holding its listener: a listener that listens twice is told twice, and each end stops one. */
type Listening = Readonly<{ listener: VaultMinderListener }>

/** A vaultDB's answer, once its records are told, with the refusal raised by the record it carries at the ask's labelpath, or null. */
type Told<AnswerT> = Readonly<{ answer: AnswerT, refusal: Errors.VaultError | null }>

/** A vaultDB's verbs over another vaultDB, for one bank, telling its listeners each record it learns of that is news, in order.
 * It learns of the records each answer carries, of what the wrapped vaultDB's watch notifies, and of the events a device database rings, handed to its `receive`.
 * It makes a car for each Thing it learns of a record of, by its modelkind and labelpath, for as long as it lives: {@link carAt}. The car's `receive` says what is news,
 * and the car has the Thing, what a write over it cites, how far it has been seen, and the refusal it last raised at a record.
 * It builds the bank's asks, and its once verbs send them, each answering only once its records have been told.
 * It watches the wrapped vaultDB from its `connect` to its `disconnect`. A record it learns of while no one listens still
 * reaches its Thing, but no listener, then or later: listen before asking it anything.
 */
export class VaultMinder<ThingT extends ReceivingThing = ReceivingThing> implements Omit<VaultDB, 'watch'> {
  // == [Props]: VaultDBSourcelabel, #vaultDB, #scope, #bank, #cars, #listenings, #newestBanktok, #unwatchWrapped

  /** The `sourcelabel` of each event of a record from the wrapped vaultDB, from an answer or its watch. */
  static get VaultDBSourcelabel(): typeof VaultDBSourcelabel { return VaultDBSourcelabel }

  /** The wrapped vaultDB. */
  readonly #vaultDB: VaultDB
  /** The scope of the bank this vaultDB serves. */
  readonly #scope: BankScope
  /** The bank that makes each Thing kept. */
  readonly #bank: CarBank<ThingT>
  // Kept per kind, as the datastore keeps a table per kind: a bank labelled `box` has its gate and its root box at one labelpath.
  /** The car of each Thing a record was learned of, by its modelkind, then its labelpath. */
  readonly #cars: Readonly<Record<Thingkind, Map<Labelpath, ThingCar<ThingT>>>> = { gate: new Map(), box: new Map() }
  readonly #listenings = new Set<Listening>()
  /** The `banktok` of the newest answer that read the bank, for a notice or an event rung that carries the void banktok: the void banktok until one has. */
  #newestBanktok: Banktok = SX.VoidLifeTok
  /** The stop of the wrapped vaultDB's watch, or null while it is not watched. */
  #unwatchWrapped: (() => void) | null = null
  // --

  // == [Construction]: make, constructor

  /** Wrap `opts.vaultDB` for the bank at `scope`. Nothing is watched until {@link connect}. */
  static make<ThingT extends ReceivingThing>(scope: BankScope, opts: VaultMinderOpts<ThingT>): VaultMinder<ThingT> { return new VaultMinder(scope, opts) }

  private constructor(scope: BankScope, opts: VaultMinderOpts<ThingT>) {
    const { scope: bankScope, opts: { vaultDB } } = VaultMinderChecks.makeArgs.parse({ scope, opts })
    this.#vaultDB   = vaultDB
    this.#scope     = Object.freeze({ userid: bankScope.userid, banklabel: bankScope.banklabel })
    this.#bank     = opts.bank
    Object.freeze(this)
  }
  // --

  // == [Verbs]: tryGetThing, tryWriteThing, tryListThings, tryBirthBank, tryGetBank, tryStats
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

  /** {@link VaultDB.tryWriteThing}: a write refused where there is no actual row tells the shell its answer carries. */
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
    try { this.#checkOwnAsk(ask) } catch (err) { return { ...refusedAnswerOf(ask, err), parentage: [], deltas: [], incompatible_rows: [] } }
    const answer = await this.#vaultDB.tryListThings(ask)
    this.#tellAnswer(answer, rootsOf(answer), listedRecordsOf(answer))
    return answer
  }

  // The answer's `tracked` is read in the same step as its two roots, so the roots are told only as the answer's own
  // records, never again from `tracked`: a root its Thing refuses is refused once.
  /** {@link VaultDB.tryBirthBank}: the two roots it answers, as its val or a refusal's dbhas, are told in root order. */
  async tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer> {
    try { this.#checkOwnAsk(ask) } catch (err) { return refusedAnswerOf(ask, err) }
    const answer = await this.#vaultDB.tryBirthBank(ask)
    this.#tellAnswer(answer, [], bornRecordsOf(answer))
    return answer
  }

  // The answer's `tracked` is read in the same step as its two roots, so the roots are told only as the answer's own
  // records, never again from `tracked`: a root its Thing refuses is refused once.
  /** {@link VaultDB.tryGetBank}: the two roots it answers are told in root order, the shell where none is stored. */
  async tryGetBank(ask: GetBankAsk): Promise<GetBankAnswer> {
    try { this.#checkOwnAsk(ask) } catch (err) { return refusedAnswerOf(ask, err) }
    const answer = await this.#vaultDB.tryGetBank(ask)
    this.#tellAnswer(answer, [], gotBankRecordsOf(answer))
    return answer
  }

  /** {@link VaultDB.tryStats}: the roots its `tracked` reports are told, and nothing else. */
  async tryStats(ask: StatsAsk): Promise<StatsAnswer> {
    try { this.#checkOwnAsk(ask) } catch (err) { return refusedAnswerOf(ask, err) }
    const answer = await this.#vaultDB.tryStats(ask)
    this.#tellAnswer(answer, rootsOf(answer), [])
    return answer
  }

  /** Refuse an ask of another bank than this vaultDB's */
  #checkOwnAsk(ask: AnyAsk): void { ThingChecks.bankScope.parseConsistent(ask, this.#scope) }
  // --

  // == [Once verbs]: tryGetBankOnce, tryStatsOnce, tryGetOnce, getOnce, tryListOnce, listOnce, tryPutOnce, putOnce, tryDelOnce, delOnce
  // Each sends the wrapped vaultDB one ask of this bank's, and answers once the records the answer carries are told. Each
  // `try` form answers the vaultDB's whole answer, a refusal included, unless the record it carries at the ask's labelpath
  // is refused as it is told: then it answers that refusal. The other form throws the refusal, and `getOnce` refuses too
  // where the Thing is known only sparse in its newest life.

  // A get of the bank has no labelpath of its own: a root refused as it is told reaches each listener's onBadNews alone.
  /** Get this bank's two roots once, in one step. */
  async tryGetBankOnce(): Promise<GetBankAnswer> {
    return await this.tryGetBank({ ...this.#scope, op: 'getbank', ...this.#bankFields() })
  }

  /** Get this bank's storage stats once, in one step. */
  async tryStatsOnce(): Promise<StatsAnswer> {
    return await this.tryStats({ ...this.#scope, op: 'stats', ...this.#bankFields() })
  }

  /** Get the Thing at `scoped`, of this bank, once. */
  async tryGetOnce(scoped: ThingScope): Promise<GetThingAnswer> {
    let ask: GetAsk
    try { ask = this.makeGetAsk({ ...this.#kindAndLabelpathOf(scoped), ifAbsent: 'nil' }) } catch (err) { return refusedAnswerOf(scoped, err) }
    const { answer, refusal } = await this.#doTryGetThing(ask)
    return (refusal === null) ? answer : ownRefusedAnswerOf(answer, refusal)
  }

  /** Get the Thing at `scoped`, of this bank, once, resolving the Thing's record after the get: live, a tombstone or the shell, as the Thing's own frozen object.
   * Refuses `stale_read` where the Thing's newest life is still known only sparse after the get, such as when storage answers an earlier life. Call `thingAt` for the Thing.
   */
  async getOnce(scoped: ThingScope): Promise<ReturnType<ThingT['pickle']>> {
    const answer = await this.tryGetOnce(scoped)
    if (! answer.ok) { throw answer.err }
    // A good answer's own record was told and taken, so a car is kept at its scope.
    const car = this.carAt(scoped)!
    if (car.agekind === 'bare') { throw Throwers.thingSoonestBare(this.#kindAndLabelpathOf(scoped).labelpath) }
    return car.thing.pickle() as ReturnType<ThingT['pickle']>
  }

  /** List the children of the live Thing at `scoped`, of this bank, once. A parent deleted or never stored refuses `absent_thing`. An incompatible child is told to each listener's `onBadNews`. */
  async tryListOnce(scoped: ThingScope): Promise<ListThingsAnswer> {
    let ask: ListAsk
    try { ask = this.makeListAsk(this.#kindAndLabelpathOf(scoped)) } catch (err) { return { ...refusedAnswerOf(scoped, err), parentage: [], deltas: [], incompatible_rows: [] } }
    const answer = await this.tryListThings(ask)
    if (answer.incompatible_rows.length > 0) { this.#tellBadNews(Throwers.childrenIncompatible(ask, answer.incompatible_rows), null) }
    return answer
  }

  /** List the children of the Thing at `scoped` once, resolving their {@link Kids}. */
  async listOnce(scoped: ThingScope): Promise<Kids> {
    const answer = await this.tryListOnce(scoped)
    if (! answer.ok) { throw answer.err }
    return answer.val
  }

  /** Put `args.record` over `args.cited` once. */
  async tryPutOnce<RecordT extends ThingRecord>(args: PutOnceArgs<RecordT>): Promise<WriteThingAnswer> {
    let ask: WriteAsk<RecordT>
    try { ask = this.makePutAsk<RecordT>({ ...args, cited: args.cited ?? this.#citableAt(args.record) }) } catch (err) { return refusedAnswerOf(args, err) }
    const { answer, refusal } = await this.#doTryWriteThing(ask)
    return (refusal === null) ? answer : ownRefusedAnswerOf(answer, refusal)
  }

  /** Put `args.record` over `args.cited` once, resolving the actual record the vaultDB reports. */
  async putOnce<RecordT extends ThingRecord>(args: PutOnceArgs<RecordT>): Promise<RecordT> {
    const answer = await this.tryPutOnce(args)
    if (! answer.ok) { throw answer.err }
    // The ask's modelkind is the record's, which the vaultDB checks what it answers against.
    return answer.val as RecordT
  }

  /** Delete the Thing once, writing the tombstone `args.record` over `args.cited`. */
  async tryDelOnce<RecordT extends ThingRecord>(args: DelOnceArgs<RecordT>): Promise<WriteThingAnswer> {
    let ask: WriteAsk<RecordT>
    try { ask = this.makeDelAsk<RecordT>({ ...args, cited: args.cited ?? this.#citableAt(args.record) }) } catch (err) { return refusedAnswerOf(args, err) }
    const { answer, refusal } = await this.#doTryWriteThing(ask)
    return (refusal === null) ? answer : ownRefusedAnswerOf(answer, refusal)
  }

  /** Delete the Thing once, writing the tombstone `args.record` over `args.cited`, and resolve the actual tombstone the vaultDB reports. */
  async delOnce<RecordT extends ThingRecord>(args: DelOnceArgs<RecordT>): Promise<RecordT> {
    const answer = await this.tryDelOnce(args)
    if (! answer.ok) { throw answer.err }
    // The ask's modelkind is the record's, which the vaultDB checks what it answers against.
    return answer.val as RecordT
  }

  // The act tables read a revseq of -1 and the void revtok as citing nothing stored. The cited lives above it are the
  // record's, as the ask's checks demand, so a record of a life after the first refuses there.
  /** The citable of the car kept for `record`'s Thing, as a write of `record` cites it, or the void revision where none is kept */
  #citableAt<RecordT extends ThingRecord>(record: RecordT): CitedOf<RecordT> {
    return (this.carAt(record)?.citable ?? Shell.citedInParentLivesOf(record)) as CitedOf<RecordT>
  }

  /** The modelkind and labelpath of `scoped`, refusing a scope of another bank */
  #kindAndLabelpathOf(scoped: ThingScope): Pick<ThingScope, 'modelkind' | 'labelpath'> {
    const { modelkind, labelpath } = ThingChecks.thingScope.parseConsistent(scoped, this.#scope)
    return { modelkind, labelpath }
  }
  // --

  // == [Asks]: makeGetAsk, makeListAsk, makePutAsk, makeDelAsk, knownRoots, cachedRoots, #cachedAt, #bankFields
  // Each adds this bank's scope, banktok and track to the draft, `getAskOf` and its siblings add the op and default
  // flags, and the verb checks the ask. A bank whose gate is not yet known to be stored, as at sign-in or before its
  // first birth, has asks with the void banktok, which only a get may carry, and a root not yet known to be stored is
  // tracked at the void revision.

  /** The get ask for the Thing of `draft.modelkind` at `draft.labelpath` in this bank. */
  makeGetAsk(draft: BankAskDraft): GetAsk { return getAskOf({ ...draft, ...this.#scope, ...this.#bankFields() }) }

  /** The list ask for the children of the Thing of `draft.modelkind` at `draft.labelpath` in this bank. */
  makeListAsk(draft: Omit<BankAskDraft, 'ifAbsent'>): ListAsk { return listAskOf({ ...draft, ...this.#scope, ...this.#bankFields() }) }

  /** The put ask for `draft.record` over `draft.cited`, in this bank. */
  makePutAsk<RecordT extends ThingRecord>(draft: Omit<PutAskDraft<RecordT>, 'track' | 'banktok'>): WriteAsk<RecordT> {
    return { ...putAskOf<RecordT>({ ...draft, ...this.#bankFields() }), ...this.#scope }
  }

  /** The del ask for the tombstone `draft.record` over `draft.cited`, in this bank. */
  makeDelAsk<RecordT extends ThingRecord>(draft: Omit<DelAskDraft<RecordT>, 'track' | 'banktok'>): WriteAsk<RecordT> {
    return { ...delAskOf<RecordT>({ ...draft, ...this.#bankFields() }), ...this.#scope }
  }

  // A root known newer only sparse is given at its older whole record, so that the answer sends it whole. A root's
  // shell is at the void revision, as Shell.Cited is.
  /** The roots this bank's asks track: the revision of each of its {@link cachedRoots}. */
  get knownRoots(): Track {
    const { gate, root } = this.cachedRoots
    return { gate: trackPairOf(gate), root: trackPairOf(root) }
  }

  // A Thing's record is always whole: a live box's sparse form is never adopted.
  /** The record of each of this bank's roots' Things, live or a tombstone, or the root's shell where there is no Thing: what a birth writes over. */
  get cachedRoots(): ActualRoots {
    const scopes = rootScopesOf(this.#scope)
    return { gate: this.#cachedAt(scopes.gate) as ActualRoots['gate'], root: this.#cachedAt(scopes.root) as ActualRoots['root'] }
  }

  /** The record of the Thing at `scope`, or the shell there where there is no Thing */
  #cachedAt(scope: ThingScope): ThingRecord | VoidSentinel {
    return this.#cars[scope.modelkind].get(scope.labelpath)?.thing.pickle() ?? Shell.under(scope, null)
  }

  // The record found among the gates is a gate's, live or a tombstone: the vaultDB checked it as one.
  /** The `banktok` and `track` of this bank's asks: the banktok of the bank's gate wherever its Thing has a record, live or a tombstone, else the void banktok, and its {@link knownRoots}. */
  #bankFields(): { banktok: Banktok, track: Track } {
    const gate = this.cachedRoots.gate as Partial<GateRecord>
    return { banktok: gate.banktok ?? SX.VoidLifeTok, track: this.knownRoots }
  }
  // --

  // == [Listening]: listen

  /** Tell `listener` each event of this bank's records that is news, and of trouble, until the function it returns is called.
   * - Each event is a {@link VaultEvent} with its `sourcelabel`, `read_tc` and `banktok`. An answer's events carry the
   *   answer's `banktok`. The events of a notice or of an event rung carry its own `banktok`, or, where that is the void
   *   banktok, the `banktok` of the newest answer that read the bank.
   * - The events of a verb's answer reach every listener, in order, before the verb resolves.
   * - Of the records an answer carries, the gate comes first, then the root box, a list's parent and the
   *   Things it lists, and last the answer's own record.
   * - A record no newer than one seen of its Thing is told to no one, unless it is the newest revision seen, read in a
   *   later span of 65.536 seconds than that revision was last seen in.
   * - What `hear` throws goes to the listener's own `onBadNews`, of no scope; a record refused goes to every listener's, with its scope.
   */
  listen(listener: VaultMinderListener): () => void {
    VaultMinderChecks.listener.parse(listener)
    const listening: Listening = Object.freeze({ listener })
    this.#listenings.add(listening)
    return () => { this.#listenings.delete(listening) }
  }
  // --

  // == [Receiving]: receive

  /** Receive an event a device database rang, and tell every listener, before returning, the events of its `val` that are news, at its `sourcelabel`, `read_tc` and `banktok`.
   * An `item` event's `val` is received as an answer's record is, a void sentinel included, at the lifepath it carries.
   * A `life` or `aged` event tells nothing, and its agerank is never read: the Thing at its labelpath keeps its own.
   * Refuses an event of another bank.
   */
  receive(event: VaultEvent): void {
    const rung = VaultMinderChecks.rungEvent.parseConsistent(event, this.#scope)
    if (event.eventkind !== 'item') { return }
    const { liveness } = VaultMinderChecks.rungItem.parse(event)
    // Only its scope is held to the event's: a record's own banktok is no event's.
    const scope = ThingChecks.thingScope.parse(rung)
    if (liveness === 'void') { VaultMinderChecks.rungVoid.parseConsistent(event.val, scope) } else { VaultMinderChecks.rungThing.parseConsistent(event.val, scope) }
    this.#tell([event.val], { sourcelabel: rung.sourcelabel, read_tc: rung.read_tc, banktok: this.#banktokOr(rung.banktok) })
  }
  // --

  // == [Reading]: thingAt, carAt, ensureRootCars

  /** The Thing at `scoped`, in this vaultDB's bank, or undefined where no record of it has been learned of. The same object across records and lives. */
  thingAt(scoped: ThingScope): ThingT | undefined { return this.carAt(scoped)?.thing }

  /** The car of the Thing at `scoped`: what a write over it cites, how far it has been seen, and the refusal it last raised at a record; or undefined where {@link thingAt} is.
   * Its `lastErr` is for a devtool, never for an app's own logic.
   */
  carAt(scoped: ThingScope): ThingCar<ThingT> | undefined {
    const { modelkind, labelpath } = this.#kindAndLabelpathOf(scoped)
    return this.#cars[modelkind].get(labelpath)
  }

  /** The cars of this bank's gate and root box. A root no record has been received of gets its car here, its Thing modelling the shell. */
  ensureRootCars(): Readonly<{ gate: ThingCar<ThingT>, root: ThingCar<ThingT> }> {
    const scopes = rootScopesOf(this.#scope)
    return { gate: this.#ensureCar(Shell.under(scopes.gate, null)), root: this.#ensureCar(Shell.under(scopes.root, null)) }
  }
  // --

  // == [Watching]: isWatching, connect, disconnect

  /** True from {@link connect} until {@link disconnect}, or until the wrapped vaultDB's watch ends of itself: what that watch notifies is told meanwhile. */
  get isWatching(): boolean { return this.#unwatchWrapped !== null }

  /** Start watching the wrapped vaultDB for this bank's records. A second call does nothing while watching, and its `onEnded` is never called.
   * What the wrapped vaultDB's `watch` throws is thrown, and nothing is watched. Where that watch ends of itself, nothing is watched until the next call,
   * and `onEnded` is called once, with {@link isWatching} already false.
   */
  connect(onEnded?: () => void): this {
    VaultMinderChecks.connectArgs.parse({ onEnded })
    this.#unwatchWrapped ??= this.#vaultDB.watch(
      this.#scope,
      (notice) => { this.#tellNotice(notice) },
      (news) => { this.#tellBadNews(news, null) },
      () => {
        this.#unwatchWrapped = null
        onEnded?.()
      },
    )
    return this
  }

  /** Stop watching the wrapped vaultDB: what its watch notifies after reaches no one, until the next {@link connect}. A second call does nothing.
   * Its answers still pass through, and their records are still told. What the wrapped vaultDB's stop throws is thrown.
   */
  disconnect(): this {
    const unwatch = this.#unwatchWrapped
    this.#unwatchWrapped = null
    unwatch?.()
    return this
  }
  // --

  // == [Telling]: #tellAnswer, #tellNotice, #banktokOr, #tell, #receiveAtThing, #ensureCar, #tellBadNews

  /** Tell every listener the events of `roots` then `owns`, the records `answer` carries, from the wrapped vaultDB at the answer's `read_tc` and `banktok`.
   * Returns the first refusal a record of `owns` raised, or null.
   */
  #tellAnswer(answer: { banktok: Banktok, read_tc: ReadTc }, roots: readonly SeenThing[], owns: readonly SeenThing[]): Errors.VaultError | null {
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

  /** `banktok`, or where it is the void banktok, that of the newest answer that read the bank */
  #banktokOr(banktok: Banktok): Banktok { return (banktok === SX.VoidLifeTok) ? this.#newestBanktok : banktok }

  /** Tell every listener each event the Things return for `seens`, in order, each carrying `dispatch`, and return the first refusal a record raised, or null.
   * A record refused goes to every listener's `onBadNews`, with its scope, or null where that is refused too.
   */
  #tell(seens: readonly SeenThing[], dispatch: Dispatch): Errors.VaultError | null {
    let firstRefusal: Errors.VaultError | null = null
    for (const seen of seens) {
      let scope: ThingScope | null = null
      let events: readonly VaultEvent[]
      try {
        const { modelkind, userid, banklabel, labelpath } = SeenChecks.seenCited.parseConsistent(seen, this.#scope)
        scope  = { modelkind, userid, banklabel, labelpath }
        events = this.#receiveAtThing(seen, dispatch)
      } catch (err) {
        const refusal = Throwers.refusalOfThrown(err)
        this.#tellBadNews(refusal, scope)
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

  /** The events `seen`'s Thing returns for `seen` at `dispatch`, its car kept first where there is none */
  #receiveAtThing(seen: SeenThing, dispatch: Dispatch): readonly VaultEvent[] {
    return this.#ensureCar(seen).receive(itemEventOf(seen, dispatch))
  }

  // The car is kept before its Thing receives a record, so that a subscriber the Thing tells finds it here, and stays
  // where that record is refused, its Thing holding the shell.
  /** The car of `seen`'s Thing, made and kept where there is none, its Thing holding the shell in the lives `seen` names above it */
  #ensureCar(seen: SeenThing): ThingCar<ThingT> {
    const cars = this.#cars[seen.modelkind]
    const existing = cars.get(seen.labelpath)
    if (existing !== undefined) { return existing }
    const car = ThingCar.make(BaseThing.shellOf(seen), { bank: this.#bank })
    cars.set(seen.labelpath, car)
    return car
  }

  /** Tell `news`, of the record at `scope` or of none, to every listener's `onBadNews`. */
  #tellBadNews(news: Errors.VaultError, scope: ThingScope | null): void {
    for (const { listener } of this.#listenings) { listener.onBadNews(news, scope) }
  }
  // --
}
// --

// == [Roots]: trackPairOf

/** The revseq and lifepath of `record`: the pair a `track` has. */
function trackPairOf({ revseq, lifepath }: Pick<ThingRecord, 'revseq' | 'lifepath'>): Track['gate'] { return { revseq, lifepath } }
// --

// == [Refused once]: ownRefusedAnswerOf

// A good answer's act names what the datastore did, which no refused answer may carry.
/** `answer` as a refused answer: its error is `err`, the refusal its own record raised as it was told, and its `dbhas` is that record */
function ownRefusedAnswerOf(answer: GetThingAnswer | WriteThingAnswer, err: Errors.VaultError): BadAnswer {
  if (! answer.ok) { return { ...answer, err } }
  const { ask, banktok, tracked, read_tc } = answer
  const dbhas = ((answer.act === 'gotgone') || (answer.act === 'gotvoid')) ? answer.dbhas : answer.val
  return { ok: false, ask, act: 'unclassified_storing', banktok, tracked, read_tc, dbhas, err }
}
// --

// == [Records of an answer]: rootsOf, gotRecordsOf, writtenRecordsOf, listedRecordsOf, bornRecordsOf, gotBankRecordsOf

// Unspecified for a missing or incompatible row: notes/wontfix.md.
/** The roots `answer` carries: each root its `tracked` reports other than `'same'`, the gate first and the root box last. */
function rootsOf({ tracked }: { tracked: Tracked | 'unread' }): ThingRecord[] {
  if (tracked === 'unread') { return [] }
  return [tracked.gate, tracked.root].filter((root) => root !== 'same')
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

/** The records a birth's `answer` carries of its own: the two roots, as its val or a refusal's dbhas, each the shell where none is stored, none where the verb threw. */
function bornRecordsOf(answer: BirthBankAnswer): SeenThing[] {
  const roots = answer.ok ? answer.val : answer.dbhas
  return (roots === null) ? [] : [roots.gate, roots.root]
}

/** The records a get of the bank's `answer` carries of its own: the two roots, each the shell where none is stored, or a refusal's dbhas, none where the verb threw. */
function gotBankRecordsOf(answer: GetBankAnswer): SeenThing[] {
  if (answer.ok) { return [answer.val.gate, answer.val.root] }
  return (answer.dbhas === null) ? [] : [answer.dbhas]
}
// --
