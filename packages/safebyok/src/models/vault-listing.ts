/** The vault listing: one bank's vaults. */

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

  /** The scope of `vaultish`, which must be in this bank. */
  scopeOf(vaultish: unknown):  VaultScope  { return vaultScope.parseConsistent(vaultish, this.bank.scope, { message: Phrases.otherScope }) }

  /** Parse `vaultish` as a {@link VaultSparse}. */
  sparseOf(vaultish: unknown): VaultSparse { return BX.vaultSparse.parse(vaultish) }

  /** Parse `vaultish` as a {@link VaultRecord} of this bank. */
  recordOf(vaultish: unknown): VaultRecord { return BX.vaultRecord.parseConsistent(vaultish, this.bank.scope, { message: Phrases.otherScope }) }
  // --

  // == [A vault's boxes]: boxListingOf

  /** A new listing of `vault`'s boxes under the vault's current life, with no watch started. */
  boxListingOf(vault: Vault): BoxListing {
    return new BoxListing(vault, { bankDB: this.bankDB, maxMillisSinceRefresh: this.bank.boxRefreshMillis })
  }
  // --

  // == [A birth's form]: recordOfBirth

  /** A new live vault record at `scope`, at the revision after `expected`, under this bank life and a new vault life. */
  recordOfBirth(scope: VaultScope, expected: SX.Revision): VaultRecord {
    const written_at = nowMillis()
    return { ...scope, fmt: BX.VaultFormat, ...SX.nextRevisionOf(expected, written_at), registered_at: written_at, am: 'a', bank_tok: this.bank.bank_tok, vault_tok: makeLifeTok() }
  }
  // --

  // == [Delivering what ensureBank answers]: deliverEnsured, listingOfEnsured

  /** Deliver an ensureBank `answer` to the bank, its gate and this listing, and return the vaults.
   * Chute: deliverEnsured → listingOfEnsured → deliverListing → deliverRecord → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  deliverEnsured(answer: EnsureBankAnswer): readonly Vault[] {
    this.demandEnabled()
    return this.deliverListing(this.#listingOfEnsured(answer))
  }

  // A live bank's rows are delivered here, so the listing answered carries no parent. No live bank lists no vault, and
  // its bank row, a tombstone among them, goes on as the listing's parent.
  /** Deliver the bank and gate rows of an ensureBank `answer`, and return it as a listing of its vault rows. */
  #listingOfEnsured(answer: EnsureBankAnswer): ListingListAnswer<VaultRecord, VaultSparse, SX.DamagedVault> {
    if (! answer.ok) { return answer }
    if (answer.val === null) { return { ...answer, act: 'gotvoid', val: { listed: [], damaged_rows: [] } } }
    this.bank.receiveParent(answer.parent)
    this.bank.gateListing.deliverRecord(answer.val.gates.main)
    return { ...answer, act: 'got', parent: null, val: { listed: answer.val.vaults, damaged_rows: answer.val.damaged_rows } }
  }
  // --

  // == [Deleting]: tryDel

  /** Non-throwing form of {@link Listing.del}. The vault's boxes are deleted with it.
   * Refuses where `ante` names another life than the vault listed.
   */
  override async tryDel(ante: VaultSparse): Promise<ThingAnswer<Vault | null>> {
    try {
      const listed = this.at(ante)
      if ((listed !== null) && (listed.vault_tok !== ante.vault_tok)) { throw delOfOtherLife() }
    } catch (err) { return refusedAnswerOf(err, UNANSWERED) }
    return super.tryDel(ante)
  }
  // --

  // == [Defined by the vault listing]: isEnabled, receiveParent, demandOfWorld, scopepathOf, makeThing, nothingStoredError, doTryList, damagedStoredError, doTryGet, doTryPut, tombstoneOver, doTryDel, watchRows, isOwnRow

  /** Whether this listing answers: its bank does. */
  get isEnabled(): boolean { return this.bank.isEnabled }

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

  /** Whether `row` is a vault row. */
  protected isOwnRow(row: BankRow | GateRecord | VaultRow | BoxRow): row is VaultRow { return ('vaultlabel' in row) && ! ('boxlabel' in row) }
  // --

  /** Always `'vault_listing'`: marks this model for a {@link Modelkind} check. */
  get modelkind(): 'vault_listing' { return 'vault_listing' satisfies Modelkind }
}
