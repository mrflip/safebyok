import { cloneDeep, mergeWith } from 'es-toolkit'
import { nowMillis } from '../helpers/clock'
import { type CipherCtxRecord, makeLifeTok } from '../helpers/crypto'
import { ENCRYPTED, LOCKED, VEILED } from '../helpers/consts'
import { type Outcome, outcomeOf } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import * as CX from '../shapes/shapes-core'
import type { Sidecar, Boxscope, Whisper } from '../shapes/shapes-core'
import type { LockState } from '../shapes/shapes-enums'
import * as SX from '../shapes/shapes-storage'
import * as VX from '../shapes/shapes-vaultish'
import { type BoxExposedPatch, type BoxPatch, type BoxPatchGiven, type BoxPutOpts, type BoxRecord, type BoxSnapshot, type BoxSparse, type BoxWorld, type Fetched, type TimelyOpts } from '../shapes/shapes-vaultish'
import { stableJsonify } from '../helpers/stable-jsonify'
import { absentBoxError, notExposedError, recordForNewBox, undecodedWhisper } from '../refusals/throwers'
import type { BoxListing } from './box-listing'
import { Storable } from './storable'

/** A box as this device holds it: a storable that ducks as its record, with its whisper openable while the vault is unlocked. */
export class Box extends Storable<Boxscope, BoxRecord, BoxSparse, BoxSnapshot> {
  // == [Props]: applabel, user_id, vaultlabel, boxlabel, world, listing, #exposed, #isVeiled, #subscribeWithVault

  /** The scope, tattooed on by Storable's constructor. */
  declare readonly applabel:   string
  declare readonly user_id:    string
  declare readonly vaultlabel: string
  declare readonly boxlabel:   string

  declare readonly world: BoxWorld

  declare readonly listing: BoxListing

  /** The whisper the host asked to keep open on the instance, a plain object it may edit: hidden while the vault is locked, kept until {@link unexpose} or a vault modification clears the box. */
  #exposed: Whisper | null = null
  /** Whether {@link veil} is hiding the whisper exposed. */
  #isVeiled = false

  /** Unbound callback to enroll the given listener for this box's changes and its vault's. */
  readonly #subscribeWithVault = (listener: () => void): (() => void) => {
    const unsubscribeBox = this.subscribeOwn(listener)
    // Its own function, as a vault's listeners are a set: a listener on two boxes must survive leaving one.
    const unsubscribeVault = this.world.subscribe(() => { listener() })
    return () => {
      unsubscribeBox()
      unsubscribeVault()
    }
  }
  // --

  // == [Getters]: fmt, box_tok, sidecar, box_key_wrapped, whisper_codec, whisper_schema_version, whisper_ciphered, whisper, isShowing, subscribe

  get fmt(): number { return this.central.fmt }

  /** The life of the box under its boxlabel, as the record in hand has it: minted at its birth, and kept by every later revision of that life. */
  get box_tok(): string { return this.central.box_tok }

  /** The sidecar of the record in hand, which only the full record carries; null otherwise. It holds nothing secret, so it shows whether the vault is locked or not. */
  get sidecar(): Sidecar | null { return this.full?.sidecar ?? null }

  /** The sealed parts of the record in hand; null where it is not full. */
  get box_key_wrapped():        BoxRecord['box_key_wrapped'] | null  { return this.full?.box_key_wrapped ?? null }
  get whisper_codec():          'json_v1' | null                     { return this.full?.whisper_codec ?? null }
  get whisper_schema_version(): 1 | null                             { return this.full?.whisper_schema_version ?? null }
  get whisper_ciphered():       BoxRecord['whisper_ciphered'] | null { return this.full?.whisper_ciphered ?? null }

  /** The whisper exposed on this instance, or the bag saying why it will not show: encrypted, locked or veiled.
   * See notes/expose_improves_security.md
   */
  get whisper(): Whisper {
    if (this.#exposed === null) { return ENCRYPTED }
    if (this.isLocked)          { return LOCKED }
    if (this.#isVeiled)         { return VEILED }
    return this.#exposed
  }

  /** True where {@link whisper} shows the value: exposed, unlocked and unveiled; read live. */
  get isShowing(): boolean { return this.whisper === this.#exposed }

  /** Public access to the unbound "make me a subscriber" callback, told of this box's changes and its vault's. */
  override get subscribe(): (listener: () => void) => (() => void) { return this.#subscribeWithVault }
  // --

  // == [The vault's lock]: lockState

  /** Whether the vault is locked, read live, as `vault.lockState()` is. */
  lockState(): LockState { return this.listing.lockState() }
  // --

  // == [The whisper]: extractWhisper, tryExtractWhisper, expose, unexpose, veil, unveil, patchWhisper, replaceExposed, unseal

  /** The timely stored whisper, keeping nothing on the instance. */
  async extractWhisper(opts: TimelyOpts = {}): Promise<Whisper> {
    await this.ensureUnsealable(opts); this.demandUnsealable()
    return this.#unseal(this.demandFullProps())
  }

  tryExtractWhisper(opts: TimelyOpts = {}): Promise<Outcome<Whisper>> { return outcomeOf(() => this.extractWhisper(opts)) }

  /** Open the stored whisper and hold it on the instance, showing, where `box.whisper` offers it until {@link unexpose}.
   * See notes/expose_improves_security.md
   */
  async expose(opts: TimelyOpts = {}): Promise<this> {
    const exposed = await this.extractWhisper(opts)
    this.demandExposable()
    this.#isVeiled = false
    this.#replaceExposed(exposed)
    return this
  }

  /** Discard the whisper held on the instance, from any state. */
  unexpose(): this {
    this.#exposed = null
    this.settle()
    return this
  }

  /** Hide the whisper exposed, keeping it, from any state. */
  veil(): this {
    this.#isVeiled = true
    this.settle()
    return this
  }

  /** Stop hiding the whisper exposed; a locked vault still hides it.
   * See notes/expose_improves_security.md
   */
  unveil(): this {
    if (this.#exposed === null) { throw notExposedError() }
    this.#isVeiled = false
    this.settle()
    return this
  }

  /** Merge `patch` over the whisper exposed, shown or hidden, into a new object, arrays replaced, and tell the subscribers; nothing is stored. */
  patchWhisper(patch: Whisper): this {
    const given = VX.whisperPatch.parse(patch)
    this.demandEnabled()
    if (this.#exposed === null) { throw notExposedError() }
    this.#replaceExposed(mergedOver(this.#exposed, given))
    return this
  }

  /** Swap in a new whisper exposed and tell: its identity moves the snapshot's, which holds none of it. */
  #replaceExposed(exposed: Whisper): void {
    this.#exposed = exposed
    this.tellListeners()
  }

  /** The whisper of `record`, opened through the vault's seal verbs and held to `CX.whisper`. */
  async #unseal(record: BoxRecord): Promise<Whisper> {
    const { sidecar, box_key_wrapped, whisper_ciphered } = record
    const stamp = boxStampOf(SX.boxSparse.parse(record), sidecar)
    const whisperText = await this.world.unsealStampedString({ box_key_wrapped, whisper_ciphered }, stamp)
    const held = CX.whisper.safeParse(parseJsonOrNull(whisperText))
    if (! held.success) { throw undecodedWhisper() }
    return held.data
  }
  // --

  // == [Putting]: put, tryPut, putExposed, tryPutExposed, edit, keptWhisper

  /** Seals `patch` over the record in hand and stores it, answering this box; a deleted box is reborn.
   *
   * A lock does not interrupt or reverse a put once its write has begun. A patch leaving out the whisper or the sidecar keeps
   * the one stored, so a box held sparse is fetched first. */
  async put(patch: BoxPatch, opts: BoxPutOpts = {}): Promise<this> {
    const { ifAbsent = 'add', ifPresent = 'repl', ...timely } = VX.boxPutOpts.parse(opts)
    await this.ensurePuttable(timely)
    const given = this.demandPuttable(patch, { ifPresent })
    const { record, prior } = await this.#edit(given)
    this.demandPuttable(patch, { ifPresent })
    await this.listing.put(record, { prior, ifAbsent, ifPresent })
    return this
  }

  tryPut(patch: BoxPatch, opts: BoxPutOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.put(patch, opts)) }

  /** Seal the whisper exposed, veiled or not, and store it; `patch` may name a sidecar, never a whisper. */
  async putExposed(patch: BoxExposedPatch = {}, opts: BoxPutOpts = {}): Promise<this> {
    const { sidecar } = VX.boxExposedPatch.parse(patch)
    if (this.#exposed === null) { throw notExposedError() }
    return this.put({ whisper: this.#exposed, sidecar }, opts)
  }

  tryPutExposed(patch: BoxExposedPatch = {}, opts: BoxPutOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.putExposed(patch, opts)) }

  /** The next record `patch` makes, sealed and not stored, and the revision it goes over. */
  async #edit({ whisper, sidecar }: BoxPatchGiven): Promise<{ record: BoxRecord, prior: SX.Revision }> {
    const prior = this.central
    const written_at = nowMillis()
    const next = { ...prior, ...SX.nextRevisionOf(prior, written_at), am: 'a' as const }
    // A whisper left out is unsealed and resealed all the same, as the stamp binds the sidecar.
    const record = this.isTombstoneRecord(prior)
      ? await sealedRecordOf(this.world, { ...next, registered_at: written_at, box_tok: makeLifeTok() }, sidecar ?? {}, whisper ?? {})
      : await sealedRecordOf(this.world, next, sidecar ?? this.demandFullProps().sidecar, whisper ?? await this.#keptWhisper())
    return { record, prior: SX.revisionOf(prior) }
  }

  /** The whisper a patch left out, opened from the record in hand. */
  #keptWhisper(): Promise<Whisper> { return this.#unseal(this.demandFullProps()) }
  // --

  // == [Guards]: demandUnsealable, demandPuttable, demandExposable, demandPresent, ensureUnsealable, ensurePuttable

  /** Demands that the box be enabled and present, with a full record, and the vault unlocked. */
  demandUnsealable(): this { return this.demandEnabled().demandUnlocked().demandPresent().demandFull() }

  /** The parsed `patch`, refused unless a put of it under `opts` may go ahead now. */
  demandPuttable(patch: BoxPatch, { ifPresent }: BoxPutOpts = {}): BoxPatchGiven {
    const given = VX.boxPatch.parseConsistent(patch, this.scope, { kind: 'bad_option', message: Phrases.patchOfOtherScope, advice: Phrases.BoxPatchAdvice })
    if ((ifPresent === 'fail') && ('whisper_ciphered' in patch)) { throw recordForNewBox() }
    this.demandEnabled()
    this.world.demandUnlocked()
    this.demandWhole()
    return given
  }

  /** Holding a whisper on the instance needs the box enabled and the vault unlocked. */
  demandExposable(): this { return this.demandEnabled().demandUnlocked() }

  demandPresent(): this {
    if (! this.isPresent) { throw absentBoxError(this) }
    return this
  }

  ensureUnsealable(opts: TimelyOpts = {}): Promise<this> { return this.hydrate(opts) }

  ensurePuttable(opts: TimelyOpts = {}): Promise<this> { return this.hydrate(opts) }
  // --

  // == [Protected, overriding Storable's]: adopt, sweepContents, vacateContents, isFullRecord, lifeTokPathOf, makeSnapshot

  /** A record gone takes the whisper exposed with it. */
  protected override adopt(central: Fetched<BoxRecord, BoxSparse>): void {
    super.adopt(central)
    if (this.isTombstoneRecord(central)) { this.#exposed = null }
  }

  protected override sweepContents(): void { this.#exposed = null }

  protected override vacateContents(): void { this.#exposed = null }

  /** A box record alive that carries its sealed whisper. */
  protected isFullRecord(fetched: BoxSparse): fetched is BoxRecord {
    return (fetched.am === 'a') && ('whisper_ciphered' in fetched)
  }

  /** A box's life is its vault's and its own: `vault_tok-box_tok`. */
  protected lifeTokPathOf({ vault_tok, box_tok }: Fetched<BoxRecord, BoxSparse>): string { return `${vault_tok}-${box_tok}` }

  protected makeSnapshot(): BoxSnapshot {
    return Object.freeze({
      ...this.scope,
      revision_tok:  this.revision_tok,
      revision_seq:  this.revision_seq,
      registered_at: this.registered_at,
      written_at:    this.written_at,
      sidecar:       this.sidecar,
      full:          this.isFull,
      present:       this.isPresent,
      exposed:       this.#exposed !== null,
      veiled:        this.#isVeiled,
    })
  }
  // --
}

// == [Merging]: mergedOver

/** `patch` merged over a copy of `whisper`, arrays replaced, as a plain object merge. */
const mergedOver = (whisper: Whisper, patch: Whisper): Whisper => (
  mergeWith(cloneDeep(whisper), patch, (_was, val) => (Array.isArray(val) ? val : undefined))
)
// --

// == [The seal]: sealedRecordOf, boxStampOf, parseJsonOrNull

/** The full record of `base` with `sidecar`, `whisper` sealed through `world`: as json_v1, bound with its key to the box's stamp. Of `base`, only its sparse fields are taken. */
const sealedRecordOf = async (world: Pick<BoxWorld, 'sealStampedString'>, base: BoxSparse, sidecar: Sidecar, whisper: Whisper): Promise<BoxRecord> => {
  const sparse = SX.boxSparse.parse(base)
  const stamp = boxStampOf(sparse, sidecar)
  const { box_key_wrapped, whisper_ciphered } = await world.sealStampedString(stableJsonify(whisper) ?? '', stamp)
  return VX.boxRecord.parse({ ...sparse, sidecar, box_key_wrapped, whisper_ciphered })
}

/** The box's stamp, which the lease binds both sealed parts to: every sparse field of the record, and its sidecar as stable JSON. */
const boxStampOf = (sparse: BoxSparse, sidecar: Sidecar): CipherCtxRecord => ({ ...sparse, sidecar: stableJsonify(sidecar) ?? '' })

/** `text` parsed as JSON, or null where it is none: a SyntaxError can quote what it failed on. */
const parseJsonOrNull = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
// --
