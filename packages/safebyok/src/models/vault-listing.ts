/** A bank's vaults as this device holds them: the vault listing, and what it is given to reach the vaultDB, the device cache and the bank. */

import { randomId } from '../crypto'
import { type RefusalMeta, VaultError } from '../errors'
import { type BankScope, type VaultScope, vaultScope } from '../shapes/scopes'
import { Listing } from './listing'
import { type Cache, type Dna, type Fetched, type ListingOpts, type ListingWorld, type Revision, type Store, type Tell, type Times, type VaultRecord, type VaultSparse, VaultFormat, vaultRecord, vaultSparse } from './models-shapes'
import { type VaultSnapshot, Vault } from './vault'

// == [Given to a vault listing]: VaultWorld, VaultStore, VaultCache, VaultDna, VaultListingOpts

/** The bank, as far as its vaults need it: a {@link ListingWorld}, and the bank's scope. */
export type VaultWorld = ListingWorld & { scope: BankScope }

/** The vaultDB's vault verbs, as this listing calls them. Mapping the real VaultDB onto these is the later match-up. */
export type VaultStore = Store<VaultScope, VaultRecord, VaultSparse>

/** The device cache of this bank's vaults. */
export type VaultCache = Cache<VaultRecord, VaultSparse>

/** The dna of a vault: its scope. */
export type VaultDna = Dna<VaultScope, VaultRecord>

export type VaultListingOpts = ListingOpts<VaultScope, VaultRecord, VaultSparse> & { world: VaultWorld }
// --

// == [VaultListing]

/** One bank's vaults, by vaultlabel. */
export class VaultListing extends Listing<VaultScope, VaultRecord, VaultSparse, VaultSnapshot, Vault> {
  declare readonly world: VaultWorld

  constructor(opts: VaultListingOpts) {
    super(opts)
    Object.freeze(this)
  }

  // == [Defined by the vault listing]

  protected vaultTokOfWorld(): null { return null }

  protected scopepathOf(scope: VaultScope): string {
    return ['vault', scope.applabel, scope.user_id, scope.vaultlabel].join('^')
  }

  scopeOf(duck: unknown):  VaultScope  { return vaultScope.parse(duck) }

  sparseOf(duck: unknown): VaultSparse { return vaultSparse.parse(duck) }

  recordOf(duck: unknown): VaultRecord { return vaultRecord.parse(duck) }

  /** The vault a dna stages at birth: the dna under a `vault_tok` minted here, the life this vault takes if storage holds none. */
  protected draftOf(dna: Dna<VaultScope, VaultRecord> & Revision & Times): Promise<VaultRecord> {
    return Promise.resolve({ ...dna, fmt: VaultFormat, am: 'a', vault_tok: randomId() })
  }

  protected makeThing(central: Fetched<VaultRecord, VaultSparse>, staged: Fetched<VaultRecord, VaultSparse>, cache: Cache<VaultRecord, VaultSparse>, tell: Tell): Vault {
    return new Vault(this.world, this, cache, central, staged, { maxMillisSinceRefresh: this.maxMillisSinceRefresh }, tell)
  }

  absentRefusal(scope: VaultScope): VaultError {
    return new VaultError('absent_vault', `No vault is stored under the label ${scope.vaultlabel}.`)
  }

  /** The record `meta.vault_stored` carries, where it is a record of these forms; else null. */
  protected storedInStaleRefusal(err: VaultError): Fetched<VaultRecord, VaultSparse> | null {
    const stored: unknown = err.meta?.vault_stored
    const full = vaultRecord.safeParse(stored)
    return full.success ? full.data : null
  }

  staleMetaOf(stored: Fetched<VaultRecord, VaultSparse>): RefusalMeta {
    // `RefusalMeta` still names the old vault record; the models' records are the ones `storedInStaleRefusal` takes back.
    return { vault_stored: stored as unknown as Required<RefusalMeta>['vault_stored'] }
  }
  // --
}
// --
