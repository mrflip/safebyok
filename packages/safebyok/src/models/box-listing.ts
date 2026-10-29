import { VaultError } from '../errors'
import { type BoxRecord, type BoxScope, type BoxSnapshot, type BoxSparse, Box, BoxFormat } from './box'
import { type Answer, type FetchOpts, type Notice, Listing } from './listing'
import { type Draft, type Fetched, type LockState, type Revision, type TimelyOpts, type Times, type Tombstone, type World } from './storable'

// == [What a box listing is given]: VaultScope, BoxWorld, BoxStore, BoxCache

export type VaultScope = Readonly<{ applabel: string, user_id: string, vaultlabel: string }>

// The vault, as far as its boxes need it: the one clock, its scope, its lock, its own timeliness, and its ear
// for the world an answer carries.
export type BoxWorld = World & {
  scope:     VaultScope
  lockState(): LockState
  ensureTimely(opts: TimelyOpts): Promise<void>
  takeWorld(world: unknown): void
}

// The vaultDB's box verbs, as this listing calls them. Mapping the real VaultDB onto these is the later match-up.
export type BoxStore = {
  getBox(scope: BoxScope): Promise<Answer<BoxScope, BoxRecord, BoxSparse>>
  putBox(record: BoxRecord): Promise<Answer<BoxScope, BoxRecord, BoxSparse>>
  delBox(tombstone: Tombstone<BoxScope>): Promise<Answer<BoxScope, BoxRecord, BoxSparse>>
  // `fullFor` names the boxes to push full records for; every other notice is sparse at most.
  watchBoxes(scope: VaultScope, onNotice: (notice: Notice<BoxScope, BoxRecord, BoxSparse>) => void, fullFor: () => readonly string[]): () => void
}

// The device cache of this vault's boxes: the sparse forms and tombstones, never a whisper.
export type BoxCache = {
  loadBoxes(scope: VaultScope): Promise<readonly (BoxSparse | Tombstone<BoxScope>)[]>
  saveBox(cacheable: BoxSparse | Tombstone<BoxScope>): Promise<void>
}

export type BoxListingOpts = {
  world:                  BoxWorld
  store:                  BoxStore
  cache:                  BoxCache
  maxMillisSinceRefresh:  number
  onBadNews?:             ((news: VaultError) => void) | undefined
}

// == [BoxListing]

export class BoxListing extends Listing<BoxScope, BoxRecord, BoxSparse, BoxSnapshot, Box> {
  declare readonly world: BoxWorld

  readonly #store: BoxStore
  readonly #cache: BoxCache
  readonly #maxMillisSinceRefresh: number

  constructor(opts: BoxListingOpts) {
    super({ world: opts.world, onBadNews: opts.onBadNews })
    this.#store = opts.store
    this.#cache = opts.cache
    this.#maxMillisSinceRefresh = opts.maxMillisSinceRefresh
  }

  // == [By boxlabel]: box, fetchBox

  box(boxlabel: string): Box | null {
    return this.at(this.#scopeFor(boxlabel))
  }

  fetchBox(boxlabel: string, opts: FetchOpts = {}): Promise<Box | null> {
    return this.fetch(this.#scopeFor(boxlabel), opts)
  }

  #scopeFor(boxlabel: string): BoxScope {
    return { ...this.world.scope, boxlabel }
  }

  // == [The vault locked]: forgetWhispers

  forgetWhispers(): void {
    for (const box of this.things) { box.forgetWhisper() }
  }

  // == [What a listing defines]

  protected scopepathOf(scope: BoxScope): string {
    return ['box', scope.applabel, scope.user_id, scope.vaultlabel, scope.boxlabel].join('^')
  }

  protected scopeOfSparse(sparse: BoxSparse): BoxScope {
    const { applabel, user_id, vaultlabel, boxlabel } = sparse
    return { applabel, user_id, vaultlabel, boxlabel }
  }

  protected recordOfDraft(draft: Draft<BoxScope, BoxRecord> & Revision & Times): BoxRecord {
    return { format: BoxFormat, sidecar: {}, box_key_wrapped: '', whisper_codec: 'json_v1', whisper_schema_version: 1, whisper_ciphered: '', ...draft }
  }

  protected makeThing(central: Fetched<BoxScope, BoxRecord, BoxSparse>): Box {
    return new Box(central, { listing: this, maxMillisSinceRefresh: this.#maxMillisSinceRefresh })
  }

  absentRefusal(scope: BoxScope): VaultError {
    return new VaultError('absent_box', `No box is stored under the label ${scope.boxlabel}.`)
  }

  lockState(): LockState {
    return this.world.lockState()
  }

  ensureTimelyWorld(opts: TimelyOpts): Promise<void> {
    return this.world.ensureTimely(opts)
  }

  protected takeWorld(world: unknown): void {
    this.world.takeWorld(world)
  }

  protected storedInStaleRefusal(err: VaultError): Fetched<BoxScope, BoxRecord, BoxSparse> | null {
    const stored: unknown = err.meta?.box_stored
    return isBoxSparse(stored) ? stored : null
  }

  protected storeGet(scope: BoxScope): Promise<Answer<BoxScope, BoxRecord, BoxSparse>> {
    return this.#store.getBox(scope)
  }

  protected storePut(record: BoxRecord): Promise<Answer<BoxScope, BoxRecord, BoxSparse>> {
    return this.#store.putBox(record)
  }

  protected storeDel(tombstone: Tombstone<BoxScope>): Promise<Answer<BoxScope, BoxRecord, BoxSparse>> {
    return this.#store.delBox(tombstone)
  }

  protected watchStore(onNotice: (notice: Notice<BoxScope, BoxRecord, BoxSparse>) => void): () => void {
    return this.#store.watchBoxes(this.world.scope, onNotice, () => this.hydratedThings.map((box) => box.boxlabel))
  }

  protected loadCached(): Promise<readonly Fetched<BoxScope, BoxRecord, BoxSparse>[]> {
    return this.#cache.loadBoxes(this.world.scope)
  }

  protected saveCached(cacheable: BoxSparse | Tombstone<BoxScope>): Promise<void> {
    return this.#cache.saveBox(cacheable)
  }
}

// == [Helpers]: isBoxSparse

const isBoxSparse = (val: unknown): val is BoxSparse => (
  typeof val === 'object' && val !== null && 'boxlabel' in val && 'revision_seq' in val && 'revision_tok' in val
)
