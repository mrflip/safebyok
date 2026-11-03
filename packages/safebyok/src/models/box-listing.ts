/** A vault's boxes as this device holds them: the box listing, and what it is given to reach the vaultDB and the vault. */

import { makeLifeTok } from '../crypto'
import { VaultError } from '../errors'
import { lockedError } from '../helpers/throwers'
import { type Outcome, outcomeOf } from '../outcome'
import type { Sidecar } from '../shapes/box'
import { type Boxscope, type VaultScope, boxscope } from '../shapes/scopes'
import { type BoxSnapshot, Box, sealedRecordOf } from './box'
import type { Lease } from './lease'
import { Listing } from './listing'
import { type BoxRecord, type BoxSparse, type Dna, type Fetched, type ListingOpts, type ListingWorld, type Store, type WhisperHolder, BoxFormat, boxDna, boxRecord, boxSparse } from './models-shapes'
import * as MSX from './models-shapes'

// == [Given to a box listing]: BoxLease, BoxWorld, BoxStore, BoxDna, BoxListingOpts

/** The vault's lease, as far as its boxes need it: the seal and the unseal. */
export type BoxLease = Pick<Lease, 'sealWith' | 'unsealWith'>

/** The vault, as far as its boxes need it: a {@link ListingWorld}, the vault's scope and token, and its lease, taken at each seal and unseal and never kept, which refuses 'vault_locked' while the vault is locked. */
export type BoxWorld = ListingWorld & { scope: VaultScope, vault_tok: string, demandLease(): BoxLease }

/** The vaultDB's box verbs, as this listing calls them. Mapping the real VaultDB onto these is the later match-up. */
export type BoxStore = Store<Boxscope, BoxRecord, BoxSparse>

/** The dna of a box, with the whisper, as its {@link WhisperHolder} `{ val }`, and the sidecar `create` seals, both required: what a caller hands `create`, which holds it to {@link boxDna}. It carries no sealed parts, which only the seal makes. */
export type BoxDna = Omit<Dna<Boxscope, BoxRecord>, 'box_key_wrapped' | 'whisper_ciphered' | 'sidecar'> & { whisper: WhisperHolder, sidecar: Sidecar }

export type BoxListingOpts = ListingOpts<Boxscope, BoxRecord, BoxSparse> & { world: BoxWorld }
// --

// == [BoxListing]

/** One vault's boxes, by boxlabel. */
export class BoxListing extends Listing<Boxscope, BoxRecord, BoxSparse, BoxSnapshot, Box> {
  declare readonly world: BoxWorld

  /** A box listing in `opts.world`, whose vault's scope and `vault_tok` are held to `boxListingOpts`, the rest to the base's check; each refuses 'bad_option'. */
  constructor(opts: BoxListingOpts) {
    MSX.boxListingOpts.parse(opts)
    super(opts)
    Object.freeze(this)
  }

  // == [Birth]: create, tryCreate, demandUnlocked

  /** Seal the box of `input`, under a `box_tok` fresh from {@link makeLifeTok}, and store it over no record; resolves the instance held once it lands. Refuses 'bad_option', naming the field, a dna that fails {@link boxDna}; 'vault_locked' while the vault is locked, the seal's end included; 'bad_option' a scope already held; and 'stale_write' where storage holds a record, delivered first. */
  async create(input: BoxDna): Promise<Box> {
    const dna = boxDna.parse(input)
    this.#demandUnlocked()
    this.demandNotHeld(dna)
    const { whisper, sidecar, ...sparse } = this.stampDna(dna)
    const draft = await sealedRecordOf(this.world.demandLease(), { ...sparse, fmt: BoxFormat, am: 'a', vault_tok: this.world.vault_tok, box_tok: makeLifeTok() }, sidecar, whisper)
    this.#demandUnlocked()
    return this.putDraft(draft)
  }

  tryCreate(input: BoxDna): Promise<Outcome<Box>> { return outcomeOf(() => this.create(input)) }

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

  protected makeThing(central: Fetched<BoxRecord, BoxSparse>): Box {
    return new Box(this.world, this, central, { maxMillisSinceRefresh: this.maxMillisSinceRefresh })
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
  // --
}
// --
