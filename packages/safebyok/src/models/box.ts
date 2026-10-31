import { verifyConsistent } from '../checks/validator'
import { VaultError } from '../errors'
import * as Phrases from '../phrases'
import type { Sidecar } from '../shapes/box'
import type { Boxscope } from '../shapes/scopes'
import { type BoxRecord, type BoxSparse, type EditOpts, type LockedBag, type WhisperHolder, LOCKED, boxPatch, whisperHolder } from './models-shapes'
import { Storable } from './storable'
import { stubSeal } from './stub-seal'

// == [Record forms]: BoxSnapshot, BoxProps, BoxPatch

export type BoxSnapshot = Boxscope & Readonly<{
  revision_tok:  string
  revision_seq:  number
  registered_at: number
  written_at:    number
  sidecar:       Sidecar | null
  full:          boolean
  present:       boolean
  exposed:       boolean
}>

/** Both halves of a box, the whisper, as its {@link WhisperHolder} `{ val }`, and the sidecar: what every update of a box names, and what it seals. */
export type BoxProps = { whisper: WhisperHolder, sidecar: Sidecar }

/** A host's patch for `edit` and `send`: both {@link BoxProps}, required, and any other prop of the box's record, which the box controls and ignores, so `{ ...record, whisper, sidecar }` will do. `boxPatch` checks it. */
export type BoxPatch = BoxProps & { [Prop in Exclude<keyof BoxRecord, 'sidecar'>]?: BoxRecord[Prop] | undefined }
// --

// == [Box]

/** A box as this device holds it: a storable that ducks as its record, with its whisper openable while the vault is unlocked. */
export class Box extends Storable<Boxscope, BoxRecord, BoxSparse, BoxPatch, BoxSnapshot> {
  /** The scope, tattooed on by Storable's constructor. */
  declare readonly applabel:   string
  declare readonly user_id:    string
  declare readonly vaultlabel: string
  declare readonly boxlabel:   string

  /** The whisper the host asked to keep open on the instance, as its frozen {@link WhisperHolder}, kept while the vault locks and unlocks until the host sets it null. Nothing seals it: an update seals the whisper it is given. */
  #exposed: WhisperHolder | null = null

  // == [Props, as the record has them]: fmt, sidecar, box_key_wrapped, whisper_codec, whisper_schema_version, whisper_ciphered

  get fmt(): number { return this.combined.fmt }

  /** The sidecar of the record in hand, which only the full record carries; null otherwise. It holds nothing secret, so it shows whether the vault is locked or not. */
  get sidecar(): Sidecar | null { return this.full?.sidecar ?? null }

  /** The sealed parts of the record in hand; null where it is not full. */
  get box_key_wrapped():        BoxRecord['box_key_wrapped'] | null  { return this.full?.box_key_wrapped ?? null }
  get whisper_codec():          'json_v1' | null                     { return this.full?.whisper_codec ?? null }
  get whisper_schema_version(): 1 | null                             { return this.full?.whisper_schema_version ?? null }
  get whisper_ciphered():       BoxRecord['whisper_ciphered'] | null { return this.full?.whisper_ciphered ?? null }
  // --

  // == [Guards]: ensureReadyToUnsealWhisper, demandReadyToUnsealWhisper, ensureReadyToSeal, demandReadyToSeal

  async ensureReadyToUnsealWhisper(opts: EditOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToUnsealWhisper()
  }

  /** Opening the whisper needs the vault unlocked and the record in hand present and full: a box gone or damaged has no whisper to open, and refuses 'absent_box'. */
  demandReadyToUnsealWhisper(): this { return this.demandUnlocked().demandPresent().demandFull() }

  async ensureReadyToSeal(opts: EditOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToSeal()
  }

  /** A seal needs the vault unlocked, and no more: a box gone or damaged is sealed back to life. */
  demandReadyToSeal(): this { return this.demandUnlocked() }
  // --

  // == [The whisper]: whisper, unsealWhisper, expose, seal

  /** The exposed whisper, as its frozen {@link WhisperHolder} `{ val }`, or LOCKED while the vault is; the vault locking forgets nothing, and the whisper answers again once it unlocks. Setting it exposes the given whisper, `{ val }`, which needs the vault unlocked, and does no more: nothing seals it, as `edit` and `send` seal only the whisper they are given. The box keeps a frozen copy, so to change the whisper, set it anew; one that is not `{ val }` with `val` a whisper refuses 'bad_option', naming the field, before the lock is looked at. Setting null (or LOCKED, which counts as null, and is told from a whisper by `Storable.isLockedFUBag`) forgets it, locked or not. */
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

  /** Open the stored whisper and hand it back, as its frozen {@link WhisperHolder} `{ val }`, keeping nothing on the instance. */
  async unsealWhisper(opts: EditOpts = {}): Promise<WhisperHolder> {
    await this.ensureReadyToUnsealWhisper(opts)
    return this.#unseal()
  }

  /** Open the stored whisper and keep it on the instance, readable and settable as `box.whisper`, kept while the vault locks and unlocks: a host that calls this accepts the whisper living on the instance until it sets `box.whisper` null. */
  async expose(opts: EditOpts = {}): Promise<this> {
    this.#exposed = await this.unsealWhisper(opts)
    this.settle()
    return this
  }

  /** Seal this whisper, `{ val }`, with this sidecar under the next revision, as the staged: `edit({ whisper, sidecar }, opts)`. Nothing is stored until `send`. */
  seal(whisper: WhisperHolder, sidecar: Sidecar, opts: EditOpts = {}): Promise<this> { return this.edit({ whisper, sidecar }, opts) }

  /** Not yet: decipher the whisper under the boxKey, unwrapped through the vault's lease, parse it, and hold it to {@link whisperHolder}: the seal ciphers the whole object, `{ val }`, as JSON. */
  #unseal(): Promise<WhisperHolder> {
    this.demandFull()
    return Promise.reject(new VaultError('unexpected_error', 'unseal is not written yet.'))
  }
  // --

  // == [Required by Storable]: isFullRecord, isFullPatch, makeStaged, makeSnapshot

  protected isFullRecord(fetched: BoxSparse): fetched is BoxRecord {
    return 'whisper_ciphered' in fetched
  }

  /** Returns for a full patch of this box, and refuses any other 'bad_option', naming the field; `edit`, so `send` and `seal`, calls it first of all, before any guard. Every update of a box seals the whisper it is given, as `{ val }`, with the sidecar it is given, and carries neither over from the record in hand; an exposed whisper is no substitute for the one given.
   * The patch is held to `boxPatch`: a patch missing either half, or whose whisper is not `{ val }`
   * with `val` a whisper, or whose sidecar fails its check, is not full. The other props of the
   * box's record may ride along, so `{ ...record, whisper, sidecar }` will do; each is checked,
   * and `makeStaged` takes none of them. A scope field that names another box refuses, naming it.
   */
  protected isFullPatch(patch: unknown): asserts patch is BoxPatch {
    verifyConsistent(boxPatch.parse(patch, { advice: Phrases.BoxPatchAdvice }), this.scope, { kind: 'bad_option', message: Phrases.patchOfOtherScope })
  }

  /** The patch's whisper, sealed by {@link stubSeal} with the patch's sidecar under `base`'s props: `base`, sparse or full, lends its scope, revision, times and whisper's form, and none of its sidecar or sealed parts. */
  protected makeStaged(base: BoxSparse, { whisper, sidecar }: BoxProps): Promise<BoxRecord> {
    return stubSeal({ ...base, sidecar }, whisper)
  }

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
// --
