/** A vault's boxes as this device holds them: the box listing, and what it is given to reach the vaultDB, the device cache and the vault. */

import { VaultError } from '../errors'
import type { Whisper } from '../shapes/box'
import { type Boxscope, type VaultScope, boxscope } from '../shapes/scopes'
import { type BoxSnapshot, Box } from './box'
import { Listing } from './listing'
import { type BoxRecord, type BoxSparse, type Cache, type Dna, type Fetched, type ListingOpts, type ListingWorld, type Revision, type Store, type Times, BoxFormat, boxRecord, boxSparse } from './models-shapes'

// == [What a box listing is given]: BoxWorld, BoxStore, BoxCache, BoxDna, BoxListingOpts

/** The vault, as far as its boxes need it: a {@link ListingWorld}, and the vault's scope and token. */
export type BoxWorld = ListingWorld & { scope: VaultScope, vault_tok: string }

/** The vaultDB's box verbs, as this listing calls them. Mapping the real VaultDB onto these is the later match-up. */
export type BoxStore = Store<Boxscope, BoxRecord, BoxSparse>

/** The device cache of this vault's boxes. */
export type BoxCache = Cache<BoxRecord, BoxSparse>

/** The dna of a box, with the whisper to seal into it once built. */
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

  /** {@link Listing.build}, and for a dna with a whisper, seal it in once built: the constructor takes no whisper. Stores nothing. */
  override async build(input: BoxDna | Fetched<BoxRecord, BoxSparse>): Promise<Box> {
    if (! ('whisper' in input) || input.whisper === undefined) { return super.build(input) }
    const { whisper, ...dna } = input
    const box = await super.build(dna)
    await box.seal(whisper)
    return box
  }
  // --

  // == [What a listing defines]

  protected scopepathOf(scope: Boxscope): string {
    return ['box', scope.applabel, scope.user_id, scope.vaultlabel, scope.boxlabel].join('^')
  }

  scopeOf(duck: unknown):  Boxscope  { return boxscope.parse(duck) }

  sparseOf(duck: unknown): BoxSparse { return boxSparse.parse(duck) }

  recordOf(duck: unknown): BoxRecord { return boxRecord.parse(duck) }

  /** The box a dna stages at birth: the dna over the sparse defaults, with an empty sidecar for the seal to bind. No whisper until one is sealed in. */
  protected draftOf(dna: Dna<Boxscope, BoxRecord> & Revision & Times): BoxSparse | BoxRecord {
    return { fmt: BoxFormat, am: 'a', vault_tok: this.world.vault_tok, whisper_codec: 'json_v1', whisper_schema_version: 1, sidecar: {}, ...dna }
  }

  protected makeThing(central: Fetched<BoxRecord, BoxSparse>, staged: Fetched<BoxRecord, BoxSparse> | null): Box {
    return new Box(this.world, this, central, staged, { maxMillisSinceRefresh: this.maxMillisSinceRefresh })
  }

  absentRefusal(scope: Boxscope): VaultError {
    return new VaultError('absent_box', `No box is stored under the label ${scope.boxlabel}.`)
  }

  /** What `meta.box_stored` carries: the full record where it is one, else its sparse form, else null. */
  protected storedInStaleRefusal(err: VaultError): Fetched<BoxRecord, BoxSparse> | null {
    const stored: unknown = err.meta?.box_stored
    const full = boxRecord.safeParse(stored)
    if (full.success) { return full.data }
    const sparse = boxSparse.safeParse(stored)
    return sparse.success ? sparse.data : null
  }
  // --
}
// --
