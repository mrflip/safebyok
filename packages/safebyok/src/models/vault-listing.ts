/** A bank's vaults as this device has them: the vault listing, and what it is given to reach the vaultDB and the bank. */

import { nowMillis } from '../helpers/clock'
import type { Modelkind } from '../helpers/consts'
import { makeLifeTok } from '../helpers/crypto'
import { VaultError } from '../refusals/errors'
import { type Outcome, demandGood, outcomeOf, valOf } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import { type VaultScope, vaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import { type AnyGating, type VaultStamp, vaultStamp } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import { type DelTombstone, type Fetched, type ListingOpts, type SlotFate, type ThingAnswer, type VaultSnapshot, type VaultWorld } from '../shapes/shapes-vaultish'
import type { AddPasskeyParams, BoxRow, DelOpts, PutOpts, PutVaultOpts, ReplacePassphraseParams, RevokePasskeyParams, VaultRow, VaultRecord, VaultSparse } from '../shapes/shapes-storage'
import { type Answer, type Notice, answerWithVal, refusedAnswerOf } from '../storage/vault-db'
import { absentVaultError, alreadyAsking, delOfOtherLife, vaultStoredDamaged } from '../refusals/throwers'
import { BoxListing } from './box-listing'
import type { Gate } from './gate'
import { Listing } from './listing'
import { cmpRevisions } from './storable'
import { Vault } from './vault'

/** One bank's vaults, by vaultlabel. */
export class VaultListing extends Listing<VaultScope, VaultRecord, VaultSparse, VaultSnapshot, Vault, SX.DamagedVault> {
  // == [Props]: world, #openGating, openGating

  declare readonly world: VaultWorld

  #openGating: AnyGating | null = null

  /** The gating open on this bank, or null. */
  get openGating(): AnyGating | null { return this.#openGating }
  // --

  // == [Construction]: constructor, buildVault, tryBuildVault, boxListingOf, scopeOf, sparseOf, recordOf

  constructor(world: VaultWorld, opts: ListingOpts) {
    VX.vaultWorld.parse(world)
    super(world, opts)
    Object.freeze(this)
  }

  /** SLOPDOC: A new vault for `scope`, asked of the user, put and unlocked; or, locked, the slot's winner. */
  buildVault(scope: VaultScope): Promise<Vault> { return Vault.launchBirth(this, scope, this.bankFriend.askUser) }

  /** Non-throwing form of {@link buildVault}. */
  tryBuildVault(scope: VaultScope): Promise<Outcome<Vault>> { return outcomeOf(() => this.buildVault(scope)) }

  /** The listing of `vault`'s boxes, its watch not started. */
  boxListingOf(vault: Vault): BoxListing {
    return new BoxListing(vault, { scope: vault.scope, vaultDB: this.vaultDB, maxMillisSinceRefresh: this.world.boxRefreshMillis, bankFriend: this.bankFriend })
  }

  /** The scope of `duck`, which must be this bank's: no listing answers for another's. */
  scopeOf(duck: unknown):  VaultScope  { return vaultScope.parseConsistent(duck, this.world.scope, { message: Phrases.otherScope }) }

  /** Parse `duck` as a {@link VaultSparse}. */
  sparseOf(duck: unknown): VaultSparse { return SX.vaultSparse.parse(duck) }

  /** Parse `duck` as a {@link VaultRecord} of this bank. */
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

  // == [The gate verbs]: replacePassphrase, addPasskey, revokePasskey, each with its try form, gateVerbAnswered, tryDel

  /** Lay a new passphrase wayin on the row, deliver what it writes to the vault listed, and answer that record. Nothing locks: the vaultKey does not change. */
  async replacePassphrase(params: ReplacePassphraseParams): Promise<SX.VaultRecord> { return demandGood(await this.tryReplacePassphrase(params)).val }

  /** {@link replacePassphrase}, answering the vaultDB's own answer. */
  tryReplacePassphrase(params: ReplacePassphraseParams): Promise<ThingAnswer<SX.VaultRecord>> { return this.#gateVerbAnswered(() => this.vaultDB.tryReplacePassphrase(params)) }

  /** Lay a passkey wayin on the row. */
  async addPasskey(params: AddPasskeyParams): Promise<SX.VaultRecord> { return demandGood(await this.tryAddPasskey(params)).val }

  /** {@link addPasskey}, answering the vaultDB's own answer. */
  tryAddPasskey(params: AddPasskeyParams): Promise<ThingAnswer<SX.VaultRecord>> { return this.#gateVerbAnswered(() => this.vaultDB.tryAddPasskey(params)) }

  /** Null the row's passkey wayin. */
  async revokePasskey(params: RevokePasskeyParams): Promise<SX.VaultRecord> { return demandGood(await this.tryRevokePasskey(params)).val }

  /** {@link revokePasskey}, answering the vaultDB's own answer. */
  tryRevokePasskey(params: RevokePasskeyParams): Promise<ThingAnswer<SX.VaultRecord>> { return this.#gateVerbAnswered(() => this.vaultDB.tryRevokePasskey(params)) }

  // The val is the record the verb wrote: the vault listed may have a newer one by the time the answer is delivered.
  /** The answer `call` brings, its record delivered to the vault listed. */
  async #gateVerbAnswered(call: () => Promise<Answer<SX.VaultRecord, string>>): Promise<ThingAnswer<SX.VaultRecord>> {
    let answer: Answer<SX.VaultRecord, string> | null = null
    try {
      this.demandEnabled()
      answer = await call()
      await this.deliver(answer)
      return answerWithVal(answer, valOf(answer))
    } catch (err) { return refusedAnswerOf(err, answer) }
  }

  /** {@link Listing.tryDel}, refusing first a delete that names another life than the vault listed; its boxes cascade in the vaultDB. */
  override async tryDel(ante: VaultSparse): Promise<ThingAnswer<Vault | null>> {
    try {
      const listed = this.at(ante)
      if ((listed !== null) && (listed.vault_tok !== ante.vault_tok)) { throw delOfOtherLife() }
    } catch (err) { return refusedAnswerOf(err, null) }
    return super.tryDel(ante)
  }
  // --

  // == [The one gating open]: attachGating, detachGating, dismissGatingAtDiscard, sweep, vacate, dismissGatingOfGoneListing

  /** Attaches the one gating this bank may have open. */
  attachGating(gating: AnyGating): void {
    if (this.#openGating !== null) { throw alreadyAsking() }
    this.#openGating = gating
    this.tellListeners()
  }

  /** The open gating has concluded. */
  detachGating(): void {
    this.#openGating = null
    this.tellListeners()
  }

  /** `vault` is going away: the open gating concludes, if it asks for that vault, whatever its kind. */
  dismissGatingAtDiscard(vault: Vault): void {
    if (this.#openGating?.vault === vault) { this.#openGating.dismiss() }
  }

  /** Sweep this listing's vaults, and dismiss the open gating whatever vault it asks for. */
  override sweep(): this {
    super.sweep()
    this.#dismissGatingOfGoneListing()
    return this
  }

  /** Vacate this listing's vaults, and dismiss the open gating whatever vault it asks for. */
  override vacate(): this {
    super.vacate()
    this.#dismissGatingOfGoneListing()
    return this
  }

  // Past the disable: the dismiss tells the listeners, who must meet the listing already disabled.
  /** The open gating, whatever vault it asks for, concludes with the listing going away. */
  #dismissGatingOfGoneListing(): void { this.#openGating?.dismiss() }
  // --

  // == [Defined by the vault listing]: vaultTokOfWorld, fateOver, scopepathOf, makeThing, nothingStoredError, doTryList, damagedStoredError, doTryGet, doTryPut, doTryDel, watchRows, isOwnRow

  protected vaultTokOfWorld(): null { return null }

  /** An older record loses to the vault listed. A newer one replaces it where it is of another `vault_tok`, or alive over a tombstone. */
  protected override fateOver(listed: Vault, record: Fetched<VaultRecord, VaultSparse>): SlotFate {
    const age = cmpRevisions(listed, record)
    if (age === 'older') { return 'lose' }
    const isOtherLife = record.vault_tok !== listed.vault_tok
    const isRebirth = (! listed.isPresent) && (! VX.isTombstone(record))
    return ((age === 'newer') && (isOtherLife || isRebirth)) ? 'replace' : 'receive'
  }

  protected scopepathOf(scope: VaultScope): string {
    return ['vault', scope.applabel, scope.user_id, scope.vaultlabel].join('^')
  }

  protected makeThing(central: Fetched<VaultRecord, VaultSparse>): Vault {
    return new Vault(this.world, this, central, this.bankFriend)
  }

  protected nothingStoredError(scope: VaultScope): VaultError { return absentVaultError(scope) }

  // A bank's listing has its scope for a world, no row, so it has nothing for the bank to receive.
  protected async doTryList() {
    const answer = await this.vaultDB.tryListVaults(this.world.scope)
    return answer.ok ? { ...answer, world: null, val: { listed: answer.val.vaults, damaged_rows: answer.val.damaged_rows } } : answer
  }

  protected damagedStoredError(damaged: SX.DamagedVault): VaultError { return vaultStoredDamaged(damaged) }

  protected doTryGet(scope: VaultScope) { return this.vaultDB.tryGetVault(scope, { ifAbsent: 'nil' }) }

  /** The vaultDB refuses `repl` on a vault: a record moves only by a gate verb. */
  protected doTryPut(record: VaultRecord, opts: PutOpts) { return this.vaultDB.tryPutVault(record, opts as PutVaultOpts) }

  protected doTryDel(tombstone: DelTombstone<VaultSparse>, opts: DelOpts) { return this.vaultDB.tryDelVault(tombstone, opts) }

  protected watchRows(onNotice: (notice: Notice) => void, onBadNews: (news: VaultError) => void): () => void { return this.vaultDB.watch(this.world.scope, onNotice, onBadNews) }

  protected isOwnRow(row: VaultRow | BoxRow): row is VaultRow { return ! ('boxlabel' in row) }
  // --

  /** Answers 'vault_listing', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'vault_listing' { return 'vault_listing' satisfies Modelkind }
}
