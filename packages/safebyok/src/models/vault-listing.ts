/** A bank's vaults as this device holds them: the vault listing, and what it is given to reach the vaultDB and the bank. */

import { omit } from 'es-toolkit'
import { makeLifeTok } from '../crypto'
import { VaultError } from '../errors'
import { type Outcome, outcomeOf } from '../outcome'
import * as Phrases from '../phrases'
import { type BankScope, type VaultScope, vaultScope } from '../shapes/scopes'
import type { VaultLogger } from '../logger'
import type { Notice } from '../storage/vault-db-new'
import type { BoxRow, DelOpts, PutOpts, VaultRow } from '../storage/vault-db-shapes'
import { type DelTombstone, Listing } from './listing'
import { Gate } from './gate'
import type { PassphraseProving } from './proving'
import { type Dna, type Fetched, type LeaseDeviceDB, type LeaseGrantOpts, type ListingOpts, type ListingWorld, type ProofClosure, type ProvingWorld, type Revision, type Times, type VaultRecord, type VaultSparse, FirstGateEpoch, VaultFormat, vaultRecord, vaultSparse } from './models-shapes'
import * as MSX from './models-shapes'
import { type VaultSnapshot, Vault } from './vault'

// == [Given to a vault listing]: VaultWorld, VaultDna, VaultListingOpts

/** The bank, as far as its vaults need it: a {@link ListingWorld}, and what a vault's gate and lease need of it, as `vaultListingOpts` checks it. Its lease verbs take the vault's scope; `vault.leaseDBFriend()` binds it. */
export type VaultWorld = ListingWorld & ProvingWorld & {
  scope:       BankScope
  logger:      VaultLogger
  leaseMillis?: LeaseGrantOpts['leaseMillis']
  deviceDB:    LeaseDeviceDB
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
    vault.takeUpLease(await proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: vault.leaseMillis }))
    return vault
  }

  tryCreate(input: VaultDna, proofClosure?: ProofClosure): Promise<Outcome<Vault>> { return outcomeOf(() => this.create(input, proofClosure)) }

  /** Start the watch, and take up each vault's cached lease, as {@link Vault.takeUpKeptLease} does. */
  override async hello(): Promise<void> {
    await super.hello()
    await Promise.all(this.things.map((vault) => vault.takeUpKeptLease()))
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

  /** The record of a vault's birth, and the proving its gate was built under: the dna under a fresh `vault_tok`, and the gate {@link Gate.build} makes of that stamp from what `proofClosure` answers; without one, refuses 'bad_option'. */
  async #draftWithProving(dna: Dna<VaultScope, VaultRecord> & Revision & Times, proofClosure?: ProofClosure): Promise<{ draft: VaultRecord, proving: PassphraseProving }> {
    const checked = MSX.vaultBuildArgs.parse({ proofClosure })
    const sparse: VaultSparse = { ...dna, fmt: VaultFormat, am: 'a', vault_tok: makeLifeTok() }
    const { gate, proving } = await Gate.build(MSX.vaultStamp.parse(sparse), checked.proofClosure, this.world)
    return { draft: { ...sparse, am: 'a', gate: { ...gate.pickle(), gate_epoch: FirstGateEpoch } }, proving }
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
