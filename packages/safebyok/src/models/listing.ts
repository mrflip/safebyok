/** The base of a box listing and a vault listing: the live instances of one kind of thing, the device cache they are warmed from, the watch on storage, and every storage call made for that kind of thing. */

import { randomId } from '../crypto'
import type { VaultError } from '../errors'
import { type Outcome, outcomeOf, refusalOf } from '../outcome'
import type { Clock } from '../shapes/bank-opts'
import { type Answer, type Cache, type Dna, type Fetched, type FetchOpts, type IfAbsent, type ListingOpts, type ListingWorld, type LockState, type Notice, type Revision, type SparseBase, type Store, type TimelyOpts, type Times, type Tombstone, IsListing, NeverStoredSeq } from './models-shapes'
import * as MSX from './models-shapes'
import type { Storable } from './storable'

type Thing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>> = Storable<ScopeT, RecordT, SparseT, unknown, unknown>
// --

// == [Listing]

/** The live instances of one kind of thing, by scope, each made once and kept, as its tombstone once gone.
 * `hello` warms it from the device cache, starts the watch and hydrates everything; after that
 * the cache is only saved to. Every answer storage gives, to `fetch`, `put`, `del` or the watch,
 * goes through `#deliver`: the world is taken first, a refusal thrown after what it says is
 * delivered, and the record handed to its instance's `receive`, or to a new instance's, through
 * `#buildOrReceive`; the bad news is told, and the listing settles, which saves the instance to
 * the cache and makes the snapshot again. A fetch then judges the answer against its `ifAbsent`.
 */
export abstract class Listing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, SnapshotT, ThingT extends Storable<ScopeT, RecordT, SparseT, unknown, SnapshotT>> {
  readonly world: ListingWorld
  /** The refresh horizon of each thing made here. */
  protected readonly maxMillisSinceRefresh: number

  readonly #store: Store<ScopeT, RecordT, SparseT>
  readonly #cache: Cache<RecordT, SparseT>
  readonly #things    = new Map<string, ThingT>()
  readonly #unsubscribes = new Map<string, () => void>()
  readonly #listeners = new Set<() => void>()
  readonly #onBadNews: ((news: VaultError) => void) | null
  #snapshot: readonly SnapshotT[] = Object.freeze([])
  #unwatch:  (() => void) | null = null

  constructor(opts: ListingOpts<ScopeT, RecordT, SparseT>) {
    MSX.listingOpts.parse(opts)
    this.world = opts.world
    this.#store = opts.store
    this.#cache = opts.cache
    this.maxMillisSinceRefresh = opts.maxMillisSinceRefresh
    this.#onBadNews = opts.onBadNews ?? null
  }

  get clock(): Clock { return this.world.clock }

  /** The tag a storable's constructor checks for. */
  readonly [IsListing] = true as const

  lockState(): LockState { return this.world.lockState() }

  ensureTimelyWorld(opts: TimelyOpts): Promise<void> { return this.world.ensureTimely(MSX.timelyOpts.parse(opts)) }

  // == [Starting and ending]: hello, goodbye

  /** Load the device cache once and revive an instance from each copy whose scope is not already held, saving nothing back (an instance held is fresher than its cached copy); start the watch; hydrate every instance. */
  async hello(): Promise<void> {
    const cached = await this.#cache.load()
    for (const copy of cached) {
      if (this.at(this.scopeOf(copy.central)) === null) { this.#hold(this.makeThing(copy.central, copy.staged)) }
    }
    await this.settle()
    this.#unwatch ??= this.#store.watch(this.#onNotice, () => this.watchableThings.map((thing) => thing.scope))
    await this.hydrateAll()
  }

  /** End the watch. The instances stay as they are. */
  goodbye(): void {
    this.#unwatch?.()
    this.#unwatch = null
  }
  // --

  // == [Listing verbs]: at, things, watchableThings, build, hydrateAll

  /** The instance held under `scope`, or null. Calls nothing. */
  at(scope: ScopeT): ThingT | null {
    return this.#things.get(this.scopepathOf(scope)) ?? null
  }

  get things(): readonly ThingT[] { return [...this.#things.values()] }

  /** The instances the watch should push full records for. */
  get watchableThings(): readonly ThingT[] { return this.things.filter((thing) => thing.isWatchable) }

  /** Build the instance of `input`, hold it, and resolve it. Stores nothing.
   * A record, sparse, full or a tombstone, is delivered as a fetch's answer would be: `build(record)` is
   * `thing.receive(record)` for a thing not yet held, so a thing already held under its scope receives it.
   * A dna, its defaults filled, is staged at revision 0 over a central never stored. Either way the instance is saved to the device cache.
   * Build returns the instance and no news: the refusals of its delivery and of the cache's save are told to `onBadNews`.
   */
  async build(input: Dna<ScopeT, RecordT> | Fetched<RecordT, SparseT>): Promise<ThingT> {
    if (hasRevision(input)) { return this.#receiveInto(this.at(this.scopeOf(input)) ?? this.#makeThingFor(input), input) }
    const draft = this.draftOf(this.stampDna(input))
    const thing = this.#hold(this.makeThing(this.#neverStoredOf(draft), draft))
    await this.settle(thing)
    return thing
  }

  /** Hydrate every instance held. A hydrate that is refused is told as bad news, and the others go on. */
  async hydrateAll(opts: TimelyOpts = {}): Promise<void> {
    const outcomes = await Promise.all(this.things.map((thing) => thing.tryHydrate(opts)))
    for (const { ok, err } of outcomes) { if (! ok) { this.tellBadNews([err]) } }
  }
  // --

  // == [Storage verbs]: fetch, put, del

  /** The instance under `scope` as storage now holds it, built where none was held, once storage's answer is delivered to it.
   * Where storage holds nothing under `scope`, or a tombstone, deleted or damaged, the instance held, if any, has received it
   * and settled, and then `opts.ifAbsent` says: 'fail', the default, throws {@link absentRefusal}; 'nil' resolves null.
   */
  async fetch(scope: ScopeT, opts: FetchOpts = {}): Promise<ThingT | null> {
    const { ifAbsent = 'fail', ...timely } = MSX.fetchOpts.parse(opts)
    const asked = this.scopeOf(scope)
    await this.ensureTimelyWorld(timely)
    const answer = await this.#store.get(asked)
    return this.#deliver(answer, ifAbsent)
  }

  tryFetch(scope: ScopeT, opts: FetchOpts = {}): Promise<Outcome<ThingT | null>> { return outcomeOf(() => this.fetch(scope, opts)) }

  /** Put `duck`, a record or a thing ducking as its record, over the revision its instance expects (none, for a thing never stored or not held), and deliver the answer. A 'stale_write' refusal delivers the record storage holds before it is thrown. */
  async put(duck: RecordT | Thing<ScopeT, RecordT, SparseT>): Promise<ThingT | null> {
    const record = this.recordOf(duck)
    const expectedRevision = this.expectedRevisionOf(this.scopeOf(record))
    const answer = await this.#store.put(record, expectedRevision)
    return this.#deliver(answer)
  }

  tryPut(duck: RecordT | Thing<ScopeT, RecordT, SparseT>): Promise<Outcome<ThingT | null>> { return outcomeOf(() => this.put(duck)) }

  /** Delete the thing `duck` names, a sparse record or a thing, at the revision its instance expects, and deliver the answer, a tombstone. A 'stale_write' refusal delivers as `put` does. */
  async del(duck: SparseT | Thing<ScopeT, RecordT, SparseT>): Promise<ThingT | null> {
    const scope = this.scopeOf(duck)
    const expectedRevision = this.expectedRevisionOf(scope)
    const answer = await this.#store.del(scope, expectedRevision)
    return this.#deliver(answer)
  }

  tryDel(duck: SparseT | Thing<ScopeT, RecordT, SparseT>): Promise<Outcome<ThingT | null>> { return outcomeOf(() => this.del(duck)) }

  /** The revision storage should hold under `scope` when a record is put or deleted: what the instance held there expects; null where none is held. */
  expectedRevisionOf(scope: ScopeT): Revision | null {
    return this.at(scope)?.expectedRevision() ?? null
  }
  // --

  // == [Delivering an answer]: deliver, buildOrReceive, receiveInto, makeThingFor, hold, neverStoredOf

  /** The pipeline every answer takes. Check it; take the world; a refusal is thrown, after the record a 'stale_write' carries is delivered; a record, or none stored, goes to `#buildOrReceive` under the scope the answer names.
   * What reaches the caller who asked, a `fetch`, a `put` or a `del`, is the answer's own: its world's refusal, its `err` (a 'stale_write' as it came), or the absent refusal. A refusal met in delivering the record, by `receive` or by the cache's save, goes to `onBadNews` and not to the caller, who has the instance back as it stands.
   * Only a fetch judges, by passing its `ifAbsent`: an answer of nothing stored, or of a tombstone, is then absent, once delivered, and throws {@link absentRefusal} under 'fail' and resolves null under 'nil'. A `put`, a `del` and a notice pass none, and have the instance back, a tombstone or not.
   */
  async #deliver(answer: Answer<ScopeT, RecordT, SparseT>, ifAbsent?: IfAbsent): Promise<ThingT | null> {
    MSX.answer.parse(answer)
    this.world.takeWorld(answer.world)
    if (answer.ok) {
      const thing = await this.#buildOrReceive(answer.scope, answer.val)
      const isAbsent = answer.val === null || MSX.isTombstone(answer.val)
      if (ifAbsent === 'fail' && isAbsent) { throw this.absentRefusal(answer.scope) }
      return (ifAbsent === 'nil' && isAbsent) ? null : thing
    }
    const stored = this.storedInStaleRefusal(answer.err)
    if (stored !== null) { await this.#buildOrReceive(answer.scope, stored) }
    throw answer.err
  }

  /** Hand `record` to the instance under `scope`, born first where none is held and there is a record to bear. Null for nothing stored and nothing held. */
  #buildOrReceive(scope: ScopeT, record: Fetched<RecordT, SparseT> | null): Promise<ThingT | null> {
    const thing = this.at(scope) ?? (record === null ? null : this.#makeThingFor(record))
    return thing === null ? Promise.resolve(null) : this.#receiveInto(thing, record)
  }

  /** `thing.receive(record)`, then settle on the thing. The bad news `receive` returns, and a refusal it throws, are told to `onBadNews`, never thrown: whoever delivered here, a fetch, a put, a del, a build or a notice, has the instance back. */
  async #receiveInto(thing: ThingT, record: Fetched<RecordT, SparseT> | null): Promise<ThingT> {
    try {
      this.tellBadNews(thing.receive(record).badnews)
    } catch (err) {
      this.tellBadNews([refusalOf(err)])
    }
    await this.settle(thing)
    return thing
  }

  /** A new instance for a record not yet held, with nothing stored as its central, so that `receive` adopts the record as it would any newer one. */
  #makeThingFor(record: Fetched<RecordT, SparseT>): ThingT {
    const neverStored = this.#neverStoredOf(this.sparseOf(record))
    return this.#hold(this.makeThing(neverStored, null))
  }

  /** Hold `thing` under its scope, and make the listing's snapshot again on each change of the thing's. An instance held under that scope is let go: the listing stops following it. */
  #hold(thing: ThingT): ThingT {
    const scopepath = this.scopepathOf(thing.scope)
    this.#unsubscribes.get(scopepath)?.()
    this.#things.set(scopepath, thing)
    thing.getSnapshot()   // a thing notifies only once it has a snapshot
    this.#unsubscribes.set(scopepath, thing.subscribe(() => { this.#remakeSnapshot() }))
    return thing
  }

  /** A central never stored: a tombstone at `NeverStoredSeq` under a new tok, of `sparse`'s props. */
  #neverStoredOf(sparse: SparseT): Tombstone<SparseT> {
    return { ...sparse, revision_tok: randomId(), revision_seq: NeverStoredSeq, am: 'x' }
  }
  // --

  // == [The watch]: onNotice

  /** Deliver a notice as a good answer; a refusal met on the way, the world's or a record that cannot be made into an instance, is bad news, as nobody asked. */
  readonly #onNotice = async (notice: Notice<RecordT, SparseT>): Promise<void> => {
    MSX.notice.parse(notice)
    const { record, world } = notice
    const { ok, err } = await outcomeOf(() => this.#deliver({ scope: this.scopeOf(record), ok: true, val: record, world }))
    if (! ok) { this.tellBadNews([err]) }
  }
  // --

  // == [Snapshot and subscription]: snapshot, getSnapshot, subscribe, settle, remakeSnapshot

  /** The snapshot of every present instance, as the instance itself gives it: frozen, the same array until one of them changes. */
  get snapshot(): readonly SnapshotT[] { return this.#snapshot }

  get getSnapshot(): () => readonly SnapshotT[] { return this.#getSnapshot }
  readonly #getSnapshot = (): readonly SnapshotT[] => this.#snapshot

  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** Save `thing`, when given, to the device cache by `#cache.save`, then make the listing's snapshot again. A save that is refused is told to `onBadNews`, not thrown. */
  protected async settle(thing?: ThingT): Promise<void> {
    try {
      if (thing !== undefined) { await this.#cache.save(thing.cacheable) }
    } catch (err) {
      this.tellBadNews([refusalOf(err)])
    }
    this.#remakeSnapshot()
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

  /** Tell each item of `badnews` to the host's `onBadNews`, where one was given. */
  protected tellBadNews(badnews: readonly VaultError[]): void {
    for (const news of badnews) { this.#onBadNews?.(news) }
  }
  // --

  // == [Helpers]: stampDna

  /** `dna` under revision 0, the first a thing earns, and the times of now; `draftOf` completes it. */
  protected stampDna(dna: Dna<ScopeT, RecordT>): Dna<ScopeT, RecordT> & Revision & Times {
    const now = this.clock.now()
    return { ...dna, revision_tok: randomId(), revision_seq: 0, registered_at: now, written_at: now }
  }
  // --

  // == [Defined by the concrete listing]: scopepathOf, scopeOf, sparseOf, recordOf, draftOf, makeThing, absentRefusal, storedInStaleRefusal

  protected abstract scopepathOf(scope: ScopeT): string
  /** The scope of `duck`, a record in any form or a thing ducking as one; refuses anything else. */
  abstract scopeOf(duck: unknown): ScopeT
  /** The sparse form of `duck`, a record in any form or a thing ducking as one, as a plain copy with the payload left out; refuses anything else. */
  abstract sparseOf(duck: unknown): SparseT
  /** The full record `duck` is, as a plain copy; refuses a duck that is not full. */
  abstract recordOf(duck: unknown): RecordT
  /** The record a stamped dna makes, staged at birth: the thing's sparse form, its defaults filled in, alive; a vault's is its full novel record. */
  protected abstract draftOf(dna: Dna<ScopeT, RecordT> & Revision & Times): SparseT | RecordT
  /** Construct the instance, and nothing more. */
  protected abstract makeThing(central: Fetched<RecordT, SparseT>, staged: Fetched<RecordT, SparseT> | null): ThingT
  abstract absentRefusal(scope: ScopeT): VaultError
  /** The record a 'stale_write' refusal carries, what storage holds; null for none, or for a record that fails its check. */
  protected abstract storedInStaleRefusal(err: VaultError): Fetched<RecordT, SparseT> | null
  // --
}
// --

// == [Helpers]: hasRevision

/** True for a record handed to `build`, which carries a `revision_seq`; false for a dna. A dna carrying one is taken for a record. */
export const hasRevision = (input: object): input is Revision & Times => 'revision_seq' in input
// --
