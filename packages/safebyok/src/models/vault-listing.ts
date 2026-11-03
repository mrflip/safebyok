/** A bank's vaults as this device holds them: the vault listing, and what it is given to reach the vaultDB and the bank. */

import { omit } from 'es-toolkit'
import { makeLifeTok } from '../crypto'
import { VaultError } from '../errors'
import { type Outcome, outcomeOf } from '../outcome'
import * as Phrases from '../phrases'
import { type BankScope, type VaultScope, vaultScope } from '../shapes/scopes'
import type { VaultLogger } from '../logger'
import type { DeviceDB } from '../storage/device-db-new'
import type { Notice } from '../storage/vault-db-new'
import type { BoxRow, DelOpts, PutOpts, VaultRow } from '../storage/vault-db-shapes'
import { BoxListing } from './box-listing'
import { type DelTombstone, Listing } from './listing'
import { Gate } from './gate'
import type { PassphraseProving } from './proving'
import { type Dna, type Fetched, type ListingOpts, type ListingWorld, type ProofClosure, type ProvingWorld, type Revision, type Times, type VaultRecord, type VaultSparse, VaultFormat, vaultRecord, vaultSparse } from './models-shapes'
import * as MSX from './models-shapes'
import { type VaultSnapshot, Vault } from './vault'

// == [Given to a vault listing]: VaultWorld, VaultDna, VaultListingOpts

/** The bank, as far as its vaults need it: a {@link ListingWorld}, and what a vault's gate and lease need of it, as `vaultListingOpts` checks it. `vault.leaseFriend()` binds its deviceDB's lease verbs to each vault. `onPanic` hears a refused erase of the cached lease, and no secret material. `boxRefreshMillis` is the horizon of a vault's boxes, by default the vault's own. */
export type VaultWorld = ListingWorld & ProvingWorld & {
  scope:       BankScope
  logger:      VaultLogger
  leaseMillis?: number
  deviceDB:    DeviceDB
  onPanic?:    ((refusal: VaultError) => unknown) | undefined
  boxRefreshMillis?: number
}

/** The dna of a vault: its scope. A gate it carries is ignored: the gate of a vault drafted is the one `create` makes from its `proofClosure`. */
export type VaultDna = Dna<VaultScope, VaultRecord>

export type VaultListingOpts = ListingOpts & { world: VaultWorld }
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

  /** Build the gate of a vault under a `vault_tok` fresh from {@link makeLifeTok}, from what `proofClosure` answers, and store it over no record; resolves the vault held once it lands, unlocked under the lease its passphrase proving grants. Refuses 'bad_option' with no closure, or a scope already held, before the closure is asked anything; 'stale_write' where storage holds a vault, delivered first. A refusal before the put lands holds nothing of the dna; a lease refused after it leaves the vault stored and held, locked. */
  async create(input: VaultDna, proofClosure?: ProofClosure): Promise<Vault> {
    this.demandNotHeld(input)
    const { draft, proving } = await this.#draftWithProving(this.stampDna(input), proofClosure)
    const vault = await this.putDraft(draft)
    const lease = await proving.buildLease(vault.leaseFriend())
    await lease.attach()
    return vault
  }

  tryCreate(input: VaultDna, proofClosure?: ProofClosure): Promise<Outcome<Vault>> { return outcomeOf(() => this.create(input, proofClosure)) }

  /** The listing of `vault`'s boxes, its watch not started. Bad news of a box goes where this listing's goes. */
  boxListingOf(vault: Vault): BoxListing {
    const { boxRefreshMillis = this.maxMillisSinceRefresh } = this.world
    return new BoxListing({ world: vault, vaultDB: this.vaultDB, maxMillisSinceRefresh: boxRefreshMillis, onBadNews: (news) => { this.tellBadNews([news]) } })
  }

  // == [Defined by the vault listing]

  protected vaultTokOfWorld(): null { return null }

  protected scopepathOf(scope: VaultScope): string {
    return ['vault', scope.applabel, scope.user_id, scope.vaultlabel].join('^')
  }

  scopeOf(duck: unknown):  VaultScope  { return vaultScope.parse(duck) }

  sparseOf(duck: unknown): VaultSparse { return vaultSparse.parse(duck) }

  recordOf(duck: unknown): VaultRecord { return vaultRecord.parse(duck) }

  /** The record of a vault's birth, and the proving its gate was built under: the dna under a fresh `vault_tok`, and the gate {@link Gate.build} makes of that stamp from what `proofClosure` answers; without one, refuses 'bad_option'. */
  async #draftWithProving(dna: Dna<VaultScope, VaultRecord> & Revision & Times, proofClosure?: ProofClosure): Promise<{ draft: VaultRecord, proving: PassphraseProving }> {
    const checked = MSX.vaultBuildArgs.parse({ proofClosure })
    const sparse: VaultSparse = { ...dna, fmt: VaultFormat, am: 'a', vault_tok: makeLifeTok() }
    const { gate, proving } = await Gate.build(MSX.vaultStamp.parse(sparse), checked.proofClosure, this.world)
    return { draft: { ...sparse, am: 'a', gate: gate.pickle() }, proving }
  }

  protected makeThing(central: Fetched<VaultRecord, VaultSparse>): Vault {
    return new Vault(this.world, this, central, { maxMillisSinceRefresh: this.maxMillisSinceRefresh })
  }

  absentRefusal(scope: VaultScope): VaultError {
    return new VaultError('absent_vault', Phrases.vaultAbsent(scope.vaultlabel))
  }

  /** The vault row alone: the boxes `getVault` lists with it are the vault's box listing's to take. */
  protected async tryGetRow(scope: VaultScope) {
    const answer = await this.vaultDB.tryGetVault(scope, { ifAbsent: 'nil' })
    return (answer.ok && (answer.val !== null)) ? { ...answer, val: omit(answer.val, ['boxes', 'damaged_records']) } : answer
  }

  protected tryPutRow(record: VaultRecord, opts: PutOpts) { return this.vaultDB.tryPutVault(record, opts) }

  protected tryDelRow(tombstone: DelTombstone<VaultSparse>, opts: DelOpts) { return this.vaultDB.tryDelVault(tombstone, opts) }

  protected watchRows(onNotice: (notice: Notice) => void): () => void { return this.vaultDB.watch(this.world.scope, onNotice) }

  protected isOwnRow(row: VaultRow | BoxRow): row is VaultRow { return ! ('boxlabel' in row) }
  // --
}
// --
