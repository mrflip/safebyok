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
import { type BoxExposedPatch, type BoxPatch, type BoxPatchParsed, type BoxPutOpts, type BoxSnapshot, type BoxWorld, type Fetched, type ThingAnswer, type TimelyOpts } from '../shapes/shapes-vaultish'
import type { BoxRecord, BoxSparse } from '../shapes/shapes-bankdb'
import { stableJsonify } from '../helpers/stable-jsonify'
import { tattoo } from '../helpers/helpers'
import { boxAbsent, notExposed, undecodedWhisper } from '../refusals/throwers'
import type { BoxListing } from './box-listing'
import { Storable } from './storable'
import { refusedAnswerOf } from '../storage/bank-db'

/** A box as this device has it: a storable that ducks as its record, with its whisper openable while the vault is unlocked. */
export class Box extends Storable<Boxscope, BoxRecord, BoxSparse, BoxSnapshot> {
  // == [Props]: user_id, banklabel, vaultlabel, boxlabel, bank_tok, vault_tok, world, listing, #exposed, #isVeiled

  /** The scope, tattooed on by Storable's constructor. */
  declare readonly user_id:    string
  declare readonly banklabel:  string
  declare readonly vaultlabel: string
  declare readonly boxlabel:   string
  /** The life of the bank this box lies in, inscribed once by `assignInitialProps` and never moved. */
  declare readonly bank_tok:   string
  /** The vault this box lies in, inscribed once by `assignInitialProps` and never moved. */
  declare readonly vault_tok:  string

  declare readonly world: BoxWorld

  declare readonly listing: BoxListing

  /** The whisper the host asked to keep open on the instance, a plain object it may edit: hidden while the vault is locked, kept until {@link unexpose} or a vault modification clears the box. */
  #exposed: Whisper | null = null
  /** Whether {@link veil} is hiding the whisper exposed. */
  #isVeiled = false
  // --

  // == [Getters]: fmt, box_tok, sidecar, box_key_wrapped, whisper_codec, whisper_schema_version, whisper_ciphered, whisper, exposure, isShowing, isVeiled, isLocked

  /** The storage format of the record in hand. */
  get fmt(): number { return this.central.fmt }

  /** The life of the box under its boxlabel, as the record in hand has it: minted at its birth, and kept by every later revision of that life. */
  get box_tok(): string { return this.central.box_tok }

  /** The sidecar of the record in hand, which only the full record carries; null otherwise. It has nothing secret, so it shows whether the vault is locked or not. */
  get sidecar(): Sidecar | null { return this.full?.sidecar ?? null }

  /** The sealed parts of the record in hand; null where it is not full. */
  get box_key_wrapped():        BoxRecord['box_key_wrapped'] | null  { return this.full?.box_key_wrapped ?? null }
  /** The whisper's codec in the record in hand, or null where the record is not full. */
  get whisper_codec():          'json_v1' | null                     { return this.full?.whisper_codec ?? null }
  /** The whisper's schema version in the record in hand, or null where the record is not full. */
  get whisper_schema_version(): 1 | null                             { return this.full?.whisper_schema_version ?? null }
  /** The ciphered whisper in the record in hand, or null where the record is not full. */
  get whisper_ciphered():       BoxRecord['whisper_ciphered'] | null { return this.full?.whisper_ciphered ?? null }

  /** The whisper exposed on this instance, or a bag standing in for it while it hides. Ask {@link exposure} why, never the bag.
   * See notes/expose_improves_security.md
   */
  get whisper(): Whisper {
    if (this.#exposed === null) { return ENCRYPTED }
    if (this.isLocked)          { return LOCKED }
    if (this.#isVeiled)         { return VEILED }
    return this.#exposed
  }

  // Taken in the order `whisper` picks its bag.
  /** Where the whisper stands, read live: `showing`, or why `whisper` hides it.
   * `locked` means the whisper is exposed but hidden while the vault is locked; it is not the vault's lock, for which ask `isLocked` (an unexposed box in a locked vault answers `unexposed`).
   */
  get exposure(): BoxExposure {
    if (this.#exposed === null) { return 'unexposed' }
    if (this.isLocked)          { return 'locked' }
    if (this.#isVeiled)         { return 'veiled' }
    return 'showing'
  }

  /** True where {@link whisper} shows the value: exposed, unlocked and unveiled; read live. */
  get isShowing(): boolean { return this.exposure === 'showing' }

  /** True while {@link veil} hides the whisper exposed, whatever the lock; read live. */
  get isVeiled(): boolean { return this.#isVeiled }

  /** Whether this box's vault is locked, read live. */
  get isLocked(): boolean { return this.listing.isLocked }
  // --

  // == [Construction]: assignInitialProps

  /** Inscribes the `bank_tok` and `vault_tok` of the vault life this box lies in, beside what the base inscribes. */
  protected override assignInitialProps(central: Fetched<BoxRecord, BoxSparse>): void {
    tattoo(this, { bank_tok: central.bank_tok, vault_tok: central.vault_tok }, { configurable: false })
    super.assignInitialProps(central)
  }
  // --

  // == [The whisper]: extractWhisper, tryExtractWhisper, expose, unexpose, #doUnexpose, veil, unveil, patchWhisper, replaceExposed, unseal

  /** The timely stored whisper, keeping nothing on the instance. */
  async extractWhisper(opts: TimelyOpts = {}): Promise<Whisper> {
    await this.ensureUnsealable(opts); this.demandUnsealable()
    return this.#unseal(this.demandFullProps())
  }

  /** Non-throwing form of {@link extractWhisper}. */
  tryExtractWhisper(opts: TimelyOpts = {}): Promise<Outcome<Whisper>> { return outcomeOf(() => this.extractWhisper(opts)) }

  /** Unseal the stored whisper and keep it on the instance, showing, where `box.whisper` offers it until {@link unexpose}.
   * See notes/expose_improves_security.md
   */
  async expose(opts: TimelyOpts = {}): Promise<this> {
    const exposed = await this.extractWhisper(opts)
    this.demandExposable()
    this.#isVeiled = false
    this.#replaceExposed(exposed)
    return this
  }

  /** Discard the whisper kept on the instance, and its veil, from any state. */
  unexpose(): this {
    this.#doUnexpose()
    this.align()
    return this
  }

  // called internally by adopt, sweepContents, vacateContents and unexpose itself
  /** Drop the whisper exposed and its veil; the caller aligns. */
  #doUnexpose(): void {
    this.#exposed = null
    this.#isVeiled = false
  }

  /** Hide the whisper exposed, keeping it, from any state. */
  veil(): this {
    this.#isVeiled = true
    this.align()
    return this
  }

  /** Stop hiding the whisper exposed; a locked vault still hides it.
   * See notes/expose_improves_security.md
   */
  unveil(): this {
    if (this.#exposed === null) { throw notExposed() }
    this.#isVeiled = false
    this.align()
    return this
  }

  /** Merge `patch` over the whisper exposed, shown or hidden, into a new object, arrays replaced, and tell the subscribers; nothing is written. */
  patchWhisper(patch: Whisper): this {
    const given = VX.whisperPatch.parse(patch)
    this.demandEnabled()
    if (this.#exposed === null) { throw notExposed() }
    this.#replaceExposed(mergedOver(this.#exposed, given))
    return this
  }

  /** Swap in a new whisper exposed, and tell the subscribers even where the snapshot, which has none of it, has not moved. */
  #replaceExposed(exposed: Whisper): void {
    const ante = this.snapshot
    this.#exposed = exposed
    this.align()
    if (this.snapshot === ante) { this.tellListeners() }
  }

  /** The whisper of `record`, opened through the vault's seal verbs and checked by `CX.whisper`. */
  async #unseal(record: BoxRecord): Promise<Whisper> {
    const { box_key_wrapped, whisper_ciphered } = record
    const whisperText = await this.world.unsealStampedString({ box_key_wrapped, whisper_ciphered }, boxStampOf(record))
    return deserializeWhisper(whisperText)
  }
  // --

  // == [Putting]: put, tryPut, putExposed, tryPutExposed, edit, keptWhisper

  /** Seals `patch` over the record in hand and puts it, answering this box; a deleted box is reborn.
   *
   * A lock does not interrupt or reverse a put once its write has begun. A patch leaving out the whisper or the sidecar keeps
   * the stored half, so a sparse box is fetched first unless the patch carries both; a box behind storage answers `stale_write`.
   */
  async put(patch: BoxPatch, opts: BoxPutOpts = {}): Promise<this> {
    demandGood(await this.tryPut(patch, opts))
    return this
  }

  /** {@link put}, answering the vaultDB's own answer with the box listed as its `val`. */
  async tryPut(patch: BoxPatch, opts: BoxPutOpts = {}): Promise<ThingAnswer<Box>> {
    try {
      const { ifAbsent, ifPresent, maxMillisSinceRefresh, maxWorldMillis } = VX.boxPutOpts.parse(opts)
      await this.ensurePuttable(patch, { maxMillisSinceRefresh, maxWorldMillis })
      const given = this.demandPuttable(patch, { ifPresent })
      const { record, expected } = await this.#editAndSeal(given)
      this.demandPuttable(patch, { ifPresent })
      return await this.listing.tryPut(record, { expected, ifAbsent, ifPresent })
    } catch (err) { return refusedAnswerOf(err, UNANSWERED) }
  }

  /** Seal the whisper exposed, veiled or not, and put it; `patch` may name a sidecar, never a whisper. */
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
      ? await sealedRecordOf(this.world, { ...next, registered_at: written_at, box_tok: makeLifeTok() }, sidecar ?? {}, whisper ?? {})
      : await sealedRecordOf(this.world, next, sidecar ?? this.demandFullProps().sidecar, whisper ?? await this.#storedWhisper())
    return { record, expected }
  }

  /** The stored whisper, unsealed from the record in hand, for a patch that leaves the whisper out. */
  #storedWhisper(): Promise<Whisper> { return this.#unseal(this.demandFullProps()) }
  // --

  // == [Guards]: demandUnsealable, demandPuttable, #givenOf, demandExposable, demandPresent, ensureUnsealable, ensurePuttable

  /** Demands that the box be enabled and present, with a full record, and the vault unlocked. */
  demandUnsealable(): this { return this.demandEnabled().demandUnlocked().demandPresent().demandFull() }

  /** The parsed `patch`, refused unless a put of it under `opts` may go ahead now. */
  demandPuttable(patch: BoxPatch, { ifPresent }: BoxPutOpts = {}): BoxPatchParsed {
    const given = this.#givenOf(patch, ifPresent)
    this.demandEnabled().demandUnlocked()
    if (! isOfBothHalves(given)) { this.demandWhole() }
    return given
  }

  /** `patch` parsed as one of this box's, for a put under `ifPresent`. */
  #givenOf(patch: BoxPatch, ifPresent?: BoxPutOpts['ifPresent']): BoxPatchParsed {
    const patchCheck = (ifPresent === 'fail') ? VX.boxPatchNew : VX.boxPatch
    return patchCheck.parseConsistent(patch, this.scope, { kind: 'bad_option', message: Phrases.patchOfOtherScope })
  }

  /** Keeping a whisper on the instance needs the box enabled and the vault unlocked. */
  demandExposable(): this { return this.demandEnabled().demandUnlocked() }

  /** Demand that this box is present. */
  demandPresent(): this {
    if (! this.isPresent) { throw boxAbsent(this) }
    return this
  }

  /** Hydrate this box so that its whisper can be unsealed. */
  ensureUnsealable(opts: TimelyOpts = {}): Promise<this> { return this.hydrate(opts) }

  // A sparse box under a patch of both halves needs nothing fetched: the put's revision check is what catches a stale one.
  /** Bring this box and its vault timely enough for a put of `patch`, fetching a sparse record only where `patch` keeps part of it. */
  async ensurePuttable(patch: BoxPatch, opts: TimelyOpts = {}): Promise<this> {
    const given = this.#givenOf(patch)
    if (this.isWholeRecord(this.central) || ! isOfBothHalves(given)) { return this.hydrate(opts) }
    await this.listing.ensureTimelyWorld(VX.timelyOpts.parse(opts).maxWorldMillis)
    return this
  }
  // --

  // == [Protected, overriding Storable's]: adopt, sweepContents, vacateContents, isFullRecord, lifeTokPathOf, makeSnapshot

  /** A record gone takes the whisper exposed, and its veil, with it. */
  protected override adopt(central: Fetched<BoxRecord, BoxSparse>): void {
    super.adopt(central)
    if (this.isTombstoneRecord(central)) { this.#doUnexpose() }
  }

  protected override sweepContents(): void { this.#doUnexpose() }

  protected override vacateContents(): void { this.#doUnexpose() }

  /** A box record alive that carries its sealed whisper. */
  protected isFullRecord(fetched: BoxSparse): fetched is BoxRecord {
    return (fetched.am === 'a') && ('whisper_ciphered' in fetched)
  }

  /** A box's life is its vault's and its own: {@link BX.vaultLifeOf}, then `box_tok`. */
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

  /** Answers 'box', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'box' { return 'box' satisfies Modelkind }
}

// == [Patches]: isOfBothHalves

/** Whether `given` carries both the whisper and the sidecar, so that a put of it needs nothing from the record stored. */
function isOfBothHalves({ whisper, sidecar }: BoxPatchParsed): boolean { return (whisper !== undefined) && (sidecar !== undefined) }
// --

// == [Merging]: mergedOver

/** `patch` merged over a copy of `whisper`, arrays replaced, as a plain object merge. */
function mergedOver(whisper: Whisper, patch: Whisper): Whisper {
  return mergeWith(cloneDeep(whisper), patch, (_was, val) => (Array.isArray(val) ? val : undefined))
}
// --

// == [The seal]: sealedRecordOf, boxStampOf, deserializeWhisper

// The sidecar is laid beside the seal, never in it, so storage may change it and the whisper still opens.
/** The full record of `base` with `sidecar`, `whisper` sealed through `world`: as json_v1, bound with its key to the box's stamp. Of `base`, only its sparse fields are taken. */
async function sealedRecordOf(world: Pick<BoxWorld, 'sealStampedString'>, base: BoxSparse, sidecar: Sidecar, whisper: Whisper): Promise<BoxRecord> {
  const sparse = BX.boxSparse.parse(base)
  const { box_key_wrapped, whisper_ciphered } = await world.sealStampedString(stableJsonify(whisper), boxStampOf(sparse))
  return BX.boxRecord.parse({ ...sparse, sidecar, box_key_wrapped, whisper_ciphered })
}

/** The box's stamp, which the lease binds both sealed parts to: every sparse field of `record`, and not its sidecar. */
function boxStampOf(record: BoxSparse): CipherCtxRecord { return BX.boxSparse.parse(record) }

// What JSON.parse throws is replaced, never kept as a cause: a SyntaxError can quote the text it failed on.
/** The whisper `text` holds as JSON; `damaged_whisper` where it holds none, or holds what is not a whisper. */
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
