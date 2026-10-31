/** A vault's boxes as this device holds them: the box listing, and what it is given to reach the vaultDB, the device cache and the vault. */

import { type RefusalMeta, VaultError } from '../errors'
import { lockedError } from '../helpers/throwers'
import type { Sidecar } from '../shapes/box'
import { type Boxscope, type VaultScope, boxscope } from '../shapes/scopes'
import { type BoxSnapshot, Box } from './box'
import { Listing, hasRevision } from './listing'
import { type BoxDnaFilled, type BoxRecord, type BoxSparse, type Cache, type Dna, type Fetched, type ListingOpts, type ListingWorld, type Revision, type Store, type Tell, type Times, type WhisperHolder, BoxFormat, boxDna, boxRecord, boxListingOpts, boxSparse } from './models-shapes'
import { stubSeal } from './stub-seal'

// == [Given to a box listing]: BoxWorld, BoxStore, BoxCache, BoxDna, BoxListingOpts

/** The vault, as far as its boxes need it: a {@link ListingWorld}, and the vault's scope and token. */
export type BoxWorld = ListingWorld & { scope: VaultScope, vault_tok: string }

/** The vaultDB's box verbs, as this listing calls them. Mapping the real VaultDB onto these is the later match-up. */
export type BoxStore = Store<Boxscope, BoxRecord, BoxSparse>

/** The device cache of this vault's boxes. */
export type BoxCache = Cache<BoxRecord, BoxSparse>

/** The dna of a box, with the whisper, as its {@link WhisperHolder} `{ val }`, and the sidecar `build` seals, both required: what a caller hands `build`, which holds it to {@link boxDna}. It carries no sealed parts, which only the seal makes. */
export type BoxDna = Omit<Dna<Boxscope, BoxRecord>, 'box_key_wrapped' | 'whisper_ciphered' | 'sidecar'> & { whisper: WhisperHolder, sidecar: Sidecar }

export type BoxListingOpts = ListingOpts<Boxscope, BoxRecord, BoxSparse> & { world: BoxWorld }
// --

// == [BoxListing]

/** One vault's boxes, by boxlabel. */
export class BoxListing extends Listing<Boxscope, BoxRecord, BoxSparse, BoxSnapshot, Box> {
  declare readonly world: BoxWorld

  /** A box listing in `opts.world`, whose vault's scope and `vault_tok` are held to `boxListingOpts`, the rest to the base's check; each refuses 'bad_option'. */
  constructor(opts: BoxListingOpts) {
    boxListingOpts.parse(opts)
    super(opts)
    Object.freeze(this)
  }

  // == [Building]: build, demandUnlocked

  /** {@link Listing.build}, a dna sealed at birth: the box staged is full, the dna's whisper sealed in with its sidecar. Stores nothing.
   * A record is told from a dna as `Listing.build` tells it, by its `revision_seq`, and keeps its
   * own check there. A dna is held to {@link boxDna} first of all, refusing 'bad_option', naming
   * the failing field, a missing whisper or sidecar, or a whisper that is not `{ val }`, among
   * them: the props the factory controls are stripped, the defaults filled in. Then the seal needs
   * the vault unlocked: a sound dna built while it is locked refuses 'vault_locked', holding nothing.
   */
  override async build(input: BoxDna | Fetched<BoxRecord, BoxSparse>): Promise<Box> {
    if (hasRevision(input)) { return super.build(input) }
    const dna = boxDna.parse(input)
    this.#demandUnlocked()
    return super.build(dna)
  }

  /** Refuse 'vault_locked' while the vault is locked, as a box's `demandUnlocked` does. */
  #demandUnlocked(): void { if (this.lockState() === 'locked') { throw lockedError() } }
  // --

  // == [Defined by the box listing]

  protected vaultTokOfWorld(): string { return this.world.vault_tok }

  protected scopepathOf(scope: Boxscope): string {
    return ['box', scope.applabel, scope.user_id, scope.vaultlabel, scope.boxlabel].join('^')
  }

  scopeOf(duck: unknown):  Boxscope  { return boxscope.parse(duck) }

  sparseOf(duck: unknown): BoxSparse { return boxSparse.parse(duck) }

  recordOf(duck: unknown): BoxRecord { return boxRecord.parse(duck) }

  // Every dna reaches here through `build`, which holds it to `boxDna`: the defaults are filled there, not here. The whisper rides in the dna this far, and no further.
  /** The box a dna stages at birth: the dna as {@link boxDna} filled it, under the format, alive, in this vault, sealed by {@link stubSeal} over the dna's whisper. */
  protected draftOf({ whisper, ...dna }: BoxDnaFilled & Revision & Times): Promise<BoxRecord> {
    return stubSeal({ ...dna, fmt: BoxFormat, am: 'a', vault_tok: this.world.vault_tok }, whisper)
  }

  protected makeThing(central: Fetched<BoxRecord, BoxSparse>, staged: Fetched<BoxRecord, BoxSparse> | null, cache: Cache<BoxRecord, BoxSparse>, tell: Tell): Box {
    return new Box(this.world, this, cache, central, staged, { maxMillisSinceRefresh: this.maxMillisSinceRefresh }, tell)
  }

  absentRefusal(scope: Boxscope): VaultError {
    return new VaultError('absent_box', `No box is stored under the label ${this.scopeOf(scope).boxlabel}.`)
  }

  /** The record `meta.box_stored` carries: the full record where it is one, else its sparse form, else null. */
  protected storedInStaleRefusal(err: VaultError): Fetched<BoxRecord, BoxSparse> | null {
    const stored: unknown = err.meta?.box_stored
    const full = boxRecord.safeParse(stored)
    if (full.success) { return full.data }
    const sparse = boxSparse.safeParse(stored)
    return sparse.success ? sparse.data : null
  }

  staleMetaOf(stored: Fetched<BoxRecord, BoxSparse>): RefusalMeta {
    // `RefusalMeta` still names the old box forms; the models' records are the ones `storedInStaleRefusal` takes back.
    return { box_stored: stored as unknown as Required<RefusalMeta>['box_stored'] }
  }
  // --
}
// --
