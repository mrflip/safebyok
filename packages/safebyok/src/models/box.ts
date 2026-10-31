import { verifyConsistent } from '../checks/validator'
import { makeLifeTok } from '../crypto'
import { VaultError } from '../errors'
import * as Phrases from '../phrases'
import type { Sidecar } from '../shapes/box'
import type { Boxscope } from '../shapes/scopes'
import { type BoxRecord, type BoxSparse, type EditOpts, type Fetched, type LockedBag, type WhisperHolder, LOCKED, whisperHolder } from './models-shapes'
import * as MSX from './models-shapes'
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

  // == [Props, as the record has them]: fmt, box_tok, sidecar, box_key_wrapped, whisper_codec, whisper_schema_version, whisper_ciphered

  get fmt(): number { return this.combined.fmt }

  /** The life of the box under its boxlabel, as the record in hand has it: minted at its birth, and kept by every later revision of that life. */
  get box_tok(): string { return this.combined.box_tok }

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

  /** Throws unless unlocked with a full, healthy record: refuses 'vault_locked', 'absent_box' for a box gone or damaged, or 'bad_option' for a sparse record not yet filled, which `ensureReadyToUnsealWhisper` fetches first. */
  demandReadyToUnsealWhisper(): this { return this.demandUnlocked().demandPresent().demandFull() }

  async ensureReadyToSeal(opts: EditOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToSeal()
  }

  /** Throws unless unlocked ('vault_locked'). */
  demandReadyToSeal(): this { return this.demandUnlocked() }
  // --

  // == [The whisper]: whisper, unsealWhisper, expose, seal

  /** The exposed whisper, `{ val }`, while the vault is unlocked, or null where none is exposed; {@link LOCKED} while the vault is locked. Locking forgets nothing: the whisper answers again once the vault unlocks.
   * Setting it exposes the whisper given, and no more: nothing seals it, as an update seals only the
   * whisper it is given. It needs the vault unlocked; a whisper that is not `{ val }` refuses
   * 'bad_option', naming the field, before the lock is looked at. The box keeps a frozen copy.
   * Setting null, or LOCKED (told from a whisper by `Storable.isLockedFUBag`), forgets it, locked or not.
   */
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

  /** Open the stored whisper and keep it on the instance, offered by `box.whisper`, which answers LOCKED in its place while the vault is locked. Keeping it is the host's decision, which a host would otherwise make for itself, without the guard; it lives on the instance until the host sets `box.whisper` null. */
  async expose(opts: EditOpts = {}): Promise<this> {
    this.#exposed = await this.unsealWhisper(opts)
    this.settle()
    return this
  }

  /** Seal this whisper, `{ val }`, with this sidecar under the next revision, as the staged: `edit({ whisper, sidecar }, opts)`. Nothing is stored until `send`. */
  seal(whisper: WhisperHolder, sidecar: Sidecar, opts: EditOpts = {}): Promise<this> { return this.edit({ whisper, sidecar }, opts) }

  /** Not yet: decipher the whisper under the boxKey, unwrapped through the vault's lease, parse it, and hold it to {@link whisperHolder}: the seal ciphers the whole object, `{ val }`, as JSON. */
  #unseal(): Promise<WhisperHolder> {
    this.demandedFull()
    return Promise.reject(new VaultError('unexpected_error', 'unseal is not written yet.'))
  }
  // --

  // == [Required by Storable]: isFullRecord, isFullPatch, makeStaged, lifeTokPathOf, makeSnapshot

  /** A box record alive that carries its sealed whisper. */
  protected isFullRecord(fetched: BoxSparse): fetched is BoxRecord {
    return (fetched.am === 'a') && ('whisper_ciphered' in fetched)
  }

  /** Returns for a full patch of this box, and refuses any other 'bad_option', naming the field; `edit`, so `send` and `seal`, calls it first of all, before any guard. Every update of a box seals the whisper it is given, as `{ val }`, with the sidecar it is given, and carries neither over from the record in hand; an exposed whisper is no substitute for the one given.
   * The patch is held to `boxPatch`: a patch missing either half, or whose whisper is not `{ val }`
   * with `val` a whisper, or whose sidecar fails its check, is not full. The other props of the
   * box's record may ride along, so `{ ...record, whisper, sidecar }` will do; each is checked,
   * and `makeStaged` takes none of them. A scope field that names another box refuses, naming it.
   */
  protected isFullPatch(patch: unknown): asserts patch is BoxPatch {
    verifyConsistent(MSX.boxPatch.parse(patch, { advice: Phrases.BoxPatchAdvice }), this.scope, { kind: 'bad_option', message: Phrases.patchOfOtherScope })
  }

  /** The staged record of `patch`: its whisper, sealed by {@link stubSeal} with its sidecar over `makeStagedBase`'s base, which lends its scope, revision, times, `box_tok` and whisper's form, and none of its sidecar or sealed parts. At a birthday, the box's birthday gift is a `box_tok` fresh from {@link makeLifeTok}. `patch` was held to `boxPatch` by `isFullPatch` before `edit` called this; of it, only the whisper and the sidecar are taken. */
  protected makeStaged(patch: BoxPatch): Promise<BoxRecord> {
    const { whisper, sidecar } = patch
    const { base, isBirthday } = this.makeStagedBase()
    const box_tok = isBirthday ? makeLifeTok() : base.box_tok
    return stubSeal({ ...base, box_tok, sidecar }, whisper)
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
// --
