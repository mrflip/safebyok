/** A bank's vaults as this device has them: the vault listing, and what it is given to reach the vaultDB and the bank. */

import type { GateAct, OkAct } from '../shapes/shapes-enums'
import { nowMillis } from '../helpers/clock'
import { type Modelkind, UNANSWERED } from '../helpers/consts'
import { makeLifeTok } from '../helpers/crypto'
import { VaultError } from '../refusals/errors'
import { type Outcome, outcomeOf, valOf } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import { type VaultScope, vaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import { type VaultStamp, vaultStamp } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import { type DelTombstone, type Fetched, type ListingDelOpts, type ListingOpts, type ListingPutOpts, type ThingAnswer, type VaultSnapshot, type VaultWorld } from '../shapes/shapes-vaultish'
import type { BoxRow, VaultRow, VaultRecord, VaultSparse } from '../shapes/shapes-storage'
import { type Answer, type Notice, answerWithVal, refusedAnswerOf } from '../storage/vault-db'
import { vaultAbsent, delOfOtherLife, vaultStoredDamaged } from '../refusals/throwers'
import { BoxListing } from './box-listing'
import type { Gate } from './gate'
import { Listing } from './listing'
import { Vault } from './vault'

/** One bank's vaults, by vaultlabel. */
export class VaultListing extends Listing<VaultScope, VaultRecord, VaultSparse, VaultSnapshot, Vault, SX.DamagedVault> {
  // == [Props]: world

  declare readonly world: VaultWorld
  // --

  // == [Construction]: constructor, buildVault, tryBuildVault, boxListingOf, scopeOf, sparseOf, recordOf

  constructor(world: VaultWorld, opts: ListingOpts) {
    VX.vaultWorld.parse(world)
    super(world, opts)
    Object.freeze(this)
  }

  /** SLOPDOC: A new vault for `scope`, asked of the user, put and unlocked; or, locked, the vault some other device put first. */
  buildVault(scope: VaultScope): Promise<Vault> { return Vault.launchBirth(this, scope, this.bankFriend.askUser) }

  /** Non-throwing form of {@link buildVault}. */
  tryBuildVault(scope: VaultScope): Promise<Outcome<Vault>> { return outcomeOf(() => this.buildVault(scope)) }

  /** The listing of `vault`'s boxes, its watch not started. */
  boxListingOf(vault: Vault): BoxListing {
    return new BoxListing(vault, { scope: vault.scope, vaultDB: this.vaultDB, maxMillisSinceRefresh: this.world.boxRefreshMillis, bankFriend: this.bankFriend })
  }

  /** The scope of `vaultish`, which must be this bank's: no listing answers for another's. */
  scopeOf(vaultish: unknown):  VaultScope  { return vaultScope.parseConsistent(vaultish, this.world.scope, { message: Phrases.otherScope }) }

  /** Parse `vaultish` as a {@link VaultSparse}. */
  sparseOf(vaultish: unknown): VaultSparse { return SX.vaultSparse.parse(vaultish) }

  /** Parse `vaultish` as a {@link VaultRecord} of this bank. */
  recordOf(vaultish: unknown): VaultRecord { return SX.vaultRecord.parseConsistent(vaultish, this.world.scope, { message: Phrases.otherScope }) }
  // --

  // == [A birth's forms]: stampOfBirth, recordOfBirth

  /** A new life's stamp under `scope`, one per attempt to build a vault. */
  stampOfBirth(scope: VaultScope): VaultStamp {
    return vaultStamp.parse({ ...scope, vault_tok: makeLifeTok(), registered_at: nowMillis() })
  }

  /** The record of a birth, at the revision after `expected`'s, carrying `gate` and the stamp it was made under. */
  recordOfBirth(gate: Gate, expected: SX.Revision): VaultRecord {
    return { ...gate.stamp, fmt: SX.VaultFormat, am: 'a', ...SX.nextRevisionOf(expected, nowMillis()), gate: gate.pickle() }
  }
  // --

  // == [The gate verbs]: replacePassphrase, addPasskey, revokePasskey, each with its try form, gateMoveOf, tryDel
  // The val is the record the verb wrote: the vault listed may have a newer one by the time the answer is delivered.

  /** Lay a new passphrase wayin on the vault at `ante`, and answer the record stored. Nothing locks: the vaultKey does not change. */
  async replacePassphrase(ante: VaultRecord, passphrase_wayin: SX.Gate['passphrase_wayin']): Promise<VaultRecord> { return valOf(await this.tryReplacePassphrase(ante, passphrase_wayin)) }

  /** {@link replacePassphrase}, answering the vaultDB's own answer.
   * Chute: tryReplacePassphrase → vaultDB.tryReplacePassphrase → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async tryReplacePassphrase(ante: VaultRecord, passphrase_wayin: SX.Gate['passphrase_wayin']): Promise<ThingAnswer<VaultRecord>> {
    let answer: Answer<VaultRecord, OkAct | GateAct> | typeof UNANSWERED = UNANSWERED
    try {
      const { record, prior } = this.#gateMoveOf(ante, { passphrase_wayin })
      answer = await this.vaultDB.tryReplacePassphrase(record, { prior })
      this.deliverAnswer(answer, record)
      return answerWithVal(answer, valOf(answer))
    } catch (err) { return refusedAnswerOf(err, answer) }
  }

  /** Lay a passkey wayin on the vault at `ante`, and answer the record stored. */
  async addPasskey(ante: VaultRecord, passkey_wayin: NonNullable<SX.Gate['passkey_wayin']>): Promise<VaultRecord> { return valOf(await this.tryAddPasskey(ante, passkey_wayin)) }

  /** {@link addPasskey}, answering the vaultDB's own answer.
   * Chute: tryAddPasskey → vaultDB.tryAddPasskey → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async tryAddPasskey(ante: VaultRecord, passkey_wayin: NonNullable<SX.Gate['passkey_wayin']>): Promise<ThingAnswer<VaultRecord>> {
    let answer: Answer<VaultRecord, OkAct | GateAct> | typeof UNANSWERED = UNANSWERED
    try {
      const { record, prior } = this.#gateMoveOf(ante, { passkey_wayin })
      answer = await this.vaultDB.tryAddPasskey(record, { prior })
      this.deliverAnswer(answer, record)
      return answerWithVal(answer, valOf(answer))
    } catch (err) { return refusedAnswerOf(err, answer) }
  }

  /** Null the passkey wayin of the vault at `ante`, and answer the record stored, or the row stored where it has no passkey wayin. */
  async revokePasskey(ante: VaultRecord): Promise<VaultRecord> { return valOf(await this.tryRevokePasskey(ante)) }

  /** {@link revokePasskey}, answering the vaultDB's own answer.
   * Chute: tryRevokePasskey → vaultDB.tryRevokePasskey → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async tryRevokePasskey(ante: VaultRecord): Promise<ThingAnswer<VaultRecord>> {
    let answer: Answer<VaultRecord, OkAct | GateAct> | typeof UNANSWERED = UNANSWERED
    try {
      const { record, prior } = this.#gateMoveOf(ante, { passkey_wayin: null })
      answer = await this.vaultDB.tryRevokePasskey(record, { prior })
      this.deliverAnswer(answer, record)
      return answerWithVal(answer, valOf(answer))
    } catch (err) { return refusedAnswerOf(err, answer) }
  }

  /** The record of the vault at `ante` with `moved` laid on its gate, at the next revision and gate_epoch, and the revision it expects. */
  #gateMoveOf(ante: VaultRecord, moved: Partial<SX.Gate>): { record: VaultRecord, prior: SX.Revision } {
    const checked = this.recordOf(ante)
    this.demandEnabled()
    const prior = SX.revisionOf(checked)
    const record: VaultRecord = { ...checked, ...SX.nextRevisionOf(prior, nowMillis()), gate: { ...checked.gate, ...moved, gate_epoch: checked.gate.gate_epoch + 1 } }
    return { record, prior }
  }

  /** {@link Listing.tryDel}, refusing first a delete that names another life than the vault listed; its boxes cascade in the vaultDB. */
  override async tryDel(ante: VaultSparse): Promise<ThingAnswer<Vault | null>> {
    try {
      const listed = this.at(ante)
      if ((listed !== null) && (listed.vault_tok !== ante.vault_tok)) { throw delOfOtherLife() }
    } catch (err) { return refusedAnswerOf(err, UNANSWERED) }
    return super.tryDel(ante)
  }
  // --

  // == [Defined by the vault listing]: vaultTokOfWorld, isOneLifePerInstance, scopepathOf, makeThing, nothingStoredError, doTryList, damagedStoredError, doTryGet, doTryPut, tombstoneOver, doTryDel, watchRows, isOwnRow

  protected vaultTokOfWorld(): null { return null }

  // A Vault object is one life of its vault: a vault deleted, or made anew, is a new instance (`notes/deliver-contract.md`, L2).
  protected get isOneLifePerInstance(): true { return true }

  protected scopepathOf(scope: VaultScope): string {
    return ['vault', scope.user_id, scope.banklabel, scope.vaultlabel].join('^')
  }

  protected makeThing(central: Fetched<VaultRecord, VaultSparse>): Vault {
    return new Vault(this.world, this, central, this.bankFriend)
  }

  protected nothingStoredError(scope: VaultScope): VaultError { return vaultAbsent(scope) }

  // A bank's listing has its scope for a world, no row, so it has nothing for the bank to receive.
  protected async doTryList() {
    const answer = await this.vaultDB.tryListVaults({ op: 'list', ...this.world.scope })
    return answer.ok ? { ...answer, world: null, val: { listed: answer.val.vaults, damaged_rows: answer.val.damaged_rows } } : answer
  }

  protected damagedStoredError(damaged: SX.DamagedVault): VaultError { return vaultStoredDamaged(damaged) }

  protected doTryGet(scope: VaultScope) {
    const expected = this.at(scope)?.sparse ?? SX.shellVaultOf(scope)
    return this.vaultDB.tryGetVault({ op: 'get', ...scope, ifAbsent: 'nil', expected })
  }

  protected doTryPut(record: VaultRecord, { expected, ifAbsent, ifPresent }: ListingPutOpts<VaultSparse>) {
    const { user_id, banklabel, vaultlabel } = record
    return this.vaultDB.tryPutVault({ op: 'put', user_id, banklabel, vaultlabel, ifAbsent, ifPresent, expected, record })
  }

  protected tombstoneOver(expected: VaultSparse): DelTombstone<VaultSparse> {
    return { ...expected, ...SX.nextRevisionOf(expected, nowMillis()), am: 'x', vault_tok: makeLifeTok() }
  }

  protected doTryDel(tombstone: DelTombstone<VaultSparse>, { expected }: ListingDelOpts<VaultSparse>) {
    const { user_id, banklabel, vaultlabel } = tombstone
    return this.vaultDB.tryDelVault({ op: 'del', user_id, banklabel, vaultlabel, expected, record: tombstone })
  }

  protected watchRows(onNotice: (notice: Notice) => void, onBadNews: (news: VaultError) => void): () => void { return this.vaultDB.watch(this.world.scope, onNotice, onBadNews) }

  protected isOwnRow(row: VaultRow | BoxRow): row is VaultRow { return ! ('boxlabel' in row) }
  // --

  /** Answers 'vault_listing', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'vault_listing' { return 'vault_listing' satisfies Modelkind }
}
