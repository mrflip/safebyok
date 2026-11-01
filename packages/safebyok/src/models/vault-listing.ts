/** A bank's vaults as this device holds them: the vault listing, and what it is given to reach the vaultDB, the device cache and the bank. */

import { makeLifeTok } from '../crypto'
import { VaultError } from '../errors'
import * as RefusalFuncs from '../helpers/refusal-funcs'
import { type BankScope, type VaultScope, vaultScope } from '../shapes/scopes'
import type { VaultLogger } from '../logger'
import { Listing } from './listing'
import { Gate } from './gate'
import { type PassphraseProving, spendAnswerAfter } from './proving'
import type { GatingWorld } from './gating'
import { type Cache, type Dna, type Fetched, type LeaseDeviceDB, type LeaseGrantOpts, type ListingOpts, type ListingWorld, type Cleartexts, type GateWorld, type Revision, type Store, type Times, type VaultRecord, type VaultSparse, VaultFormat, vaultRecord, vaultSparse } from './models-shapes'
import * as MSX from './models-shapes'
import { type VaultSnapshot, Vault } from './vault'

// == [Given to a vault listing]: VaultWorld, VaultStore, VaultCache, VaultDna, VaultListingOpts

/** The bank, as far as its vaults need it: a {@link ListingWorld}, and what a vault's gate, lease and gatings need of it, as `vaultListingOpts` checks it. Its lease verbs take the vault's scope; `vault.leaseDBFriend()` binds it. */
export type VaultWorld = ListingWorld & GateWorld & GatingWorld & {
  scope:         BankScope
  logger:        VaultLogger
  leaseMillis?:  LeaseGrantOpts['leaseMillis']
  pesterMillis?: number
  deviceDB:      LeaseDeviceDB
}

/** The vaultDB's vault verbs, as this listing calls them. */
export type VaultStore = Store<VaultScope, VaultRecord, VaultSparse>

export type VaultCache = Cache<VaultRecord, VaultSparse>

/** The dna of a vault: its scope. Anything else it carries is ignored: the gate of a vault ensured is the one built from its cleartexts. */
export type VaultDna = Dna<VaultScope, VaultRecord>

export type VaultListingOpts = ListingOpts<VaultScope, VaultRecord, VaultSparse> & { world: VaultWorld }
// --

// == [VaultListing]

/** One bank's vaults, by vaultlabel. A vault is born only as stored, through `ensure`; `build` takes a record alone. */
export class VaultListing extends Listing<VaultScope, VaultRecord, VaultSparse, VaultSnapshot, Vault> {
  declare readonly world: VaultWorld

  constructor(opts: VaultListingOpts) {
    super(opts)
    MSX.vaultListingOpts.parse(opts)
    Object.freeze(this)
  }

  /** Build a vault of `dna` gated by `cleartexts`, put it, and hold the vault as stored: unlocked under a lease its passphrase proving grants, where the put lands; where another device stored a vault under the scope first, that vault, as it stands.
   * Nothing is held before storage takes the vault, so cleartexts refused hold nothing. A passkey's answer among them is spent unless refused as correctable, as a weak passphrase is (G2).
   */
  ensure(dna: VaultDna, cleartexts: Cleartexts): Promise<Vault> {
    return spendAnswerAfter(cleartexts, async () => {
      const { draft, proving } = await this.#buildDraft(this.stampDna(this.scopeOf(dna)), cleartexts)
      const vault = await this.putDraft(draft)
      if (vault.vault_tok !== draft.vault_tok) { return vault }
      vault.takeUpLease(await proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: vault.leaseMillis }))
      return vault
    })
  }

  /** Take up each vault's cached lease, as {@link Vault.takeUpCachedLease} does, once the base's `hello` has revived and hydrated them. */
  override async hello(): Promise<void> {
    await super.hello()
    await Promise.all(this.things.map((vault) => vault.takeUpCachedLease()))
  }

  /** End the watch, and let every vault's lease go, leaving the lease this device keeps for the next load; erasing it is `vault.lock()`'s. */
  override goodbye(): void {
    super.goodbye()
    for (const vault of this.things) { vault.letLeaseGo() }
  }

  // == [Defined by the vault listing]

  protected vaultTokOfWorld(): null { return null }

  protected scopepathOf(scope: VaultScope): string {
    return ['vault', scope.applabel, scope.user_id, scope.vaultlabel].join('^')
  }

  scopeOf(duck: unknown):  VaultScope  { return vaultScope.parse(duck) }

  sparseOf(duck: unknown): VaultSparse { return vaultSparse.parse(duck) }

  recordOf(duck: unknown): VaultRecord { return vaultRecord.parse(duck) }

  /** The novel record of a vault, the stamped dna under a `vault_tok` fresh from {@link makeLifeTok}, and the proving of the gate {@link Gate.build} makes of it from `cleartexts`. */
  async #buildDraft(dna: Dna<VaultScope, VaultRecord> & Revision & Times, cleartexts?: Cleartexts): Promise<{ draft: VaultRecord, proving: PassphraseProving }> {
    const checked = MSX.vaultBuildArgs.parse({ cleartexts })
    const sparse: VaultSparse = { ...dna, fmt: VaultFormat, am: 'a', vault_tok: makeLifeTok() }
    const { gate, proving } = await Gate.build(MSX.vaultStamp.parse(sparse), checked.cleartexts, this.world)
    return { draft: { ...sparse, gate: gate.pickle() }, proving }
  }

  protected makeThing(central: Fetched<VaultRecord, VaultSparse>, staged: Fetched<VaultRecord, VaultSparse>, cache: Cache<VaultRecord, VaultSparse>): Vault {
    return new Vault(this.world, this, cache, central, staged, { maxMillisSinceRefresh: this.maxMillisSinceRefresh })
  }

  absentRefusal(scope: VaultScope): VaultError {
    return RefusalFuncs.vaultAbsent(scope.vaultlabel)
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
