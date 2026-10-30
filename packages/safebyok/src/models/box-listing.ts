/** A vault's boxes as this device holds them: the box listing, and what it is given to reach the vaultDB, the device cache and the vault. */

import { VaultError } from '../errors'
import { BoxFormat } from './box'
import type { Boxscope, VaultScope } from '../shapes/scopes'
import type { Whisper } from '../shapes/box'
import { type BoxRecord, type BoxSnapshot, type BoxSparse, Box } from './box'
import { type Answer, type FetchOpts, type Notice, Listing } from './listing'
import type { Cacheable, Dna, Fetched, LockState, Revision, TimelyOpts, Times, World } from './models-shapes'

// == [What a box listing is given]: BoxWorld, BoxStore, BoxCache, BoxListingOpts

/** The vault, as far as its boxes need it: the clock, its scope and token, its lock, its own timeliness, and the world an answer carries. */
export type BoxWorld = World & {
  scope:     VaultScope
  vault_tok: string
  lockState(): LockState
  ensureTimely(opts: TimelyOpts): Promise<void>
  takeWorld(world: unknown): void
}

/** The vaultDB's box verbs, as this listing calls them. Mapping the real VaultDB onto these is the later match-up. */
export type BoxStore = {
  getBox(scope: Boxscope): Promise<Answer<BoxRecord, BoxSparse>>
  putBox(record: BoxRecord): Promise<Answer<BoxRecord, BoxSparse>>
  delBox(scope: Boxscope, revision: Revision): Promise<Answer<BoxRecord, BoxSparse>>
  /** `fullFor` names the boxes to push full records for; every other notice is sparse at most. */
  watchBoxes(scope: VaultScope, onNotice: (notice: Notice<BoxRecord, BoxSparse>) => void, fullFor: () => readonly string[]): () => void
}

/** The device cache of this vault's boxes: each box's cacheable form, central and staged as they stood. */
export type BoxCache = {
  loadBoxes(scope: VaultScope): Promise<readonly Cacheable<BoxRecord, BoxSparse>[]>
  saveBox(cacheable: Cacheable<BoxRecord, BoxSparse>): Promise<void>
}

/** The dna of a box, with the whisper to seal into it once built. */
export type BoxDna = Dna<Boxscope, BoxRecord> & { whisper?: Whisper | undefined }

export type BoxListingOpts = {
  world:                 BoxWorld
  store:                 BoxStore
  cache:                 BoxCache
  maxMillisSinceRefresh: number
  onBadNews?:            ((news: VaultError) => void) | undefined
}
// --

// == [BoxListing]

/** One vault's boxes, by boxlabel. */
export class BoxListing extends Listing<Boxscope, BoxRecord, BoxSparse, BoxSnapshot, Box> {
  declare readonly world: BoxWorld

  readonly #store: BoxStore
  readonly #cache: BoxCache
  readonly #maxMillisSinceRefresh: number

  constructor(opts: BoxListingOpts) {
    super({ world: opts.world, onBadNews: opts.onBadNews })
    this.#store = opts.store
    this.#cache = opts.cache
    this.#maxMillisSinceRefresh = opts.maxMillisSinceRefresh
    Object.freeze(this)
  }

  // == [By boxlabel]: box, fetchBox, buildBox

  /** The box held under `boxlabel`, or null. Reads nothing. */
  box(boxlabel: string): Box | null {
    return this.at(this.#scopeFor(boxlabel))
  }

  /** The box under `boxlabel`, hydrated, or what `ifAbsent` says: {@link Listing.fetch} by boxlabel. */
  fetchBox(boxlabel: string, opts: FetchOpts = {}): Promise<Box | null> {
    return this.fetch(this.#scopeFor(boxlabel), opts)
  }

  /** Build a box from `dna`, and seal its whisper in where one is given: the constructor takes no whisper. Stores nothing. */
  async buildBox(dna: BoxDna): Promise<Box> {
    const { whisper, ...rest } = dna
    const box = await this.build(rest)
    if (whisper !== undefined) { await box.seal(whisper) }
    return box
  }

  #scopeFor(boxlabel: string): Boxscope {
    return { ...this.world.scope, boxlabel }
  }
  // --

  // == [What a listing defines]

  protected scopepathOf(scope: Boxscope): string {
    return ['box', scope.applabel, scope.user_id, scope.vaultlabel, scope.boxlabel].join('^')
  }

  protected scopeOfSparse(sparse: BoxSparse): Boxscope {
    const { applabel, user_id, vaultlabel, boxlabel } = sparse
    return { applabel, user_id, vaultlabel, boxlabel }
  }

  /** The box a dna stages at birth: the dna over the sparse defaults, an empty sidecar among them. No whisper until one is sealed in. */
  protected draftOf(dna: Dna<Boxscope, BoxRecord> & Revision & Times): BoxSparse {
    return { fmt: BoxFormat, am: 'a', vault_tok: this.world.vault_tok, whisper_codec: 'json_v1', whisper_schema_version: 1, sidecar: {}, ...dna }
  }

  protected makeThing(central: Fetched<BoxRecord, BoxSparse>, staged: Fetched<BoxRecord, BoxSparse>): Box {
    return new Box({ world: this.world, listing: this, central, staged, maxMillisSinceRefresh: this.#maxMillisSinceRefresh })
  }

  absentRefusal(scope: Boxscope): VaultError {
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

  protected storedInStaleRefusal(err: VaultError): Fetched<BoxRecord, BoxSparse> | null {
    const stored: unknown = err.meta?.box_stored
    return isBoxSparse(stored) ? stored : null
  }

  protected storeGet(scope: Boxscope): Promise<Answer<BoxRecord, BoxSparse>> {
    return this.#store.getBox(scope)
  }

  protected storePut(record: BoxRecord): Promise<Answer<BoxRecord, BoxSparse>> {
    return this.#store.putBox(record)
  }

  protected storeDel(scope: Boxscope, revision: Revision): Promise<Answer<BoxRecord, BoxSparse>> {
    return this.#store.delBox(scope, revision)
  }

  protected watchStore(onNotice: (notice: Notice<BoxRecord, BoxSparse>) => void): () => void {
    return this.#store.watchBoxes(this.world.scope, onNotice, () => this.hydratedThings.map((box) => box.boxlabel))
  }

  protected loadCached(): Promise<readonly Cacheable<BoxRecord, BoxSparse>[]> {
    return this.#cache.loadBoxes(this.world.scope)
  }

  protected saveCached(cacheable: Cacheable<BoxRecord, BoxSparse>): Promise<void> {
    return this.#cache.saveBox(cacheable)
  }
  // --
}
// --

// == [Helpers]: isBoxSparse

// A placeholder for the sparse record's validator, which the match-up with shapes/box brings.
const isBoxSparse = (val: unknown): val is BoxSparse => (
  typeof val === 'object' && val !== null && 'boxlabel' in val && 'revision_seq' in val && 'revision_tok' in val && 'am' in val
)
// --
