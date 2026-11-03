import { verifyConsistent } from '../checks/validator'
import { type CipherCtxRecord, makeLifeTok, randomId } from '../crypto'
import { VaultError } from '../errors'
import { type Outcome, outcomeOf } from '../outcome'
import * as Phrases from '../phrases'
import type { Sidecar } from '../shapes/box'
import type { Boxscope } from '../shapes/scopes'
import { stableJsonify } from '../stable-jsonify'
import type { BoxLease, BoxWorld } from './box-listing'
import { type BoxRecord, type BoxSparse, type Fetched, type LockedBag, type SendOpts, type TimelyOpts, type WhisperHolder, LOCKED, whisperHolder } from './models-shapes'
import * as MSX from './models-shapes'
import { Storable } from './storable'

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

/** A host's patch for `send`: both {@link BoxProps}, required, and any other prop of the box's record, which the box controls and ignores, so `{ ...record, whisper, sidecar }` will do. `boxPatch` checks it. */
export type BoxPatch = BoxProps & { [Prop in Exclude<keyof BoxRecord, 'sidecar'>]?: BoxRecord[Prop] | undefined }
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

  /** Throws unless unlocked with a full, healthy record: refuses 'vault_locked', 'absent_box' for a box gone or damaged, or 'bad_option' for a sparse record not yet filled, which `ensureReadyToUnsealWhisper` fetches first. */
  demandReadyToUnsealWhisper(): this { return this.demandUnlocked().demandPresent().demandFull() }

  async ensureReadyToSend(opts: TimelyOpts = {}): Promise<this> {
    await this.hydrate(opts)
    return this.demandReadyToSend()
  }

  /** A send needs the vault unlocked, and no more: a box gone or damaged is sent back to life. */
  demandReadyToSend(): this { return this.demandUnlocked() }
  // --

  // == [The whisper]: whisper, unsealWhisper, expose

  /** The exposed whisper, `{ val }`, while the vault is unlocked, or null where none is exposed; {@link LOCKED} while the vault is locked. Locking forgets nothing: the whisper answers again once the vault unlocks.
   * Setting it exposes the whisper given, and no more: nothing seals it, as a `send` seals only the
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
  async unsealWhisper(opts: TimelyOpts = {}): Promise<WhisperHolder> {
    await this.ensureReadyToUnsealWhisper(opts)
    return this.#unseal()
  }

  /** Open the stored whisper and keep it on the instance, offered by `box.whisper`, which answers LOCKED in its place while the vault is locked. Keeping it is the host's decision, which a host would otherwise make for itself, without the guard; it lives on the instance until the host sets `box.whisper` null. */
  async expose(opts: TimelyOpts = {}): Promise<this> {
    this.#exposed = await this.unsealWhisper(opts)
    this.settle()
    return this
  }

  /** The whisper of the record in hand, opened through the vault's lease and held to {@link whisperHolder}; one that opens to anything else refuses 'damaged_box'. */
  async #unseal(): Promise<WhisperHolder> {
    const record = this.demandFullProps()
    const { sidecar, box_key_wrapped, whisper_ciphered } = record
    const stamp = boxStampOf(MSX.boxSparse.parse(record), sidecar)
    const bytes = await this.world.demandLease().unsealWith({ box_key_wrapped, whisper_ciphered }, stamp, stamp)
    try {
      const held = whisperHolder.safeParse(parseJsonOrNull(new TextDecoder().decode(bytes)))
      if (! held.success) { throw undecodedWhisper() }
      return held.data
    } finally {
      bytes.fill(0)
    }
  }
  // --

  // == [Sending]: send, trySend, edit

  /** Seal `patch` over the record in hand and put it over that record's revision, resolving once storage's answer is received; a snapshot shows the change only then. Refuses 'bad_option', naming the field, `opts` or a patch that fails {@link MSX.boxPatch}, before any guard; 'vault_locked', at the seal's end too, storing nothing; and 'stale_write' where the record moved, the record stored delivered first. On a box gone or damaged, this is its rebirth. A refusal leaves nothing behind.
   * `opts.ifPresent` is only ever `'replace'`, what every put already is.
   */
  async send(patch: BoxPatch, opts: SendOpts = {}): Promise<this> {
    const { ifPresent: _ifPresent, ...timely } = MSX.sendOpts.parse(opts)
    verifyConsistent(MSX.boxPatch.parse(patch, { advice: Phrases.BoxPatchAdvice }), this.scope, { kind: 'bad_option', message: Phrases.patchOfOtherScope })
    await this.ensureReadyToSend(timely)
    const ante = this.central
    const record = await this.#edit(patch, ante)
    this.demandReadyToSend()
    await this.listing.put(record, ante)
    return this
  }

  trySend(patch: BoxPatch, opts: SendOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.send(patch, opts)) }

  /** The record `patch` makes of `ante`, returned and held nowhere: under the revision after `ante`'s, written now, its whisper and sidecar sealed through the vault's lease, and only those taken of it. Over a tombstone it is a birthday: registered now, under a `box_tok` fresh from {@link makeLifeTok}. */
  #edit({ whisper, sidecar }: BoxPatch, ante: Fetched<BoxRecord, BoxSparse>): Promise<BoxRecord> {
    const isBirthday = this.isTombstoneRecord(ante)
    const written_at = this.world.clock.now()
    return sealedRecordOf(this.world.demandLease(), {
      ...ante,
      revision_tok:  randomId(),
      revision_seq:  ante.revision_seq + 1,
      registered_at: isBirthday ? written_at : ante.registered_at,
      written_at,
      box_tok:       isBirthday ? makeLifeTok() : ante.box_tok,
      am:            'a',
    }, sidecar, whisper)
  }
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
    })
  }
  // --
}
// --

// == [The seal]: sealedRecordOf, boxStampOf, parseJsonOrNull

/** The full record of `base` with `sidecar`, `whisper` sealed through `lease`: its {@link WhisperHolder} `{ val }` as json_v1, bound with its key to the box's stamp. Of `base`, only its sparse fields are taken. */
export const sealedRecordOf = async (lease: BoxLease, base: BoxSparse, sidecar: Sidecar, whisper: WhisperHolder): Promise<BoxRecord> => {
  const sparse = MSX.boxSparse.parse(base)
  const stamp = boxStampOf(sparse, sidecar)
  const { box_key_wrapped, whisper_ciphered } = await lease.sealWith(new TextEncoder().encode(stableJsonify(whisper)), stamp, stamp)
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

// == [Refusals]: undecodedWhisper

const undecodedWhisper = (): VaultError => new VaultError('damaged_box', Phrases.UndecodedWhisper)
// --
