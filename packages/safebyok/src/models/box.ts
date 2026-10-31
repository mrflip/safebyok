import { VaultError } from '../errors'
import * as Phrases from '../phrases'
import type { Sidecar, Whisper } from '../shapes/box'
import type { Boxscope } from '../shapes/scopes'
import type { BoxRecord, BoxSparse, EditOpts } from './models-shapes'
import { Storable } from './storable'
import { stubSeal } from './stub-seal'

// == [Record forms]: LOCKED, BoxSnapshot, BoxProps, namesBoth

/** The sentinel `box.whisper` answers while the vault is locked. It is registered with `Symbol.for`, so `Symbol.for('LOCKED')` is this symbol. */
export const LOCKED: unique symbol = Symbol.for('LOCKED')

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

/** The patch a host hands `edit` and `send`: both halves of a box, the whisper and the sidecar, as every update names both. */
export type BoxProps = { whisper: Whisper, sidecar: Sidecar }

/** True where `patch` names both a whisper and a sidecar, neither undefined nor null, as a host's patch may not, whatever its type says. */
const namesBoth = (patch: Partial<BoxProps>): boolean => ((patch.whisper ?? null) !== null) && ((patch.sidecar ?? null) !== null)
// --

// == [Box]

/** A box as this device holds it: a storable that ducks as its record, with its whisper openable while the vault is unlocked. */
export class Box extends Storable<Boxscope, BoxRecord, BoxSparse, BoxProps, BoxSnapshot> {
  /** The scope, tattooed on by Storable's constructor. */
  declare readonly applabel:   string
  declare readonly user_id:    string
  declare readonly vaultlabel: string
  declare readonly boxlabel:   string

  /** The whisper the host asked to keep open on the instance, kept while the vault locks and unlocks until the host sets it null. Nothing seals it: an update seals the whisper it is given. */
  #exposed: Whisper | null = null

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

  // == [The whisper]: whisper, unsealWhisper, expose, seal, edit

  /** The exposed whisper, or LOCKED while the vault is; the vault locking forgets nothing, and the whisper answers again once it unlocks. Setting it exposes the given whisper, which needs the vault unlocked, and does no more: nothing seals it, as `edit` and `send` seal only the whisper they are given. Setting null (or LOCKED, which counts as null) forgets it, locked or not. */
  get whisper(): Whisper | typeof LOCKED | null {
    if (this.isLocked) { return LOCKED }
    return this.#exposed
  }

  set whisper(whisper: Whisper | typeof LOCKED | null) {
    const forgets = (whisper === null) || (whisper === LOCKED)
    if (! forgets) { this.demandUnlocked() }
    this.#exposed = forgets ? null : whisper
    this.settle()
  }

  /** Open the stored whisper and hand it back, keeping nothing on the instance. */
  async unsealWhisper(opts: EditOpts = {}): Promise<Whisper> {
    await this.ensureReadyToUnsealWhisper(opts)
    return this.#unseal()
  }

  /** Open the stored whisper and keep it on the instance, readable and settable as `box.whisper`, kept while the vault locks and unlocks: a host that calls this accepts the whisper living on the instance until it sets `box.whisper` null. */
  async expose(opts: EditOpts = {}): Promise<this> {
    this.#exposed = await this.unsealWhisper(opts)
    this.settle()
    return this
  }

  /** Seal this whisper with this sidecar under the next revision, as the staged: `edit({ whisper, sidecar }, opts)`. Nothing is stored until `send`. */
  seal(whisper: Whisper, sidecar: Sidecar, opts: EditOpts = {}): Promise<this> { return this.edit({ whisper, sidecar }, opts) }

  /** {@link Storable.edit}, for a patch that names both the whisper and the sidecar: every update of a box seals the whisper it is given with the sidecar it is given, and carries neither over from the record in hand. A patch missing either refuses 'bad_option' before anything is staged; `send` and `seal` come through here. An exposed whisper is no substitute for the one given. */
  override edit(patch: BoxProps, opts: EditOpts = {}): Promise<this> {
    if (! namesBoth(patch)) { return Promise.reject(new VaultError('bad_option', Phrases.WhisperAndSidecarRequired)) }
    return super.edit(patch, opts)
  }

  /** Not yet: decipher the whisper under the boxKey, unwrapped through the vault's lease. */
  #unseal(): Promise<Whisper> {
    this.demandFull()
    return Promise.reject(new VaultError('unexpected_error', 'unseal is not written yet.'))
  }
  // --

  // == [Required by Storable]: isFullRecord, makeStaged, makeSnapshot

  protected isFullRecord(fetched: BoxSparse): fetched is BoxRecord {
    return 'whisper_ciphered' in fetched
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
