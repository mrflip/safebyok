/** A box as this device holds it: one whisper sealed in storage, the sidecar shown while the vault is locked, and the verbs that open, edit and send it. */

import type * as Z from 'zod'
import { whisperBytesOf } from '../box'
import { objCheck } from '../checks/validator'
import { VaultError } from '../errors'
import { type Outcome, outcomeOf } from '../outcome'
import * as BX from '../shapes/box'
import type { Boxscope } from '../shapes/scopes'
import { type EditOpts, type Fetched, type Revision, type SendOpts, type StorableOpts, type TimelyOpts, type Times, Storable, isTombstone } from './storable'

// == [Record forms]: BoxSparse, BoxRecord, BoxSnapshot, BoxPatch, boxPatch, BoxEditOpts, BoxSendOpts, LOCKED, Locked

/** A box as a listing shows it: its scope, revision, times and sidecar, nothing ciphered. The existing `BoxSparse` with the scope and `revision_seq` beside it, until shapes/box carries them. */
export type BoxSparse = Boxscope & Revision & Times & BX.BoxSparse

/** The whole box as storage holds it: the sparse fields and the two ciphered ones. */
export type BoxRecord = BoxSparse & BX.BoxCiphered

/** What a host renders of a box: its scope and sparse fields, and whether it is whole, gone, open on this device, or edited and unsent. Never the whisper. */
export type BoxSnapshot = Boxscope & Readonly<{
  revision_tok:  string
  revision_seq:  number
  registered_at: number
  written_at:    number
  sidecar:       BX.Sidecar | null
  hydrated:      boolean
  gone:          boolean
  exposed:       boolean
  unsent:        boolean
}>

/** What a host hands `edit` or `send`: a whisper, a sidecar, both or neither. Its `parse` refuses 'bad_option'. */
export const boxPatch = objCheck(() => ({ whisper: BX.whisper.optional(), sidecar: BX.sidecar.optional() }), 'bad_option')
export type BoxPatch = Z.input<typeof boxPatch>

/** `reseal`: with no whisper given or exposed, open the stored one and seal it again over the record in hand. */
export type BoxEditOpts = EditOpts & { reseal?: boolean | undefined }
export type BoxSendOpts = SendOpts & { reseal?: boolean | undefined }

/** What `box.whisper` reads while the vault is locked. */
export const LOCKED: unique symbol = Symbol('safebyok.locked')
export type Locked = typeof LOCKED
// --

// == [What a box is given]: BoxSealer, BoxOpts

/** The vaultKey's two services, reached through the vault's lease: seal a whisper's bytes over a box's stamp, and open them again. Refuses 'vault_locked' with no lease held. */
export type BoxSealer = {
  sealWhisper(whisperBytes: Uint8Array, stamp: BoxSparse): Promise<BX.BoxCiphered>
  unsealWhisper(ciphered: BX.BoxCiphered, stamp: BoxSparse): Promise<Uint8Array>
}

export type BoxOpts = StorableOpts<Boxscope, BoxRecord, BoxSparse> & { sealer: BoxSealer }
// --

// == [Box]

/** One box, as its listing holds it: `boxListing.make` or `fetch` hands one out, never `new Box`.
 * Its whisper is never in the snapshot. `unsealWhisper` opens it for one call; `expose` keeps it
 * open on the instance as `whisper` until the vault locks. Both need the vault unlocked, as does
 * every edit, a sidecar edit included (the spec's *Box record, overlay, central*).
 */
export class Box extends Storable<Boxscope, BoxRecord, BoxSparse, BoxPatch, BoxSnapshot> {
  // The scope, attached by Storable's constructor.
  declare readonly applabel:   string
  declare readonly user_id:    string
  declare readonly vaultlabel: string
  declare readonly boxlabel:   string

  readonly #sealer: BoxSealer
  // The whisper `expose` keeps open, or one the host set, until the vault locks. Set, the next edit seals it.
  #exposed: BX.Whisper | null = null

  constructor(central: Fetched<Boxscope, BoxRecord, BoxSparse>, opts: BoxOpts) {
    super(central, opts)
    this.#sealer = opts.sealer
    Object.freeze(this)
  }

  // == [The whisper in hand]: whisper

  /** The whisper kept open on this box, LOCKED while the vault is locked, or null when none is kept.
   * Setting it keeps the given whisper open without sealing it: the next `edit` or `send` seals
   * it. Setting null, or LOCKED, forgets it. Refuses 'vault_locked' when set while locked.
   */
  get whisper(): BX.Whisper | Locked | null {
    if (this.isLocked) { return LOCKED }
    return this.#exposed
  }

  set whisper(whisper: BX.Whisper | Locked | null) {
    this.demandUnlocked()
    this.#exposed = whisper === LOCKED ? null : whisper
    this.replaceSnapshot()
  }
  // --

  // == [Verbs]: unsealWhisper, expose, reseal, forgetWhisper, send

  /** Hydrate, then open the stored whisper under the vaultKey and resolve it, keeping nothing on the box.
   * Opens through the sealer's `unsealWhisper`. Refuses 'vault_locked', and 'damaged_box' for a
   * box that opens to something that is no whisper.
   */
  async unsealWhisper(opts: TimelyOpts = {}): Promise<BX.Whisper> {
    await this.hydrate(opts)
    this.demandUnlocked()
    const { box_key_wrapped, whisper_ciphered, ...stamp } = this.fullRecord()
    const whisperBytes = await this.#sealer.unsealWhisper({ box_key_wrapped, whisper_ciphered }, stamp)
    try {
      this.demandUnlocked()
      const checked = BX.whisper.safeParse(parseJsonOrNull(new TextDecoder().decode(whisperBytes)))
      if (! checked.success) {
        throw new VaultError('damaged_box', 'That box opened, but what was inside is not a whisper this package knows, so it is damaged. It was left as it is; remove it, or store its whisper again over it.')
      }
      return checked.data
    } finally {
      whisperBytes.fill(0)
    }
  }

  tryUnsealWhisper(opts: TimelyOpts = {}): Promise<Outcome<BX.Whisper>> { return outcomeOf(() => this.unsealWhisper(opts)) }

  /** Open the stored whisper as {@link unsealWhisper} does and keep it on the box as `whisper`, until the vault locks or `forgetWhisper`; resolve `this`. */
  async expose(opts: TimelyOpts = {}): Promise<this> {
    this.#exposed = await this.unsealWhisper(opts)
    this.replaceSnapshot()
    return this
  }

  tryExpose(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.expose(opts)) }

  /** Open the stored whisper and edit it back in, sealed again over the record in hand; resolve `this`. Nothing is stored until `send`. */
  async reseal(opts: TimelyOpts = {}): Promise<this> {
    return this.edit({ whisper: await this.unsealWhisper(opts) }, opts)
  }

  tryReseal(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.reseal(opts)) }

  /** Drop the whisper kept open on this box. The box listing calls it when the vault locks. */
  forgetWhisper(): void {
    if (this.#exposed === null) { return }
    this.#exposed = null
    this.replaceSnapshot()
  }

  override send(patch: BoxPatch, opts: BoxSendOpts = {}): Promise<this> { return super.send(patch, opts) }
  // --

  // == [What a storable defines]: scopeOf, isFullRecord, sparseOf, overlayOf, makeSnapshot

  protected scopeOf(fetched: Fetched<Boxscope, BoxRecord, BoxSparse>): Boxscope {
    const { applabel, user_id, vaultlabel, boxlabel } = fetched
    return { applabel, user_id, vaultlabel, boxlabel }
  }

  protected isFullRecord(fetched: BoxSparse): fetched is BoxRecord {
    return 'whisper_ciphered' in fetched
  }

  protected sparseOf(record: BoxSparse): BoxSparse {
    const { box_key_wrapped: _boxKeyWrapped, whisper_ciphered: _whisperCiphered, ...sparse } = record as BoxSparse & Partial<BX.BoxCiphered>
    return sparse
  }

  /** The sidecar given, laid in as it is; and the whisper given, else the one exposed, else with `reseal` the one stored, sealed through `#seal`. Neither given: nothing but the sidecar. */
  protected async overlayOf(patch: BoxPatch, opts: BoxEditOpts): Promise<Partial<BoxRecord>> {
    const { whisper, sidecar } = boxPatch.parse(patch)
    const toSeal = whisper ?? this.#exposed ?? (opts.reseal === true ? await this.unsealWhisper(opts) : null)
    const sealed = toSeal === null ? {} : await this.#seal(toSeal, sidecar)
    return sidecar === undefined ? sealed : { ...sealed, sidecar }
  }

  /** Seal `whisper` over the sparse record in hand, with `sidecar` laid in when given, through the sealer's `sealWhisper`; the bytes are zeroed after. */
  // The stamp carries the revision in hand, not the one `send` writes under: the spec's open question A, what the seal binds.
  async #seal(whisper: BX.Whisper, sidecar: BX.Sidecar | undefined): Promise<BX.BoxCiphered> {
    const { sparse } = this
    if (sparse === null) { throw this.listing.absentRefusal(this.scope) }
    const stamp = sidecar === undefined ? sparse : { ...sparse, sidecar }
    const whisperBytes = whisperBytesOf(whisper)
    try {
      return await this.#sealer.sealWhisper(whisperBytes, stamp)
    } finally {
      whisperBytes.fill(0)
    }
  }

  protected makeSnapshot(): BoxSnapshot {
    const { record } = this
    return Object.freeze({
      ...this.scope,
      revision_tok:  record.revision_tok,
      revision_seq:  record.revision_seq,
      registered_at: record.registered_at,
      written_at:    record.written_at,
      sidecar:       isTombstone(record) ? null : record.sidecar,
      hydrated:      this.isHydrated,
      gone:          this.isGone,
      exposed:       this.#exposed !== null,
      unsent:        this.hasOverlay,
    })
  }
  // --
}
// --

// == [Helpers]: parseJsonOrNull

/** `text` parsed as JSON, or null when it is none. */
const parseJsonOrNull = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
// --
