/** The box listing: one vault's boxes, under one life of the vault. */

import { VaultError } from '../refusals/errors'
import type { Modelkind } from '../helpers/consts'
import { nowMillis } from '../helpers/clock'
import { makeLifeTok } from '../helpers/crypto'
import { tattoo } from '../helpers/helpers'
import { boxAbsent, boxStoredDamaged, boxNotListed, rowOfOtherLife } from '../refusals/throwers'
import { type Outcome, outcomeOf } from '../refusals/outcome'
import { type Boxscope, type VaultScope, boxscope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import * as BX from '../shapes/shapes-bankdb'
import * as VX from '../shapes/shapes-vaultish'
import { type BoxCreateOpts, type BoxDna, type BoxPutOpts, type BoxSnapshot, type DelTombstone, type Fetched, type ListingDelOpts, type ListingOpts, type ListingPutOpts, boxDna } from '../shapes/shapes-vaultish'
import type { BankRow, BoxQuery, BoxRow, DamagedBox, GateRecord, VaultRow, BoxRecord, BoxSparse } from '../shapes/shapes-bankdb'
import type { Notice } from '../storage/bank-db'
import type { Bank } from './bank'
import { Box } from './box'
import { Listing } from './listing'
import type { Vault } from './vault'

/** One vault's boxes, by boxlabel. */
export class BoxListing extends Listing<Boxscope, BoxRecord, BoxSparse, BoxSnapshot, Box, DamagedBox> {
  // == [Props]: user_id, banklabel, vaultlabel, bank_tok, vault_tok, scope, bank, vault

  /** The vault's scope, and the bank and vault life this listing was made under (these five fields). */
  declare readonly user_id:    string
  declare readonly banklabel:  string
  declare readonly vaultlabel: string
  declare readonly bank_tok:   string
  declare readonly vault_tok:  string
  readonly scope:              VaultScope
  /** The vault's bank. */
  readonly bank:               Bank
  /** The vault whose boxes these are. */
  readonly vault:              Vault
  // --

  // == [Construction]: constructor, scopeOf, sparseOf, recordOf

  // A vault of a new life makes a new box listing: this one answers only while the vault is of the life it was made under.
  /** The listing of `vault`'s boxes, under the life the vault has now. */
  constructor(vault: Vault, opts: ListingOpts) {
    const checked = VX.listedUnder.vault.parse(vault)
    super(checked.bank.device, opts)
    this.bank  = checked.bank
    this.vault = checked
    this.scope = Object.freeze(checked.scope)
    tattoo(this, { ...this.scope, bank_tok: checked.bank_tok, vault_tok: checked.vault_tok })
    Object.freeze(this)
  }

  /** The scope of `boxish`, which must be in this vault. */
  scopeOf(boxish: unknown):  Boxscope  { return boxscope.parseConsistent(boxish, this.scope) }

  /** Parse `boxish` as a {@link BoxSparse}. */
  sparseOf(boxish: unknown): BoxSparse { return BX.boxSparse.parse(boxish) }

  /** Parse `boxish` as a {@link BoxRecord} of this vault. */
  recordOf(boxish: unknown): BoxRecord { return BX.boxRecord.parseConsistent(boxish, this.scope) }
  // --

  // == [Methods]: puttable, create, tryCreate, shellFor

  /** The box to put `scoped` through: the one listed, or else a void box, listed now.
   * Under `ifAbsent: 'fail'`, refuses where none is listed.
   */
  puttable(scoped: unknown, opts: BoxPutOpts = {}): Box {
    const { ifAbsent } = VX.boxPutOpts.parse(opts)
    const scope = this.scopeOf(scoped)
    const listed = this.at(scope)
    if ((listed === null) && (ifAbsent === 'fail')) { throw boxNotListed(scope) }
    return listed ?? this.#shellFor(scope)
  }

  /** The box to delete `scoped` through: the one listed, or else a void box, listed now. */
  deletable(scoped: unknown): Box { return this.puttable(scoped) }

  /** Create a new box for whisper (encrypted) and sidecar (readable), sealed against the box metadata.
   * See `sealedRecordOf` in models/box.ts for what "encrypted" and "sealed" mean. Over a live box:
   * - `ifPresent: 'fail'` (default): refuse
   * - `ifPresent: 'repl'`: replace it
   * - `ifPresent: 'get'`: put nothing, and return the live box
   */
  async create(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Box> {
    const { ifAbsent, ifPresent, maxMillisSinceRefresh, maxParentMillis } = VX.boxCreateOpts.parse(opts)
    const dna = boxDna.parse(input)
    return this.puttable(input, { ifAbsent }).put(dna, { ifAbsent, ifPresent, maxMillisSinceRefresh, maxParentMillis })
  }

  /** Non-throwing form of {@link create}. */
  tryCreate(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Outcome<Box>> { return outcomeOf(() => this.create(input, opts)) }

  /** A void box, newly listed at `scope`. */
  #shellFor(scope: Boxscope): Box { return this.deliverRecord(BX.shellBoxOf(this.#queryOf(scope))) }

  /** `scope` with the `bank_tok` and `vault_tok` this listing was made under. */
  #queryOf(scope: Boxscope): BoxQuery { return { ...scope, bank_tok: this.bank_tok, vault_tok: this.vault_tok } }
  // --

  // == [Above it]: ensureParentTimely

  /** Refresh the vault, unless it was refreshed within `maxMillis` (default: the vault's own horizon). */
  override async ensureParentTimely(maxMillis?: number): Promise<void> { await this.vault.ensureTimely(VX.maxMillis.parse(maxMillis)) }
  // --

  // == [Defined by the box listing]: isEnabled, receiveParent, demandOfLife, scopepathOf, labelOf, makeThing, nothingStoredError, doTryList, damagedStoredError, doTryGet, doTryPut, tombstoneOver, doTryDel, watchRows, isOwnRow

  /** Whether this listing answers: its vault does, and is still of the life this listing was made under. */
  get isEnabled(): boolean { return this.vault.isEnabled && (this.vault.vault_tok === this.vault_tok) }

  protected receiveParent(parent: unknown): void { this.vault.receiveParent(parent) }

  protected demandOfLife(record: Fetched<BoxRecord, BoxSparse>): void {
    if (record.bank_tok !== this.bank_tok)   { throw rowOfOtherLife(record, 'bank_tok') }
    if (record.vault_tok !== this.vault_tok) { throw rowOfOtherLife(record, 'vault_tok') }
  }

  protected scopepathOf(scope: Boxscope): string {
    return ['box', scope.user_id, scope.banklabel, scope.vaultlabel, scope.boxlabel].join('^')
  }

  protected labelOf({ boxlabel }: Boxscope): string { return boxlabel }

  protected makeThing(central: Fetched<BoxRecord, BoxSparse>): Box {
    return new Box(this, central)
  }

  protected nothingStoredError(scope: Boxscope): VaultError { return boxAbsent(scope) }

  protected async doTryList() {
    const { bank_tok, vault_tok } = this
    const answer = await this.bankDB.tryListBoxes({ op: 'list', ...this.scope, bank_tok, vault_tok })
    return answer.ok ? { ...answer, val: { listed: answer.val.boxes, damaged_rows: answer.val.damaged_rows } } : answer
  }

  protected damagedStoredError(damaged: DamagedBox): VaultError { return boxStoredDamaged(damaged) }

  protected doTryGet(scope: Boxscope) {
    const asked = this.#queryOf(scope)
    const expected = this.at(scope)?.sparse ?? BX.shellBoxOf(asked)
    return this.bankDB.tryGetBox({ op: 'get', ...asked, ifAbsent: 'nil', expected })
  }

  protected doTryPut(record: BoxRecord, { expected, ifAbsent, ifPresent }: ListingPutOpts<BoxSparse>) {
    const { user_id, banklabel, vaultlabel, boxlabel, bank_tok, vault_tok } = record
    return this.bankDB.tryPutBox({ op: 'put', user_id, banklabel, vaultlabel, boxlabel, bank_tok, vault_tok, ifAbsent, ifPresent, expected, record })
  }

  protected tombstoneOver(expected: BoxSparse): DelTombstone<BoxSparse> {
    return { ...expected, ...SX.nextRevisionOf(expected, nowMillis()), am: 'x', box_tok: makeLifeTok() }
  }

  protected doTryDel(tombstone: DelTombstone<BoxSparse>, { expected }: ListingDelOpts<BoxSparse>) {
    const { user_id, banklabel, vaultlabel, boxlabel, bank_tok, vault_tok } = tombstone
    return this.bankDB.tryDelBox({ op: 'del', user_id, banklabel, vaultlabel, boxlabel, bank_tok, vault_tok, expected, record: tombstone })
  }

  protected watchRows(onNotice: (notice: Notice) => void, onBadNews: (news: VaultError) => void): () => void { return this.bankDB.watch(this.scope, onNotice, onBadNews) }

  /** Whether `row` is a box row of the vault life this listing was made under. */
  protected isOwnRow(row: BankRow | GateRecord | VaultRow | BoxRow): row is BoxRow { return ('boxlabel' in row) && (BX.vaultLifeOf(row) === BX.vaultLifeOf(this)) }
  // --

  /** Always `'box_listing'`: marks this model for a {@link Modelkind} check. */
  get modelkind(): 'box_listing' { return 'box_listing' satisfies Modelkind }
}
