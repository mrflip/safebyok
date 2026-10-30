/** A vault's boxes as this device holds them: the box listing, and what it is given to reach the vaultDB, the device cache and the vault. */

import { type RefusalMeta, VaultError } from '../errors'
import type { Whisper } from '../shapes/box'
import { type Boxscope, type VaultScope, boxscope } from '../shapes/scopes'
import { type BoxSnapshot, Box } from './box'
import { Listing, hasRevision } from './listing'
import { type BoxDnaFilled, type BoxRecord, type BoxSparse, type Cache, type Dna, type Fetched, type ListingOpts, type ListingWorld, type Revision, type Store, type Times, BoxFormat, boxDna, boxRecord, boxSparse } from './models-shapes'

// == [Given to a box listing]: BoxWorld, BoxStore, BoxCache, BoxDna, BoxListingOpts

/** The vault, as far as its boxes need it: a {@link ListingWorld}, and the vault's scope and token. */
export type BoxWorld = ListingWorld & { scope: VaultScope, vault_tok: string }

/** The vaultDB's box verbs, as this listing calls them. Mapping the real VaultDB onto these is the later match-up. */
export type BoxStore = Store<Boxscope, BoxRecord, BoxSparse>

/** The device cache of this vault's boxes. */
export type BoxCache = Cache<BoxRecord, BoxSparse>

/** The dna of a box, with the whisper to seal into it once built: what a caller hands `build`, which holds it to {@link boxDna}. */
export type BoxDna = Dna<Boxscope, BoxRecord> & { whisper?: Whisper | undefined }

export type BoxListingOpts = ListingOpts<Boxscope, BoxRecord, BoxSparse> & { world: BoxWorld }
// --

// == [BoxListing]

/** One vault's boxes, by boxlabel. */
export class BoxListing extends Listing<Boxscope, BoxRecord, BoxSparse, BoxSnapshot, Box> {
  declare readonly world: BoxWorld

  constructor(opts: BoxListingOpts) {
    super(opts)
    Object.freeze(this)
  }

  // == [Building]: build

  /** {@link Listing.build}, and for a dna with a whisper, seal it in once built: the constructor takes no whisper. Stores nothing.
   * A record is told from a dna as `Listing.build` tells it, by its `revision_seq`, and keeps its
   * own check there. A dna is held to {@link boxDna} first, refusing 'bad_option', naming the
   * failing field: the props the factory controls are stripped, the defaults filled in.
   */
  override async build(input: BoxDna | Fetched<BoxRecord, BoxSparse>): Promise<Box> {
    if (hasRevision(input)) { return super.build(input) }
    const { whisper, ...dna } = boxDna.parse(input)
    const box = await super.build(dna)
    if (whisper !== undefined) { await box.seal(whisper) }
    return box
  }
  // --

  // == [Defined by the box listing]

  protected scopepathOf(scope: Boxscope): string {
    return ['box', scope.applabel, scope.user_id, scope.vaultlabel, scope.boxlabel].join('^')
  }

  scopeOf(duck: unknown):  Boxscope  { return boxscope.parse(duck) }

  sparseOf(duck: unknown): BoxSparse { return boxSparse.parse(duck) }

  recordOf(duck: unknown): BoxRecord { return boxRecord.parse(duck) }

  // Every dna reaches here through `build`, which holds it to `boxDna`: the defaults are filled there, not here.
  /** The box a dna stages at birth: the dna as {@link boxDna} filled it, under the format, alive, in this vault. No whisper until one is sealed in. */
  protected draftOf(dna: Omit<BoxDnaFilled, 'whisper'> & Revision & Times): BoxSparse | BoxRecord {
    return { ...dna, fmt: BoxFormat, am: 'a', vault_tok: this.world.vault_tok }
  }

  protected makeThing(central: Fetched<BoxRecord, BoxSparse>, staged: Fetched<BoxRecord, BoxSparse> | null): Box {
    return new Box(this.world, this, central, staged, { maxMillisSinceRefresh: this.maxMillisSinceRefresh })
  }

  absentRefusal(scope: Boxscope): VaultError {
    return new VaultError('absent_box', `No box is stored under the label ${scope.boxlabel}.`)
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
