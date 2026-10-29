import { VaultError, isVaultError } from '../errors'
import { type Outcome, outcomeOf } from '../outcome'
import type { Clock } from '../shapes/bank-opts'
import { stableJsonify } from '../stable-jsonify'
import { type Draft, type Fetched, type LockState, type Revision, type Storable, type StorableListing, type TimelyOpts, type Times, type Tombstone, type World, isTombstone, mintRevisionTok } from './storable'

// == [What storage answers]: Answer, Notice

// Every answer carries the thing asked about and the world it lies in, as storage holds both now.
// The world is canonical; the record matters chiefly where the two would disagree, as in a stale write.
export type Answer<ScopeT, RecordT, SparseT> = Readonly<{
  record: Fetched<ScopeT, RecordT, SparseT> | null
  world:  unknown
}>

// What the watch delivers: an answer nobody asked for, always naming a record. It enters the
// pipeline exactly where a fetch's answer would.
export type Notice<ScopeT, RecordT, SparseT> = Readonly<{
  record: Fetched<ScopeT, RecordT, SparseT>
  world:  unknown
}>

// What `fetch` does for a thing the listing does not hold.
export type FetchOpts = TimelyOpts & { ifAbsent?: 'create' | 'fail' | 'nil' | undefined }

export type ListingOpts = {
  world:      World
  onBadNews?: ((news: VaultError) => void) | undefined
}

type Thing<ScopeT extends object, RecordT extends SparseT, SparseT extends ScopeT & Revision & Times> = Storable<ScopeT, RecordT, SparseT, unknown, unknown>

// == [Listing]

export abstract class Listing<ScopeT extends object, RecordT extends SparseT, SparseT extends ScopeT & Revision & Times, SnapshotT, ThingT extends Storable<ScopeT, RecordT, SparseT, unknown, SnapshotT>>
implements StorableListing<ScopeT, RecordT, SparseT> {
  readonly world: World

  readonly #things = new Map<string, ThingT>()
  readonly #listeners = new Set<() => void>()
  readonly #onBadNews: ((news: VaultError) => void) | null
  #snapshot: readonly SparseT[] = Object.freeze([])
  #unwatch: (() => void) | null = null

  constructor(opts: ListingOpts) {
    this.world = opts.world
    this.#onBadNews = opts.onBadNews ?? null
  }

  get clock(): Clock { return this.world.clock }

  // == [Starting and ending]: hello, goodbye

  // Load the device cache once and make an instance from each copy; start the watch; then fetch everything.
  async hello(): Promise<void> {
    const cached = await this.loadCached()
    for (const copy of cached) { await this.make(copy) }
    this.#unwatch ??= this.watchStore(this.#onNotice)
    await this.hydrateAll()
  }

  // End the watch. The instances stay as they are.
  goodbye(): void {
    this.#unwatch?.()
    this.#unwatch = null
  }

  // == [Listing ops]: at, make, fetch, hydrateAll, things

  at(scope: ScopeT): ThingT | null {
    return this.#things.get(this.scopepathOf(scope)) ?? null
  }

  get things(): readonly ThingT[] { return [...this.#things.values()] }

  // The things this device holds in whole: the ones a store may push full records for.
  get hydratedThings(): readonly ThingT[] { return this.things.filter((thing) => thing.isHydrated) }

  // Generous on the way in: a draft (scope and the host's props, no revision), a sparse record, a full one,
  // or a tombstone. A draft is completed into a record at revision_seq 0, so its first send proposes 1. Here
  // is where the validator goes, a union of the strict draft shape and the strict sparse-or-better shape.
  async make(input: Draft<ScopeT, RecordT> | Fetched<ScopeT, RecordT, SparseT>): Promise<ThingT> {
    const central = hasRevision(input) ? input : this.recordOfDraft(this.stampDraft(input))
    const thing = this.makeThing(central)
    this.#things.set(this.scopepathOf(thing.scope), thing)
    const badnews = await thing.settle()
    for (const news of badnews) { this.tellBadNews(news) }
    this.publish()
    return thing
  }

  async fetch(scope: ScopeT, opts: FetchOpts = {}): Promise<ThingT | null> {
    const held = this.at(scope)
    if (held !== null) { return held.hydrate(opts) }
    if (opts.ifAbsent === 'nil') { return null }
    if (opts.ifAbsent === 'fail') { throw this.absentRefusal(scope) }
    const made = await this.make(scope)
    return made.hydrate(opts)
  }

  tryFetch(scope: ScopeT, opts: FetchOpts = {}): Promise<Outcome<ThingT | null>> { return outcomeOf(() => this.fetch(scope, opts)) }

  async hydrateAll(opts: FetchOpts = {}): Promise<void> {
    await Promise.all(this.things.map((thing) => thing.tryHydrate(opts)))
  }

  // == [Storage, on a thing's behalf]: fetchRecordOf, putRecordOf, delRecordOf

  async fetchRecordOf(thing: Thing<ScopeT, RecordT, SparseT>): Promise<void> {
    const answer = await this.storeGet(thing.scope)
    await this.#deliver(thing, answer)
  }

  async putRecordOf(thing: Thing<ScopeT, RecordT, SparseT>, record: RecordT): Promise<void> {
    try {
      const answer = await this.storePut(record)
      await this.#deliver(thing, answer)
    } catch (err) {
      await this.#deliverWhatStaleSays(thing, err)
      throw err
    }
  }

  async delRecordOf(thing: Thing<ScopeT, RecordT, SparseT>, tombstone: Tombstone<ScopeT>): Promise<void> {
    try {
      const answer = await this.storeDel(tombstone)
      await this.#deliver(thing, answer)
    } catch (err) {
      await this.#deliverWhatStaleSays(thing, err)
      throw err
    }
  }

  // == [Delivering an answer]: deliver, deliverWhatStaleSays, evict

  // Peel the world off, hand the record to the thing, cache what it hands back, tell what it says to tell.
  async #deliver(thing: Thing<ScopeT, RecordT, SparseT>, answer: Answer<ScopeT, RecordT, SparseT>): Promise<void> {
    this.takeWorld(answer.world)
    const fetched = answer.record ?? this.tombstoneForAbsence(thing)
    const wasHydrated = thing.isHydrated
    const { cacheable, badnews } = await thing.receive(fetched)
    const stillHydrated = thing.isHydrated
    const lostHydration = wasHydrated && ! stillHydrated
    if (thing.isGone) {
      this.#evict(thing)
    } else if (lostHydration) {
      void thing.tryHydrate()   // a thing held in whole stays whole; nobody waits, and a try form never rejects
    }
    await this.saveCached(cacheable)
    for (const news of badnews) { this.tellBadNews(news) }
    this.publish()
  }

  // A write refused as stale carries what storage holds now: that is an answer too.
  async #deliverWhatStaleSays(thing: Thing<ScopeT, RecordT, SparseT>, err: unknown): Promise<void> {
    if (! isVaultError(err, 'stale_write')) { return }
    const stored = this.storedInStaleRefusal(err)
    if (stored === null) { return }
    await this.#deliver(thing, { record: stored, world: null })
  }

  #evict(thing: Thing<ScopeT, RecordT, SparseT>): void {
    this.#things.delete(this.scopepathOf(thing.scope))
  }

  // == [The watch]: onNotice

  // Storage says what changed, and in what world. Deliver it to the instance, making one from the bare
  // scope if none is held, so the notice itself arrives through the pipeline and is cached.
  readonly #onNotice = (notice: Notice<ScopeT, RecordT, SparseT>): void => {
    const scope = this.scopeOf(notice.record)
    const held = this.at(scope)
    if (held !== null) { void this.#deliver(held, notice); return }
    void this.make(scope).then((made) => this.#deliver(made, notice))
  }

  // == [Snapshot and subscription]: snapshot, getSnapshot, subscribe, publish

  get snapshot(): readonly SparseT[] { return this.#snapshot }

  get getSnapshot(): () => readonly SparseT[] { return this.#getSnapshot }
  readonly #getSnapshot = (): readonly SparseT[] => this.#snapshot

  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  protected publish(): void {
    const next = Object.freeze(this.things.map((thing) => thing.sparse).filter((sparse) => sparse !== null))
    if (stableJsonify(next) === stableJsonify(this.#snapshot)) { return }
    this.#snapshot = next
    this.#listeners.forEach((listener) => { listener() })
  }

  // == [Bad news]: tellBadNews

  protected tellBadNews(news: VaultError): void {
    this.#onBadNews?.(news)
  }

  // == [Helpers]: stampDraft, tombstoneForAbsence, scopeOf

  // A draft gets the revision nothing stored has, and the times of now.
  protected stampDraft(draft: Draft<ScopeT, RecordT>): Draft<ScopeT, RecordT> & Revision & Times {
    const now = this.clock.now()
    return { ...draft, revision_tok: mintRevisionTok(), revision_seq: 0, registered_at: now, written_at: now }
  }

  // Nothing stored where a record was held: a tombstone at the held revision, with the times last known.
  protected tombstoneForAbsence(thing: Thing<ScopeT, RecordT, SparseT>): Tombstone<ScopeT> {
    const { revision_tok, revision_seq, registered_at, written_at } = thing.record
    return { ...thing.scope, revision_tok, revision_seq, registered_at, written_at, deleted: true }
  }

  protected scopeOf(fetched: Fetched<ScopeT, RecordT, SparseT>): ScopeT {
    return isTombstone(fetched) ? fetched : this.scopeOfSparse(fetched)
  }

  // == [What the concrete listing defines]: scopepathOf, scopeOfSparse, recordOfDraft, makeThing, absentRefusal, lockState, the world, the stores

  protected abstract scopepathOf(scope: ScopeT): string
  protected abstract scopeOfSparse(sparse: SparseT): ScopeT
  // The record's defaults, with the stamped draft over them. The validator's own defaults, once there is one.
  protected abstract recordOfDraft(draft: Draft<ScopeT, RecordT> & Revision & Times): RecordT
  protected abstract makeThing(central: Fetched<ScopeT, RecordT, SparseT>): ThingT
  abstract absentRefusal(scope: ScopeT): VaultError
  abstract lockState(): LockState
  abstract ensureTimelyWorld(opts: TimelyOpts): Promise<void>
  protected abstract takeWorld(world: unknown): void
  protected abstract storedInStaleRefusal(err: VaultError): Fetched<ScopeT, RecordT, SparseT> | null

  // The vaultDB, as this listing maps it.
  protected abstract storeGet(scope: ScopeT): Promise<Answer<ScopeT, RecordT, SparseT>>
  protected abstract storePut(record: RecordT): Promise<Answer<ScopeT, RecordT, SparseT>>
  protected abstract storeDel(tombstone: Tombstone<ScopeT>): Promise<Answer<ScopeT, RecordT, SparseT>>
  protected abstract watchStore(onNotice: (notice: Notice<ScopeT, RecordT, SparseT>) => void): () => void

  // The deviceDB, as this listing maps it: read once at hello, written after.
  protected abstract loadCached(): Promise<readonly Fetched<ScopeT, RecordT, SparseT>[]>
  protected abstract saveCached(cacheable: SparseT | Tombstone<ScopeT>): Promise<void>
}

// == [Helpers]: hasRevision

const hasRevision = (input: object): input is Revision & Times => 'revision_seq' in input
