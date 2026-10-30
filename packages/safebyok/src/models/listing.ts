/** The base of a box listing and a vault listing: the live instances of one kind of thing, the device cache they are warmed from, the watch on storage, and every storage call made for that kind of thing. */

import { randomId } from '../crypto'
import type { VaultError } from '../errors'
import { alreadyHeldError } from '../helpers/throwers'
import { type Outcome, outcomeOf, refusalOf } from '../outcome'
import type { Clock } from '../shapes/bank-opts'
import { type Answer, type Cache, type Cacheable, type Dna, type Fetched, type FetchOpts, type IfAbsent, type ListingOpts, type ListingWorld, type LockState, type Notice, type Revision, type SparseBase, type Store, type TimelyOpts, type Times, type Tombstone, IsListing, NeverStoredSeq } from './models-shapes'
import * as MSX from './models-shapes'
import type { Storable } from './storable'

type Thing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>> = Storable<ScopeT, RecordT, SparseT, unknown, unknown>

/** Intake for `#buildOrReceive`: a record storage gave, or `build` was handed, null for nothing stored; a copy from the device cache; or a dna's draft. */
type Intake<RecordT, SparseT> = Received<RecordT, SparseT> | Readonly<{ flavor: 'cached', copy: Cacheable<RecordT, SparseT> }> | Readonly<{ flavor: 'drafted', draft: SparseT | RecordT }>
type Received<RecordT, SparseT> = Readonly<{ flavor: 'received', record: Fetched<RecordT, SparseT> | null }>
// --

// == [Listing]

/** The live instances of one kind of thing, by scope, each made once and kept, as its tombstone once gone.
 * `hello` warms it from the device cache, starts the watch and hydrates everything; after that
 * the cache is only saved to. Every answer storage gives, to `fetch`, `put`, `del` or the watch,
 * goes through `#deliver`, and every instance is made and held through `#buildOrReceive`, so no
 * scope is built twice. The listing then settles, saving the instance to the cache and making the
 * snapshot again. A call is refused when it cannot give what it asked for: a refusal from storage,
 * or a record its instance's `receive` refuses. Bad news nobody asked about, a refused save to
 * the cache or a refusal met on a notice, is told to `onBadNews`.
 */
export abstract class Listing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, SnapshotT, ThingT extends Storable<ScopeT, RecordT, SparseT, unknown, SnapshotT>> {
  readonly world: ListingWorld
  /** The refresh horizon of each thing made here. */
  protected readonly maxMillisSinceRefresh: number

  readonly #store: Store<ScopeT, RecordT, SparseT>
  readonly #cache: Cache<RecordT, SparseT>
  readonly #things    = new Map<string, ThingT>()
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

  /** Load the device cache once and revive an instance from each copy whose scope is not already held, saving nothing back (an instance held is fresher than its cached copy); start the watch; hydrate every instance.
   * The cache is a cache: a load refused, or a copy that cannot be revived, is told to `onBadNews`, and hello goes on without it.
   */
  async hello(): Promise<void> {
    const loaded = await outcomeOf(() => this.#cache.load())
    if (! loaded.ok) { this.tellBadNews([loaded.err]) }
    const copies = loaded.ok ? loaded.val : []
    for (const copy of copies) {
      const revived = await outcomeOf(() => this.#buildOrReceive(this.scopeOf(copy.central), { flavor: 'cached', copy }))
      if (! revived.ok) { this.tellBadNews([revived.err]) }
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
   * A record, sparse, full or a tombstone, is delivered as a fetch's answer would be: a thing already held under its
   * scope receives it, and a refusal its `receive` throws is thrown.
   * A dna, its defaults filled, is staged at revision 0 over a central never stored. A dna for a scope already held
   * refuses 'bad_option': `edit` the instance held, which brings a deleted or damaged one back to life.
   * Either way the instance is saved to the device cache; a save refused is told to `onBadNews`.
   */
  async build(input: Dna<ScopeT, RecordT> | Fetched<RecordT, SparseT>): Promise<ThingT> {
    if (hasRevision(input)) { return this.#buildOrReceive(this.scopeOf(input), { flavor: 'received', record: input }) }
    const draft = this.draftOf(this.stampDna(input))
    return this.#buildOrReceive(this.scopeOf(draft), { flavor: 'drafted', draft })
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

  // == [Delivering an answer]: deliver, buildOrReceive, bornOf, hold, neverStoredOf

  /** The pipeline every answer takes. Check it; take the world; hand the record, or none stored, to `#buildOrReceive` under the scope the answer names; a refusal answer is thrown, after the record a 'stale_write' carries is delivered.
   * The answer's own refusals are thrown: its world's, its `err` (a 'stale_write' as it came), or the absent refusal. A refusal `receive` throws is thrown too, as the instance cannot become what storage holds; but where the answer is itself a refusal, that one is thrown, and the carried record's is told to `onBadNews`.
   * Only a fetch judges, by passing its `ifAbsent`: an answer of nothing stored, or of a tombstone, is then absent, once delivered, and throws {@link absentRefusal} under 'fail' and resolves null under 'nil'. A `put`, a `del` and a notice pass none, and have the instance back, a tombstone or not.
   */
  async #deliver(answer: Answer<ScopeT, RecordT, SparseT>, ifAbsent?: IfAbsent): Promise<ThingT | null> {
    MSX.answer.parse(answer)
    this.world.takeWorld(answer.world)
    if (answer.ok) {
      const thing = await this.#buildOrReceive(answer.scope, { flavor: 'received', record: answer.val })
      const isAbsent = answer.val === null || MSX.isTombstone(answer.val)
      if (ifAbsent === 'fail' && isAbsent) { throw this.absentRefusal(answer.scope) }
      return (ifAbsent === 'nil' && isAbsent) ? null : thing
    }
    const stored = this.storedInStaleRefusal(answer.err)
    if (stored !== null) {
      const delivered = await outcomeOf(() => this.#buildOrReceive(answer.scope, { flavor: 'received', record: stored }))
      if (! delivered.ok) { this.tellBadNews([delivered.err]) }
    }
    throw answer.err
  }

  // The one place an instance is made and held: `#bornOf` is called from here alone, and only where no instance is held.
  /** The instance under `scope` once `intake` meets it: the instance held, or, where none is, one born of `intake` and held.
   * A record received goes to the instance's `receive`, a new instance's included, which is held only once it has taken
   * the record; a refusal `receive` throws is thrown, nothing held or saved. A cached copy leaves an instance held as it
   * is, being older. A draft for a scope held refuses 'bad_option'. The listing then settles on the instance, saving it,
   * except for a revived copy, which is saved nowhere. Null for nothing stored and nothing held.
   */
  #buildOrReceive(scope: ScopeT, intake: Exclude<Intake<RecordT, SparseT>, Received<RecordT, SparseT>> | (Received<RecordT, SparseT> & { record: Fetched<RecordT, SparseT> })): Promise<ThingT>
  #buildOrReceive(scope: ScopeT, intake: Intake<RecordT, SparseT>): Promise<ThingT | null>
  async #buildOrReceive(scope: ScopeT, intake: Intake<RecordT, SparseT>): Promise<ThingT | null> {
    const held = this.at(scope)
    if (held !== null && intake.flavor === 'drafted') { throw alreadyHeldError() }
    if (held !== null && intake.flavor === 'cached')  { return held }
    const thing = held ?? this.#bornOf(intake)
    if (thing === null) { return null }
    if (intake.flavor === 'received') { this.tellBadNews(thing.receive(intake.record).badnews) }
    if (thing !== held) { this.#hold(thing) }
    if (intake.flavor !== 'cached') { await this.settle(thing) }
    return thing
  }

  /** A new instance for `intake`, constructed and nothing more; null for nothing stored. A record's instance is born over a central never stored, of the record's sparse form, so that `receive` adopts the record as it would any newer one; a copy's revives its central and staged; a draft is staged over a central never stored. */
  #bornOf(intake: Intake<RecordT, SparseT>): ThingT | null {
    if (intake.flavor === 'cached')  { return this.makeThing(intake.copy.central, intake.copy.staged) }
    if (intake.flavor === 'drafted') { return this.makeThing(this.#neverStoredOf(intake.draft), intake.draft) }
    return intake.record === null ? null : this.makeThing(this.#neverStoredOf(this.sparseOf(intake.record)), null)
  }

  /** Hold `thing`, born here, under its scope, and make the listing's snapshot again on each change of the thing's. */
  #hold(thing: ThingT): void {
    this.#things.set(this.scopepathOf(thing.scope), thing)
    thing.getSnapshot()   // a thing notifies only once it has a snapshot
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
      await this.#deliver({ scope: this.scopeOf(record), ok: true, val: record, world })
    })
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
    } finally {
      this.#remakeSnapshot()
    }
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
  tellBadNews(badnews: readonly VaultError[]): void {
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
