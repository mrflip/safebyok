import      { VaultDB, valOf, VaultError }                                                  from 'safebyok'
import type { Outcome, BoxRecord, VaultScope, Proof, Sidecar, BoxSummary, Ciphered, LeaseRecord, VaultKeyPair, Clock, BadNewsHandler, DeviceDB, GetProof, KeyDeriver, StrengthChecker, VaultLogger, MakeVaultOpts, VaultProps } from 'safebyok'
import      * as ZL                                                                         from './vault-checks.js'
import type { Whisper, Label }                                                              from './vault-checks.js'
import      { adorn, decorate }                                                             from './adorn.js'
import      { cipherCtx, decipherBytes, unwrapKeyUnder }                                    from './crypto.js'
import      { BoxFormat }                                                                   from './box.js'
import      * as Crypto from './crypto.js'
import      { bad, good } from './outcome.js'
import { parseMakeVaultOpts } from './vault-opts.js'

/* eslint-disable sonarjs/no-identical-functions */
export const LeaseFormat = 'safebyok-lease-v1'

export class Vault {
  // Every storage refusal, whichever call met it, passes by the refusal policy on its way out.
  readonly #vaultDB: VaultDB
  // Every failure of the device's own storage reaches the vault's callers as a condition, with a kind.
  readonly #deviceDB: DeviceDB
  // The vault reads its own lease length, and calls its own hello: a host writing over the public
  // `hello` on the handle changes nothing inside the vault.
  readonly #leaseMillis: number
  // How long a hello trusts the last read when its call says nothing: see hello().
  readonly #staleMillis:      number
  readonly #onBadNews:        BadNewsHandler | null
  readonly #getProof:         GetProof |       null
  readonly #logger:           VaultLogger
  readonly #clock:            Clock
  readonly #keyDeriver:       KeyDeriver
  readonly #strengthChecker:  StrengthChecker
  readonly #whisperByteLimit: number
  readonly #boxLimit:         number
  readonly #vaultByteLimit:   number

  declare vaultDB: VaultDB
  declare applabel: string
  declare user_id: string
  declare vaultlabel: string
  declare lease: Lease | null
  declare vault_id: string
  declare vault_key_epoch: number
  declare hostGetProof: () => Promise<Proof>
  #takeUpAborter: AbortController | null = null

  /** Millisecond timer */
  get clock(): Clock { return Date }
  now():  ZL.Timestamp { return this.clock.now() }

  #autolockTimer: ZL.Timer | null = null

  get scope(): VaultScope { return { applabel: this.applabel, user_id: this.user_id, vaultlabel: this.vaultlabel } }

  #lease: Lease | null = null

  decipherBoxWhisper(box: Box): Promise<string> {
    this.assertUnlocked()
    return this.#lease!.decipherBoxWhisper(box)
  }

  /** unlock and return box; throws on any refusal
   * @see {@link VaultDB.tryGetBox} and {@link Vault.unlock} for refusals; most importantly:
   * * `stale_write` if VaultDB's revision is newer than expected
   * * `vault_locked` if the vault cannot be unlocked (user cancels dialog box, called
   * *  from a background task, etc
   */
  async getBox(boxlabel: Label): Promise<Box | null> { return valOf(await this.tryGetBox(boxlabel)) }

  /** get box; @see {@link tryGetBox}. resolves to {@link Outcome}<Box>; never throws */
  async tryGetBox(boxlabel: Label): Promise<Outcome<Box | null>> {
    ZL.label.parse(boxlabel)
    await this.hello()
    const result = await this.vaultDB.tryGetBox(this.scope, boxlabel)
    if (! result.ok)  { return result }
    if (! result.val) { return { ...result, val: null } }
    const val = Box.make(this, result.val)
    return { ...result, val }
  }

  get unlocked(): boolean {
    return (this.#lease !== null) && (this.#lease.active)
  }
  assertUnlocked(): true {
    if (this.unlocked) { return true }
    this.lock()
    throw lockedError()
  }

  lock() {
    this.#cancelAutolock()
    this.#abortTakeUp()
    this.#lease    = null
    this.#settle()
  }

  #cancelAutolock() {
    if (this.#autolockTimer === null) { return }
    clearTimeout(this.#autolockTimer)
    this.#autolockTimer = null
  }

  /** Have a lease take-up under way stand down: a key change has landed since it began. */
  #abortTakeUp() {
    this.#takeUpAborter?.abort()
    this.#takeUpAborter = null
  }

  async populate() {
    const raw = valOf(await this.#vaultDB.getVaultProps(this.scope))!
    const record: VaultProps = ZL.vaultProps.parse(raw)
    const               { format, applabel, user_id, vaultlabel, vault_id, unlock_epoch, vault_key_epoch, passphrase, passkey, registered_at } = record
    Object.assign(this, { format, applabel, user_id, vaultlabel, vault_id, unlock_epoch, vault_key_epoch, passphrase, passkey, registered_at })
  }

  private constructor(vaultDB: VaultDB, deviceDB: DeviceDB, record: MakeVaultOpts) {
    const { scope, leaseMillis, staleMillis, onBadNews, getProof, logger, clock, keyDeriver, strengthChecker, whisperByteLimit, boxLimit, vaultByteLimit } = parseMakeVaultOpts(record)
    const { applabel, user_id, vaultlabel } = scope
    this.applabel = applabel
    this.user_id = user_id
    this.vaultlabel = vaultlabel
    //
    this.#vaultDB = vaultDB
    this.#deviceDB = deviceDB
    this.#leaseMillis = leaseMillis
    this.#staleMillis = staleMillis
    this.#onBadNews = onBadNews
    this.#getProof = getProof
    this.#logger = logger
    this.#clock = clock
    this.#keyDeriver = keyDeriver
    this.#strengthChecker = strengthChecker
    this.#whisperByteLimit = whisperByteLimit
    this.#boxLimit = boxLimit
    this.#vaultByteLimit = vaultByteLimit
  }

  // !! SHIM

  async unlock(): Promise<Vault> {
    if (this.unlocked) { return this }
    await this.hello()
    // ...stuff
    return this
  }
  get open(): boolean { return this.lease === null }
  hello(): Promise<Vault> { return Promise.resolve(this) }

  #settle() { return this }
  get cheat() {
    return {
      vaultDB: this.#vaultDB, deviceDB: this.#deviceDB,
      logger: this.#logger, clock: this.#clock, keyDeriver: this.#keyDeriver, strengthChecker: this.#strengthChecker,
      whisperByteLimit: this.#whisperByteLimit, boxLimit: this.#boxLimit, vaultByteLimit: this.#vaultByteLimit,
      leaseMillis: this.#leaseMillis, staleMillis: this.#staleMillis, onBadNews: this.#onBadNews, getProof: this.#getProof,
    } as const
  }
}

export class Box {
  /** The vault this box belongs to, hidden */
  declare readonly vault: Vault
  /** The record's format, `safebyok-box-v6`. */
  readonly format:                 BoxRecord['format']
  /** The box's label within its vault. */
  readonly boxlabel:               string
  /** Fresh on every put: what a conditional write over this box names. */
  readonly revision_tok:           string
  /** How the whisper became the bytes ciphered: `json_v1`. */
  readonly whisper_codec:          BoxRecord['whisper_codec']
  /** Which generation of the whisper's shape this box holds: 1. */
  readonly whisper_schema_version: BoxRecord['whisper_schema_version']
  /** The app's own JSON beside the whisper, `{}` when none, frozen through: visible in storage, never encrypted. */
  readonly sidecar:                Sidecar
  /** When this boxlabel was first put, in epoch milliseconds. */
  readonly registered_at:          number
  /** When this revision was put, in epoch milliseconds, whether or not the whisper changed. */
  readonly written_at:             number
  /** The boxKey, wrapped under the vaultKey. */
  declare readonly box_key_wrapped: Ciphered
  /** The whisper, ciphered under the boxKey. */
  declare readonly whisper_ciphered: Ciphered
  /** The sidecar, parsed, frozen: visible in storage, never encrypted. */
  declare readonly sidecar_json:    string

  readonly damaged: false = false as const

  /** scope: { applabel, user_id, vaultlabel } */
  get scope(): VaultScope { return this.vault.scope }
  /** id of the vault this box belongs to */
  get vault_id(): string { return this.vault.vault_id }
  /** Which vaultKey this box's boxKey is wrapped under. */
  get vault_key_epoch(): number { return this.vault.vault_key_epoch }

  get whisper(): Promise<Whisper | null> {
    return this.getWhisper()
  }
  /** The deciphered whisper. Throws if vault is locked. */
  async getWhisper(): Promise<Whisper | null> {
    await this.vault.unlock()
    const whisperSerialized   = await this.vault.decipherBoxWhisper(this)
    const checked = ZL.whisper.safeParse(parseJson(whisperSerialized))
    if (! checked.success) {
      throw new VaultError('damaged_box', "That box opened, but what was inside is not a whisper this package knows, so it is damaged. It was left as it is; remove it, or store its whisper again over it.")
    }
    return checked.data
  }

  // !!! The following in this class is not demo code this is just to make the example work.

  static make(vault: Vault, boxRecord: BoxRecord): Box {
    return new Box(vault, boxRecord)
  }
  constructor(vault: Vault, record: BoxRecord) {
    this.sidecar                = frozenJsonOf(record.sidecar_json)
    this.format                 = record.format
    this.boxlabel               = record.boxlabel
    this.revision_tok           = record.revision_tok
    this.whisper_codec          = record.whisper_codec
    this.whisper_schema_version = record.whisper_schema_version
    this.registered_at          = record.registered_at
    this.written_at             = record.written_at
    this.sidecar_json           = record.sidecar_json
    const box_key_wrapped        = Object.freeze({ ...record.box_key_wrapped })
    const whisper_ciphered       = Object.freeze({ ...record.whisper_ciphered })
    decorate<Box>(this, { vault, box_key_wrapped, whisper_ciphered })
    Object.freeze(this)
  }

  /** Every visible field, the sidecar parsed, and `damaged: false`, for `vault.boxes` Frozen. */
  get summary(): BoxSummary {
    const                              { boxlabel, revision_tok, vault_key_epoch, registered_at, written_at, sidecar, damaged } = this
    const summary: BoxSummary        = { boxlabel, revision_tok, vault_key_epoch, registered_at, written_at, sidecar, damaged }
    return adorn(this, 'summary', Object.freeze(summary))
  }
  /** The stored record this box was made from, frozen. */
  get props(): BoxProps {
    const                              { boxlabel, revision_tok, vault_key_epoch, registered_at, written_at, sidecar, format, whisper_codec, whisper_schema_version, box_key_wrapped, whisper_ciphered } = this
    const props: BoxProps            = { boxlabel, revision_tok, vault_key_epoch, registered_at, written_at, sidecar, format, whisper_codec, whisper_schema_version, box_key_wrapped, whisper_ciphered }
    return adorn(this, 'props', Object.freeze(props))
  }
  get authentics(): BoxAuthentics {
    const                             { boxlabel, revision_tok, vault_key_epoch, registered_at, written_at, whisper_codec, whisper_schema_version, sidecar_json } = this
    const authentics: BoxAuthentics = { boxlabel, revision_tok, vault_key_epoch, registered_at, written_at, whisper_codec, whisper_schema_version, sidecar_json }
    return adorn(this, 'authentics', Object.freeze(authentics))
  }

  ctxOf(purpose: 'box_key_wrapped' | 'whisper_ciphered'): Uint8Array {
    const { applabel, user_id, vaultlabel, vault_id } = this.vault
    return cipherCtx(BoxFormat, applabel, user_id, vaultlabel, vault_id, purpose, this.authentics)
  }
}

export class Lease {
  /** The vault this lease belongs to, for its scope and clock. Not enumerable, not in `props`. */
  declare readonly vault: Vault
  /** The record's format, `safebyok-lease-v1`. */
  readonly format:                  LeaseRecord['format']
  /** The vaultKey, wrapped under `lease_key`, bound to the lease's ctx. */
  readonly vault_key_lease_wrapped: Ciphered
  /** The instant from which the lease opens nothing, and the vault asks for a proof: epoch milliseconds. */
  until: ZL.Timestamp

  /** This browser's leaseKey: non-extractable, usable only to wrap and unwrap the vaultKey. */
  #_lease_key:             CryptoKey | null = null

  get vault_id(): string { return this.vault.vault_id }
  get vault_key_epoch(): number { return this.vault.vault_key_epoch }

  get unlocked(): boolean {
    return (this.#_lease_key !== null) && (! this.expired)
  }
  get expired(): boolean { return this.endsWithin(0) }
  get active(): boolean { return ! this.expired }

  assertUnlocked(): boolean {
    if (this.unlocked) { return true }
    this.lock()
    throw lockedError()
  }
  lock() {
    this.#_lease_key = null
  }

  /**
   * The whisper `props` holds, opened under `vaultKey` for `vault` and `holder`: kind 'damaged_box'
   * when its vaultKey epoch is not `holder`'s, when it will not unwrap or decipher under the ctx
   * rebuilt from the scope, `holder`'s `vault_id` and its visible fields, or when it opens to no
   * whisper. Names nothing of the box.
   */
  async decipherBoxWhisper(box: Box): Promise<string> {
    const { box_key_wrapped: boxKeyWrapped, whisper_ciphered: whisperCiphered } = box.props
    let whisperBytes: Uint8Array
    const vaultKey = await this.#demandVaultKey(box)
    try {
      const boxKey = await unwrapKeyUnder(vaultKey, boxKeyWrapped, box.ctxOf('box_key_wrapped'), { extractable: false, usage: ['decrypt'] })
      whisperBytes = await decipherBytes(boxKey, whisperCiphered,  box.ctxOf('whisper_ciphered'))
    } catch {
      // WebCrypto's own refusal is dropped: it says nothing a caller can act on.
      throw new VaultError('damaged_box', "That box is damaged: it would not open under this vault's key, as if altered in storage or moved there from somewhere else. It was left as it is; remove it, or store its whisper again over it.")
    }
    return new TextDecoder().decode(whisperBytes)
  }


  // unlocked: VaultKeyPair, standing: VaultProps, until: number, overtaken?: AbortSignal

  private constructor(vault: Vault, record: LeaseRecord, until: number, leaseKey: CryptoKey, wrapped: Ciphered) {
    this.vault                   = vault
    this.vault_key_lease_wrapped = Object.freeze({ ...record.vault_key_lease_wrapped })
    this.format                  = record.format
    this.until                   = until
    this.vault_key_lease_wrapped = wrapped
    this.#_lease_key             = leaseKey
  }

  /**
   * A fresh lease around the vaultKey a proof just opened: a new leaseKey, made non-extractable
   * so not even this code can export it, and the vaultKey's extractable handle wrapped under it,
   * bound to the lease's ctx, and not kept. Writes nothing: the vault puts the record (`props`)
   * in the device store, in place of any before, and computes `askPassphraseAt` from its clock
   * and `leaseHours`. Throws a Zod error, as misuse, for a `holder` or `askPassphraseAt` that a
   * lease record could not hold (`LeaseRecord`'s checks): the vault hands it only what it read
   * and computed.
   *
   * @param vault - The vault it is for: its scope is bound into the wrap.
   * @param holder - The vault props the vaultKey was proven against: their `vault_id` and `unlock_epoch` are bound into the wrap.
   * @param vaultKeyPair - The vaultKey as a way in handed it over; only its `transientKey` is read, to be wrapped.
   * @param askPassphraseAt - When the lease ends, in epoch milliseconds.
   * @returns The lease.
   *
   * @example const lease = await Lease.grant(vault, vaultProps, opened, now + vault.leaseMillis)
   */
  static async grant(vault: Vault, record: LeaseRecord, keypair: VaultKeyPair, until: number): Promise<Lease> {
    const leaseKey = await Crypto.makeLeaseKey()
    const wrapped  = await Crypto.wrapKeyUnder(leaseKey, keypair.transientKey, this.leaseCtx(vault, until))
    return new Lease(vault, record, until, leaseKey, wrapped)
  }

  /** get vaultKey
   * The wrap is opened under the leaseKey, bound to the ctx the
   * vault expects, into a non-extractable handle for the vault to hold for the session.
   *
   * Refuses with kind 'vault_locked' when the lease has ended, or was granted before a way in
   * changed or before the vault was deleted and made anew; and 'corrupt_record' when it fits and
   * still does not open: its wrap or its leaseKey damaged. The vault asks for a proof either way,
   * and erases the lease.
   *
   * @param holder - The vault props as the vault read them now.
   * @returns The vaultKey, non-extractable.
   *
   * @example const { ok, val: vaultKey } = await lease.tryOpen(vaultProps)
   * @example await lease.tryOpen({ ...vaultProps, unlock_epoch: vaultProps.unlock_epoch + 1 })   // refused 'vault_locked': a way in changed since
   */
  async #getVaultKey(holder: LeaseHolder): Promise<Outcome<CryptoKey>> {
    if (holder.vault_id !== this.vault_id || holder.vault_key_epoch !== this.vault_key_epoch) {
      return bad(new VaultError('vault_locked', "This device's lease was granted before the vault's ways in changed, or before it was deleted and made anew, so it opens nothing: the vault asks for a proof instead."))
    }
    if (this.endsWithin(0)) {
      return bad(new VaultError('vault_locked', "This device's lease has ended: the vault asks for a proof again."))
    }
    try {
      return good(await unwrapKeyUnder(this.#demandLeaseKey(), this.vault_key_lease_wrapped, Lease.leaseCtx(this.vault, this.until), SessionUsage))
    } catch {
      return bad(new VaultError('corrupt_record', "This device's lease would not open: it may have been damaged where it is kept. The vault asks for a proof instead."))
    }
  }
  async #demandVaultKey(holder: LeaseHolder): Promise<CryptoKey> { return valOf(await this.#getVaultKey(holder)) }

  #demandLeaseKey(): CryptoKey {
    this.assertUnlocked()
    return this.#_lease_key!
  }

  endsWithin(millis: ZL.Timerange): boolean {
    return this.until - this.vault.now() <= millis
  }

  static leaseCtx(vault: Vault, until: number) {
    const { applabel, user_id, vaultlabel, vault_id } = vault
    return cipherCtx(LeaseFormat, applabel, user_id, vaultlabel, vault_id, until, 'vault_key_lease_wrapped')
  }
}

export type BoxAuthentics = Omit<BoxRecord, 'format' | 'box_key_wrapped' | 'whisper_ciphered'>
export type BoxProps      = Omit<BoxRecord, 'sidecar_json'> & { sidecar: Sidecar }

/** `json`, parsed, with every object and array in it frozen as the parse builds it. */
const frozenJsonOf = (json: string): Sidecar => JSON.parse(json, (_ckey, val: unknown) => Object.freeze(val)) as Sidecar

/** `text` parsed as JSON, or null when it is none: what a decipher hands the whisper check. */
const parseJson = (jsontext: string): unknown => {
  try {
    return JSON.parse(jsontext)
  } catch {
    throw new VaultError('damaged_box', "Whisper cannot be read as JSON")
  }
}

export const lockedError = () => new VaultError('vault_locked', 'The vault is locked, so nothing was read or written: call again, and the vault asks for a proof through getProof, or unlock it first.')

/**
 * The vault props a lease is granted under, as far as it reads them: the vault's id and its
 * `unlock_epoch`, which its wrap is bound to. A whole {@link VaultProps} is one. A change to the
 * ways in moves the epoch, and a vault deleted and made anew has another id: either way, a lease
 * granted before opens nothing.
 */
export type LeaseHolder = Pick<Vault, 'vault_id' | 'vault_key_epoch'>

/** The usages of the handle a lease hands back: what the vault keeps, wrapping and unwrapping boxKeys, never exported. */
const SessionUsage = { extractable: false, usage: ['wrapKey', 'unwrapKey'] } as const
