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

/** A vault as this device has it: a storable that ducks as its record, standing for its scope through its lives, whose boxes are sealed under its bank's lease. */
export class Vault extends Storable<VaultScope, VaultRecord, VaultSparse, VaultSnapshot> {
  // == [Props]: user_id, banklabel, vaultlabel, bank_tok, listing, #boxListing

  /** The scope, tattooed on by Storable's constructor. */
  declare readonly user_id:    string
  declare readonly banklabel:  string
  declare readonly vaultlabel: string
  /** The life of the bank this vault is of, inscribed once by `assignInitialProps`. */
  declare readonly bank_tok:   string
  declare readonly listing:    VaultListing

  /** The listing of this vault's boxes under the life in hand; null until asked for, and again once a record of another life is received. */
  #boxListing: BoxListing | null = null
  // --

  // == [Getters]: bank, vault_tok, fmt, boxListing

  /** The bank this vault is of. */
  get bank(): Bank { return this.listing.bank }

  /** This vault's life, as the record in hand has it: a vault deleted or made again for its scope has another. */
  get vault_tok(): string { return this.central.vault_tok }

  /** The storage format of the record in hand. */
  get fmt(): number { return this.central.fmt }

  /** The listing of this vault's boxes under the life in hand, made on first asking. */
  get boxListing(): BoxListing {
    this.#boxListing ??= this.listing.boxListingOf(this)
    return this.#boxListing
  }
  // --

  // == [Construction]: assignInitialProps

  /** Inscribes this vault's `bank_tok` beside what the base inscribes. */
  protected override assignInitialProps(central: Fetched<VaultRecord, VaultSparse>): void {
    tattoo(this, { bank_tok: central.bank_tok }, { configurable: false })
    super.assignInitialProps(central)
  }
  // --

  // == [The bank's lock]: lock, letBoxesGo

  /** Tell the listeners, this vault's and its boxes', the bank's lock has moved; once this vault no longer answers, its boxes go. Never throws. */
  override lock(): this {
    super.lock()
    if (this.isEnabled) { this.#boxListing?.lock() } else { this.#letBoxesGo() }
    return this
  }

  // The box listing answers only under the life it was made under, so its boxes no longer answer, and drop their whispers.
  /** End the boxes' watch, bring them up to the lock, and let go of their listing: the next asking makes another. */
  #letBoxesGo(): void {
    const boxListing = this.#boxListing
    this.#boxListing = null
    boxListing?.goodbye()
    boxListing?.lock()
  }
  // --

  // == [Above the boxes]: sealStampedString, unsealStampedString, stampsOf, receiveParent

  /** `whisperText` sealed under a fresh boxKey under the bankKey, both bound to the bank, this vault and `stamp`. */
  async sealStampedString(whisperText: string, stamp: CipherCtxRecord): Promise<SealedWhisper> {
    return this.bank.sealWith(whisperText, this.#stampsOf(stamp))
  }

  /** The text `sealed` contains, bound to the bank, this vault and `stamp`. */
  async unsealStampedString(sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<string> {
    return this.bank.unsealWith(sealed, this.#stampsOf(stamp))
  }

  /** This vault's stamp, then `stamp`, which must be of this vault's scope and life. */
  #stampsOf(stamp: CipherCtxRecord): CipherCtxRecord[] {
    this.demandEnabled().demandPresent()
    const life = { ...this.scope, bank_tok: this.bank_tok, vault_tok: this.vault_tok }
    checkedConsistent(stamp, life, { kind: 'unexpected_error', message: Phrases.StampOfOtherVault })
    return [GX.vaultStamp.parse(this), stamp]
  }

  // The vault listing receives the parent as it would a row from any vault request: a newer row of another life is
  // received into this Vault, and its boxes go.
  /** Deliver the vault row a box answer carries. */
  receiveParent(parent: unknown): void { this.listing.deliverRecord(BX.vaultRow.refusingAs('record_conflict').parse(parent)) }
  // --

  // == [Box verbs]: beginWatch, bringUp, getBox, fetchBox, putBox, delBox, each with its try form

  /** List this vault's boxes and start their watch. */
  async beginWatch(): Promise<this> {
    this.demandWatchable()
    const brought = await outcomeOf(() => this.#bringUp())
    this.bank.device.announce({ kind: 'helloed', outcome: brought, vault: this })
    demandGood(brought)
    return this
  }

  /** The boxes' watch started and their listing fetched. */
  async #bringUp(): Promise<void> {
    await this.boxListing.hello()
    await this.boxListing.list()
  }

  /** Non-throwing form of {@link beginWatch}. */
  tryBeginWatch(): Promise<Outcome<this>> { return outcomeOf(() => this.beginWatch()) }

  /** Hydrate and return the box listed at `boxlabel` (i.e. fetch if stale). A missing box is null for `ifAbsent: 'nil'`, or refused for `ifAbsent: 'fail'`.
   * Chute: vault.getBox → listing.get → tryGet → #doTryGetJoined → doTryGet → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async getBox(boxlabel: string, opts: FetchOpts = {}): Promise<Box | null> {
    return this.boxListing.get({ ...this.scope, boxlabel }, opts)
  }

  /** Non-throwing form of {@link getBox}. */
  tryGetBox(boxlabel: string, opts: FetchOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.getBox(boxlabel, opts)) }

  /** {@link getBox}, the box's record fetched whatever its age. */
  fetchBox(boxlabel: string, opts: FetchOpts = {}): Promise<Box | null> { return this.getBox(boxlabel, { ...opts, maxMillisSinceRefresh: 0 }) }

  /** Non-throwing form of {@link fetchBox}. */
  tryFetchBox(boxlabel: string, opts: FetchOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.fetchBox(boxlabel, opts)) }

  /** Seals `patch` over the box listed at its `boxlabel` as the next revision and puts it, answering the box; {@link Box.put} has the options and the refusals. */
  async putBox(patch: BoxPut, opts: BoxPutOpts = {}): Promise<Box> {
    const box = this.boxListing.puttable({ ...patch, ...this.scope }, opts)
    return box.put(patch, opts)
  }

  /** Non-throwing form of {@link putBox}. */
  tryPutBox(patch: BoxPut, opts: BoxPutOpts = {}): Promise<Outcome<Box>> { return outcomeOf(() => this.putBox(patch, opts)) }

  /** Delete the box listed at `boxlabel`, and return it.
   * Refuses `absent_box` for a box already deleted or never stored.
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

  /** Whether the bank is locked, read live: a vault has no lock of its own, and a host asks the bank. */
  protected get isLocked(): boolean { return this.bank.isLocked }

  /** A watch needs the vault enabled and present. */
  demandWatchable(): this { return this.demandEnabled().demandPresent() }

  /** Demand that this vault is present. */
  demandPresent(): this {
    if (! this.isPresent) { throw deletedVault() }
    return this
  }

  /** This vault, refreshed within `maxMillis`, by default its horizon: as it stands where it is recent, otherwise fetched. */
  ensureTimely(maxMillis?: number): Promise<this> { return this.hydrate({ maxMillisSinceRefresh: maxMillis }) }
  // --

  // == [Protected, overriding Storable's]: adopt, isFullRecord, lifeTokPathOf, makeSnapshot

  /** Adopt `central`. A record of another life, a tombstone among them, lets the boxes of the life in hand go. */
  protected override adopt(central: Fetched<VaultRecord, VaultSparse>): void {
    const isOtherLife = ! this.isOfLife(central)
    super.adopt(central)
    if (isOtherLife) { this.#letBoxesGo() }
  }

  /** A vault row has nothing encrypted: a full one is one alive. */
  protected isFullRecord(fetched: VaultSparse): fetched is VaultRecord { return fetched.am === 'a' }

  /** A vault's life is its bank's and its own: {@link BX.vaultLifeOf}. */
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

  /** Answers 'vault', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'vault' { return 'vault' satisfies Modelkind }
}
