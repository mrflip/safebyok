import { VaultError } from '../errors'
import * as Phrases from '../phrases'
import type { Sidecar, Whisper } from '../shapes/box'
import type { Boxscope } from '../shapes/scopes'
import { type BoxRecord, type BoxSparse, type EditOpts, isTombstone } from './models-shapes'
import { Storable } from './storable'
import { stubSeal } from './stub-seal'

// == [Record forms]: LOCKED, LockedSidecar, BoxSnapshot, BoxProps, BoxEditOpts

/** The sentinel `box.whisper` answers while the vault is locked, and the key that marks a {@link LockedSidecar}. It is registered with `Symbol.for`, so `Symbol.for('LOCKED')` is this symbol. */
export const LOCKED: unique symbol = Symbol.for('LOCKED')

/** The bag `box.sidecar` and the snapshot's `sidecar` answer in place of the sidecar while the vault is locked. It is one frozen object, marked by the {@link LOCKED} key, which JSON leaves out. */
export type LockedSidecar = Readonly<{ [LOCKED]: true }>

const lockedSidecar: LockedSidecar = Object.freeze({ [LOCKED]: true as const })

/** Whether `sidecar` is the bag a locked box answers, which is always the one frozen object. */
const isLockedSidecar = (sidecar: Sidecar | LockedSidecar | null): boolean => sidecar === lockedSidecar

export type BoxSnapshot = Boxscope & Readonly<{
  revision_tok:  string
  revision_seq:  number
  registered_at: number
  written_at:    number
  sidecar:       Sidecar | LockedSidecar | null
  full:          boolean
  present:       boolean
  exposed:       boolean
}>

/** The patch a host hands `edit` and `send`: either half of a box, both, or neither. */
export type BoxProps = { whisper?: Whisper | undefined, sidecar?: Sidecar | undefined }

/** `reseal`: with no whisper given or exposed, open the stored one and seal it again under the new revision. */
export type BoxEditOpts = EditOpts & { reseal?: boolean | undefined }
// --

// == [Box]

/** A box as this device holds it: a storable that ducks as its record, with its whisper openable while the vault is unlocked. */
export class Box extends Storable<Boxscope, BoxRecord, BoxSparse, BoxProps, BoxSnapshot> {
  /** The scope, tattooed on by Storable's constructor. */
  declare readonly applabel:   string
  declare readonly user_id:    string
  declare readonly vaultlabel: string
  declare readonly boxlabel:   string

  /** The whisper the host asked to keep open on the instance, kept while the vault locks and unlocks until the host sets it null. Set, it is what the next edit seals. */
  #exposed: Whisper | null = null

  // == [Props, as the record has them]: fmt, sidecar, box_key_wrapped, whisper_codec, whisper_schema_version, whisper_ciphered

  get fmt(): number { return this.combined.fmt }

  /** The sidecar of the record in hand, which only the full record carries; null otherwise. While the vault is locked, it is the {@link LockedSidecar} bag instead, whatever the record holds. */
  get sidecar(): Sidecar | LockedSidecar | null {
    if (this.isLocked) { return lockedSidecar }
    return this.full?.sidecar ?? null
  }

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

  /** The exposed whisper, or LOCKED while the vault is; the vault locking forgets nothing, and the whisper reads again once it unlocks. Setting it exposes the given whisper without sealing it, which needs the vault unlocked: the next `edit` or `send` seals what is exposed. Setting null (or LOCKED, which reads as null) forgets it, locked or not. */
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

  // == [Required by Storable]: isFullRecord, makeStaged, makeSnapshot

  protected isFullRecord(fetched: BoxSparse): fetched is BoxRecord {
    return 'whisper_ciphered' in fetched
  }

  /** A whisper given or exposed is sealed by {@link stubSeal} under `base`'s props, with the sidecar given, else the one `base` carries; a box gone or damaged is reborn with `{}`, but a live one whose record in hand is sparse refuses 'bad_option', as `{}` would be put over the sidecar stored. With neither whisper, the sealed parts ride along as they are, which needs `base` full. */
  protected makeStaged(base: BoxSparse, patch: BoxProps): Promise<BoxRecord> {
    const whisper = patch.whisper ?? this.#exposed
    if (whisper === null) {
      const withSidecar = patch.sidecar === undefined ? base : { ...base, sidecar: patch.sidecar }
      if (! this.isFullRecord(withSidecar)) { return Promise.reject(new VaultError('bad_option', Phrases.NoWhisperToCarry)) }
      return Promise.resolve(withSidecar)
    }
    const carried = this.isFullRecord(base) ? base.sidecar : null
    if (carried === null && patch.sidecar === undefined && ! isTombstone(this.combined)) { return Promise.reject(new VaultError('bad_option', Phrases.NoSidecarToCarry)) }
    return stubSeal({ ...base, sidecar: patch.sidecar ?? carried ?? {} }, whisper)
  }

  /** Two snapshots are alike when their JSON is, and both or neither carry the locked sidecar. */
  protected override sameSnapshot(next: BoxSnapshot, current: BoxSnapshot): boolean {
    // JSON leaves the LOCKED key out: without the identity check, a box that locks with an empty sidecar would keep its old snapshot.
    return isLockedSidecar(next.sidecar) === isLockedSidecar(current.sidecar) && super.sameSnapshot(next, current)
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
