/** The base of a box listing and a vault listing: the live instances of one kind of thing, the watch on storage, and every storage call made for that kind of thing. */

import { randomId } from '../crypto'
import { VaultError } from '../errors'
import { alreadyHeldError } from '../helpers/throwers'
import * as Phrases from '../phrases'
import { type Outcome, outcomeOf } from '../outcome'
import { reportToPlatform } from '../report-error'
import type { Clock } from '../shapes/bank-opts'
import { type Answer, type Fetched, type FetchOpts, type IfAbsent, type ListingOpts, type ListingWorld, type LockState, type Notice, type Revision, type SparseBase, type Store, type TimelyOpts, type Times, type Tombstone, IsListing, NeverStoredSeq } from './models-shapes'
import * as MSX from './models-shapes'
import type { Storable } from './storable'

type Thing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>> = Storable<ScopeT, RecordT, SparseT, unknown>
// --

// == [Listing]

/** The live instances of one kind of thing, by scope, each made once and held, as its tombstone once gone.
 * `hello` starts the watch and hydrates everything held. Every answer storage gives, to `fetch`,
 * `put`, `del` or the watch, goes through `#deliver`, and every instance is made and held through
 * `#buildOrReceive`, so no scope is built twice; the listing then makes its snapshot again. A call
 * is refused when it cannot give what it asked for: a refusal from storage, or a record its
 * instance's `receive` refuses. Bad news nobody asked about, a refusal met on a notice, is told to
 * `onBadNews`.
 */
export abstract class Listing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, SnapshotT, ThingT extends Storable<ScopeT, RecordT, SparseT, SnapshotT>> {
  readonly world: ListingWorld
  /** The refresh horizon of each thing made here. */
  protected readonly maxMillisSinceRefresh: number

  readonly #store: Store<ScopeT, RecordT, SparseT>
  readonly #things    = new Map<string, ThingT>()
  readonly #listeners = new Set<() => void>()
  readonly #onBadNews: ((news: VaultError) => unknown) | null
  /** The news already told, so one refusal that several callers share, a timer's launch and a `hydrateAll` joined to it, is told once. */
  readonly #told = new WeakSet<VaultError>()
  #snapshot: readonly SnapshotT[] = Object.freeze([])
  #unwatch:  (() => void) | null = null

  constructor(opts: ListingOpts<ScopeT, RecordT, SparseT>) {
    MSX.listingOpts.parse(opts)
    this.world = opts.world
    this.#store = opts.store
    this.maxMillisSinceRefresh = opts.maxMillisSinceRefresh
    this.#onBadNews = opts.onBadNews ?? null
  }

  get clock(): Clock { return this.world.clock }

  /** The tag a storable's constructor checks for. */
  readonly [IsListing] = true as const

  lockState(): LockState { return this.world.lockState() }

  ensureTimelyWorld(opts: TimelyOpts): Promise<void> { return this.world.ensureTimely(MSX.timelyOpts.parse(opts)) }

  // == [Starting and ending]: hello, goodbye

  /** Start the watch, and hydrate every instance held. */
  async hello(): Promise<void> {
    this.#unwatch ??= this.#store.watch(this.#onNotice, () => this.watchableThings.map((thing) => thing.scope))
    await this.hydrateAll()
  }

  /** End the watch. The instances stay as they are. */
  goodbye(): void {
    this.#unwatch?.()
    this.#unwatch = null
  }
  // --

  // == [Listing verbs]: at, things, watchableThings, build, hydrateAll, demandNotHeld

  /** The instance held under `scope`, or null. Calls nothing. A scope that fails {@link scopeOf} refuses as it does. */
  at(scope: ScopeT): ThingT | null {
    return this.#things.get(this.scopepathOf(this.scopeOf(scope))) ?? null
  }

  get things(): readonly ThingT[] { return [...this.#things.values()] }

  /** The instances the watch should push full records for. */
  get watchableThings(): readonly ThingT[] { return this.things.filter((thing) => thing.isWatchable) }

  /** The instance of `record`, sparse, full or a tombstone, once it is delivered as a fetch's answer would be, and held; a thing already held under its scope receives it, and a refusal its `receive` throws is thrown. Stores nothing. */
  async build(record: Fetched<RecordT, SparseT>): Promise<ThingT> {
    this.sparseOf(record)
    return this.#buildOrReceive(this.scopeOf(record), record)
  }

  /** Hydrate every instance held. A hydrate that is refused is told as bad news, and the others go on; `opts` that fail {@link MSX.timelyOpts} refuse 'bad_option' first, hydrating none. */
  async hydrateAll(opts: TimelyOpts = {}): Promise<void> {
    const timely = MSX.timelyOpts.parse(opts)
    const outcomes = await Promise.all(this.things.map((thing) => thing.tryHydrate(timely)))
    for (const { ok, err } of outcomes) { if (! ok) { this.tellBadNews([err]) } }
  }

  /** Refuses 'bad_option' a birth under a `scope` already held: `send` the instance held, which brings a box deleted or damaged back to life. */
  protected demandNotHeld(scope: ScopeT): void {
    if (this.at(scope) !== null) { throw alreadyHeldError() }
  }
  // --

  // == [Storage verbs]: fetch, put, putDraft, del

  /** The instance under `scope` as storage now holds it, built where none was held, once storage's answer is delivered to it.
   * Where storage holds nothing under `scope`, or a tombstone, deleted or damaged, the instance held, if any, has received it
   * and settled, and then `opts.ifAbsent` says: 'fail', the default, throws {@link absentRefusal}; 'nil' resolves null.
   */
  async fetch(scope: ScopeT, opts: FetchOpts = {}): Promise<ThingT | null> {
    const { ifAbsent = 'fail', ...timely } = MSX.fetchOpts.parse(opts)
    const asked = this.scopeOf(scope)
    await this.ensureTimelyWorld(timely)
    const answer = await this.#store.get(asked)
    return this.#deliver(answer, asked, ifAbsent)
  }

  tryFetch(scope: ScopeT, opts: FetchOpts = {}): Promise<Outcome<ThingT | null>> { return outcomeOf(() => this.fetch(scope, opts)) }

  /** Put `duck`, a record or a thing ducking as its record, over `ante`'s revision, not whatever is held by then, and deliver the answer: `ante` is the record it was made from, null or one never stored for no record. A 'stale_write' refusal delivers the record storage holds before it is thrown.
   * A record whose `revision_seq` does not fit that revision refuses 'bad_record' before anything is sent: revision 0 goes over no record, and a later revision over one.
   */
  async put(duck: RecordT | Thing<ScopeT, RecordT, SparseT>, ante: Revision | null): Promise<ThingT | null> {
    const record = this.recordOf(duck)
    const scope = this.scopeOf(record)
    const priorRevisionTok = (ante === null || ante.revision_seq === NeverStoredSeq) ? null : ante.revision_tok
    if (! fitsPriorRevisionTok(record.revision_seq, priorRevisionTok)) { throw new VaultError('bad_record', Phrases.PutUnfitForPrior) }
    const answer = await this.#store.put(record, priorRevisionTok)
    return this.#deliver(answer, scope)
  }

  tryPut(duck: RecordT | Thing<ScopeT, RecordT, SparseT>, ante: Revision | null): Promise<Outcome<ThingT | null>> { return outcomeOf(() => this.put(duck, ante)) }

  /** Put `draft`, a birth, over no record: the instance it makes is held once it lands, and a refused put holds only what its answer delivered. */
  protected async putDraft(draft: RecordT): Promise<ThingT> {
    const thing = await this.put(draft, null)
    if (thing === null) { throw this.absentRefusal(this.scopeOf(draft)) }
    return thing
  }

  /** Delete the thing `duck` names, a sparse record or a thing, over the `revision_tok` its instance holds, and deliver the answer, a tombstone. A 'stale_write' refusal delivers as `put` does. */
  async del(duck: SparseT | Thing<ScopeT, RecordT, SparseT>): Promise<ThingT | null> {
    const scope = this.scopeOf(duck)
    const answer = await this.#store.del(scope, this.priorRevisionTokOf(scope))
    return this.#deliver(answer, scope)
  }

  tryDel(duck: SparseT | Thing<ScopeT, RecordT, SparseT>): Promise<Outcome<ThingT | null>> { return outcomeOf(() => this.del(duck)) }

  /** The `revision_tok` storage should hold under `scope` when a record is put or deleted: the instance held there names it; null where none is held. */
  priorRevisionTokOf(scope: ScopeT): string | null {
    return this.at(scope)?.priorRevisionTok() ?? null
  }
  // --

  // == [Delivering an answer]: deliver, buildOrReceive, makeThingOf, hold, neverStoredOf

  /** The pipeline every answer takes. Check it, and that it is for `asked`, the scope the call was about, refusing 'bad_record' an answer for another; take the world; hand the record, or none stored, to `#buildOrReceive` under the scope the answer names; a refusal answer is thrown, after the record a 'stale_write' carries is delivered.
   * The answer's own refusals are thrown: its world's, its `err` (a 'stale_write' as it came), or the absent refusal. A refusal `receive` throws is thrown too, as the instance cannot become what storage holds; but where the answer is itself a refusal, that one is thrown, and the carried record's is told to `onBadNews`.
   * Only a fetch judges, by passing its `ifAbsent`: an answer of nothing stored, or of a tombstone, is then absent, once delivered, and throws {@link absentRefusal} under 'fail' and resolves null under 'nil'. A `put`, a `del` and a notice pass none, and have the instance back, a tombstone or not.
   */
  async #deliver(answer: Answer<ScopeT, RecordT, SparseT>, asked: ScopeT, ifAbsent?: IfAbsent): Promise<ThingT | null> {
    MSX.answer.parse(answer)
    if (this.scopepathOf(answer.scope) !== this.scopepathOf(asked)) { throw new VaultError('bad_record', Phrases.AnswerOfOtherScope) }
    this.world.takeWorld(answer.world)
    if (answer.ok) {
      const thing = this.#buildOrReceive(answer.scope, answer.val)
      const isAbsent = answer.val === null || MSX.isTombstone(answer.val)
      if (ifAbsent === 'fail' && isAbsent) { throw this.absentRefusal(answer.scope) }
      return (ifAbsent === 'nil' && isAbsent) ? null : thing
    }
    const stored = this.storedInStaleRefusal(answer.err)
    if (stored !== null) {
      const delivered = await outcomeOf(() => this.#buildOrReceive(answer.scope, stored))
      if (! delivered.ok) { this.tellBadNews([delivered.err]) }
    }
    throw answer.err
  }

  // The one place an instance is made and held: `#makeThingOf` is called from here alone, and only where no instance is held.
  /** The instance under `scope` once `record` meets it, null for nothing stored: the instance held, or, where none is, one born of `record` and held once it has taken it. A refusal `receive` throws is thrown, nothing held. The listing then makes its snapshot again. Null for nothing stored and nothing held. */
  #buildOrReceive(scope: ScopeT, record: Fetched<RecordT, SparseT>): ThingT
  #buildOrReceive(scope: ScopeT, record: Fetched<RecordT, SparseT> | null): ThingT | null
  #buildOrReceive(scope: ScopeT, record: Fetched<RecordT, SparseT> | null): ThingT | null {
    const held = this.at(scope)
    if (record !== null) { this.#demandRecordOfScope(record, scope) }
    const thing = held ?? this.#makeThingOf(record)
    if (thing === null) { return null }
    this.tellBadNews(thing.receive(record).badnews)
    if (thing !== held) { this.#hold(thing) }
    this.#remakeSnapshot()
    return thing
  }

  /** Refuse 'bad_record' a `record` whose scope is not `scope`, the one the answer that carries it names. */
  #demandRecordOfScope(record: Fetched<RecordT, SparseT>, scope: ScopeT): void {
    if (this.scopepathOf(this.scopeOf(record)) !== this.scopepathOf(scope)) { throw new VaultError('bad_record', Phrases.RecordOfOtherScope) }
  }

  /** A new instance for `record`, born over a central never stored, of the record's sparse form, so that `receive` adopts the record as it would any newer one; null for nothing stored. Refuses 'unexpected_error' a record under another `vault_tok` than the vault this listing lies in. */
  #makeThingOf(record: Fetched<RecordT, SparseT> | null): ThingT | null {
    if (record === null) { return null }
    const sparse = this.sparseOf(record)
    const vault_tok = this.vaultTokOfWorld()
    if (vault_tok !== null && sparse.vault_tok !== vault_tok) { throw new VaultError('unexpected_error', Phrases.OtherVaultTokAtBirth) }
    return this.makeThing(this.#neverStoredOf(sparse))
  }

  /** Hold `thing`, born here, under its scope, and make the listing's snapshot again on each change of the thing's. */
  #hold(thing: ThingT): void {
    this.#things.set(this.scopepathOf(thing.scope), thing)
    thing.becomeNotifiable()
    thing.subscribe(() => { this.#remakeSnapshot() })
  }

  /** A central never stored: a tombstone at `NeverStoredSeq` under a new tok, of `sparse`'s props. */
  #neverStoredOf(sparse: SparseT): Tombstone<SparseT> {
    return { ...sparse, revision_tok: randomId(), revision_seq: NeverStoredSeq, am: 'x' }
  }
  // --

  // == [The watch]: onNotice

  /** Deliver a notice as a good answer. Any refusal met on the way, a malformed notice's, the world's or one `receive` throws, is bad news, as nobody asked: told to `onBadNews`, never thrown into the store's watch. */
  readonly #onNotice = async (notice: Notice<RecordT, SparseT>): Promise<void> => {
    const { ok, err } = await outcomeOf(async () => {
      MSX.notice.parse(notice)
      const { record, world } = notice
      const scope = this.scopeOf(record)
      await this.#deliver({ scope, ok: true, val: record, world }, scope)
    })
    if (! ok) { this.tellBadNews([err]) }
  }
  // --

  // == [Snapshot and subscription]: snapshot, getSnapshot, subscribe, remakeSnapshot

  /** The snapshot of every present instance, as the instance itself gives it: frozen, the same array until one of them changes. */
  get snapshot(): readonly SnapshotT[] { return this.#snapshot }

  get getSnapshot(): () => readonly SnapshotT[] { return this.#getSnapshot }
  readonly #getSnapshot = (): readonly SnapshotT[] => this.#snapshot

  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(MSX.listener.parse(listener))
    return () => { this.#listeners.delete(listener) }
  }

  /** Make the listing's snapshot again, of the present instances' own; when one differs, replace it and call every listener. */
  #remakeSnapshot(): void {
    const next = this.things.filter((thing) => thing.isPresent).map((thing) => thing.getSnapshot())
    const isSame = next.length === this.#snapshot.length && next.every((snapshot, idx) => snapshot === this.#snapshot[idx])
    if (isSame) { return }
    this.#snapshot = Object.freeze(next)
    for (const listener of this.#listeners) { listener() }
  }
  // --

  // == [Bad news]: tellBadNews

  /** Tell each item of `badnews` to the host's `onBadNews`, where one was given, never awaited. A handler that throws, or whose promise rejects, is reported to the platform (`reportToPlatform`) and no more: the call that met the news goes on as it would have, and nothing is thrown into a timer's callback or the store's watch. Each item is told once, however many callers meet it. Call it for bad news no caller waits on, such as a refusal of a refresh a timer launched. */
  tellBadNews(badnews: readonly VaultError[]): void {
    const onBadNews = this.#onBadNews
    if (onBadNews === null) { return }
    for (const news of badnews) {
      if (this.#told.has(news)) { continue }
      this.#told.add(news)
      // Any answer is heard out, a thenable among them: none is awaited.
      void (async () => {
        try {
          await onBadNews(news)
        } catch (err) {
          reportToPlatform(err)
        }
      })()
    }
  }
  // --

  // == [Helpers]: stampDna

  /** `dna` under revision 0, the first a thing earns, and the times of now. */
  protected stampDna<DnaT extends object>(dna: DnaT): DnaT & Revision & Times {
    const now = this.clock.now()
    return { ...dna, revision_tok: randomId(), revision_seq: 0, registered_at: now, written_at: now }
  }
  // --

  // == [Defined by the concrete listing]: vaultTokOfWorld, scopepathOf, scopeOf, sparseOf, recordOf, makeThing, absentRefusal, storedInStaleRefusal

  /** The `vault_tok` every record of this listing lies under, being the vault's own; null for a listing whose records make their own, as a vault's do. */
  protected abstract vaultTokOfWorld(): string | null
  protected abstract scopepathOf(scope: ScopeT): string
  /** The scope of `duck`, a record in any form or a thing ducking as one; refuses anything else. */
  abstract scopeOf(duck: unknown): ScopeT
  /** The sparse form of `duck`, a record in any form or a thing ducking as one, as a plain copy with the payload left out; refuses anything else. */
  abstract sparseOf(duck: unknown): SparseT
  /** The full record `duck` is, as a plain copy; refuses a duck that is not full. */
  abstract recordOf(duck: unknown): RecordT
  /** Construct the instance. */
  protected abstract makeThing(central: Fetched<RecordT, SparseT>): ThingT
  abstract absentRefusal(scope: ScopeT): VaultError
  /** The record a 'stale_write' refusal carries, what storage holds; null for none, or for a record that fails its check. */
  protected abstract storedInStaleRefusal(err: VaultError): Fetched<RecordT, SparseT> | null
  // --
}
// --

// == [Helpers]: fitsPriorRevisionTok

/** True where a record at `revision_seq` may be put over `priorRevisionTok`: revision 0 over none, a later revision over a tok. */
const fitsPriorRevisionTok = (revision_seq: number, priorRevisionTok: string | null): boolean => (priorRevisionTok === null ? revision_seq === 0 : revision_seq > 0)
// --
