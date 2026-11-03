import { verifyConsistent } from '../checks/validator'
import { type CipherCtxRecord, makeLifeTok, randomId } from '../crypto'
import { VaultError } from '../errors'
import { type Outcome, outcomeOf } from '../outcome'
import * as Phrases from '../phrases'
import type { Sidecar } from '../shapes/box'
import type { Boxscope } from '../shapes/scopes'
import { stableJsonify } from '../stable-jsonify'
import type { BoxWorld } from './box-listing'
import { type BoxPatchGiven, type BoxRecord, type BoxSparse, type Fetched, type LockedBag, type LockState, type SendOpts, type TimelyOpts, type WhisperHolder, LOCKED, whisperHolder } from './models-shapes'
import * as MSX from './models-shapes'
import { Storable } from './storable'

// == [Record forms]: BoxSnapshot, BoxProps, BoxPatch, BoxPut

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
export type BoxProps = { whisper: WhisperHolder, sidecar: Sidecar }

/** A host's patch for `send`: either of the {@link BoxProps} or both, the half left out being kept, and any other prop of the box's record, which the box controls and ignores, so `{ ...record, whisper, sidecar }` will do. `boxPatch` checks it. */
export type BoxPatch = { [Prop in keyof BoxProps]?: BoxProps[Prop] | undefined } & { [Prop in Exclude<keyof BoxRecord, 'sidecar'>]?: BoxRecord[Prop] | undefined }

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

  /** The whisper the host asked to keep open on the instance, as its frozen {@link WhisperHolder}, kept while the vault locks and unlocks until the host sets it null. Nothing seals it: a `send` seals the whisper it is given. */
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

  // == [Guards]: ensureReadyToUnsealWhisper, demandReadyToUnsealWhisper, ensureReadyToSend, demandReadyToSend

  async ensureReadyToUnsealWhisper(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToUnsealWhisper()
  }

  /** Throws unless unlocked with a full, healthy record: refuses 'vault_locked', 'absent_box' for a box gone, or 'bad_option' for a sparse record not yet filled, which `ensureReadyToUnsealWhisper` fetches first. */
  demandReadyToUnsealWhisper(): this { return this.demandUnlocked().demandPresent().demandFull() }

  async ensureReadyToSend(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToSend()
  }

  /** A send needs the vault unlocked, and no more: a box gone is sent back to life. */
  demandReadyToSend(): this { return this.demandUnlocked() }
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
    if (! forgets) { this.demandUnlocked() }
    this.#exposed = exposed
    this.settle()
  }

  /** The timely stored whisper, as its frozen {@link WhisperHolder} `{ val }`, keeping nothing on the instance. Refuses as `demandReadyToUnsealWhisper` does. */
  async extractWhisper(opts: TimelyOpts = {}): Promise<WhisperHolder> {
    await this.ensureReadyToUnsealWhisper(opts)
    return this.#unseal(this.demandFullProps())
  }

  tryExtractWhisper(opts: TimelyOpts = {}): Promise<Outcome<WhisperHolder>> { return outcomeOf(() => this.extractWhisper(opts)) }

  /** SLOPDOC: Opens the stored whisper and holds it on the instance, where `box.whisper` offers it until forgotten. */
  async expose(opts: TimelyOpts = {}): Promise<this> {
    this.#exposed = await this.extractWhisper(opts)
    this.settle()
    return this
  }

  /** The whisper of `record`, opened through the vault's seal verbs and held to {@link whisperHolder}; one that opens to anything else refuses 'damaged_box'. */
  async #unseal(record: BoxRecord): Promise<WhisperHolder> {
    const { sidecar, box_key_wrapped, whisper_ciphered } = record
    const stamp = boxStampOf(MSX.boxSparse.parse(record), sidecar)
    const whisperText = await this.world.unsealStampedString({ box_key_wrapped, whisper_ciphered }, stamp)
    const held = whisperHolder.safeParse(parseJsonOrNull(whisperText))
    if (! held.success) { throw undecodedWhisper() }
    return held.data
  }
  // --

  // == [Sending]: send, trySend, edit

  /** SLOPDOC: Seals `patch` over the record in hand and stores it, or brings a gone box back to life. */
  async send(patch: BoxPatch, opts: SendOpts = {}): Promise<this> {
    const { ifPresent, ...timely } = MSX.sendOpts.parse(opts)
    const given = verifyConsistent(MSX.boxPatch.parse(patch, { advice: Phrases.BoxPatchAdvice }), this.scope, { kind: 'bad_option', message: Phrases.patchOfOtherScope })
    await this.ensureReadyToSend(timely)
    const ante = this.central
    const record = await this.#edit(given, ante)
    this.demandReadyToSend()
    await this.listing.put(record, ante, { ifPresent })
    return this
  }

  trySend(patch: BoxPatch, opts: SendOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.send(patch, opts)) }

  /** SLOPDOC: The next record `patch` makes of `ante`, sealed through the vault and not yet stored. */
  async #edit({ whisper, sidecar }: BoxPatchGiven, ante: Fetched<BoxRecord, BoxSparse>): Promise<BoxRecord> {
    const isBirthday = this.isTombstoneRecord(ante)
    const sidecarGiven = sidecar ?? (isBirthday ? {} : this.demandFullProps().sidecar)
    // A whisper left out is unsealed and resealed all the same, as the stamp binds the sidecar.
    const whisperGiven = whisper ?? await this.#keptWhisper(isBirthday)
    const written_at = this.world.clock.now()
    return sealedRecordOf(this.world, {
      ...ante,
      revision_tok:  randomId(),
      revision_seq:  ante.revision_seq + 1,
      registered_at: isBirthday ? written_at : ante.registered_at,
      written_at,
      box_tok:       isBirthday ? makeLifeTok() : ante.box_tok,
      am:            'a',
    }, sidecarGiven, whisperGiven)
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
export const sealedRecordOf = async (world: Pick<BoxWorld, 'sealStampedString'>, base: BoxSparse, sidecar: Sidecar, whisper: WhisperHolder): Promise<BoxRecord> => {
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
export const noWhisperToKeep = (): VaultError => new VaultError('no_whisper', Phrases.NoWhisperToKeep)

const undecodedWhisper = (): VaultError => new VaultError('damaged_box', Phrases.UndecodedWhisper)
// --
