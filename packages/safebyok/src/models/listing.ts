/** The base of a box listing and a vault listing: the live instances of one kind of thing, the device cache they are warmed from, the watch on storage, and every storage call made on a thing's behalf. */

import { type VaultError, isVaultError } from '../errors'
import { type Outcome, outcomeOf } from '../outcome'
import type { Clock } from '../shapes/bank-opts'
import { stableJsonify } from '../stable-jsonify'
import { type Cacheable, type Dna, type Fetched, type LockState, type Revision, type Staged, type Storable, type StorableListing, type TimelyOpts, type Times, type World, NeverStoredSeq, isTombstone } from './storable'
import { randomId } from '../crypto'

// == [What storage answers]: Answer, Notice, FetchOpts, ListingOpts

/** What a storage call answers: the thing asked about, or null for none stored, and the world it lies in as storage holds it now. */
export type Answer<ScopeT, RecordT, SparseT> = Readonly<{
  record: Fetched<ScopeT, RecordT, SparseT> | null
  world:  unknown
}>

/** What the watch delivers: an answer nobody asked for, always naming a record, sparse at least. It enters the pipeline where a fetch's answer would. */
export type Notice<ScopeT, RecordT, SparseT> = Readonly<{
  record: Fetched<ScopeT, RecordT, SparseT>
  world:  unknown
}>

/** `ifAbsent`: what `fetch` does for a thing the listing does not hold, or finds gone: make a draft, refuse, or resolve null. Refuses, unless given. */
export type FetchOpts = TimelyOpts & { ifAbsent?: 'create' | 'fail' | 'nil' | undefined }

export type ListingOpts = {
  world:      World
  onBadNews?: ((news: VaultError) => void) | undefined
}

type Thing<ScopeT extends object, RecordT extends SparseT, SparseT extends ScopeT & Revision & Times> = Storable<ScopeT, RecordT, SparseT, unknown, unknown>
// --

// == [Listing]

/** The live instances of one kind of thing, by scope, each made once and kept until gone.
 * `hello` warms it from the device cache, starts the watch and hydrates everything; after that
 * the cache is only written. `make` is the one place an instance is born. Every answer storage
 * gives, to a verb or to the watch, goes through `#deliver`: the world is taken first, the record
 * handed to its instance's `receive`, what comes back cached and told, and the listing's own
 * snapshot replaced.
 */
export abstract class Listing<ScopeT extends object, RecordT extends SparseT, SparseT extends ScopeT & Revision & Times, SnapshotT, ThingT extends Storable<ScopeT, RecordT, SparseT, unknown, SnapshotT>>
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
    for (const copy of cached) { await this.#hold(this.makeThing(copy.central, copy.staged)) }
    this.#unwatch ??= this.watchStore(this.#onNotice)
    await this.hydrateAll()
  }

  /** End the watch. The instances stay as they are. */
  goodbye(): void {
    this.#unwatch?.()
    this.#unwatch = null
  }
  // --

  // == [Listing verbs]: at, things, hydratedThings, make, fetch, hydrateAll

  /** The instance held under `scope`, or null. Reads nothing. */
  at(scope: ScopeT): ThingT | null {
    return this.#things.get(this.scopepathOf(scope)) ?? null
  }

  get things(): readonly ThingT[] { return [...this.#things.values()] }

  /** The instances held whole: the ones the watch may push full records for. */
  get hydratedThings(): readonly ThingT[] { return this.things.filter((thing) => thing.isHydrated) }

  /** Make the instance of `input` and hold it, resolving it: a dna becomes a never-stored central, its defaults filled; a sparse record, a full one or a tombstone is held as it is. Stores nothing. */
  make(input: Dna<ScopeT, RecordT> | Fetched<ScopeT, RecordT, SparseT>): Promise<ThingT> {
    const central = hasRevision(input) ? input : this.draftOf(this.stampDna(input))
    return this.#hold(this.makeThing(central, null))
  }

  /** Hold `thing` under its scope and initialize it, telling what it settles; publish. */
  async #hold(thing: ThingT): Promise<ThingT> {
    this.#things.set(this.scopepathOf(thing.scope), thing)
    const settled = await thing.initialize()
    this.tellBadNews(settled.badnews)
    this.publish()
    return thing
  }

  /** The instance under `scope`, hydrated, or what `ifAbsent` says for one not held or found gone. */
  async fetch(scope: ScopeT, opts: FetchOpts = {}): Promise<ThingT | null> {
    const held = this.at(scope) ?? await this.#madeIfAllowed(scope, opts)
    if (held === null) { return held }
    await held.hydrate(opts)
    if (! held.isGone) { return held }
    return this.#madeIfAllowed(scope, opts)
  }

  tryFetch(scope: ScopeT, opts: FetchOpts = {}): Promise<Outcome<ThingT | null>> { return outcomeOf(() => this.fetch(scope, opts)) }

  async hydrateAll(opts: TimelyOpts = {}): Promise<void> {
    await Promise.all(this.things.map((thing) => thing.tryHydrate(opts)))
  }

  async #madeIfAllowed(scope: ScopeT, opts: FetchOpts): Promise<ThingT | null> {
    if (opts.ifAbsent === 'nil') { return null }
    if (opts.ifAbsent === 'create') { return this.make(scope) }
    throw this.absentRefusal(scope)
  }
  // --

  // == [Storage, on a thing's behalf]: fetchRecordOf, putRecordOf, delRecordOf

  /** Get `thing`'s record through `storeGet` and deliver the answer. */
  async fetchRecordOf(thing: Thing<ScopeT, RecordT, SparseT>): Promise<void> {
    await this.#deliver(thing, await this.storeGet(thing.scope))
  }

  /** Put `record` through `storePut` and deliver the answer. A 'stale_write' refusal delivers the record storage holds before it is thrown. */
  async putRecordOf(thing: Thing<ScopeT, RecordT, SparseT>, record: RecordT): Promise<void> {
    try {
      await this.#deliver(thing, await this.storePut(record))
    } catch (err) {
      await this.#deliverWhatStaleSays(thing, err)
      throw err
    }
  }

  /** Delete `thing` at the revision in hand through `storeDel` and deliver the answer, a tombstone. A 'stale_write' refusal delivers as `putRecordOf` does. */
  async delRecordOf(thing: Thing<ScopeT, RecordT, SparseT>): Promise<void> {
    const { sparse } = thing
    if (sparse === null) { throw this.absentRefusal(thing.scope) }
    try {
      await this.#deliver(thing, await this.storeDel(thing.scope, sparse))
    } catch (err) {
      await this.#deliverWhatStaleSays(thing, err)
      throw err
    }
  }
  // --

  // == [Delivering an answer]: deliver, deliverWhatStaleSays, letGo

  /** Take the world; hand the record to `thing.receive`; let a thing gone go; cache and tell what came back; publish. */
  async #deliver(thing: Thing<ScopeT, RecordT, SparseT>, answer: Answer<ScopeT, RecordT, SparseT>): Promise<void> {
    this.takeWorld(answer.world)
    const { badnews } = await thing.receive(answer.record)
    if (thing.isGone) { this.#letGo(thing) }
    await this.saveCached(thing.cacheable)
    this.tellBadNews(badnews)
    this.publish()
  }

  /** A write refused 'stale_write' carries what storage holds now: deliver that as an answer with no world. */
  async #deliverWhatStaleSays(thing: Thing<ScopeT, RecordT, SparseT>, err: unknown): Promise<void> {
    if (! isVaultError(err, 'stale_write')) { return }
    const stored = this.storedInStaleRefusal(err)
    if (stored === null) { return }
    await this.#deliver(thing, { record: stored, world: null })
  }

  #letGo(thing: Thing<ScopeT, RecordT, SparseT>): void {
    this.#things.delete(this.scopepathOf(thing.scope))
  }
  // --

  // == [The watch]: onNotice

  /** Deliver a notice to its instance, making one from the bare scope first when none is held, so the notice itself arrives through the pipeline and is cached. */
  readonly #onNotice = (notice: Notice<ScopeT, RecordT, SparseT>): void => {
    const scope = this.scopeOf(notice.record)
    const held = this.at(scope)
    if (held !== null) { void this.#deliver(held, notice); return }
    void this.make(scope).then((made) => this.#deliver(made, notice))
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
    const next = Object.freeze(this.things.map((thing) => thing.sparse).filter((sparse) => sparse !== null))
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

  /** `dna` with the revision nothing stored has (`NeverStoredSeq`, so its first staged record is revision 0) and the times of now: what `draftOf` completes. */
  protected stampDna(dna: Dna<ScopeT, RecordT>): Dna<ScopeT, RecordT> & Revision & Times {
    const now = this.clock.now()
    return { ...dna, revision_tok: randomId(), revision_seq: NeverStoredSeq, registered_at: now, written_at: now }
  }

  protected scopeOf(fetched: Fetched<ScopeT, RecordT, SparseT>): ScopeT {
    return isTombstone(fetched) ? fetched : this.scopeOfSparse(fetched)
  }
  // --

  // == [What the concrete listing defines]: scopepathOf, scopeOfSparse, draftOf, makeThing, absentRefusal, lockState, ensureTimelyWorld, takeWorld, storedInStaleRefusal, the stores

  protected abstract scopepathOf(scope: ScopeT): string
  protected abstract scopeOfSparse(sparse: SparseT): ScopeT
  /** The never-stored central a stamped dna makes: the thing's sparse form, its defaults filled in; a vault's is its full novel record. */
  protected abstract draftOf(dna: Dna<ScopeT, RecordT> & Revision & Times): SparseT | RecordT
  /** Construct the instance, and nothing more: the listing initializes it. */
  protected abstract makeThing(central: Fetched<ScopeT, RecordT, SparseT>, staged: Staged<ScopeT, RecordT>): ThingT
  abstract absentRefusal(scope: ScopeT): VaultError
  abstract lockState(): LockState
  abstract ensureTimelyWorld(opts: TimelyOpts): Promise<void>
  /** Hand the world an answer carries to the world: a box listing hands the vault's sparse form to the vault. Null for none. */
  protected abstract takeWorld(world: unknown): void
  protected abstract storedInStaleRefusal(err: VaultError): Fetched<ScopeT, RecordT, SparseT> | null

  // The vaultDB, as this listing maps it.
  protected abstract storeGet(scope: ScopeT): Promise<Answer<ScopeT, RecordT, SparseT>>
  protected abstract storePut(record: RecordT): Promise<Answer<ScopeT, RecordT, SparseT>>
  protected abstract storeDel(scope: ScopeT, revision: Revision): Promise<Answer<ScopeT, RecordT, SparseT>>
  protected abstract watchStore(onNotice: (notice: Notice<ScopeT, RecordT, SparseT>) => void): () => void

  // The deviceDB, as this listing maps it: read once at hello, written after.
  protected abstract loadCached(): Promise<readonly Cacheable<ScopeT, RecordT, SparseT>[]>
  protected abstract saveCached(cacheable: Cacheable<ScopeT, RecordT, SparseT>): Promise<void>
  // --
}
// --

// == [Helpers]: hasRevision

const hasRevision = (input: object): input is Revision & Times => 'revision_seq' in input
// --
