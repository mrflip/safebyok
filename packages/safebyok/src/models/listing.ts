/** The base of a box listing and a vault listing: the live instances of one kind of thing, the watch on storage, and every storage call made for that kind of thing. */

import { randomId } from '../crypto'
import { VaultError, isVaultError } from '../errors'
import type { Answer, GoodAnswer, Notice as VaultDBNotice, VaultDB } from '../storage/vault-db-new'
import type { BoxRow, DelOpts, PutOpts, VaultRow } from '../storage/vault-db-shapes'
import * as VS from '../storage/vault-db-shapes'
import { alreadyHeldError, disabledError } from '../helpers/throwers'
import * as Phrases from '../phrases'
import { type Outcome, outcomeOf } from '../outcome'
import { reportToPlatform } from '../report-error'
import type { Clock } from '../shapes/bank-opts'
import { type Fetched, type FetchOpts, type IfAbsent, type ListingOpts, type ListingWorld, type LockState, type PutListingOpts, type Revision, type SparseBase, type Times, type Tombstone, IsListing, NeverStoredSeq } from './models-shapes'
import * as MSX from './models-shapes'
import type { Storable } from './storable'

type Thing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>> = Storable<ScopeT, RecordT, SparseT, unknown>

/** The answer of a vaultDB verb, as a listing delivers it: a record in any form, or null for nothing stored, or a refusal. */
export type ListingAnswer<RecordT, SparseT> = Answer<Fetched<RecordT, SparseT> | null, string, unknown>

/** The tombstone `listing.del` hands the vaultDB: gone, at the revision after the one it goes over. */
export type DelTombstone<SparseT> = SparseT & Readonly<{ am: 'x' }>

/** The fate of a record meeting the thing in its slot: `receive` takes it in, `lose` drops it unheard, and `replace` gives the slot a new instance of it. */
export type SlotFate = 'receive' | 'lose' | 'replace'
// --

// == [Listing]

/** SLOPDOC: The live instances of one kind of thing, by scope, each made once and held, as its tombstone once gone. */
export abstract class Listing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, SnapshotT, ThingT extends Storable<ScopeT, RecordT, SparseT, SnapshotT>> {
  readonly world: ListingWorld
  /** The refresh horizon of each thing made here. */
  protected readonly maxMillisSinceRefresh: number
  protected readonly vaultDB: VaultDB

  readonly #things    = new Map<string, ThingT>()
  readonly #listeners = new Set<() => void>()
  readonly #onBadNews: ((news: VaultError) => unknown) | null
  #snapshot: readonly SnapshotT[] = Object.freeze([])
  #unwatch:  (() => void) | null = null
  /** Set by a sweep or a vacate, and never cleared. */
  #isDisabled = false

  constructor(opts: ListingOpts) {
    MSX.listingOpts.parse(opts)
    this.world = opts.world
    this.vaultDB = opts.vaultDB
    this.maxMillisSinceRefresh = opts.maxMillisSinceRefresh
    this.#onBadNews = opts.onBadNews ?? null
  }

  get clock(): Clock { return this.world.clock }

  /** The tag a storable's constructor checks for. */
  readonly [IsListing] = true as const

  lockState(): LockState { return this.world.lockState() }

  /** The world refreshed within `maxMillis`, by default its own horizon. */
  async ensureTimelyWorld(maxMillis?: number): Promise<void> { await this.world.ensureTimely(MSX.maxMillis.parse(maxMillis)) }

  // == [Starting and ending]: hello, goodbye, lock, settleThings, sweep, vacate, unlist, demandEnabled

  /** Start the watch. */
  async hello(): Promise<void> { // eslint-disable-line @typescript-eslint/require-await -- async so that a refusal rejects
    this.demandEnabled()
    this.#unwatch ??= this.watchRows(this.#onNotice)
  }

  /** End the watch. The instances stay as they are. */
  goodbye(): void {
    this.#unwatch?.()
    this.#unwatch = null
  }

  /** Lock each thing held. */
  lock(): this {
    for (const thing of this.things) { thing.lock() }
    return this
  }

  /** Bring each thing's snapshot up to the lock just moved, telling its listeners. */
  settleThings(): void {
    for (const thing of this.things) { thing.settle() }
  }

  /** End the watch, sweep each thing, and take no further calls. A repeat is a no-op. Never throws. */
  sweep(): this { return this.#disable((thing) => { thing.sweep() }) }

  /** End the watch, vacate each thing, and take no further calls. A repeat is a no-op. Never throws. */
  vacate(): this { return this.#disable((thing) => { thing.vacate() }) }

  #disable(discard: (thing: ThingT) => void): this {
    if (this.#isDisabled) { return this }
    this.#isDisabled = true
    this.goodbye()
    for (const thing of this.things) { discard(thing) }
    return this
  }

  /** Stop holding `thing`, as its own discard asks: the slot empties only for this very instance. */
  unlist(thing: Thing<ScopeT, RecordT, SparseT>): void {
    const scopepath = this.scopepathOf(this.scopeOf(thing))
    const held: Thing<ScopeT, RecordT, SparseT> | undefined = this.#things.get(scopepath)
    if (held !== thing) { return }
    this.#things.delete(scopepath)
    this.#remakeSnapshot()
  }

  /** Demands that this listing be enabled: not past a sweep or a vacate. */
  demandEnabled(): this {
    if (this.#isDisabled) { throw disabledError() }
    return this
  }
  // --

  // == [Listing verbs]: at, things, build, demandNotHeld

  /** The instance held under `scope`, or null. Calls nothing. */
  at(scope: ScopeT): ThingT | null {
    return this.#things.get(this.scopepathOf(this.scopeOf(scope))) ?? null
  }

  get things(): readonly ThingT[] { return [...this.#things.values()] }

  /** The instance of `record`, sparse, full or a tombstone, once it is delivered as a fetch's answer would be, and held; a thing already held under its scope receives it. Stores nothing. */
  async build(record: Fetched<RecordT, SparseT>): Promise<ThingT> { // eslint-disable-line @typescript-eslint/require-await -- async so that a refusal rejects
    this.demandEnabled()
    this.sparseOf(record)
    return this.#buildOrReceive(this.scopeOf(record), record)
  }

  /** Demands that no instance be held under `scope`, for a birth. A box's `send` brings one deleted back to life. */
  protected demandNotHeld(scope: ScopeT): void {
    if (this.at(scope) !== null) { throw alreadyHeldError() }
  }
  // --

  // == [Storage verbs]: fetch, put, putDraft, del, delOver

  /** SLOPDOC: The instance under `scope` as storage now holds it, built where none was held. */
  async fetch(scope: ScopeT, opts: FetchOpts = {}): Promise<ThingT | null> {
    const { ifAbsent = 'fail', maxWorldMillis } = MSX.fetchOpts.parse(opts)
    const asked = this.scopeOf(scope)
    await this.ensureTimelyWorld(maxWorldMillis)
    this.demandEnabled()
    return this.deliver(await this.tryGetRow(asked), ifAbsent)
  }

  tryFetch(scope: ScopeT, opts: FetchOpts = {}): Promise<Outcome<ThingT | null>> { return outcomeOf(() => this.fetch(scope, opts)) }

  /** SLOPDOC: Stores `duck` over `ante`'s revision and delivers storage's answer to the instance. */
  async put(duck: RecordT | Thing<ScopeT, RecordT, SparseT>, ante: Revision | null, opts: PutListingOpts = {}): Promise<ThingT | null> {
    const record = this.recordOf(duck)
    const { ifPresent = 'repl' } = MSX.putListingOpts.parse(opts)
    const prior = priorOf(MSX.putAnte.parse(ante))
    this.demandEnabled()
    return this.deliver(await this.tryPutRow(record, { prior, ifPresent }))
  }

  tryPut(duck: RecordT | Thing<ScopeT, RecordT, SparseT>, ante: Revision | null, opts: PutListingOpts = {}): Promise<Outcome<ThingT | null>> { return outcomeOf(() => this.put(duck, ante, opts)) }

  /** Put `draft`, a birth, over `ante`: the instance it makes is held once it lands, and a refused put holds only what its answer delivered. */
  protected async putDraft(draft: RecordT, ante: Revision | null = null, opts: PutListingOpts = {}): Promise<ThingT> {
    const thing = await this.put(draft, ante, opts)
    if (thing === null) { throw this.nothingStoredError(this.scopeOf(draft)) }
    return thing
  }

  /** SLOPDOC: Deletes the thing `duck` names and delivers storage's answer: its tombstone, if anything was stored. */
  async del(duck: SparseT | Thing<ScopeT, RecordT, SparseT>): Promise<ThingT | null> {
    const scope = this.scopeOf(duck)
    const held = (duck.am === 'd') ? null : this.at(scope)
    return this.delOver(held?.sparse ?? this.sparseOf(duck))
  }

  /** A tombstone over `sparse`'s own revision, and its answer delivered. */
  protected async delOver(sparse: SparseT): Promise<ThingT | null> {
    this.demandEnabled()
    const prior = priorOf(sparse)
    const tombstone = { ...sparse, ...VS.nextRevisionOf(prior, this.clock.now()), am: 'x' as const }
    return this.deliver(await this.tryDelRow(tombstone, { prior }))
  }

  tryDel(duck: SparseT | Thing<ScopeT, RecordT, SparseT>): Promise<Outcome<ThingT | null>> { return outcomeOf(() => this.del(duck)) }
  // --

  // == [Delivering an answer]: deliver, buildOrReceive, makeThingOf, hold, neverStoredOf

  /** SLOPDOC: The pipeline every storage answer takes, from its world through the instance held to the caller. */
  protected async deliver(answer: ListingAnswer<RecordT, SparseT>, ifAbsent?: IfAbsent): Promise<ThingT | null> {
    if (answer.world !== null) { this.world.takeWorld(answer.world) }
    if (answer.ok) {
      const scope = this.scopeOf(answer.req_params)
      const record = recordOfAnswer<RecordT, SparseT>(answer)
      const thing = this.#buildOrReceive(scope, record)
      if (ifAbsent === 'fail') {
        if (thing === null) { throw this.nothingStoredError(scope) }
        thing.demandPresent()
      }
      return (ifAbsent === 'nil' && thing?.isPresent !== true) ? null : thing
    }
    const stored = (answer.dbhas ?? null) as Fetched<RecordT, SparseT> | null
    if ((stored !== null) && this.isRefusalOfRow(answer.err)) {
      const delivered = await outcomeOf(() => this.#buildOrReceive(this.scopeOf(answer.req_params), stored))
      if (! delivered.ok) { this.tellBadNews([delivered.err]) }
    }
    this.tellIfRevoked(answer.err)
    throw answer.err
  }

  // The one place an instance is made and held: `#makeThingOf` is called from here alone, and only where no instance is held.
  /** SLOPDOC: Brings the instance under `scope` up to `record`, building or replacing it as the record's fate says. */
  #buildOrReceive(scope: ScopeT, record: Fetched<RecordT, SparseT>): ThingT
  #buildOrReceive(scope: ScopeT, record: Fetched<RecordT, SparseT> | null): ThingT | null
  #buildOrReceive(scope: ScopeT, record: Fetched<RecordT, SparseT> | null): ThingT | null {
    this.demandEnabled()
    const held = this.at(scope)
    if (record !== null) { this.#demandRecordOfScope(record, scope) }
    const fate = (held === null || record === null) ? 'receive' : this.fateOver(held, record)
    if (fate === 'lose') { return held }
    const thing = ((fate === 'replace') ? null : held) ?? this.#makeThingOf(record)
    if (thing === null) { return null }
    this.tellBadNews(thing.receive(record).badnews)
    if (thing !== held) {
      this.#hold(thing)
      held?.vacate()
    }
    this.#remakeSnapshot()
    return thing
  }

  /** Demands a `record` whose scope is `scope`, the one the answer that carries it names. */
  #demandRecordOfScope(record: Fetched<RecordT, SparseT>, scope: ScopeT): void {
    if (this.scopepathOf(this.scopeOf(record)) !== this.scopepathOf(scope)) { throw new VaultError('bad_record', Phrases.RecordOfOtherScope) }
  }

  /** SLOPDOC: A new instance for `record`, born of its sparse form so `receive` adopts it like any newer record. */
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

  /** SLOPDOC: Delivers a watch notice of this listing's kind like a good answer, making any refusal bad news. */
  readonly #onNotice = (notice: VaultDBNotice): void => {
    const { val, world } = notice
    if (this.#isDisabled || ! this.isOwnRow(val)) { return }
    void (async () => {
      const { ok, err } = await outcomeOf(() => {
        this.world.takeWorld(world)
        return this.#isDisabled ? null : this.#buildOrReceive(this.scopeOf(val), val)
      })
      if (! ok) { this.tellBadNews([err]) }
    })()
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
    for (const listener of this.#listeners) {
      try {
        listener()
      } catch (err) {
        reportToPlatform(err)
      }
    }
  }
  // --

  // == [Bad news]: tellBadNews, tellIfRevoked

  /** SLOPDOC: Tells bad news no caller waits on to the host's `onBadNews`, whose failures reach only the platform. */
  tellBadNews(badnews: readonly VaultError[]): void {
    const onBadNews = this.#onBadNews
    if (onBadNews === null) { return }
    for (const news of badnews) {
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

  /** A refusal of the vaultDB's on its way to a caller: 'identity_revoked' is news to the bank as well, heard before the caller hears it. */
  protected tellIfRevoked(refusal: VaultError): void {
    if (isVaultError(refusal, 'identity_revoked')) { this.tellBadNews([refusal]) }
  }
  // --

  // == [Helpers]: stampDna

  /** `dna` under revision 0, the first a thing earns, and the times of now. */
  protected stampDna<DnaT extends object>(dna: DnaT): DnaT & Revision & Times {
    const now = this.clock.now()
    return { ...dna, revision_tok: randomId(), revision_seq: 0, registered_at: now, written_at: now }
  }
  // --

  // == [Defined by the concrete listing]: fateOver, vaultTokOfWorld, scopepathOf, scopeOf, sparseOf, recordOf, makeThing, nothingStoredError, tryGetRow, tryPutRow, tryDelRow, watchRows, isOwnRow

  /** The fate of `record` meeting `held`, the thing in its slot: by default its `receive` takes it in. */
  protected fateOver(_held: ThingT, _record: Fetched<RecordT, SparseT>): SlotFate { return 'receive' }

  /** True where `err` is about this very row, so the `dbhas` it carries is delivered before it is thrown. */
  protected isRefusalOfRow({ refusalkind }: VaultError): boolean { return (refusalkind === 'stale_write') || (refusalkind === 'camped') }
  /** The `vault_tok` every record of this listing lies under, being the vault's own; null for a listing whose records make their own, as a vault's do. */
  protected abstract vaultTokOfWorld(): string | null
  protected abstract scopepathOf(scope: ScopeT): string
  /** The scope of `duck`, a record in any form or a thing ducking as one. */
  abstract scopeOf(duck: unknown): ScopeT
  /** The sparse form of `duck`, a record in any form or a thing ducking as one, as a plain copy with the payload left out. */
  abstract sparseOf(duck: unknown): SparseT
  /** The full record `duck` is, as a plain copy. */
  abstract recordOf(duck: unknown): RecordT
  protected abstract makeThing(central: Fetched<RecordT, SparseT>): ThingT
  /** The refusal for a scope where storage holds no row and no instance is held. */
  protected abstract nothingStoredError(scope: ScopeT): VaultError
  /** The vaultDB's get of this kind of thing, answering null for nothing stored. */
  protected abstract tryGetRow(scope: ScopeT): Promise<ListingAnswer<RecordT, SparseT>>
  protected abstract tryPutRow(record: RecordT, opts: PutOpts): Promise<ListingAnswer<RecordT, SparseT>>
  protected abstract tryDelRow(tombstone: DelTombstone<SparseT>, opts: DelOpts): Promise<ListingAnswer<RecordT, SparseT>>
  /** Start the vaultDB's watch over this listing's scope; returns how to stop. */
  protected abstract watchRows(onNotice: (notice: VaultDBNotice) => void): () => void
  /** True for a row this listing holds: the vaultDB's watch tells of a vault's rows and its boxes' alike. */
  protected abstract isOwnRow(row: VaultRow | BoxRow): row is (VaultRow | BoxRow) & Fetched<RecordT, SparseT>
  // --
}
// --

// == [Helpers]: priorOf, recordOfAnswer

/** The revision a vaultDB verb goes over: `ante`'s, or never stored for none. */
const priorOf = (ante: Revision | null): Revision => ((ante === null || ante.revision_seq === NeverStoredSeq) ? VS.NeverStored : VS.revisionOf(ante))

/** The record a good answer delivers: its `val`, or the tombstone in `dbhas` where it answers null; null for nothing stored, as a del's `void` is, whose `val` is a sentinel. */
const recordOfAnswer = <RecordT, SparseT>(answer: GoodAnswer<Fetched<RecordT, SparseT> | null, string, unknown>): Fetched<RecordT, SparseT> | null => {
  if (answer.act === 'void') { return null }
  return answer.val ?? (answer.dbhas as Fetched<RecordT, SparseT> | null | undefined) ?? null
}
// --
