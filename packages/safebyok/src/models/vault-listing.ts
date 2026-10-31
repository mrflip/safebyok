/** A bank's vaults as this device holds them: the vault listing, and what it is given to reach the vaultDB, the device cache and the bank. */

import { makeLifeTok } from '../crypto'
import { VaultError } from '../errors'
import { type BankScope, type VaultScope, vaultScope } from '../shapes/scopes'
import type { VaultLogger } from '../logger'
import { Listing, hasRevision } from './listing'
import { type Cache, type Dna, type Fetched, type LeaseDeviceDB, type LeaseGrantOpts, type ListingOpts, type ListingWorld, type ProofClosure, type ProvingWorld, type Revision, type Store, type Times, type VaultRecord, type VaultSparse, VaultFormat, vaultRecord, vaultSparse } from './models-shapes'
import * as MSX from './models-shapes'
import { type VaultSnapshot, Vault } from './vault'

// == [Given to a vault listing]: VaultWorld, VaultStore, VaultCache, VaultDna, VaultListingOpts

/** The bank, as far as its vaults need it: a {@link ListingWorld}, and what a vault's gate and lease need of it, as `vaultListingOpts` checks it. Its lease verbs take the vault's scope; `vault.leaseDBFriend()` binds it. */
export type VaultWorld = ListingWorld & ProvingWorld & {
  scope:       BankScope
  logger:      VaultLogger
  leaseMillis: LeaseGrantOpts['leaseMillis']
  deviceDB:    LeaseDeviceDB
}

/** The vaultDB's vault verbs, as this listing calls them. */
export type VaultStore = Store<VaultScope, VaultRecord, VaultSparse>

export type VaultCache = Cache<VaultRecord, VaultSparse>

/** The dna of a vault: its scope. A gate it carries is ignored: a vault drafted is born without one, and `build` gives it its gate. */
export type VaultDna = Dna<VaultScope, VaultRecord>

export type VaultListingOpts = ListingOpts<VaultScope, VaultRecord, VaultSparse> & { world: VaultWorld }
// --

// == [VaultListing]

/** One bank's vaults, by vaultlabel. */
export class VaultListing extends Listing<VaultScope, VaultRecord, VaultSparse, VaultSnapshot, Vault> {
  declare readonly world: VaultWorld

  constructor(opts: VaultListingOpts) {
    super(opts)
    MSX.vaultListingOpts.parse(opts)
    Object.freeze(this)
  }

  /** Build the vault of `input`, hold it, and resolve it; stores nothing. A record is delivered as the base's `build` delivers one, and takes no `proofClosure`: its gate is the one it carries, and one handed with it refuses 'bad_option'. A dna takes the `proofClosure` its gate is built from: the vault is born of the dna's draft, without a gate, then `vault.buildGate(proofClosure)` gives it one; where that is refused, the vault stays held without a gate, and `buildGate` may be called again. */
  override async build(input: VaultDna | Fetched<VaultRecord, VaultSparse>, proofClosure?: ProofClosure): Promise<Vault> {
    if (hasRevision(input)) {
      if (proofClosure !== undefined) { throw closureWithRecord() }
      return super.build(input)
    }
    const checked = MSX.buildGateArgs.parse({ proofClosure })
    const vault = await super.build(input)
    return vault.buildGate(checked.proofClosure)
  }

  // == [Defined by the vault listing]

  protected vaultTokOfWorld(): null { return null }

  protected scopepathOf(scope: VaultScope): string {
    return ['vault', scope.applabel, scope.user_id, scope.vaultlabel].join('^')
  }

  scopeOf(duck: unknown):  VaultScope  { return vaultScope.parse(duck) }

  sparseOf(duck: unknown): VaultSparse { return vaultSparse.parse(duck) }

  recordOf(duck: unknown): VaultRecord { return vaultRecord.parse(duck) }

  /** The vault a dna stages at birth: the dna under a `vault_tok` fresh from {@link makeLifeTok}, the life this vault takes if storage holds none, and no gate yet. */
  protected draftOf(dna: Dna<VaultScope, VaultRecord> & Revision & Times): Promise<VaultRecord> {
    return Promise.resolve({ ...dna, fmt: VaultFormat, am: 'a', vault_tok: makeLifeTok(), gate: null })
  }

  protected makeThing(central: Fetched<VaultRecord, VaultSparse>, staged: Fetched<VaultRecord, VaultSparse>, cache: Cache<VaultRecord, VaultSparse>): Vault {
    return new Vault(this.world, this, cache, central, staged, { maxMillisSinceRefresh: this.maxMillisSinceRefresh })
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
  // --
}
// --

// == [Refusals]: closureWithRecord

const closureWithRecord = (): VaultError => new VaultError('bad_option', 'A vault built of a record takes no proofClosure: its gate is the one the record carries.')
// --
