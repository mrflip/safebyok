import { cloneDeep, mergeWith } from 'es-toolkit'
import { nowMillis } from '../helpers/clock'
import { type CipherCtxRecord, makeLifeTok } from '../helpers/crypto'
import { ENCRYPTED, LOCKED, UNANSWERED, VEILED, type Modelkind } from '../helpers/consts'
import { type Outcome, demandGood, outcomeOf } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import * as CX from '../shapes/shapes-core'
import type { Sidecar, Boxscope, Whisper } from '../shapes/shapes-core'
import type { BoxExposure } from '../shapes/shapes-enums'
import * as SX from '../shapes/shapes-storage'
import * as BX from '../shapes/shapes-bankdb'
import * as VX from '../shapes/shapes-vaultish'
import { type BoxExposedPatch, type BoxPatch, type BoxPatchParsed, type BoxPutOpts, type BoxSnapshot, type Fetched, type ThingAnswer, type TimelyOpts } from '../shapes/shapes-vaultish'
import type { BoxRecord, BoxSparse } from '../shapes/shapes-bankdb'
import { stableJsonify } from '../helpers/stable-jsonify'
import { tattoo } from '../helpers/helpers'
import { boxAbsent, notExposed, undecodedWhisper } from '../refusals/throwers'
import type { Bank } from './bank'
import type { BoxListing } from './box-listing'
import { Storable } from './storable'
import type { Vault } from './vault'
import { refusedAnswerOf } from '../storage/bank-db'

/** A box in this tab, with its record's fields as its own props.
 * Its whisper opens while the bank is unlocked.
 */
export class Box extends Storable<Boxscope, BoxRecord, BoxSparse, BoxSnapshot> {
  // == [Props]: user_id, banklabel, vaultlabel, boxlabel, bank_tok, vault_tok, listing, #exposed, #isVeiled

  /** The fields of this box's scope. */
  declare readonly user_id:    string
  declare readonly banklabel:  string
  declare readonly vaultlabel: string
  declare readonly boxlabel:   string
  /** The life of this box's bank. It never changes. */
  declare readonly bank_tok:   string
  /** The life of this box's vault. It never changes. */
  declare readonly vault_tok:  string

  declare readonly listing: BoxListing

  /** The whisper exposed, a plain object the host may edit, or null. */
  #exposed: Whisper | null = null
  /** Whether the whisper exposed is veiled. */
  #isVeiled = false
  // --

  // == [Getters]: bank, vault, fmt, box_tok, sidecar, box_key_wrapped, whisper_codec, whisper_schema_version, whisper_ciphered, whisper, exposure, isShowing, isVeiled, isLocked

  /** The bank this box lies in. */
  get bank(): Bank { return this.listing.bank }

  /** The vault this box lies in. */
  get vault(): Vault { return this.listing.vault }

  /** The storage format of the record in hand. */
  get fmt(): number { return this.central.fmt }

  /** This box's life, as the record in hand has it. A box deleted and put again has another. */
  get box_tok(): string { return this.central.box_tok }

  /** The box's {@link Sidecar}, readable while the bank is locked, or null where the record in hand is not full. */
  get sidecar(): Sidecar | null { return this.full?.sidecar ?? null }

  /** The wrapped boxKey of the record in hand, or null where the record is not full. */
  get box_key_wrapped():        BoxRecord['box_key_wrapped'] | null  { return this.full?.box_key_wrapped ?? null }
  /** The whisper's codec in the record in hand, or null where the record is not full. */
  get whisper_codec():          'json_v1' | null                     { return this.full?.whisper_codec ?? null }
  /** The whisper's schema version in the record in hand, or null where the record is not full. */
  get whisper_schema_version(): 1 | null                             { return this.full?.whisper_schema_version ?? null }
  /** The ciphered whisper in the record in hand, or null where the record is not full. */
  get whisper_ciphered():       BoxRecord['whisper_ciphered'] | null { return this.full?.whisper_ciphered ?? null }

  /** The whisper exposed on this box, or a placeholder object while it is hidden.
   * Ask {@link exposure} why it is hidden: never inspect the placeholder.
   */
  get whisper(): Whisper {
    if (this.#exposed === null) { return ENCRYPTED }
    if (this.isLocked)          { return LOCKED }
    if (this.#isVeiled)         { return VEILED }
    return this.#exposed
  }

  // Taken in the order `whisper` picks its bag.
  /** Whether {@link whisper} shows the whisper, or why it does not:
   * - `'unexposed'` -- nothing is exposed, whether or not the bank is locked
   * - `'locked'`    -- exposed, but hidden while the bank is locked
   * - `'veiled'`    -- exposed, but hidden by {@link veil}
   * - `'showing'`   -- exposed and shown
   */
  get exposure(): BoxExposure {
    if (this.#exposed === null) { return 'unexposed' }
    if (this.isLocked)          { return 'locked' }
    if (this.#isVeiled)         { return 'veiled' }
    return 'showing'
  }

  /** Whether {@link whisper} shows the whisper: exposed, unlocked and not veiled. */
  get isShowing(): boolean { return this.exposure === 'showing' }

  /** Whether {@link veil} has hidden the whisper exposed, whether or not the bank is locked. */
  get isVeiled(): boolean { return this.#isVeiled }

  /** Whether this box's bank is locked. */
  get isLocked(): boolean { return this.bank.isLocked }
  // --

  // == [Construction]: assignInitialProps

  /** Set `bank_tok` and `vault_tok`, and the props the base sets. */
  protected override assignInitialProps(central: Fetched<BoxRecord, BoxSparse>): void {
    tattoo(this, { bank_tok: central.bank_tok, vault_tok: central.vault_tok }, { configurable: false })
    super.assignInitialProps(central)
  }
  // --

  // == [The whisper]: extractWhisper, tryExtractWhisper, expose, unexpose, #doUnexpose, veil, unveil, patchWhisper, replaceExposed, unseal

  /** The timely stored whisper.
   * Extracting it authenticates that the box record, all but its sidecar, has not been modified since it was sealed.
   */
  async extractWhisper(opts: TimelyOpts = {}): Promise<Whisper> {
    await this.ensureUnsealable(opts); this.demandUnsealable()
    return this.#unseal(this.demandFullProps())
  }

  /** Non-throwing form of {@link extractWhisper}. */
  tryExtractWhisper(opts: TimelyOpts = {}): Promise<Outcome<Whisper>> { return outcomeOf(() => this.extractWhisper(opts)) }

  // Why keeping a whisper on the box is safe: notes/expose_improves_security.md.
  /** Unseal the stored whisper and keep it on this box, where {@link whisper} shows it until {@link unexpose}. */
  async expose(opts: TimelyOpts = {}): Promise<this> {
    const exposed = await this.extractWhisper(opts)
    this.demandExposable()
    this.#isVeiled = false
    this.#replaceExposed(exposed)
    return this
  }

  /** Discard the whisper exposed, and its veil. Safe to call in any state. */
  unexpose(): this {
    this.#doUnexpose()
    this.align()
    return this
  }

  // called internally by adopt, align and unexpose itself
  /** Drop the whisper exposed and its veil, without aligning. */
  #doUnexpose(): void {
    this.#exposed = null
    this.#isVeiled = false
  }

  /** Hide the whisper exposed, keeping it. Safe to call in any state. */
  veil(): this {
    this.#isVeiled = true
    this.align()
    return this
  }

  /** Stop veiling the whisper exposed. A locked bank still hides it. */
  unveil(): this {
    if (this.#exposed === null) { throw notExposed() }
    this.#isVeiled = false
    this.align()
    return this
  }

  /** Merge `patch` into the whisper exposed, even while it is hidden, and tell the subscribers. Nothing is stored.
   * The result is a new object, and an array in `patch` replaces the whole array.
   */
  patchWhisper(patch: Whisper): this {
    const given = VX.whisperPatch.parse(patch)
    this.demandEnabled()
    if (this.#exposed === null) { throw notExposed() }
    this.#replaceExposed(mergedOver(this.#exposed, given))
    return this
  }

  /** Swap in a new whisper exposed, and tell the subscribers whether or not the snapshot changed. */
  #replaceExposed(exposed: Whisper): void {
    const ante = this.snapshot
    this.#exposed = exposed
    this.align()
    if (this.snapshot === ante) { this.tellListeners() }
  }

  /** The whisper of `record`. */
  async #unseal(record: BoxRecord): Promise<Whisper> {
    const { box_key_wrapped, whisper_ciphered } = record
    const whisperText = await this.vault.unsealStampedString({ box_key_wrapped, whisper_ciphered }, boxStampOf(record))
    return deserializeWhisper(whisperText)
  }
  // --

  // == [Putting]: put, tryPut, putExposed, tryPutExposed, edit, keptWhisper

  /** Seal `patch` over the record as its next revision, and store it, resolving this box.
   *
   * A patch that leaves out the whisper or the sidecar keeps the stored one, but may fetch the box first to get it.
   * A lock does not interrupt or reverse a put once its write has begun.
   * - `ifPresent` -- what to do over a live box:
   *   - `'repl'` -- replace it (default)
   *   - `'fail'` -- refuse `camped`
   *   - `'get'`  -- store nothing, and resolve this box holding the stored record
   * - `ifAbsent`  -- what to do where the box was never stored, or deleted:
   *   - `'add'`  -- store it as a new life of the box, its whisper and sidecar `{}` where left out (default)
   *   - `'fail'` -- refuse `absent_box`
   *
   * Refuses `stale_write` when storage has a newer revision. The box then holds that revision: edit from it.
   */
  async put(patch: BoxPatch, opts: BoxPutOpts = {}): Promise<this> {
    demandGood(await this.tryPut(patch, opts))
    return this
  }

  /** {@link put}, resolving the bankDB's answer instead of throwing, with this box as its `val`. */
  async tryPut(patch: BoxPatch, opts: BoxPutOpts = {}): Promise<ThingAnswer<Box>> {
    try {
      const { ifAbsent, ifPresent, maxMillisSinceRefresh, maxParentMillis } = VX.boxPutOpts.parse(opts)
      await this.ensurePuttable(patch, { maxMillisSinceRefresh, maxParentMillis })
      const given = this.demandPuttable(patch, { ifPresent })
      const { record, expected } = await this.#editAndSeal(given)
      this.demandPuttable(patch, { ifPresent })
      return await this.listing.tryPut(record, { expected, ifAbsent, ifPresent })
    } catch (err) { return refusedAnswerOf(err, UNANSWERED) }
  }

  /** Put the whisper exposed, veiled or not, with the sidecar `patch` names, if any. */
  async putExposed(patch: BoxExposedPatch = {}, opts: BoxPutOpts = {}): Promise<this> {
    const { sidecar } = VX.boxExposedPatch.parse(patch)
    if (this.#exposed === null) { throw notExposed() }
    return this.put({ whisper: this.#exposed, sidecar }, opts)
  }

  /** Non-throwing form of {@link putExposed}. */
  tryPutExposed(patch: BoxExposedPatch = {}, opts: BoxPutOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.putExposed(patch, opts)) }

  /** The next record for `patch`, sealed but not yet put, with the row it is put over. */
  async #editAndSeal({ whisper, sidecar }: BoxPatchParsed): Promise<{ record: BoxRecord, expected: BoxSparse }> {
    const expected = this.central
    const written_at = nowMillis()
    const next = { ...expected, ...SX.nextRevisionOf(expected, written_at), am: 'a' as const }
    // A whisper left out is unsealed and resealed all the same, as the stamp binds the revision.
    const record = this.isTombstoneRecord(expected)
      ? await sealedRecordOf(this.vault, { ...next, registered_at: written_at, box_tok: makeLifeTok() }, sidecar ?? {}, whisper ?? {})
      : await sealedRecordOf(this.vault, next, sidecar ?? this.demandFullProps().sidecar, whisper ?? await this.#storedWhisper())
    return { record, expected }
  }

  /** The whisper of the record in hand. */
  #storedWhisper(): Promise<Whisper> { return this.#unseal(this.demandFullProps()) }
  // --

  // == [Guards]: demandUnsealable, demandPuttable, #givenOf, demandExposable, demandPresent, ensureUnsealable, ensurePuttable

  /** Throw unless `isEnabled`, unlocked, `isPresent` and `isFull`. */
  demandUnsealable(): this { return this.demandEnabled().demandUnlocked().demandPresent().demandFull() }

  /** Parse `patch` for a put under `opts`, throwing unless the put may go ahead now.
   * It asks `isEnabled`, unlocked, and, where `patch` leaves out the whisper or the sidecar, a whole record in hand.
   */
  demandPuttable(patch: BoxPatch, { ifPresent }: BoxPutOpts = {}): BoxPatchParsed {
    const given = this.#givenOf(patch, ifPresent)
    this.demandEnabled().demandUnlocked()
    if (! isOfBothHalves(given)) { this.demandWhole() }
    return given
  }

  /** `patch`, parsed for a put under `ifPresent` and checked against this box's scope. */
  #givenOf(patch: BoxPatch, ifPresent?: BoxPutOpts['ifPresent']): BoxPatchParsed {
    const patchCheck = (ifPresent === 'fail') ? VX.boxPatchNew : VX.boxPatch
    return patchCheck.parseConsistent(patch, this.scope, { kind: 'bad_option', message: Phrases.patchOfOtherScope })
  }

  /** Throw unless `isEnabled` and unlocked. */
  demandExposable(): this { return this.demandEnabled().demandUnlocked() }

  /** Demand that this box is present. */
  demandPresent(): this {
    if (! this.isPresent) { throw boxAbsent(this) }
    return this
  }

  /** Hydrate this box so that its whisper can be unsealed. */
  ensureUnsealable(opts: TimelyOpts = {}): Promise<this> { return this.hydrate(opts) }

  // A sparse box under a patch of both halves needs nothing fetched: the put's revision check is what catches a stale one.
  /** `hydrate` this box for a put of `patch`, leaving a sparse record unfetched where `patch` has both the whisper and the sidecar. */
  async ensurePuttable(patch: BoxPatch, opts: TimelyOpts = {}): Promise<this> {
    const given = this.#givenOf(patch)
    if (this.isWholeRecord(this.central) || ! isOfBothHalves(given)) { return this.hydrate(opts) }
    await this.listing.ensureParentTimely(VX.timelyOpts.parse(opts).maxParentMillis)
    return this
  }
  // --

  // == [Aligning]: align

  // A lock only hides the whisper exposed, so that edits survive to the unlock (notes/expose_improves_security.md). A
  // box that no longer answers will never show it again.
  /** Align (see {@link Storable.align}), dropping the whisper exposed and its veil once this box is not `isEnabled`. Never throws. */
  override align(): void {
    if (! this.isEnabled) { this.#doUnexpose() }
    super.align()
  }
  // --

  // == [Protected, overriding Storable's]: adopt, children, isFullRecord, lifeTokPathOf, makeSnapshot

  /** Adopt `central`, dropping the whisper exposed and its veil where it is a tombstone. */
  protected override adopt(central: Fetched<BoxRecord, BoxSparse>): void {
    super.adopt(central)
    if (this.isTombstoneRecord(central)) { this.#doUnexpose() }
  }

  /** None: a box has nothing listed below it. */
  protected get children(): readonly [] { return [] }

  /** Whether `fetched` is alive and has its sealed whisper. */
  protected isFullRecord(fetched: BoxSparse): fetched is BoxRecord {
    return (fetched.am === 'a') && ('whisper_ciphered' in fetched)
  }

  /** The life of `record`: its vault's life ({@link BX.vaultLifeOf}), then its `box_tok`. */
  protected lifeTokPathOf(record: Fetched<BoxRecord, BoxSparse>): string { return `${BX.vaultLifeOf(record)}-${record.box_tok}` }

  protected makeSnapshot(): BoxSnapshot {
    return Object.freeze({
      ...this.scope,
      revision_tok:  this.revision_tok,
      revision_seq:  this.revision_seq,
      registered_at: this.registered_at,
      written_at:    this.written_at,
      sidecar:       this.sidecar,
      isFull:        this.isFull,
      isPresent:     this.isPresent,
      isExposed:     this.#exposed !== null,
      isVeiled:      this.#isVeiled,
      isLocked:      this.isLocked,
    })
  }
  // --

  /** Always `'box'`: marks this model for a {@link Modelkind} check. */
  get modelkind(): 'box' { return 'box' satisfies Modelkind }
}

// == [Patches]: isOfBothHalves

/** Whether `given` has both the whisper and the sidecar. */
function isOfBothHalves({ whisper, sidecar }: BoxPatchParsed): boolean { return (whisper !== undefined) && (sidecar !== undefined) }
// --

// == [Merging]: mergedOver

/** `patch` merged over a copy of `whisper`, arrays replaced. */
function mergedOver(whisper: Whisper, patch: Whisper): Whisper {
  return mergeWith(cloneDeep(whisper), patch, (_was, val) => (Array.isArray(val) ? val : undefined))
}
// --

// == [The seal]: sealedRecordOf, boxStampOf, deserializeWhisper

// The sidecar is laid beside the seal, never in it, so storage may change it and the whisper still opens.
/** The full record of `base`, with `sidecar` in the clear and `whisper` sealed through `vault`.
 * The whisper is ciphered, as JSON text, under a fresh boxKey. Both are bound to the stamps of the box, its vault and
 * its bank: they open only for this revision of this box, unchanged. Only the sparse fields of `base` are taken.
 */
async function sealedRecordOf(vault: Pick<Vault, 'sealStampedString'>, base: BoxSparse, sidecar: Sidecar, whisper: Whisper): Promise<BoxRecord> {
  const sparse = BX.boxSparse.parse(base)
  const { box_key_wrapped, whisper_ciphered } = await vault.sealStampedString(stableJsonify(whisper), boxStampOf(sparse))
  return BX.boxRecord.parse({ ...sparse, sidecar, box_key_wrapped, whisper_ciphered })
}

/** The box's stamp: every sparse field of `record`, and not its sidecar. */
function boxStampOf(record: BoxSparse): CipherCtxRecord { return BX.boxSparse.parse(record) }

// What JSON.parse throws is replaced, never kept as a cause: a SyntaxError can quote the text it failed on.
/** Parse the whisper in the JSON `text`, throwing `damaged_whisper` for anything else. */
function deserializeWhisper(text: string): Whisper {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw undecodedWhisper()
  }
  const checked = CX.whisper.safeParse(parsed)
  if (! checked.success) { throw undecodedWhisper() }
  return checked.data
}
// --
