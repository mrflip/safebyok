import { type CipherCtxRecord, makeLifeTok } from '../helpers/crypto'
import { type LockedBag, LOCKED } from '../helpers/consts'
import { type Outcome, outcomeOf } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import type { Sidecar, Boxscope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import * as VX from '../shapes/shapes-vaultish'
import { type BoxPatch, type BoxPatchGiven, type BoxPutOpts, type BoxRecord, type BoxSnapshot, type BoxSparse, type BoxWorld, type Fetched, type TimelyOpts, type WhisperHolder, whisperHolder } from '../shapes/shapes-vaultish'
import { stableJsonify } from '../helpers/stable-jsonify'
import { absentBoxError, recordForNewBox, undecodedWhisper } from '../refusals/throwers'
import type { BoxListing } from './box-listing'
import { Storable } from './storable'

/** A box as this device holds it: a storable that ducks as its record, with its whisper openable while the vault is unlocked. */
export class Box extends Storable<Boxscope, BoxRecord, BoxSparse, BoxSnapshot> {
  // == [Props]: applabel, user_id, vaultlabel, boxlabel, world, listing, #exposed

  /** The scope, tattooed on by Storable's constructor. */
  declare readonly applabel:   string
  declare readonly user_id:    string
  declare readonly vaultlabel: string
  declare readonly boxlabel:   string

  declare readonly world: BoxWorld

  declare readonly listing: BoxListing

  /** The frozen {@link WhisperHolder} the host asked to keep open on the instance, until {@link veil}. */
  #exposed: WhisperHolder | null = null
  // --

  // == [Getters]: fmt, box_tok, sidecar, box_key_wrapped, whisper_codec, whisper_schema_version, whisper_ciphered, whisper

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

  /** SLOPDOC: The whisper exposed on this instance, LOCKED while the vault is. */
  get whisper(): WhisperHolder | LockedBag | null {
    if (this.isLocked) { return LOCKED }
    return this.#exposed
  }
  // --

  // == [The whisper]: extractWhisper, tryExtractWhisper, expose, veil, unseal

  /** The timely stored whisper, as its frozen {@link WhisperHolder} `{ val }`, keeping nothing on the instance. */
  async extractWhisper(opts: TimelyOpts = {}): Promise<WhisperHolder> {
    await this.ensureUnsealable(opts); this.demandUnsealable()
    return this.#unseal(this.demandFullProps())
  }

  tryExtractWhisper(opts: TimelyOpts = {}): Promise<Outcome<WhisperHolder>> { return outcomeOf(() => this.extractWhisper(opts)) }

  /** SLOPDOC: Opens the stored whisper and holds it on the instance, where `box.whisper` offers it until forgotten. */
  async expose(opts: TimelyOpts = {}): Promise<this> {
    const exposed = await this.extractWhisper(opts)
    this.demandExposable()
    this.#exposed = exposed
    this.settle()
    return this
  }

  /** Overwrite the whisper held on this instance, locked or not. */
  veil(): this {
    this.#exposed = null
    this.settle()
    return this
  }

  /** The whisper of `record`, opened through the vault's seal verbs and held to {@link whisperHolder}. */
  async #unseal(record: BoxRecord): Promise<WhisperHolder> {
    const { sidecar, box_key_wrapped, whisper_ciphered } = record
    const stamp = boxStampOf(VX.boxSparse.parse(record), sidecar)
    const whisperText = await this.world.unsealStampedString({ box_key_wrapped, whisper_ciphered }, stamp)
    const held = whisperHolder.safeParse(parseJsonOrNull(whisperText))
    if (! held.success) { throw undecodedWhisper() }
    return held.data
  }
  // --

  // == [Putting]: put, tryPut, edit, keptWhisper

  /** Seals `patch` over the record in hand and stores it, answering this box; a deleted box is reborn. */
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

  /** The next record `patch` makes, sealed and not stored, and the revision it goes over. */
  async #edit({ whisper, sidecar }: BoxPatchGiven): Promise<{ record: BoxRecord, prior: SX.Revision }> {
    const prior = this.central
    const written_at = this.world.clock.now()
    const next = { ...prior, ...SX.nextRevisionOf(prior, written_at), am: 'a' as const }
    // A whisper left out is unsealed and resealed all the same, as the stamp binds the sidecar.
    const record = this.isTombstoneRecord(prior)
      ? await sealedRecordOf(this.world, { ...next, registered_at: written_at, box_tok: makeLifeTok() }, sidecar ?? {}, whisper ?? { val: {} })
      : await sealedRecordOf(this.world, next, sidecar ?? this.demandFullProps().sidecar, whisper ?? await this.#keptWhisper())
    return { record, prior: SX.revisionOf(prior) }
  }

  /** The whisper a patch left out, opened from the record in hand. */
  #keptWhisper(): Promise<WhisperHolder> { return this.#unseal(this.demandFullProps()) }
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

  // == [Protected, overriding Storable's]: sweepContents, vacateContents, isFullRecord, lifeTokPathOf, makeSnapshot

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
    })
  }
  // --
}

// == [The seal]: sealedRecordOf, boxStampOf, parseJsonOrNull

/** The full record of `base` with `sidecar`, `whisper` sealed through `world`: its {@link WhisperHolder} `{ val }` as json_v1, bound with its key to the box's stamp. Of `base`, only its sparse fields are taken. */
const sealedRecordOf = async (world: Pick<BoxWorld, 'sealStampedString'>, base: BoxSparse, sidecar: Sidecar, whisper: WhisperHolder): Promise<BoxRecord> => {
  const sparse = VX.boxSparse.parse(base)
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
