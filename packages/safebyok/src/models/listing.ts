/** The base of a box listing and a vault listing: the live instances of one kind of thing, the device cache they are warmed from, the watch on storage, and every storage call made on a thing's behalf. */

import { type VaultError, isVaultError } from '../errors'
import { type Outcome, outcomeOf } from '../outcome'
import type { Clock } from '../shapes/bank-opts'
import { stableJsonify } from '../stable-jsonify'
import type { Storable } from './storable'
import { type Cacheable, type Dna, type Fetched, type LockState, type Revision, type SparseBase, type StorableListing, type TimelyOpts, type Times, type Tombstone, type World, NeverStoredSeq } from './models-shapes'
import { randomId } from '../crypto'

// == [What storage answers]: Answer, Notice, FetchOpts, ListingOpts

// don't let things you control be wishy-washy: damaged is boolean. Use Zod!!!
// you may want this to be a tagged union to allow damaged_record as a top-level field
// and if you want a val/err disjunction
/** The answer to a storage call: the thing asked about, or null for none stored, and the world it lies in as storage holds it now. `damaged` marks a record that failed its check, of which only scope, vault_tok and revision were recovered. */
export type Answer<RecordT, SparseT> = Readonly<{
  ok:      boolean
  val:     Fetched<RecordT, SparseT> | null
  world:   unknown
  meta:    Record<string, unknown>
  err:     VaultError | null
  damaged: boolean
}>

/** A notice from the watch: an answer nobody asked for, always naming a record, sparse at least. It enters the pipeline where a fetch's answer would. */
export type Notice<RecordT, SparseT> = Readonly<{
  record:   Fetched<RecordT, SparseT>
  world:    unknown
  damaged?: boolean | undefined
}>

/** `ifAbsent`: how `fetch` treats a thing the listing does not hold, or finds gone: make a draft, refuse, or resolve null. Refuses, unless given. */
export type FetchOpts = TimelyOpts & { ifAbsent?: 'create' | 'fail' | 'nil' | undefined }

export type ListingOpts = {
  world:      World
  onBadNews?: ((news: VaultError) => void) | undefined
}

type Thing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>> = Storable<ScopeT, RecordT, SparseT, unknown, unknown>
// --

// == [Listing]

/** The live instances of one kind of thing, by scope, each made once and kept until gone.
 * `hello` warms it from the device cache, starts the watch and hydrates everything; after that
 * the cache is only written. `build` is the one place an instance is born. Every answer storage
 * gives, to a verb or to the watch, goes through `#deliver`: the world is taken first, the record
 * handed to its instance's `receive`, what comes back cached and told, and the listing's own
 * snapshot replaced.
 */
export abstract class Listing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, SnapshotT, ThingT extends Storable<ScopeT, RecordT, SparseT, unknown, SnapshotT>>
implements StorableListing<ScopeT, RecordT, SparseT> {
  readonly world: World

  readonly #things    = new Map<string, ThingT>()
  readonly #listeners = new Set<() => void>()
  readonly #onBadNews: ((news: VaultError) => void) | null
  #snapshot: readonly SparseT[] = Object.freeze([])
  #unwatch:  (() => void) | null = null

  constructor(opts: ListingOpts) {
    this.world = opts.world
    this.#onBadNews = opts.onBadNews ?? null
  }

  get clock(): Clock { return this.world.clock }

  // == [Starting and ending]: hello, goodbye

  /** Read the device cache once and revive an instance from each copy; start the watch; hydrate every instance. */
  async hello(): Promise<void> {
    const cached = await this.loadCached()
    for (const copy of cached) { this.#hold(this.makeThing(copy.central, copy.staged)) }
    this.#unwatch ??= this.watchStore(this.#onNotice)
    await this.hydrateAll()
  }

  /** End the watch. The instances stay as they are. */
  goodbye(): void {
    this.#unwatch?.()
    this.#unwatch = null
  }
  // --

  // == [Listing verbs]: at, things, hydratedThings, build, fetch, hydrateAll

  /** The instance held under `scope`, or null. Reads nothing. */
  at(scope: ScopeT): ThingT | null {
    return this.#things.get(this.scopepathOf(scope)) ?? null
  }

  get things(): readonly ThingT[] { return [...this.#things.values()] }

  /** The instances held whole: the ones the watch may push full records for. */
  get hydratedThings(): readonly ThingT[] { return this.things.filter((thing) => thing.isHydrated) }

  /** Build the instance of `input` and hold it, resolving it. A sparse record, a full one or a tombstone is held as central.
   * A dna, its defaults filled, is staged at revision 0 over a central never stored: a tombstone at `NeverStoredSeq`, so
   * that nothing stored is the answer it expects. Stores nothing.
   */
  build(input: Dna<ScopeT, RecordT> | Fetched<RecordT, SparseT>): Promise<ThingT> {
    // fixme: drafts are not a thing
    if (hasRevision(input)) { return Promise.resolve(this.#hold(this.makeThing(input, input))) }
    const draft = this.draftOf(this.stampDna(input))
    const neverStored: Tombstone<SparseT> = { ...draft, revision_tok: randomId(), revision_seq: NeverStoredSeq, am: 'x' }
    return Promise.resolve(this.#hold(this.makeThing(neverStored, draft)))
  }

  /** Hold `thing`, settled in its constructor, under its scope; publish. */
  #hold(thing: ThingT): ThingT {
    this.#things.set(this.scopepathOf(thing.scope), thing)
    this.publish()
    return thing
  }

  /** The instance under `scope`, hydrated, or what `ifAbsent` says for one not held or found gone. */
  async fetch(scope: ScopeT, opts: FetchOpts = {}): Promise<ThingT | null> {
    check preconditions
    record = get from VaultDB
    handle generic errors
    thing = build or deliver record
    settle
    // no:
    // const held = this.at(scope) ?? await this.#madeIfAllowed(scope, opts)
    // if (held === null) { return held }
    // await held.hydrate(opts)
    // if (! held.isGone) { return held }
    // return this.#madeIfAllowed(scope, opts)
  }

  tryFetch(scope: ScopeT, opts: FetchOpts = {}): Promise<Outcome<ThingT | null>> { return outcomeOf(() => this.fetch(scope, opts)) }

  async hydrateAll(opts: TimelyOpts = {}): Promise<void> {
    await Promise.all(this.things.map((thing) => thing.tryHydrate(opts)))
  }

  // this has missed the boat -- vaultDB will have created the record
  // we'll add this feature later
  // async applyIfAbsentPolicy(scope: ScopeT, opts: FetchOpts): Promise<ThingT | null> {
  //   if (opts.ifAbsent === 'nil') { return null }
  //   if (opts.ifAbsent === 'create') { return this.build(scope) }
  //   throw this.absentRefusal(scope)
  // }

  // --

  // == [Storage, on a thing's behalf]: fetchRecordOf, putRecordOf, delRecordOf

  /** Get `thing`'s record through `storeGet` and deliver the answer. */
  async fetchRecordOf(thing: Thing<ScopeT, RecordT, SparseT>): Promise<void> {
    // decide if fetch calls fetchRecordOf, or the other way around -- but they should share a pipeline
    // my best guess is fetch gets a record and delivers or builds
    // await this.#deliver(thing, await this.storeGet(thing.scope))
  }


  /** Put `record` through `storePut` and deliver the answer. A 'stale_write' refusal delivers the record storage holds before it is thrown. */
  async putRecordOf(thing: Thing<ScopeT, RecordT, SparseT>, record: RecordT): Promise<void> {
    // convert this to use the try form. Make Answer be an outcome { ok, val, meta, world, err }. and sometimes stored_record or something too?
    const answer = await this.tryStorePut(record)
    const deliverable = this.deliverableRecordForAnswer(answer)
    await this.#deliver(thing, deliverable)
  }

  /** The `val` record (possibly null) if `ok`; the actual stored record, if `err` is a stale_write refusal. null otherwise. */
  deliverableRecordForAnswer(answer: Answer<RecordT, SparseT>): RecordT | null {
    if (answer.ok) { return answer }
    if (answer.err.code === 'stale_write') {
      return { ...answer, ok: true, val: answer.stored_record }
    }
    return null
  }

  /** Delete `thing` at the revision in hand through `storeDel` and deliver the answer, a tombstone. A 'stale_write' refusal delivers as `putRecordOf` does. */
  async delRecordOf(thing: Thing<ScopeT, RecordT, SparseT>): Promise<void> {
    // why is this here? the thing will have set its tombstone already, now you just need to store and deliver the result
    // deleting a deleted thing is not a problem
    // if (thing.isGone) { throw this.absentRefusal(thing.scope) }
    const answer = await this.tryStoreDel(thing.scope, thing.sparse)
    try {
      await this.#deliver(thing, )
    } catch (err) {
      await this.#deliverWhatStaleSays(thing, err)
      throw err
    }
  }
  // --

  // == [Delivering an answer]: deliver, deliverWhatStaleSays, letGo

  /** Take the world; hand the record to `thing.receive`; let a thing gone go; cache and tell what came back; publish. */
  async #deliver(thing: Thing<ScopeT, RecordT, SparseT>, answer: Answer<RecordT, SparseT>): Promise<void> {
    this.takeWorld(answer.world)
    const { badnews } = thing.receive(answer.val, answer.damaged)
    // if (thing.isGone) { this.#letGo(thing) } // we're keeping the instance as its tombstone, just ignore it when appropriate
    // await this.saveCached(thing.cacheable) // should we move this to thing.settle?
    this.tellBadNews(badnews)
    this.publish()
  }

  buildOrDeliver(record: Notice<RecordT, SparseT>): Promise<ThingT> {
    const storable = this.at(record)
    if (storable === null) { return this.build(record) }
    this.#deliver(storable, record)
    return storable
  }

  // #letGo(thing: Thing<ScopeT, RecordT, SparseT>): void {
  //   this.#things.delete(this.scopepathOf(thing.scope))
  // }

  // --

  // == [The watch]: onNotice

  /** Deliver a notice to its instance, making one from the bare scope first when none is held, so the notice itself arrives through the pipeline and is cached. */
  readonly #onNotice = (notice: Notice<RecordT, SparseT>): void => {
    this.#deliver(notice)
  }

  // --

  // == [Snapshot and subscription]: snapshot, getSnapshot, subscribe, publish

  /** The sparse form of every instance held, frozen, the same array until one changes. */
  get snapshot(): readonly SparseT[] { return this.#snapshot }

  get getSnapshot(): () => readonly SparseT[] { return this.#getSnapshot }
  readonly #getSnapshot = (): readonly SparseT[] => this.#snapshot

  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** Make the listing's snapshot again and, when it differs, replace it and call every listener. */
  protected publish(): void {
    const next = Object.freeze(this.things.filter((thing) => ! thing.isGone).map((thing) => thing.sparse))
    if (stableJsonify(next) === stableJsonify(this.#snapshot)) { return }
    this.#snapshot = next
    for (const listener of this.#listeners) { listener() }
  }
  // --

  // == [Bad news]: tellBadNews

  /** Tell each item of `badnews` to the host's `onBadNews`, where one was given. */
  protected tellBadNews(badnews: readonly VaultError[]): void {
    for (const news of badnews) { this.#onBadNews?.(news) }
  }
  // --

  // == [Helpers]: stampDna, scopeOf

  /** `dna` under revision 0, the first a thing earns, and the times of now; `draftOf` completes it. */
  protected stampDna(dna: Dna<ScopeT, RecordT>): Dna<ScopeT, RecordT> & Revision & Times {
    const now = this.clock.now()
    return { ...dna, revision_tok: randomId(), revision_seq: 0, registered_at: now, written_at: now }
  }

  protected scopeOf(fetched: Fetched<RecordT, SparseT>): ScopeT {
    return this.scopeOfSparse(fetched)
  }
  // --

  // == [What the concrete listing defines]: scopepathOf, scopeOfSparse, draftOf, makeThing, absentRefusal, lockState, ensureTimelyWorld, takeWorld, storedInStaleRefusal, the stores

  protected abstract scopepathOf(scope: ScopeT): string
  protected abstract scopeOfSparse(sparse: SparseT): ScopeT
  /** The record a stamped dna makes, staged at birth: the thing's sparse form, its defaults filled in, alive; a vault's is its full novel record. */
  protected abstract draftOf(dna: Dna<ScopeT, RecordT> & Revision & Times): SparseT | RecordT
  /** Construct the instance, and nothing more. */
  protected abstract makeThing(central: Fetched<RecordT, SparseT>, staged: Fetched<RecordT, SparseT>): ThingT
  abstract absentRefusal(scope: ScopeT): VaultError
  abstract lockState(): LockState
  abstract ensureTimelyWorld(opts: TimelyOpts): Promise<void>
  /** Hand the world an answer carries to the world: a box listing hands the vault's sparse form to the vault. Null for none. */
  protected abstract takeWorld(world: unknown): void
  protected abstract storedInStaleRefusal(err: VaultError): Fetched<RecordT, SparseT> | null

  // The vaultDB, as this listing maps it.
  protected abstract storeGet(scope: ScopeT): Promise<Answer<RecordT, SparseT>>
  protected abstract storePut(record: RecordT): Promise<Answer<RecordT, SparseT>>
  protected abstract storeDel(scope: ScopeT, revision: Revision): Promise<Answer<RecordT, SparseT>>
  protected abstract watchStore(onNotice: (notice: Notice<RecordT, SparseT>) => void): () => void

  // The deviceDB, as this listing maps it: read once at hello, written after.
  protected abstract loadCached(): Promise<readonly Cacheable<RecordT, SparseT>[]>
  protected abstract saveCached(cacheable: Cacheable<RecordT, SparseT>): Promise<void>
  // --
}
// --

// == [Helpers]: hasRevision

const hasRevision = (input: object): input is Revision & Times => 'revision_seq' in input
// --
