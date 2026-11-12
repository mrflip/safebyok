/** A vault's boxes as this device has them: the box listing, handed its vault, under one life of it. */

import { VaultError } from '../refusals/errors'
import type { Modelkind } from '../helpers/consts'
import { nowMillis } from '../helpers/clock'
import { makeLifeTok } from '../helpers/crypto'
import { tattoo } from '../helpers/helpers'
import { boxAbsent, boxStoredDamaged, boxNotListed, instanceDisabled, rowOfOtherWorld } from '../refusals/throwers'
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

  /** The scope of the vault listed, and the life of it this listing was made under, tattooed on by the constructor. */
  declare readonly user_id:    string
  declare readonly banklabel:  string
  declare readonly vaultlabel: string
  declare readonly bank_tok:   string
  declare readonly vault_tok:  string
  readonly scope:              VaultScope
  /** The bank the vault is of. */
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

  /** The scope of `boxish`, which must be this vault's: no listing answers for another's. */
  scopeOf(boxish: unknown):  Boxscope  { return boxscope.parseConsistent(boxish, this.scope) }

  /** Parse `boxish` as a {@link BoxSparse}. */
  sparseOf(boxish: unknown): BoxSparse { return BX.boxSparse.parse(boxish) }

  /** Parse `boxish` as a {@link BoxRecord} of this vault. */
  recordOf(boxish: unknown): BoxRecord { return BX.boxRecord.parseConsistent(boxish, this.scope) }
  // --

  // == [Methods]: puttable, create, tryCreate, shellFor

  /** The box a put of `scoped` goes through: the one listed, or a void one made where none is listed. */
  puttable(scoped: unknown, opts: BoxPutOpts = {}): Box {
    const { ifAbsent } = VX.boxPutOpts.parse(opts)
    const scope = this.scopeOf(scoped)
    const listed = this.at(scope)
    if ((listed === null) && (ifAbsent === 'fail')) { throw boxNotListed(scope) }
    return listed ?? this.#shellFor(scope)
  }

  /** The box a delete of `scoped` goes through: the one listed, or a void one made where none is listed. */
  deletable(scoped: unknown): Box { return this.puttable(scoped) }

  /** Seals a new box and puts it where no live record stands, answering the box listed. */
  async create(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Box> {
    const { ifAbsent, ifPresent, maxMillisSinceRefresh, maxWorldMillis } = VX.boxCreateOpts.parse(opts)
    const dna = boxDna.parse(input)
    return this.puttable(input, { ifAbsent }).put(dna, { ifAbsent, ifPresent, maxMillisSinceRefresh, maxWorldMillis })
  }

  /** Non-throwing form of {@link create}. */
  tryCreate(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Outcome<Box>> { return outcomeOf(() => this.create(input, opts)) }

  /** A void box listed under `scope`. */
  #shellFor(scope: Boxscope): Box { return this.deliverRecord(BX.shellBoxOf(this.#queryOf(scope))) }

  /** `scope` under the life of the vault this listing was made under: its `bank_tok` and `vault_tok`. */
  #queryOf(scope: Boxscope): BoxQuery { return { ...scope, bank_tok: this.bank_tok, vault_tok: this.vault_tok } }
  // --

  // == [Above it]: ensureTimelyWorld

  /** The vault refreshed within `maxMillis`, by default its own horizon. */
  override async ensureTimelyWorld(maxMillis?: number): Promise<void> { await this.vault.ensureTimely(VX.maxMillis.parse(maxMillis)) }
  // --

  // == [Defined by the box listing]: isEnabled, demandEnabled, receiveParent, demandOfWorld, scopepathOf, makeThing, nothingStoredError, doTryList, damagedStoredError, doTryGet, doTryPut, tombstoneOver, doTryDel, watchRows, isOwnRow

  /** Whether this listing answers: its vault does, and is still of the life this listing was made under. */
  get isEnabled(): boolean { return this.vault.isEnabled && (this.vault.vault_tok === this.vault_tok) }

  /** Demand that this listing's vault answers, and is still of the life this listing was made under. */
  demandEnabled(): this {
    this.vault.demandEnabled()
    if (this.vault.vault_tok !== this.vault_tok) { throw instanceDisabled() }
    return this
  }

  protected receiveParent(parent: unknown): void { this.vault.receiveParent(parent) }

  protected demandOfWorld(record: Fetched<BoxRecord, BoxSparse>): void {
    if (record.bank_tok !== this.bank_tok)   { throw rowOfOtherWorld(record, 'bank_tok') }
    if (record.vault_tok !== this.vault_tok) { throw rowOfOtherWorld(record, 'vault_tok') }
  }

  protected scopepathOf(scope: Boxscope): string {
    return ['box', scope.user_id, scope.banklabel, scope.vaultlabel, scope.boxlabel].join('^')
  }

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

  /** A box row of this life of the vault: one under another life is no row. */
  protected isOwnRow(row: BankRow | GateRecord | VaultRow | BoxRow): row is BoxRow { return ('boxlabel' in row) && (BX.vaultLifeOf(row) === BX.vaultLifeOf(this)) }
  // --

  /** Answers 'box_listing', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'box_listing' { return 'box_listing' satisfies Modelkind }
}
