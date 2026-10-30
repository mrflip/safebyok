import { VaultError } from '../errors'
import type { Sidecar, Whisper } from '../shapes/box'
import type { Boxscope } from '../shapes/scopes'
import type { BoxRecord, BoxSparse, EditOpts } from './models-shapes'
import { Storable } from './storable'

// == [Record forms]: BoxSnapshot, BoxProps, BoxEditOpts, LOCKED

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

/** The patch a host hands `edit` and `send`: either half of a box, both, or neither. */
export type BoxProps = { whisper?: Whisper | undefined, sidecar?: Sidecar | undefined }

/** `reseal`: with no whisper given or exposed, open the stored one and seal it again under the new revision. */
export type BoxEditOpts = EditOpts & { reseal?: boolean | undefined }

/** The sentinel `box.whisper` returns while the vault is locked. */
export const LOCKED: unique symbol = Symbol('safebyok.locked')
// --

// == [Box]

/** A box as this device holds it: a storable that ducks as its record, with its whisper openable while the vault is unlocked. */
export class Box extends Storable<Boxscope, BoxRecord, BoxSparse, BoxProps, BoxSnapshot> {
  /** The scope, tattooed on by Storable's constructor. */
  declare readonly applabel:   string
  declare readonly user_id:    string
  declare readonly vaultlabel: string
  declare readonly boxlabel:   string

  /** The whisper the host asked to keep open on the instance, until the vault locks. Set, it is what the next edit seals. */
  #exposed: Whisper | null = null

  // == [Props, as the record has them]: fmt, sidecar, box_key_wrapped, whisper_codec, whisper_schema_version, whisper_ciphered

  get fmt(): number { return this.combined.fmt }

  /** The sidecar of the record in hand, which only the full record carries; null otherwise. */
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

  // == [The whisper]: whisper, unsealWhisper, expose, seal, reseal, edit

  /** The exposed whisper, or LOCKED while the vault is. Setting it exposes the given whisper without sealing it: the next `edit` or `send` seals what is exposed. Setting null (or LOCKED, which reads as null) forgets it. */
  get whisper(): Whisper | typeof LOCKED | null {
    if (this.isLocked) { return LOCKED }
    return this.#exposed
  }

  set whisper(whisper: Whisper | typeof LOCKED | null) {
    this.demandUnlocked()
    this.#exposed = whisper === LOCKED ? null : whisper
    this.settle()
  }

  /** Open the stored whisper and hand it back, keeping nothing on the instance. */
  async unsealWhisper(opts: EditOpts = {}): Promise<Whisper> {
    await this.ensureReadyToUnsealWhisper(opts)
    return this.#unseal()
  }

  /** Open the stored whisper and keep it on the instance, readable and settable as `box.whisper` until the vault locks. */
  async expose(opts: EditOpts = {}): Promise<this> {
    this.#exposed = await this.unsealWhisper(opts)
    this.settle()
    return this
  }

  /** Seal this whisper under the next revision, as the staged. Nothing is stored until `send`. */
  seal(whisper: Whisper, opts: EditOpts = {}): Promise<this> { return this.edit({ whisper }, opts) }

  /** Open the stored whisper and seal it again under the next revision, as the staged. */
  async reseal(opts: EditOpts = {}): Promise<this> {
    return this.edit({ whisper: await this.unsealWhisper(opts) }, opts)
  }

  /** {@link Storable.edit}, with `reseal`: given no whisper and none exposed, open the stored one and seal it again. */
  override edit(props: BoxProps, opts: BoxEditOpts = {}): Promise<this> {
    if (props.whisper === undefined && this.#exposed === null && opts.reseal === true) { return this.reseal(opts) }
    return super.edit(props, opts)
  }

  /** Not yet: decipher the whisper under the boxKey, unwrapped through the vault's lease. */
  #unseal(): Promise<Whisper> {
    this.demandFull()
    return Promise.reject(new VaultError('unexpected_error', 'unseal is not written yet.'))
  }
  // --

  // == [Concrete Subclass Required Methods]: isFullRecord, makeStaged, makeSnapshot

  protected isFullRecord(fetched: BoxSparse): fetched is BoxRecord {
    return 'whisper_ciphered' in fetched
  }

  /** A whisper given or exposed is sealed under `base`'s props, the sidecar given or carried among them; with neither whisper, the sealed parts ride along as they are, which needs `base` full.
   * Not yet: the seal itself (a fresh boxKey, wrapped under the vaultKey; the whisper ciphered with the record's stamp).
   */
  protected makeStaged(base: BoxSparse, patch: BoxProps): Promise<BoxRecord> {
    const withSidecar = patch.sidecar === undefined ? base : { ...base, sidecar: patch.sidecar }
    const whisper = patch.whisper ?? this.#exposed
    if (whisper === null) {
      if (! this.isFullRecord(withSidecar)) { return Promise.reject(new VaultError('bad_option', 'This box holds no whisper to carry forward, so an edit needs one: hydrate it, or give a whisper.')) }
      return Promise.resolve(withSidecar)
    }
    return Promise.reject(new VaultError('unexpected_error', 'seal is not written yet.'))
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
