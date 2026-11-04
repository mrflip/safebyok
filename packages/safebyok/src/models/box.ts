import { verifyConsistent } from '../checks/validator'
import { type CipherCtxRecord, makeLifeTok, randomId } from '../crypto'
import { VaultError } from '../errors'
import { absentBoxError } from '../helpers/throwers'
import { type Outcome, outcomeOf } from '../outcome'
import * as Phrases from '../phrases'
import type { Sidecar } from '../shapes/box'
import type { Boxscope } from '../shapes/scopes'
import { stableJsonify } from '../stable-jsonify'
import type { BoxListing, BoxWorld } from './box-listing'
import { type BoxPatchGiven, type BoxPutOpts, type BoxRecord, type BoxSparse, type Fetched, type LockedBag, type LockState, type TimelyOpts, type WhisperHolder, LOCKED, whisperHolder } from './models-shapes'
import * as MSX from './models-shapes'
import { Storable } from './storable'

// == [Record forms]: BoxSnapshot, BoxHalves, BoxPatch, BoxPut

export type BoxSnapshot = Boxscope & Readonly<{
  revision_tok:  string
  revision_seq:  number
  registered_at: number
  written_at:    number
  sidecar:       Sidecar | null
  full:          boolean
  present:       boolean
  exposed:       boolean
  lockState:     LockState
}>

/** Both halves of a box, the whisper, as its {@link WhisperHolder} `{ val }`, and the sidecar: what every update of a box names, and what it seals. */
export type BoxHalves = { whisper: WhisperHolder, sidecar: Sidecar }

/** A host's patch for `put`: either of the {@link BoxHalves} or both, the half left out being kept, and any other prop of the box's record, which the box controls and ignores, so `{ ...record, whisper, sidecar }` will do. `boxPatch` checks it. */
export type BoxPatch = { [Prop in keyof BoxHalves]?: BoxHalves[Prop] | undefined } & { [Prop in Exclude<keyof BoxRecord, 'sidecar'>]?: BoxRecord[Prop] | undefined }

/** A host's patch for `vault.putBox`: a {@link BoxPatch} under its `boxlabel`. */
export type BoxPut = BoxPatch & { boxlabel: string }
// --

// == [Box]

/** A box as this device holds it: a storable that ducks as its record, with its whisper openable while the vault is unlocked. */
export class Box extends Storable<Boxscope, BoxRecord, BoxSparse, BoxSnapshot> {
  /** The scope, tattooed on by Storable's constructor. */
  declare readonly applabel:   string
  declare readonly user_id:    string
  declare readonly vaultlabel: string
  declare readonly boxlabel:   string

  declare readonly world: BoxWorld

  declare readonly listing: BoxListing

  /** The whisper the host asked to keep open on the instance, as its frozen {@link WhisperHolder}, kept while the vault locks and unlocks until the host sets it null. Nothing seals it: a `put` seals the whisper it is given. */
  #exposed: WhisperHolder | null = null

  // == [Props, as the record has them]: fmt, box_tok, sidecar, box_key_wrapped, whisper_codec, whisper_schema_version, whisper_ciphered

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
  // --

  // == [Guards]: demandPresent, ensureUnsealable, demandUnsealable, ensurePuttable, demandPuttable, demandExposable

  demandPresent(): this {
    if (! this.isPresent) { throw absentBoxError(this) }
    return this
  }

  ensureUnsealable(opts: TimelyOpts = {}): Promise<this> { return this.hydrate(opts) }

  /** Demands that the box be enabled and present, with a full record, and the vault unlocked. */
  demandUnsealable(): this { return this.demandEnabled().demandUnlocked().demandPresent().demandFull() }

  ensurePuttable(opts: TimelyOpts = {}): Promise<this> { return this.hydrate(opts) }

  /** A put needs the box enabled and the vault unlocked, and no more: a box gone comes back to life. */
  demandPuttable(): this { return this.demandEnabled().demandUnlocked() }

  /** Holding a whisper on the instance needs the box enabled and the vault unlocked. */
  demandExposable(): this { return this.demandEnabled().demandUnlocked() }
  // --

  // == [The whisper]: whisper, extractWhisper, tryExtractWhisper, expose

  /** SLOPDOC: The whisper exposed on this instance, LOCKED while the vault is; set it to expose or forget one. */
  get whisper(): WhisperHolder | LockedBag | null {
    if (this.isLocked) { return LOCKED }
    return this.#exposed
  }

  set whisper(whisper: WhisperHolder | LockedBag | null) {
    const forgets = (whisper === null) || Storable.isLockedFUBag(whisper)
    const exposed = forgets ? null : whisperHolder.parse(whisper)
    if (! forgets) { this.demandExposable() }
    this.#exposed = exposed
    this.settle()
  }

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

  /** The whisper of `record`, opened through the vault's seal verbs and held to {@link whisperHolder}. */
  async #unseal(record: BoxRecord): Promise<WhisperHolder> {
    const { sidecar, box_key_wrapped, whisper_ciphered } = record
    const stamp = boxStampOf(MSX.boxSparse.parse(record), sidecar)
    const whisperText = await this.world.unsealStampedString({ box_key_wrapped, whisper_ciphered }, stamp)
    const held = whisperHolder.safeParse(parseJsonOrNull(whisperText))
    if (! held.success) { throw undecodedWhisper() }
    return held.data
  }
  // --

  // == [Putting]: put, tryPut, edit

  /** Seals `patch` over the record in hand and stores it, answering the box listed; a box gone comes back. */
  async put(patch: BoxPatch, opts: BoxPutOpts = {}): Promise<Box> {
    const { ifAbsent = 'add', ifPresent = 'repl', ...timely } = MSX.boxPutOpts.parse(opts)
    const given = verifyConsistent(MSX.boxPatch.parse(patch, { advice: Phrases.BoxPatchAdvice }), this.scope, { kind: 'bad_option', message: Phrases.patchOfOtherScope })
    this.listing.puttable({ ...patch, ...this.scope }, { ifAbsent, ifPresent })
    await this.ensurePuttable(timely); this.demandPuttable()
    const { record, prior } = await this.#edit(given)
    this.demandPuttable()
    return this.listing.put(record, { prior, ifAbsent, ifPresent })
  }

  tryPut(patch: BoxPatch, opts: BoxPutOpts = {}): Promise<Outcome<Box>> { return outcomeOf(() => this.put(patch, opts)) }

  /** The next record `patch` makes of the record in hand on entry, sealed and not yet stored, with that revision it was sealed over. */
  async #edit({ whisper, sidecar }: BoxPatchGiven): Promise<{ record: BoxRecord, prior: Fetched<BoxRecord, BoxSparse> }> {
    const prior = this.central
    const isBirthday = this.isTombstoneRecord(prior)
    const sidecarGiven = sidecar ?? (isBirthday ? {} : this.demandFullProps().sidecar)
    // A whisper left out is unsealed and resealed all the same, as the stamp binds the sidecar.
    const whisperGiven = whisper ?? await this.#keptWhisper(isBirthday)
    const written_at = this.world.clock.now()
    const record = await sealedRecordOf(this.world, {
      ...prior,
      revision_tok:  randomId(),
      revision_seq:  prior.revision_seq + 1,
      registered_at: isBirthday ? written_at : prior.registered_at,
      written_at,
      box_tok:       isBirthday ? makeLifeTok() : prior.box_tok,
      am:            'a',
    }, sidecarGiven, whisperGiven)
    return { record, prior }
  }

  /** The whisper a patch left out, opened from the record in hand; 'no_whisper' over a tombstone, which has none to keep. */
  #keptWhisper(isBirthday: boolean): Promise<WhisperHolder> {
    if (isBirthday) { throw noWhisperToKeep() }
    return this.#unseal(this.demandFullProps())
  }
  // --

  // == [Discards]: sweepContents, vacateContents

  protected override sweepContents(): void { this.#exposed = null }

  protected override vacateContents(): void { this.#exposed = null }
  // --

  // == [Required by Storable]: isFullRecord, lifeTokPathOf, makeSnapshot

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
      lockState:     this.listing.lockState(),
    })
  }
  // --
}
// --

// == [The seal]: sealedRecordOf, boxStampOf, parseJsonOrNull

/** The full record of `base` with `sidecar`, `whisper` sealed through `world`: its {@link WhisperHolder} `{ val }` as json_v1, bound with its key to the box's stamp. Of `base`, only its sparse fields are taken. */
const sealedRecordOf = async (world: Pick<BoxWorld, 'sealStampedString'>, base: BoxSparse, sidecar: Sidecar, whisper: WhisperHolder): Promise<BoxRecord> => {
  const sparse = MSX.boxSparse.parse(base)
  const stamp = boxStampOf(sparse, sidecar)
  const { box_key_wrapped, whisper_ciphered } = await world.sealStampedString(stableJsonify(whisper) ?? '', stamp)
  return MSX.boxRecord.parse({ ...sparse, sidecar, box_key_wrapped, whisper_ciphered })
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

// == [Refusals]: undecodedWhisper, noWhisperToKeep

/** A whisper left out of an update, where no box is stored to keep one of. */
const noWhisperToKeep = (): VaultError => new VaultError('no_whisper', Phrases.NoWhisperToKeep)

const undecodedWhisper = (): VaultError => new VaultError('damaged_box', Phrases.UndecodedWhisper)
// --
