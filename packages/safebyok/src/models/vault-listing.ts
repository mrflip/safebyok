/** A bank's vaults as this device holds them: the vault listing, and what it is given to reach the vaultDB and the bank. */

import { nowMillis } from '../helpers/clock'
import type { Modelkind } from '../helpers/consts'
import { makeLifeTok } from '../helpers/crypto'
import { VaultError } from '../refusals/errors'
import { type Outcome, outcomeOf, valOf } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import { type VaultScope, vaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import { type AnyGating, type VaultStamp, vaultStamp } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import { type DelTombstone, type Fetched, type ListingOpts, type SlotFate, type VaultSnapshot, type VaultWorld } from '../shapes/shapes-vaultish'
import type { AddPasskeyParams, BoxRow, DelOpts, PutOpts, PutVaultOpts, ReplacePassphraseParams, RevokePasskeyParams, VaultRow, VaultRecord, VaultSparse } from '../shapes/shapes-storage'
import type { Answer, Notice } from '../storage/vault-db'
import { absentVaultError, alreadyAsking, delOfOtherLife, vaultStoredDamaged } from '../refusals/throwers'
import { BoxListing } from './box-listing'
import type { Gate } from './gate'
import { Listing } from './listing'
import { cmpRevisions } from './storable'
import { Vault } from './vault'

/** One bank's vaults, by vaultlabel. */
export class VaultListing extends Listing<VaultScope, VaultRecord, VaultSparse, VaultSnapshot, Vault> {
  // == [Props]: world, #openGating, openGating

  declare readonly world: VaultWorld

  #openGating: AnyGating | null = null

  get openGating(): AnyGating | null { return this.#openGating }
  // --

  // == [Construction]: constructor, buildVault, tryBuildVault, boxListingOf, scopeOf, sparseOf, recordOf

  constructor(world: VaultWorld, opts: ListingOpts) {
    VX.vaultWorld.parse(world)
    super(world, opts)
    Object.freeze(this)
  }

  /** SLOPDOC: A new vault for `scope`, asked of the user, stored and unlocked; or, locked, the slot's winner. */
  buildVault(scope: VaultScope): Promise<Vault> { return Vault.launchBirth(this, scope) }

  tryBuildVault(scope: VaultScope): Promise<Outcome<Vault>> { return outcomeOf(() => this.buildVault(scope)) }

  /** The listing of `vault`'s boxes, its watch not started. */
  boxListingOf(vault: Vault): BoxListing {
    return new BoxListing(vault, { vaultDB: this.vaultDB, maxMillisSinceRefresh: this.world.boxRefreshMillis, panic: this.panic })
  }

  /** The scope of `duck`, held to this bank: no listing answers for another's. */
  scopeOf(duck: unknown):  VaultScope  { return vaultScope.parseConsistent(duck, this.world.scope, { message: Phrases.otherScope }) }

  sparseOf(duck: unknown): VaultSparse { return SX.vaultSparse.parse(duck) }

  recordOf(duck: unknown): VaultRecord { return SX.vaultRecord.parseConsistent(duck, this.world.scope, { message: Phrases.otherScope }) }
  // --

  // == [A birth's forms]: stampOfBirth, recordOfBirth

  /** A new life's stamp under `scope`, one per attempt to build a vault. */
  stampOfBirth(scope: VaultScope): VaultStamp {
    return vaultStamp.parse({ ...scope, vault_tok: makeLifeTok(), registered_at: nowMillis() })
  }

  /** The record of a birth, at the revision after `prior`, carrying `gate` and the stamp it was made under. */
  recordOfBirth(gate: Gate, prior: SX.Revision): VaultRecord {
    return { ...gate.stamp, fmt: SX.VaultFormat, am: 'a', ...SX.nextRevisionOf(prior, nowMillis()), gate: gate.pickle() }
  }
  // --

  // == [Fetching]: list

  /** Every vault and tombstone the vaultDB holds for this bank, delivered: each meets its slot as a fetch's answer would. Boxes wait on their vault's listing. A damaged row is bad news. */
  async list(): Promise<void> {
    this.demandEnabled()
    const answer = await this.vaultDB.tryListVaults(this.world.scope)
    this.demandEnabled()
    if (! answer.ok) {
      this.panicIfRevoked(answer.err)
      throw answer.err
    }
    const { vaults, damaged_rows } = answer.val
    this.world.tellBadNews(damaged_rows.map((damaged) => vaultStoredDamaged(damaged)))
    await Promise.all(vaults.map((record) => this.build(record)))
  }
  // --

  // == [The gate's commits]: replacePassphrase, addPasskey, revokePasskey, del

  /** Lay a new passphrase wayin on the row, deliver what it stores to the vault held, and answer that record. Nothing locks: the vaultKey does not change. */
  async replacePassphrase(params: ReplacePassphraseParams): Promise<SX.VaultRecord> {
    this.demandEnabled()
    return this.#deliverStored(await this.vaultDB.tryReplacePassphrase(params))
  }

  /** Lay a passkey wayin on the row. */
  async addPasskey(params: AddPasskeyParams): Promise<SX.VaultRecord> {
    this.demandEnabled()
    return this.#deliverStored(await this.vaultDB.tryAddPasskey(params))
  }

  /** Null the row's passkey wayin. */
  async revokePasskey(params: RevokePasskeyParams): Promise<SX.VaultRecord> {
    this.demandEnabled()
    return this.#deliverStored(await this.vaultDB.tryRevokePasskey(params))
  }

  /** The record a gate verb stored: the vault held may hold a newer one by the time its answer is delivered. */
  async #deliverStored(answer: Answer<SX.VaultRecord, string>): Promise<SX.VaultRecord> {
    await this.deliver(answer)
    return valOf(answer)
  }

  /** SLOPDOC: Deletes the vault `ante` names over its own revision; its boxes cascade in the vaultDB. */
  override async del(ante: VaultSparse | Vault): Promise<Vault | null> {
    const held = this.at(this.scopeOf(ante))
    if ((held !== null) && (ante.am !== 'd') && (held.vault_tok !== ante.vault_tok)) { throw delOfOtherLife() }
    return this.delOver(this.sparseOf(ante))
  }
  // --

  // == [The one gating open]: holdGating, releaseGating, declineGatingAtLock, declineGatingAtDiscard, sweep, vacate

  /** Claims the one gating this bank may have open. */
  holdGating(gating: AnyGating): void {
    if (this.#openGating !== null) { throw alreadyAsking() }
    this.#openGating = gating
  }

  /** The open gating has settled. */
  releaseGating(): void { this.#openGating = null }

  /** The open gating hears a lock of `vault`, if it asks for that vault: a birth's does not. */
  declineGatingAtLock(vault: Vault): void {
    if (this.#openGating?.vault === vault) { this.#openGating.declineAtLock() }
  }

  /** `vault` is going away: the open gating settles, if it asks for that vault, whatever its kind. */
  declineGatingAtDiscard(vault: Vault): void {
    if (this.#openGating?.vault === vault) { this.#openGating.declineAtDiscard() }
  }

  /** Sweep this listing's vaults, and decline the open gating whatever vault it asks for. */
  override sweep(): this {
    this.#openGating?.declineAtDiscard()
    return super.sweep()
  }

  override vacate(): this {
    this.#openGating?.declineAtDiscard()
    return super.vacate()
  }
  // --

  // == [Defined by the vault listing]: vaultTokOfWorld, fateOver, scopepathOf, makeThing, nothingStoredError, tryGetRow, tryPutRow, tryDelRow, watchRows, isOwnRow

  protected vaultTokOfWorld(): null { return null }

  /** An older record loses to the vault held. A newer one replaces it where it is of another `vault_tok`, or alive over a tombstone. */
  protected override fateOver(held: Vault, record: Fetched<VaultRecord, VaultSparse>): SlotFate {
    const age = cmpRevisions(held, record)
    if (age === 'older') { return 'lose' }
    const isOtherLife = record.vault_tok !== held.vault_tok
    const isRebirth = (! held.isPresent) && (! VX.isTombstone(record))
    return ((age === 'newer') && (isOtherLife || isRebirth)) ? 'replace' : 'receive'
  }

  protected scopepathOf(scope: VaultScope): string {
    return ['vault', scope.applabel, scope.user_id, scope.vaultlabel].join('^')
  }

  protected makeThing(central: Fetched<VaultRecord, VaultSparse>): Vault {
    return new Vault(this.world, this, central, this.panic)
  }

  protected nothingStoredError(scope: VaultScope): VaultError { return absentVaultError(scope) }

  protected tryGetRow(scope: VaultScope) { return this.vaultDB.tryGetVault(scope, { ifAbsent: 'nil' }) }

  /** The vaultDB refuses `repl` on a vault: a record moves only by a gate verb. */
  protected tryPutRow(record: VaultRecord, opts: PutOpts) { return this.vaultDB.tryPutVault(record, opts as PutVaultOpts) }

  protected tryDelRow(tombstone: DelTombstone<VaultSparse>, opts: DelOpts) { return this.vaultDB.tryDelVault(tombstone, opts) }

  protected watchRows(onNotice: (notice: Notice) => void, onBadNews: (news: VaultError) => void): () => void { return this.vaultDB.watch(this.world.scope, onNotice, onBadNews) }

  protected isOwnRow(row: VaultRow | BoxRow): row is VaultRow { return ! ('boxlabel' in row) }
  // --

  /** Answers 'vault_listing', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'vault_listing' { return 'vault_listing' satisfies Modelkind }
}
