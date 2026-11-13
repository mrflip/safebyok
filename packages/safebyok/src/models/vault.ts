import type { Modelkind } from '../helpers/consts'
import { checkedConsistent } from '../helpers/validator'
import { tattoo } from '../helpers/helpers'
import * as Phrases from '../helpers/phrases'
import type { CipherCtxRecord } from '../helpers/crypto'
import { type Outcome, demandGood, outcomeOf } from '../refusals/outcome'
import type { VaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import * as BX from '../shapes/shapes-bankdb'
import type { VaultRecord, VaultSparse } from '../shapes/shapes-bankdb'
import * as GX from '../shapes/shapes-gateish'
import type { SealedWhisper } from '../shapes/shapes-gateish'
import type { BoxPut, BoxPutOpts, Fetched, FetchOpts, TimelyOpts, VaultSnapshot } from '../shapes/shapes-vaultish'
import { deletedVault } from '../refusals/throwers'
import type { Bank } from './bank'
import type { Box } from './box'
import type { BoxListing } from './box-listing'
import { Storable } from './storable'
import type { VaultListing } from './vault-listing'

/** A vault in this tab, with its record's fields as its own props.
 * Its boxes are sealed under its bank's lease.
 */
export class Vault extends Storable<VaultScope, VaultRecord, VaultSparse, VaultSnapshot> {
  // == [Props]: user_id, banklabel, vaultlabel, bank_tok, listing, #boxListing

  /** The fields of this vault's scope. */
  declare readonly user_id:    string
  declare readonly banklabel:  string
  declare readonly vaultlabel: string
  /** The life of this vault's bank. It never changes. */
  declare readonly bank_tok:   string
  declare readonly listing:    VaultListing

  /** The box listing last asked for, of the life in hand; null until asked for. */
  #boxListing: BoxListing | null = null
  // --

  // == [Getters]: bank, vault_tok, fmt, boxListing

  /** The bank this vault is of. */
  get bank(): Bank { return this.listing.bank }

  /** This vault's life, as the record in hand has it. A vault deleted and made again has another. */
  get vault_tok(): string { return this.central.vault_tok }

  /** The storage format of the record in hand. */
  get fmt(): number { return this.central.fmt }

  /** The listing of this vault's boxes in the life in hand.
   * Another life of the vault gets a new listing, so ask for it here each time. A deleted vault's has no boxes, and
   * storage refuses its calls as `absent_vault`.
   */
  get boxListing(): BoxListing {
    if (this.#boxListing?.vault_tok !== this.vault_tok) { this.#boxListing = this.listing.boxListingOf(this) }
    return this.#boxListing
  }
  // --

  // == [Construction]: assignInitialProps

  /** Set `bank_tok`, and the props the base sets. */
  protected override assignInitialProps(central: Fetched<VaultRecord, VaultSparse>): void {
    tattoo(this, { bank_tok: central.bank_tok }, { configurable: false })
    super.assignInitialProps(central)
  }
  // --

  // == [Above the boxes]: sealStampedString, unsealStampedString, stampsOf, receiveParent

  /** Seal `whisperText` under a fresh boxKey, wrapped by the bankKey, both bound to the bank, this vault and `stamp`.
   * `stamp` must be of this vault's scope and life.
   */
  async sealStampedString(whisperText: string, stamp: CipherCtxRecord): Promise<SealedWhisper> {
    return this.bank.sealWith(whisperText, this.#stampsOf(stamp))
  }

  /** The text in `sealed`, which opens only under the bank, this vault and `stamp` it was sealed with. */
  async unsealStampedString(sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<string> {
    return this.bank.unsealWith(sealed, this.#stampsOf(stamp))
  }

  /** This vault's stamp, then `stamp`, checked to be of this vault's scope and life. */
  #stampsOf(stamp: CipherCtxRecord): CipherCtxRecord[] {
    this.demandEnabled().demandPresent()
    const life = { ...this.scope, bank_tok: this.bank_tok, vault_tok: this.vault_tok }
    checkedConsistent(stamp, life, { kind: 'unexpected_error', message: Phrases.StampOfOtherVault })
    return [GX.vaultStamp.parse(this), stamp]
  }

  // The vault listing receives the parent as it would a row from any vault request: a newer row of another life is
  // received into this Vault, and its boxes go.
  /** Deliver `parent`, the vault row a box answer carries, to the vault listing. */
  receiveParent(parent: unknown): void { this.listing.deliverRecord(BX.vaultRow.refusingAs('record_conflict').parse(parent)) }
  // --

  // == [Box verbs]: beginWatch, bringUp, getBox, fetchBox, putBox, delBox, each with its try form

  /** List this vault's boxes and start their watch. Call it again to list them afresh. */
  async beginWatch(): Promise<this> {
    this.demandWatchable()
    const brought = await outcomeOf(() => this.#bringUp())
    this.bank.device.announce({ kind: 'helloed', outcome: brought, vault: this })
    demandGood(brought)
    return this
  }

  /** Start the boxes' watch, and list them. */
  async #bringUp(): Promise<void> {
    await this.boxListing.hello()
    await this.boxListing.list()
  }

  /** Non-throwing form of {@link beginWatch}. */
  tryBeginWatch(): Promise<Outcome<this>> { return outcomeOf(() => this.beginWatch()) }

  /** The box at `boxlabel`, its record fetched if stale.
   * - `ifAbsent: 'fail'` -- refuse `absent_box` where the box was never stored, or deleted (default)
   * - `ifAbsent: 'nil'`  -- resolve null there
   *
   * Chute: vault.getBox → listing.get → tryGet → #doTryGetJoined → doTryGet → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async getBox(boxlabel: string, opts: FetchOpts = {}): Promise<Box | null> {
    return this.boxListing.get({ ...this.scope, boxlabel }, opts)
  }

  /** Non-throwing form of {@link getBox}. */
  tryGetBox(boxlabel: string, opts: FetchOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.getBox(boxlabel, opts)) }

  /** {@link getBox}, always fetching the box's record. */
  fetchBox(boxlabel: string, opts: FetchOpts = {}): Promise<Box | null> { return this.getBox(boxlabel, { ...opts, maxMillisSinceRefresh: 0 }) }

  /** Non-throwing form of {@link fetchBox}. */
  tryFetchBox(boxlabel: string, opts: FetchOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.fetchBox(boxlabel, opts)) }

  /** Seal `patch` over the box at its `boxlabel`, and store it, resolving the box.
   * {@link Box.put} has the options.
   */
  async putBox(patch: BoxPut, opts: BoxPutOpts = {}): Promise<Box> {
    const box = this.boxListing.puttable({ ...patch, ...this.scope }, opts)
    return box.put(patch, opts)
  }

  /** Non-throwing form of {@link putBox}. */
  tryPutBox(patch: BoxPut, opts: BoxPutOpts = {}): Promise<Outcome<Box>> { return outcomeOf(() => this.putBox(patch, opts)) }

  /** Delete the box at `boxlabel`, resolving it, now holding its tombstone.
   * Refuses `absent_box` where the box was never stored, or is already deleted.
   */
  async delBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Box | null> {
    const scope = { ...this.scope, boxlabel }
    const box = await this.boxListing.deletable(scope).del(scope, opts)
    return SX.isRowAt(box, SX.VoidRevision) ? null : box
  }

  /** Non-throwing form of {@link delBox}. */
  tryDelBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.delBox(boxlabel, opts)) }
  // --

  // == [Guards]: isLocked, demandWatchable, demandPresent, ensureTimely

  // A vault has no lock of its own: a host asks the bank.
  /** Whether this vault's bank is locked. */
  protected get isLocked(): boolean { return this.bank.isLocked }

  /** Throw unless `isEnabled` and `isPresent`. */
  demandWatchable(): this { return this.demandEnabled().demandPresent() }

  /** Demand that this vault is present. */
  demandPresent(): this {
    if (! this.isPresent) { throw deletedVault() }
    return this
  }

  /** This vault, fetched unless refreshed within `maxMillis` (default: its listing's `maxMillisSinceRefresh`). */
  ensureTimely(maxMillis?: number): Promise<this> { return this.hydrate({ maxMillisSinceRefresh: maxMillis }) }
  // --

  // == [Aligning]: align

  // The listing in hand is aligned first, as a child: of a life before this one, it ends its watch and its boxes drop
  // their whispers. A tombstone is a life of its own, so a vault deleted lets go of the listing it had while live.
  /** Align (see {@link Storable.align}), discarding a box listing of a life before this one. Never throws. */
  override align(): void {
    super.align()
    if (this.#boxListing?.vault_tok !== this.vault_tok) { this.#boxListing = null }
  }
  // --

  // == [Protected, overriding Storable's]: children, isFullRecord, lifeTokPathOf, makeSnapshot

  // The listing in hand may be of a life before this one: aligned, it ends its watch and its boxes drop their whispers.
  /** The box listing in hand, if any. */
  protected get children(): readonly BoxListing[] { return this.#boxListing === null ? [] : [this.#boxListing] }

  /** Whether `fetched` is alive: a vault row has nothing more to fetch. */
  protected isFullRecord(fetched: VaultSparse): fetched is VaultRecord { return fetched.am === 'a' }

  /** The life of `record`: its bank's `bank_tok`, then its `vault_tok` ({@link BX.vaultLifeOf}). */
  protected lifeTokPathOf(record: Fetched<VaultRecord, VaultSparse>): string { return BX.vaultLifeOf(record) }

  protected makeSnapshot(): VaultSnapshot {
    return Object.freeze({
      ...this.scope,
      vault_tok:     this.vault_tok,
      revision_tok:  this.revision_tok,
      revision_seq:  this.revision_seq,
      registered_at: this.registered_at,
      written_at:    this.written_at,
      isPresent:     this.isPresent,
    })
  }
  // --

  /** Always `'vault'`: marks this model for a {@link Modelkind} check. */
  get modelkind(): 'vault' { return 'vault' satisfies Modelkind }
}
