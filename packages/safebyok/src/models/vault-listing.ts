/** A bank's vaults as this device has them: the vault listing, handed its bank. */

import { nowMillis } from '../helpers/clock'
import { type Modelkind, UNANSWERED } from '../helpers/consts'
import { makeLifeTok } from '../helpers/crypto'
import { VaultError } from '../refusals/errors'
import * as Phrases from '../helpers/phrases'
import { type VaultScope, vaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import * as BX from '../shapes/shapes-bankdb'
import type { BankRow, BoxRow, GateRecord, VaultRecord, VaultRow, VaultSparse } from '../shapes/shapes-bankdb'
import * as VX from '../shapes/shapes-vaultish'
import type { DelTombstone, Fetched, ListingDelOpts, ListingListAnswer, ListingOpts, ListingPutOpts, ThingAnswer, VaultSnapshot } from '../shapes/shapes-vaultish'
import { type EnsureBankAnswer, type Notice, refusedAnswerOf } from '../storage/bank-db'
import { vaultAbsent, delOfOtherLife, rowOfOtherWorld, vaultStoredDamaged } from '../refusals/throwers'
import type { Bank } from './bank'
import { BoxListing } from './box-listing'
import { Listing } from './listing'
import { Vault } from './vault'

/** One bank's vaults, by vaultlabel. */
export class VaultListing extends Listing<VaultScope, VaultRecord, VaultSparse, VaultSnapshot, Vault, SX.DamagedVault> {
  // == [Props]: bank

  /** The bank whose vaults these are. */
  readonly bank: Bank
  // --

  // == [Construction]: constructor, scopeOf, sparseOf, recordOf

  /** The listing of `bank`'s vaults. */
  constructor(bank: Bank, opts: ListingOpts) {
    const checked = VX.listedUnder.bank.parse(bank)
    super(checked.device, opts)
    this.bank = checked
    Object.freeze(this)
  }

  /** The scope of `vaultish`, which must be this bank's: no listing answers for another's. */
  scopeOf(vaultish: unknown):  VaultScope  { return vaultScope.parseConsistent(vaultish, this.bank.scope, { message: Phrases.otherScope }) }

  /** Parse `vaultish` as a {@link VaultSparse}. */
  sparseOf(vaultish: unknown): VaultSparse { return BX.vaultSparse.parse(vaultish) }

  /** Parse `vaultish` as a {@link VaultRecord} of this bank. */
  recordOf(vaultish: unknown): VaultRecord { return BX.vaultRecord.parseConsistent(vaultish, this.bank.scope, { message: Phrases.otherScope }) }
  // --

  // == [A vault's boxes]: boxListingOf

  /** The listing of `vault`'s boxes, under the life of the vault it has now, its watch not started. */
  boxListingOf(vault: Vault): BoxListing {
    return new BoxListing(vault, { bankDB: this.bankDB, maxMillisSinceRefresh: this.bank.boxRefreshMillis })
  }
  // --

  // == [A birth's form]: recordOfBirth

  /** The record of a vault born under `scope`, at the revision after `expected`'s: of this life of the bank, and a new life of its own. */
  recordOfBirth(scope: VaultScope, expected: SX.Revision): VaultRecord {
    const written_at = nowMillis()
    return { ...scope, fmt: BX.VaultFormat, ...SX.nextRevisionOf(expected, written_at), registered_at: written_at, am: 'a', bank_tok: this.bank.bank_tok, vault_tok: makeLifeTok() }
  }
  // --

  // == [Delivering what ensureBank answers]: deliverEnsured, listingOfEnsured

  /** The vaults an ensureBank `answer` lists, delivered as a listing's: the bank row to the bank, its main gate row to the bank's gate, then each vault row.
   * Chute: deliverEnsured → listingOfEnsured → deliverListing → deliverRecord → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  deliverEnsured(answer: EnsureBankAnswer): readonly Vault[] {
    this.demandEnabled()
    return this.deliverListing(this.#listingOfEnsured(answer))
  }

  // A live bank's rows are delivered here, so the listing answered carries no parent. No live bank lists no vault, and
  // its bank row, a tombstone among them, goes on as the listing's parent.
  /** An ensureBank `answer` as a listing's answer of the vault rows, the bank row and its main gate row delivered first. */
  #listingOfEnsured(answer: EnsureBankAnswer): ListingListAnswer<VaultRecord, VaultSparse, SX.DamagedVault> {
    if (! answer.ok) { return answer }
    if (answer.val === null) { return { ...answer, act: 'gotvoid', val: { listed: [], damaged_rows: [] } } }
    this.bank.receiveParent(answer.parent)
    this.bank.gateListing.deliverRecord(answer.val.gates.main)
    return { ...answer, act: 'got', parent: null, val: { listed: answer.val.vaults, damaged_rows: answer.val.damaged_rows } }
  }
  // --

  // == [Deleting]: tryDel

  /** {@link Listing.tryDel}, refusing first a delete that names another life than the vault listed; its boxes cascade in the bankDB. */
  override async tryDel(ante: VaultSparse): Promise<ThingAnswer<Vault | null>> {
    try {
      const listed = this.at(ante)
      if ((listed !== null) && (listed.vault_tok !== ante.vault_tok)) { throw delOfOtherLife() }
    } catch (err) { return refusedAnswerOf(err, UNANSWERED) }
    return super.tryDel(ante)
  }
  // --

  // == [Defined by the vault listing]: isEnabled, demandEnabled, receiveParent, demandOfWorld, scopepathOf, makeThing, nothingStoredError, doTryList, damagedStoredError, doTryGet, doTryPut, tombstoneOver, doTryDel, watchRows, isOwnRow

  /** Whether this listing answers: its bank does. */
  get isEnabled(): boolean { return this.bank.isEnabled }

  /** Demand that this listing's bank answers. */
  demandEnabled(): this {
    this.bank.demandEnabled()
    return this
  }

  protected receiveParent(parent: unknown): void { this.bank.receiveParent(parent) }

  protected demandOfWorld(record: Fetched<VaultRecord, VaultSparse>): void {
    if (record.bank_tok !== this.bank.bank_tok) { throw rowOfOtherWorld(record, 'bank_tok') }
  }

  protected scopepathOf(scope: VaultScope): string {
    return ['vault', scope.user_id, scope.banklabel, scope.vaultlabel].join('^')
  }

  protected makeThing(central: Fetched<VaultRecord, VaultSparse>): Vault {
    return new Vault(this, central)
  }

  protected nothingStoredError(scope: VaultScope): VaultError { return vaultAbsent(scope) }

  // The bank's ensureBank lists its vaults.
  protected async doTryList() {
    return this.#listingOfEnsured(await this.bankDB.tryEnsureBank({ op: 'ensure', ...this.bank.scope, gates: ['main'] }))
  }

  protected damagedStoredError(damaged: SX.DamagedVault): VaultError { return vaultStoredDamaged(damaged) }

  protected doTryGet(scope: VaultScope) {
    const expected = this.at(scope)?.sparse ?? BX.shellVaultOf(scope)
    return this.bankDB.tryGetVault({ op: 'get', ...scope, bank_tok: this.bank.bank_tok, ifAbsent: 'nil', expected })
  }

  protected doTryPut(record: VaultRecord, { expected, ifAbsent, ifPresent }: ListingPutOpts<VaultSparse>) {
    const { user_id, banklabel, vaultlabel, bank_tok } = record
    return this.bankDB.tryPutVault({ op: 'put', user_id, banklabel, vaultlabel, bank_tok, ifAbsent, ifPresent, expected, record })
  }

  protected tombstoneOver(expected: VaultSparse): DelTombstone<VaultSparse> {
    return { ...expected, ...SX.nextRevisionOf(expected, nowMillis()), am: 'x', vault_tok: makeLifeTok() }
  }

  protected doTryDel(tombstone: DelTombstone<VaultSparse>, { expected }: ListingDelOpts<VaultSparse>) {
    const { user_id, banklabel, vaultlabel, bank_tok } = tombstone
    return this.bankDB.tryDelVault({ op: 'del', user_id, banklabel, vaultlabel, bank_tok, expected, record: tombstone })
  }

  // The bank's one watch: each notice goes to the bank's listing, then its gate's, then this one, and each keeps the rows of its own kind.
  protected watchRows(onNotice: (notice: Notice) => void, onBadNews: (news: VaultError) => void): () => void {
    const { listing, gateListing } = this.bank
    return this.bankDB.watch(this.bank.scope, (notice) => { listing.deliverNotice(notice); gateListing.deliverNotice(notice); onNotice(notice) }, onBadNews)
  }

  /** A vault row: the bank's watch also tells of its bank, gate and box rows. */
  protected isOwnRow(row: BankRow | GateRecord | VaultRow | BoxRow): row is VaultRow { return ('vaultlabel' in row) && ! ('boxlabel' in row) }
  // --

  /** Answers 'vault_listing', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'vault_listing' { return 'vault_listing' satisfies Modelkind }
}
