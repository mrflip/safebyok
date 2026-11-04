/** A bank's vaults as this device holds them: the vault listing, and what it is given to reach the vaultDB and the bank. */

import { omit } from 'es-toolkit'
import { VaultError } from '../errors'
import { type Outcome, outcomeOf, valOf } from '../outcome'
import * as Phrases from '../phrases'
import { type BankScope, type VaultScope, vaultScope } from '../shapes/scopes'
import type { VaultLogger } from '../logger'
import type { DeviceDB } from '../storage/device-db-new'
import type { Answer, Notice, VaultDB } from '../storage/vault-db-new'
import type { AddPasskeyParams, BoxRow, DelOpts, PutOpts, PutVaultOpts, ReplacePassphraseParams, RevokePasskeyParams, VaultRow } from '../storage/vault-db-shapes'
import * as VS from '../storage/vault-db-shapes'
import { absentVaultError } from '../helpers/throwers'
import { BoxListing } from './box-listing'
import { type DelTombstone, type SlotFate, Listing } from './listing'
import { type AnyGating, type RequestCleartext, alreadyAsking } from './gating'
import { type BoxesListed, type Fetched, type ListingOpts, type ListingWorld, type ProvingWorld, type VaultRecord, type VaultSparse, vaultRecord, vaultSparse } from './models-shapes'
import * as MSX from './models-shapes'
import { cmpRevisions } from './storable'
import { type VaultSnapshot, Vault } from './vault'

// == [Given to a vault listing]: VaultWorld, VaultListingOpts

/** SLOPDOC: The bank, as far as its vaults need it: a {@link ListingWorld} and what a vault's gate and lease need. */
export type VaultWorld = ListingWorld & ProvingWorld & {
  scope:       BankScope
  logger:      VaultLogger
  leaseMillis?: number
  deviceDB:    DeviceDB
  /** Hears a refused erase of the cached lease, and no secret material. */
  onPanic?:    ((refusal: VaultError) => unknown) | undefined
  /** The host's dialog, if the host gave one. */
  requestCleartext?: RequestCleartext | undefined
  /** The horizon of a vault's boxes, by default the vault's own. */
  boxRefreshMillis?: number
}

export type VaultListingOpts = ListingOpts & { world: VaultWorld }
// --

// == [VaultListing]

/** One bank's vaults, by vaultlabel. */
export class VaultListing extends Listing<VaultScope, VaultRecord, VaultSparse, VaultSnapshot, Vault> {
  declare readonly world: VaultWorld

  #openGating: AnyGating | null = null

  constructor(opts: VaultListingOpts) {
    super(opts)
    MSX.vaultListingOpts.parse(opts)
    Object.freeze(this)
  }

  /** SLOPDOC: A new vault for `scope`, asked of the user, stored and unlocked; or, locked, the slot's winner. */
  buildVault(scope: VaultScope): Promise<Vault> { return Vault.launchBirth(this, scope) }

  tryBuildVault(scope: VaultScope): Promise<Outcome<Vault>> { return outcomeOf(() => this.buildVault(scope)) }

  /** Every vault and tombstone the vaultDB holds for this bank, delivered: each meets its slot as a fetch's answer would. Boxes wait on their vault's listing. A damaged row is bad news. */
  async fetchBank(): Promise<void> {
    this.demandEnabled()
    const answer = await this.vaultDB.tryGetBank(this.world.scope)
    if (! answer.ok) {
      this.tellIfRevoked(answer.err)
      throw answer.err
    }
    const { vaults, damaged_records } = answer.val
    this.tellBadNews(damaged_records.map((damaged) => vaultStoredDamaged(damaged)))
    await Promise.all(vaults.map((record) => this.build(record)))
  }

  // == [The gate's commits]: replacePassphrase, addPasskey, revokePasskey, del

  /** Lay a new passphrase wayin on the row, deliver what it stores to the vault held, and answer that record. Nothing locks: the vaultKey does not change. */
  async replacePassphrase(params: ReplacePassphraseParams): Promise<VS.VaultRecord> {
    this.demandEnabled()
    return this.#deliverStored(await this.vaultDB.tryReplacePassphrase(params))
  }

  /** Lay a passkey wayin on the row. */
  async addPasskey(params: AddPasskeyParams): Promise<VS.VaultRecord> {
    this.demandEnabled()
    return this.#deliverStored(await this.vaultDB.tryAddPasskey(params))
  }

  /** Null the row's passkey wayin. */
  async revokePasskey(params: RevokePasskeyParams): Promise<VS.VaultRecord> {
    this.demandEnabled()
    return this.#deliverStored(await this.vaultDB.tryRevokePasskey(params))
  }

  /** The record a gate verb stored: the vault held may hold a newer one by the time its answer is delivered. */
  async #deliverStored(answer: Answer<VS.VaultRecord, string>): Promise<VS.VaultRecord> {
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

  // == [The one gating open]: openGating, holdGating, releaseGating, declineGatingAtLock, declineGatingAtDiscard, sweep, vacate

  get openGating(): AnyGating | null { return this.#openGating }

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

  /** The listing of `vault`'s boxes, its watch not started. Bad news of a box goes where this listing's goes. */
  boxListingOf(vault: Vault): BoxListing {
    const { boxRefreshMillis = this.maxMillisSinceRefresh } = this.world
    return new BoxListing({ world: vault, vaultDB: this.vaultDB, maxMillisSinceRefresh: boxRefreshMillis, onBadNews: (news) => { this.tellBadNews([news]) } })
  }

  /** Deliver a get of `vault` as a fetch does, and answer the boxes it listed: none where it found no vault, as `vault` then tells by its own state. */
  async fetchListed(vault: Vault): Promise<BoxesListed> {
    const asked = this.scopeOf(vault)
    await this.ensureTimelyWorld()
    this.demandEnabled()
    const answer = await this.vaultDB.tryGetVault(asked, { ifAbsent: 'nil' })
    await this.deliver(vaultRowOf(answer))
    return MSX.boxesListed.parse(answer.ok ? (answer.val ?? NothingListed) : NothingListed)
  }

  // == [Defined by the vault listing]

  protected vaultTokOfWorld(): null { return null }

  /** An older record loses to the vault held. A newer one replaces it where it is of another `vault_tok`, or alive over a tombstone. */
  protected override fateOver(held: Vault, record: Fetched<VaultRecord, VaultSparse>): SlotFate {
    const age = cmpRevisions(held, record)
    if (age === 'older') { return 'lose' }
    const isOtherLife = record.vault_tok !== held.vault_tok
    const isRebirth = (! held.isPresent) && (! MSX.isTombstone(record))
    return ((age === 'newer') && (isOtherLife || isRebirth)) ? 'replace' : 'receive'
  }

  protected scopepathOf(scope: VaultScope): string {
    return ['vault', scope.applabel, scope.user_id, scope.vaultlabel].join('^')
  }

  /** The scope of `duck`, held to this bank: no listing answers for another's. */
  scopeOf(duck: unknown):  VaultScope  { return vaultScope.parseConsistent(duck, this.world.scope, { message: Phrases.otherScope }) }

  sparseOf(duck: unknown): VaultSparse { return vaultSparse.parse(duck) }

  recordOf(duck: unknown): VaultRecord { return vaultRecord.parseConsistent(duck, this.world.scope, { message: Phrases.otherScope }) }

  protected makeThing(central: Fetched<VaultRecord, VaultSparse>): Vault {
    return new Vault(this.world, this, central, { maxMillisSinceRefresh: this.maxMillisSinceRefresh })
  }

  protected nothingStoredError(scope: VaultScope): VaultError { return absentVaultError(scope) }

  /** The vault row alone: the boxes `getVault` lists with it are the vault's box listing's to take. */
  protected async tryGetRow(scope: VaultScope) { return vaultRowOf(await this.vaultDB.tryGetVault(scope, { ifAbsent: 'nil' })) }

  /** The vaultDB refuses `repl` on a vault: a record moves only by a gate verb. */
  protected tryPutRow(record: VaultRecord, opts: PutOpts) { return this.vaultDB.tryPutVault(record, opts as PutVaultOpts) }

  protected tryDelRow(tombstone: DelTombstone<VaultSparse>, opts: DelOpts) { return this.vaultDB.tryDelVault(tombstone, opts) }

  protected watchRows(onNotice: (notice: Notice) => void): () => void { return this.vaultDB.watch(this.world.scope, onNotice) }

  protected isOwnRow(row: VaultRow | BoxRow): row is VaultRow { return ! ('boxlabel' in row) }
  // --
}
// --

// == [The vault's get]: NothingListed, vaultRowOf

const NothingListed: BoxesListed = Object.freeze({ boxes: [], damaged_records: [] })

/** `answer` with its `val` the vault row alone, as a listing delivers it. */
const vaultRowOf = (answer: Awaited<ReturnType<VaultDB['tryGetVault']>>) => (
  (answer.ok && (answer.val !== null)) ? { ...answer, val: omit(answer.val, ['boxes', 'damaged_records']) } : answer
)
// --

// == [Refusals]: delOfOtherLife, vaultStoredDamaged

const delOfOtherLife = (): VaultError => new VaultError('stale_write', Phrases.DelOfOtherLife)

const vaultStoredDamaged = ({ vaultlabel }: VS.DamagedVault): VaultError => new VaultError('damaged_record', Phrases.vaultStoredDamaged(vaultlabel))
// --
