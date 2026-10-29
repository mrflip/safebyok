import type { Clock } from '../shapes/bank-opts'
import { type Outcome, outcomeOf } from '../outcome'
import { Trigger } from '../utils/trigger'

export type Version = Readonly<{ revision_tok: string, revision_seq: number }>

export type Tombstone = Version & Readonly<{ deleted: true }>

// Every answer from storage carries the thing asked about, as storage holds it now, and the world it lies in.
export type Answer<RecordT> = Readonly<{ record: RecordT | null, world: unknown }>

export type StorabilityOpts = {
  worldMaxMillisSinceRefresh?:   number | undefined
  recordMaxMillisSinceRefresh?:  number | undefined
}

// What a world offers its storables. The clock lives here: one clock, not many.
export type StorableWorld = {
  clock:                                            Clock
  timeliestListedOf(scopepath: string):             Version | null    // sparse-or-better, if this world keeps a listing at all
  takeAnswerWorld(world: unknown):                  void
  demandConsistentWith(thing: unknown):             void
}

export type StorableOpts = {
  maxMillisSinceRefresh:  number
  world:                  StorableWorld
}

export abstract class Storable<ScopeT extends object, RecordT extends Version, SparseT extends Version, SnapshotT> {
  readonly scope:  ScopeT
  readonly world:  StorableWorld

  readonly #trigger:    Trigger<SnapshotT, this>
  readonly #listeners = new Set<() => void>()

  // #record:    RecordT | null = null // no, own props
  // #tombstone: Tombstone | null = null
  #snapshot:  SnapshotT
  #unlisten:  (() => void) | null = null

  constructor(record: ScopeT, opts: StorableOpts) {
    this.scope = this.scopeOf(record)
    this.world = opts.world
    this.#adopt(record)
    this.#snapshot = this.makeSnapshot()
    this.#refreshTrigger = this.#updateRefreshTrigger(opts)
    Object.freeze(this)
  }

  #updateRefreshTrigger(opts: Pick<StorableOpts, 'maxMillisSinceRefresh'>): Trigger<SnapshotT, this> {
    if (this.#refreshTrigger) { throw new Error('Refresh trigger already exists') }
    this.#refreshTrigger = new Trigger({
      clock:                  this.world.clock,
      maxMillisSinceSuccess:  opts.maxMillisSinceRefresh,
      doSnapshot:             () => this.#snapshot,
      doTryLaunch:            () => this.tryGet(),
    })
  }

  // == [Identity]: scopepath, stamp, sparse, toJSON

  get scopepath(): string { return this.scopepathOf(this.scope) }

  get sparse(): SparseT | null { return this.#record === null ? null : this.sparseOf(this.#record) }

  toJSON(): SparseT | null { return this.sparse }

  // == [Snapshot and subscription]: snapshot, getSnapshot, subscribe

  /** make the snapshot object from current props */
  protected _makeSnapshot(): SnapshotT {  }

  /** replace the prop using current props and notify everyone? */
  #replaceSnapshot(next: SnapshotT): void {
    if (this.isSameSnapshot(next)) { return }
    this.#snapshot = next
    this.#listeners.forEach((listener) => { listener() })
  }

  // who are the customers for each of these and why can't they agree on one method name?
  // curious: why is a private variable and getter better than a non-enumerable non-writable property?

  // get snapshot(): SnapshotT { return this.#snapshot }
  // get getSnapshot(): () => SnapshotT { return this.#getSnapshot }
  // readonly #getSnapshot = (): SnapshotT => this.#snapshot

  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    this.#unlisten ??= this.doSubscribe(this.#onStoreRing)
    return () => {
      this.#listeners.delete(listener)
      if (this.#listeners.size > 0) { return }
      this.#unlisten?.()
      this.#unlisten = null
    }
  }

  // == [Timeliness]: isTimely, ensureTimely

  get isTimely(): boolean { return this.#trigger.isTimely }

  async ensureTimely(): Promise<SnapshotT> { return this.#trigger.ensure() }

  // == [get]: the lifecycle, spelled out once, undried

  /** Fetch the record from the db, update the world; handle conditions (error, gone, locked, etc). If ok, update local copies and return a live instance */
  async get(opts: StorabilityOpts = {}): Promise<this> {
    this.ensureTimelyUnlockedWorld()
    this.demandUnlocked()
    // handles updating the world, generic error handling, and ensures val is consistent with the world
    // answer: { val, meta, err, ok, opkind, params } // world was detatched by vaultDBGetSelf
    const answer = await this.tryVaultDBGetSelf()
    if (! answer.ok)  { this.handleRefusal(answer) } // answer has the op in it -- see if it should be a different method
    demandUnlocked() // what is the timing of this relative to the below?
    const record = answer.val
    // update listing, snapshot, self, cache; handles receipt of an older record
    // handle tombstoning, return null
    this.update(record)
    return this // whatever the live instance is
  }

  async put(patch: Partial<RecordT>, opts: StorabilityOpts = {}): Promise<this> {
    await this.ensureTimelyStorability() // cached copy is timely and consistent; world timely, unlocked and consistent
    this.demandStorability()             // cached copy is consistent; world unlocked and consistent
    const nextRecord = this.nextVersionedRecord(patch)
    const sealed = await this.doSealForWrite(nextRecord) // are there other kinds of sealing?
    this.demandStorability()
    const answer = await this.tryVaultDBPutSelf(sealed)
    if (! answer.ok)  { this.handleRefusal(answer) }
    demandUnlocked()
    return this.update(answer.val)
  }

  async del(): Promise<this> {
    await this.ensureTimelyStorability() // cached copy is timely and consistent; world timely, unlocked and consistent
    this.demandStorability()             // cached copy is consistent; world unlocked and consistent
    const tombstone = this.nextTombstone()
    const answer = await this.tryVaultDBDelSelf(tombstone)
    // this.demandStorability() // we tombstone if locked, right?
    // this.world.takeAnswerWorld(answer.world)
    // this.#record = null
    // this.#tombstone = answer.record ?? tombstone
    // this.#replaceSnapshot(this.makeSnapshot())
    return this.world.remove(this, answer.val)
  }

  async update(record: RecordT): void {
    if (this.older(record)) { return } // ?? throw?
    this.updateListing()
    this.updateSnapshot()
    this.updateSelf()
    this.updateCache()
    return this // whatever the live instance is
  }

  async tryGet(opts: StorabilityOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.get(opts)) }
  async tryPut(patch: Partial<RecordT>): Promise<Outcome<this>> { return outcomeOf(() => this.put(patch)) }
  async tryDel(): Promise<Outcome<this>> { return outcomeOf(() => this.del()) }

  // == [Record primitives]: cachedRecord, fetchRecord, timelyRecord

  protected cachedRecord(): RecordT | null { return this.#record }

  protected async fetchRecord(): Promise<RecordT | null> {
    const answer = await this.vaultDBGetSelf()
    // this.demandStorability() // fold that into updateWorld
    this.world.update(answer.world)
    // this.world.demandConsistentWith(answer.record) // fold that into updateWorld
    if (answer.record !== null && this.isNewerVersion(this.#cachedVersion(), answer.record)) { this.#record = answer.record }
    return this.#record
  }

  protected async timelyRecord(): Promise<RecordT | null> {
    return this.#trigger.isTimely ? this.cachedRecord() : this.fetchRecord()
  }

  // == [Versioning]: cachedVersion, nextVersionedRecord, nextTombstone, isNewerVersion

  #cachedVersion(): Version | null {
    const versioned = this.#record ?? this.#tombstone
    if (versioned === null) { return null }
    const { revision_tok, revision_seq } = versioned
    return { revision_tok, revision_seq }
  }

  #nextVersion(): Version {
    return { revision_tok: this.mintRevisionTok(), revision_seq: (this.#cachedVersion()?.revision_seq ?? 0) + 1 }
  }

  protected nextVersionedRecord(patch: Partial<RecordT>): RecordT {
    return this.mergeRecord(this.#record, patch, this.#nextVersion())
  }

  protected nextTombstone(): Tombstone {
    return { ...this.#nextVersion(), deleted: true }
  }

  protected tombstoneForAbsence(anteVersion: Version | null): Tombstone {
    return { revision_tok: anteVersion?.revision_tok ?? '', revision_seq: anteVersion?.revision_seq ?? 0, deleted: true }
  }

  protected isNewerVersion(prev: Version | null, next: Version): boolean {
    return prev === null || next.revision_seq > prev.revision_seq
  }

  // == [Push]: onStoreRing

  readonly #onStoreRing = (): void => {
    this.#trigger.scheduleLaunchNow()
  }

  // == [Storability]: the one precondition and the one drift check, defined by the subclass

  protected abstract ensureTimelyStorability(opts?: StorabilityOpts): Promise<void>
  // protected abstract demandStorability(): void
  demandStorability(): void {
  }
  storability(): boolean {
    return this.world.unlockedAndConsistentWith(this)
  }

  // == [vaultDB, as the subclass maps it]: vaultDBGetSelf, vaultDBPutSelf, vaultDBDelSelf

  protected abstract vaultDBGetSelf(): Promise<Answer<RecordT>>
  protected abstract vaultDBPutSelf(record: RecordT): Promise<Answer<RecordT>>
  protected abstract vaultDBDelSelf(tombstone: Tombstone): Promise<Answer<Tombstone>>

  // == [Hooks a subclass implements]: doSubscribe, doSealForWrite, scopepathOf, sparseOf, mergeRecord, mintRevisionTok, makeSnapshot, isSameSnapshot

  protected abstract doSubscribe(onRing: () => void): () => void
  protected doSealForWrite(record: RecordT): Promise<RecordT> { return Promise.resolve(record) }
  protected abstract scopepathOf(scope: ScopeT): string
  protected abstract sparseOf(record: RecordT): SparseT
  protected abstract mergeRecord(prev: RecordT | null, patch: Partial<RecordT>, version: Version): RecordT
  protected abstract mintRevisionTok(): string
  protected abstract makeSnapshot(): SnapshotT
  protected abstract isSameSnapshot(next: SnapshotT): boolean
}

/** Manages the lifecycle of a storable
 * 'record' is a pojo. 'live' is a class instance.
 * For a given scope have the following, some of which may be the same thing:
 * - a live instance
 * - the most recent fetched record: draft, sparse, full or tombstone
 *   - the most recent fetched *full* record. A tombstone is its own full record.
 * - (not doing this yet) optimistic record
 * - snapshot
 * - cached version
 */
class ListedStorable {



}