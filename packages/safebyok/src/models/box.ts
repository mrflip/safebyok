import { VaultError } from '../errors'
import type { Sidecar, Whisper } from '../shapes/box'
import { type EditOpts, type Fetched, Storable, isTombstone } from './storable'

// == [Record forms]: BoxScope, BoxSparse, BoxRecord, BoxSnapshot, BoxProps, BoxEditOpts, LOCKED

export type BoxScope = Readonly<{ applabel: string, user_id: string, vaultlabel: string, boxlabel: string }>

export type BoxSparse = BoxScope & Readonly<{
  format:        'safebyok-box-v9'
  revision_tok:  string
  revision_seq:  number
  registered_at: number
  written_at:    number
  sidecar:       Sidecar
}>

export type BoxRecord = BoxSparse & Readonly<{
  box_key_wrapped:        string
  whisper_codec:          'json_v1'
  whisper_schema_version: 1
  whisper_ciphered:       string
}>

export type BoxSnapshot = BoxScope & Readonly<{
  revision_tok:  string
  revision_seq:  number
  registered_at: number
  written_at:    number
  sidecar:       Sidecar | null
  hydrated:      boolean
  gone:          boolean
  exposed:       boolean
}>

// What a host hands `edit` and `send`: either half of a box, or both, or neither.
export type BoxProps = { whisper?: Whisper | undefined, sidecar?: Sidecar | undefined }

// `reseal`: with no whisper given or exposed, open the stored one and seal it again under the new revision.
export type BoxEditOpts = EditOpts & { reseal?: boolean | undefined }

// What `box.whisper` reads while the vault is locked.
export const LOCKED: unique symbol = Symbol('safebyok.locked')

export const BoxFormat = 'safebyok-box-v9'

// == [Box]

export class Box extends Storable<BoxScope, BoxRecord, BoxSparse, BoxProps, BoxSnapshot> {
  // The scope, tattooed on by Storable's constructor.
  declare readonly applabel:   string
  declare readonly user_id:    string
  declare readonly vaultlabel: string
  declare readonly boxlabel:   string

  // The record's own parts, kept off the instance's face: null on a tombstone, and the sealed ones null on a sparse too.
  #sidecar:         Sidecar | null = null
  #boxKeyWrapped:   string | null = null
  #whisperCiphered: string | null = null
  // The whisper the host asked to keep open on the instance, until the vault locks. Set, it is what the next edit seals.
  #exposed: Whisper | null = null

  protected override assign(record: Fetched<BoxScope, BoxRecord, BoxSparse>): void {
    super.assign(record)
    this.#sidecar = isTombstone(record) ? null : record.sidecar
    this.#boxKeyWrapped = ! isTombstone(record) && this.isFullRecord(record) ? record.box_key_wrapped : null
    this.#whisperCiphered = ! isTombstone(record) && this.isFullRecord(record) ? record.whisper_ciphered : null
  }

  // == [Props]: sidecar, whisper

  get sidecar(): Sidecar | null { return this.#sidecar }

  // The exposed whisper, or LOCKED while the vault is. Setting it exposes the given whisper without sealing it:
  // the next `edit` or `send` seals what is exposed. Setting null (or LOCKED, which reads as null) forgets it.
  get whisper(): Whisper | typeof LOCKED | null {
    if (this.listing.lockState() === 'locked') { return LOCKED }
    return this.#exposed
  }

  set whisper(whisper: Whisper | typeof LOCKED | null) {
    this.demandUnlocked()
    this.#exposed = whisper === LOCKED ? null : whisper
    void this.settle()
  }

  // == [Concrete ops]: unsealWhisper, expose, seal, reseal, edit, forgetWhisper

  // Open the stored whisper and hand it back, keeping nothing on the instance.
  async unsealWhisper(opts: EditOpts = {}): Promise<Whisper> {
    await this.hydrate(opts)
    this.demandUnlocked()
    return this.#unseal()
  }

  // Open the stored whisper and keep it on the instance, readable and settable as `box.whisper` until the vault locks.
  async expose(opts: EditOpts = {}): Promise<this> {
    this.#exposed = await this.unsealWhisper(opts)
    void this.settle()
    return this
  }

  // Seal this whisper under the next revision, as the local copy. Nothing is stored until `send`.
  seal(whisper: Whisper, opts: EditOpts = {}): Promise<this> { return this.edit({ whisper }, opts) }

  // Open the stored whisper and seal it again under the next revision, as the local copy.
  async reseal(opts: EditOpts = {}): Promise<this> {
    return this.edit({ whisper: await this.unsealWhisper(opts) }, opts)
  }

  // Take up the most recent of edited and central; replace the sidecar if given; seal the whisper if given or
  // exposed; else, with `reseal`, open the stored whisper and seal it again. The storable does the taking up.
  override edit(props: BoxProps, opts: BoxEditOpts = {}): Promise<this> {
    if (props.whisper === undefined && this.#exposed === null && opts.reseal === true) { return this.reseal(opts) }
    return super.edit(props, opts)
  }

  // The vault locked: nothing open stays open.
  forgetWhisper(): void {
    this.#exposed = null
    void this.settle()
  }

  // Not yet: decipher the whisper under the boxKey, unwrapped through the vault's lease.
  #unseal(): Promise<Whisper> {
    const boxKeyWrapped = this.#boxKeyWrapped
    const whisperCiphered = this.#whisperCiphered
    if (boxKeyWrapped === null || whisperCiphered === null) { return Promise.reject(new VaultError('bad_option', 'This box has not been hydrated, so there is no whisper to open: call hydrate() first.')) }
    return Promise.reject(new VaultError('unexpected_error', 'unseal is not written yet.'))
  }

  // == [What a storable defines]: scopeOf, isFullRecord, sparseOf, makeStaged, makeSnapshot

  protected scopeOf(fetched: Fetched<BoxScope, BoxRecord, BoxSparse>): BoxScope {
    const { applabel, user_id, vaultlabel, boxlabel } = fetched
    return { applabel, user_id, vaultlabel, boxlabel }
  }

  protected isFullRecord(fetched: BoxSparse): fetched is BoxRecord {
    return 'whisper_ciphered' in fetched
  }

  protected sparseOf(record: BoxSparse): BoxSparse {
    const { applabel, user_id, vaultlabel, boxlabel, revision_tok, revision_seq, format, registered_at, written_at, sidecar } = record
    return { applabel, user_id, vaultlabel, boxlabel, revision_tok, revision_seq, format, registered_at, written_at, sidecar }
  }

  // The sidecar is not bound by the seal, so it is replaced in place. A whisper given or exposed is sealed
  // under `base`'s props; with neither, the ciphered whisper rides along as it is, which needs `base` full.
  // Not yet: the seal itself (a fresh boxKey, wrapped under the vaultKey; the whisper ciphered with the record's stamp).
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
      sidecar:       this.#sidecar,
      hydrated:      this.isHydrated,
      gone:          this.isGone,
      exposed:       this.#exposed !== null,
    })
  }
}
