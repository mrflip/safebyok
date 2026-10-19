import { cipherCtx, fromB64, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder, type Ciphered } from './crypto'
import { VaultError } from './errors'
import { type Outcome, outcomeOf, unexpectedError } from './outcome'
import { PasskeyProof, PassphraseProof, type Proof } from './proof'
import { PasskeySaltBytes, WayinRecord, type PasskeyWayinRecord, type PassphraseWayinRecord, type VaultProps, type WayinKind, type WayinSummary } from './types'
import { decorate } from './utils'
import type { Vault } from './vault'

/**
 * Ways in: each the vaultKey wrapped under a wayinKey one kind of way in makes, so a vault has
 * several ways in and one vaultKey behind them all. A {@link Wayin} is made from its stored record
 * by `Wayin.make`, a {@link PassphraseWayin} or a {@link PasskeyWayin}; `wayin.tryOpen(proof)`
 * opens one, the proof making the key; `Wayin.sealPassphrase` and `Wayin.sealPasskey` make one.
 *
 * Each way in's wrap is bound to its vault -- the scope, and the fields of the vault props that
 * never change, `vault_id` and `registered_at` -- and to its own visible header (every field but
 * the wrap itself, encoded with its keys sorted: its `vault_key_epoch`, `device_id` and
 * `registered_at` among them), under a purpose its wayinkind names. A passkey's key is made with
 * that same context as its HKDF `info`. The vault props' `unlock_epoch` and the list of ways in are
 * not in it: a change to one way in bumps the epoch and rewrites the list, and the others, whose
 * passphrases this device does not hold, must still open. A way in whose `vault_key_epoch` is not
 * the vault props' is damaged, so one spliced in from older vault props never hands over its older
 * vaultKey as theirs.
 */

/**
 * The vaultKey's two lives after an unwrap. `transientKey` is extractable, because only an
 * extractable key can be wrapped (for the device record, or into a new way in); the
 * operation that needed it drops it on return. `sessionKey` is the handle the vault keeps
 * between operations: non-extractable, so the platform itself refuses to export its bytes.
 */
export type VaultKeyPair = { transientKey: CryptoKey, sessionKey: CryptoKey }

/** The slice of a {@link Vault} a way in reads: the scope its wrap is bound to, and the key deriver. */
export type WayinVault = Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'keyDeriver'>

/**
 * The vault props a way in is one of, as far as it reads them: the two fields its wrap is bound to,
 * which never change once the vault is made, and the epoch of the vaultKey they stand for, which
 * the way in's own must match. A whole {@link VaultProps} is one.
 */
export type WayinHolder = Pick<VaultProps, 'vault_id' | 'registered_at' | 'vault_key_epoch'>

/** `RecordT` with every field but its wrap, member by member of a union. */
type HeaderOf<RecordT> = RecordT extends unknown ? Omit<RecordT, 'vault_key_wayin_wrapped'> : never
/** A way in's visible header, every field but its wrap: what the wrap is bound to. */
export type WayinHeader = HeaderOf<WayinRecord>

/**
 * What a way in is stamped with besides its wayinkind's own fields: its `wayin_id` and
 * `wayinlabel`, the `vault_key_epoch` of the vaultKey it wraps, and the `device_id` and
 * `registered_at` of the device and the time that added it. A way in sealed anew keeps its stamp;
 * a way in is one.
 */
export type WayinStamp = Pick<WayinRecord, 'wayin_id' | 'wayinlabel' | 'vault_key_epoch' | 'device_id' | 'registered_at'>

/** The ctx's first part: the vault props' format, under which every way in's wrap is bound. */
const VaultPropsFormat = 'safebyok-vault-v4'

/** The ctx purpose of each wayinkind's wrap, so no kind of way in opens as another. */
const PurposeForWayinkind = {
  passphrase: 'vault_key_passphrase_wrapped',
  passkey:    'vault_key_passkey_wrapped',
} as const satisfies Readonly<Record<WayinKind, string>>

/** The usages of the handle a vault keeps: it wraps a boxKey and unwraps one, nothing else. */
const SessionUsage = { extractable: false, usage: ['wrapKey', 'unwrapKey'] } as const
// The transient is only ever the wrapped argument of a wrap; WebCrypto refuses an empty usage
// list, so it carries the narrowest one.
const TransientUsage = { extractable: true, usage: ['wrapKey'] } as const

/**
 * The context a way in's wrap is bound to (and, for a passkey, its key made with): the vault it
 * lets into, and its own visible header.
 */
const wayinCtxOf = (vault: WayinVault, holder: Pick<WayinHolder, 'vault_id' | 'registered_at'>, header: WayinHeader): Uint8Array => (
  cipherCtx(VaultPropsFormat, vault.applabel, vault.user_id, vault.vaultlabel, holder.vault_id, holder.registered_at, PurposeForWayinkind[header.wayinkind], header)
)

/** The stamp's own fields, and nothing else of whatever carries them: a way in sealed anew passes itself. */
const stampOf = ({ wayin_id, wayinlabel, vault_key_epoch, device_id, registered_at }: WayinStamp): WayinStamp => (
  { wayin_id, wayinlabel, vault_key_epoch, device_id, registered_at }
)

/** `record` without its wrap. */
const headerOf = (record: WayinRecord): WayinHeader => {
  const { vault_key_wayin_wrapped: _wrapped, ...header } = record
  return header
}

/** `record`, a frozen copy, its wrap frozen with it: what a way in hands back as its `props`. */
export const frozenRecord = (record: WayinRecord): WayinRecord => (
  Object.freeze({ ...record, vault_key_wayin_wrapped: Object.freeze({ ...record.vault_key_wayin_wrapped }) })
)

/** A way in's salt as bytes, or null when its base64url text is not base64url. */
const saltBytesOf = (saltB64: string): Uint8Array | null => {
  try {
    return fromB64(saltB64)
  } catch {
    return null
  }
}

/**
 * One way into a vault: a passphrase's ({@link PassphraseWayin}) or a passkey's
 * ({@link PasskeyWayin}), told apart by `wayinkind`. Its stored fields are its own, read-only;
 * `props` is the stored record, frozen, and `toJSON()` the same, so a log line shows the record
 * alone. It holds `vault` and `holder` (the vault props it is one of) too, neither enumerable.
 * `summary` is what a locked vault may show of it. The vault makes each from the vault props it
 * reads, and lists them as its `wayins`.
 *
 * @example vault.wayins.map((wayin) => wayin.wayinlabel)   // ['passphrase', 'laptop_fingerprint']
 * @example JSON.stringify(wayin) === JSON.stringify(wayin.props)   // true
 */
export abstract class Wayin {
  /** The vault this way in belongs to, for its scope and key deriver. Not enumerable, not in `props`. */
  declare readonly vault: WayinVault
  /** The vault props this way in is one of: the vault its wrap is bound to. Not enumerable. */
  declare readonly holder: WayinHolder
  /** The stored record, frozen: what crosses a storage boundary. Not enumerable. */
  declare readonly props: WayinRecord

  /** `passphrase` or `passkey`: which kind of proof opens it. */
  readonly wayinkind: WayinKind
  /** Random id minted when the way in is added, and kept when it is sealed anew. */
  readonly wayin_id: string
  /** What the user calls this way in: `home_phrase`, `laptop_fingerprint`. */
  readonly wayinlabel: string
  /** This vault's id for the device that added the way in. */
  readonly device_id: string
  /** When the way in was added, in epoch milliseconds. */
  readonly registered_at: number
  /** The epoch of the vaultKey it wraps: in sound vault props, the props' own. */
  readonly vault_key_epoch: number
  /** The vaultKey, wrapped under this way in's wayinKey, bound to its `wayinCtx`. */
  readonly vault_key_wayin_wrapped: Ciphered

  protected constructor(vault: WayinVault, record: WayinRecord, holder: WayinHolder) {
    decorate<Wayin>(this, { vault, holder, props: frozenRecord(record) })
    this.wayinkind = record.wayinkind
    this.wayin_id = record.wayin_id
    this.wayinlabel = record.wayinlabel
    this.device_id = record.device_id
    this.registered_at = record.registered_at
    this.vault_key_epoch = record.vault_key_epoch
    this.vault_key_wayin_wrapped = this.props.vault_key_wayin_wrapped
  }

  /**
   * The way in a stored record stands for, checked through its schema: a {@link PassphraseWayin}
   * or a {@link PasskeyWayin}, by its `wayinkind`. Refuses a record that is not one this package
   * writes with kind 'damaged_wayin', the schema's complaint its cause (a way in's record holds no
   * secret).
   *
   * @param vault - The vault it belongs to.
   * @param record - The way in as the vault props store it.
   * @param holder - The vault props it is one of.
   *
   * @example Wayin.make(vault, vaultProps.wayins[0], vaultProps)   // a PassphraseWayin
   * @example Wayin.make(vault, { ...record, wayin_id: '' }, vaultProps)   // throws 'damaged_wayin'
   */
  static make(vault: WayinVault, record: unknown, holder: WayinHolder): PassphraseWayin | PasskeyWayin {
    const checked = WayinRecord.safeParse(record)
    if (! checked.success) {
      throw new VaultError('damaged_wayin', "A way into this vault is stored in a form this package never writes, so it can't be tried. The other ways in still can.", { cause: checked.error })
    }
    return checked.data.wayinkind === 'passphrase' ? new PassphraseWayin(vault, checked.data, holder) : new PasskeyWayin(vault, checked.data, holder)
  }

  /**
   * Every way in of `vaultProps`, made as {@link Wayin.make} makes each, in the order the vault
   * tries them.
   *
   * @example Wayin.listOf(vault, vaultProps).map((wayin) => wayin.wayinkind)   // ['passphrase', 'passkey']
   */
  static listOf(vault: WayinVault, vaultProps: VaultProps): (PassphraseWayin | PasskeyWayin)[] {
    return vaultProps.wayins.map((record) => this.make(vault, record, vaultProps))
  }

  /** What a locked vault may show of this way in: every field but its wrap and, for a passphrase, its salt. */
  abstract get summary(): WayinSummary

  /** The context this way in's wrap is bound to: its vault's scope, `vault_id` and `registered_at`, its purpose, and its whole header. */
  get wayinCtx(): Uint8Array {
    return wayinCtxOf(this.vault, this.holder, headerOf(this.props))
  }

  /**
   * True when this way in is stored in a form this package never writes, so it cannot be tried:
   * at another vaultKey epoch than its vault props, or with a salt its kind never makes.
   */
  abstract isDamaged(): boolean

  /**
   * The vaultKey, out of this way in under `proof`: the proof makes this way in's wayinKey (one
   * key derivation for a passphrase, one HKDF for a passkey), and the wrap is opened under it,
   * bound to `wayinCtx`. A vaultKey comes back only from this way in's own wrap under a proof that
   * matched: there is no comparison and no shortcut, and the proof is not kept.
   *
   * Refuses with kind 'wrong_passphrase' or 'wrong_passkey' when the proof does not open it,
   * 'damaged_wayin' when it {@link isDamaged}, and as each kind says for itself. A key deriver that
   * throws is 'unexpected_error', what it threw the cause; nothing is logged.
   *
   * @param proof - The proof to try: a {@link PassphraseProof} for a passphrase's way in, a {@link PasskeyProof} for a passkey's.
   * @returns Both lives of the vaultKey.
   *
   * @example const { ok, val } = await wayin.tryOpen(Proof.parse(vault, typed))
   */
  abstract tryOpen(proof: Proof): Promise<Outcome<VaultKeyPair>>

  /** The record, as `JSON.stringify` and a log line show this way in. */
  toJSON(): WayinRecord {
    return this.props
  }

  /** Both lives of the vaultKey out of this way in's wrap under `wayinKey`, or null when it will not open. */
  protected async unwrapUnder(wayinKey: CryptoKey): Promise<VaultKeyPair | null> {
    const { wayinCtx } = this
    try {
      const transientKey = await unwrapKeyUnder(wayinKey, this.vault_key_wayin_wrapped, wayinCtx, TransientUsage)
      const sessionKey = await unwrapKeyUnder(wayinKey, this.vault_key_wayin_wrapped, wayinCtx, SessionUsage)
      return { transientKey, sessionKey }
    } catch {
      return null
    }
  }

  /**
   * The vaultKey out of whichever of `wayins` `proof` opens -- or, given `wayinId`, out of that one
   * only: a passphrase tried against each passphrase's way in in turn, one derivation apiece, the
   * first that opens ending the search; a passkey's answer against its credential's way in. A way
   * in that is damaged, or made by another key deriver, is passed over before the first
   * derivation, so the outcome never hangs on order, and one damaged way in shuts out no other.
   *
   * Refuses with kind 'absent_wayin' when `wayinId` names no way in of the proof's kind, or no
   * passkey's way in is the answering credential's; 'unknown_key_deriver' when every passphrase it
   * would try was made by another key deriver; 'damaged_wayin' when every one it would try is
   * damaged; and as {@link Wayin.tryOpen} refuses when none it tried opens, its message then
   * saying what was passed over.
   *
   * @returns Both lives of the vaultKey, and the `wayin_id` of the way in that opened.
   *
   * @example await Wayin.tryOpenAmong(Wayin.listOf(vault, vaultProps), proof)
   * @example await Wayin.tryOpenAmong(wayins, proof, chosen.wayin_id)   // that way in alone
   */
  static async tryOpenAmong(wayins: readonly Wayin[], proof: Proof, wayinId?: string): Promise<Outcome<VaultKeyPair & { wayinId: string }>> {
    return await outcomeOf(async () => {
      if (proof instanceof PassphraseProof) { return await openWithPassphrase(wayins, proof, wayinId) }
      if (proof instanceof PasskeyProof) { return await openWithPasskey(wayins, proof, wayinId) }
      throw new VaultError('bad_option', "A proof is a passphrase or a passkey's answer, as Proof.parse makes one.")
    }, unexpectedError)
  }

  /**
   * A passphrase's way in around `vaultKey`, under a fresh passphraseSalt and the passphraseKey
   * `proof` makes over it. Throws what the key deriver refuses or throws.
   *
   * @param vault - The vault it is for: its scope is bound into the wrap, its key deriver makes the key and is named on the way in.
   * @param proof - The passphrase the way in admits.
   * @param holder - The vault props it will be one of: their `vault_id` and `registered_at` are bound into the wrap.
   * @param stamp - Its {@link WayinStamp}: id, label, vaultKey epoch, device and time.
   * @param vaultKey - The vaultKey to wrap: extractable, as only such a key can be.
   *
   * @example await Wayin.sealPassphrase(vault, PassphraseProof.parse(vault, chosen), vaultProps, stamp, proven.transientKey)
   */
  static async sealPassphrase(vault: WayinVault, proof: PassphraseProof, holder: WayinHolder, stamp: WayinStamp, vaultKey: CryptoKey): Promise<PassphraseWayin> {
    const { wayin } = await sealUnderPassphrase(vault, proof, holder, stamp, vaultKey)
    return wayin
  }

  /**
   * A vault's first passphrase way in, as {@link Wayin.sealPassphrase} makes one, and the session's
   * handle on the vaultKey through it: the creating unlock keeps that, where every later way in
   * is for the vault's other devices.
   *
   * @returns The way in, and a non-extractable handle on the vaultKey unwrapped from it.
   *
   * @example const { wayin, sessionKey } = await Wayin.sealFirstPassphrase(vault, proof, draft, stamp, freshKey)
   */
  static async sealFirstPassphrase(vault: WayinVault, proof: PassphraseProof, holder: WayinHolder, stamp: WayinStamp, vaultKey: CryptoKey): Promise<{ wayin: PassphraseWayin, sessionKey: CryptoKey }> {
    const { wayin, wayinKey } = await sealUnderPassphrase(vault, proof, holder, stamp, vaultKey)
    const sessionKey = await unwrapKeyUnder(wayinKey, wayin.vault_key_wayin_wrapped, wayin.wayinCtx, SessionUsage)
    return { wayin, sessionKey }
  }

  /**
   * A passkey's way in around `vaultKey`, for the passkey whose answer `proof` holds. The way in
   * keeps the credential's id and the salt it answered over, so the vault can ask it again; never
   * the answer. Refuses with kind 'bad_option' an answer over anything but a fresh salt of
   * {@link PasskeySaltBytes} bytes, as `safebyok-react`'s `createPasskey` mints.
   *
   * @param vault - The vault it is for: its scope is bound into the wrap and its key.
   * @param proof - What the new passkey answered.
   * @param holder - The vault props it will be one of: their `vault_id` and `registered_at` are bound into the wrap and its key.
   * @param stamp - Its {@link WayinStamp}: id, label, vaultKey epoch, device and time.
   * @param vaultKey - The vaultKey to wrap: extractable, as only such a key can be.
   *
   * @example await Wayin.sealPasskey(vault, PasskeyProof.parse(vault, await createPasskey(opts)), vaultProps, stamp, proven.transientKey)
   */
  static async sealPasskey(vault: WayinVault, proof: PasskeyProof, holder: WayinHolder, stamp: WayinStamp, vaultKey: CryptoKey): Promise<PasskeyWayin> {
    if (saltBytesOf(proof.prfSaltB64)?.length !== PasskeySaltBytes) {
      throw new VaultError('bad_option', `A new passkey answers over a fresh salt of ${String(PasskeySaltBytes)} random bytes, as base64url text: safebyok-react's createPasskey mints one.`)
    }
    const header = {
      wayinkind:     'passkey',
      ...stampOf(stamp),
      credential_id: proof.credentialId,
      prf_salt_b64:  proof.prfSaltB64,
    } as const
    const wayinCtx = wayinCtxOf(vault, holder, header)
    const wayinKey = await proof.wayinKeyFor({ wayinCtx })
    const wrapped = await wrapKeyUnder(wayinKey, vaultKey, wayinCtx)
    return new PasskeyWayin(vault, { ...header, vault_key_wayin_wrapped: wrapped }, holder)
  }
}

/**
 * A passphrase's way into the vault: the vaultKey wrapped under the passphraseKey its passphrase
 * and its own passphraseSalt make, through the key deriver it names.
 *
 * @example if (wayin.wayinkind === 'passphrase') { wayin.key_deriver_label }   // 'argon2id_web_v1'
 */
export class PassphraseWayin extends Wayin {
  declare readonly wayinkind: 'passphrase'
  declare readonly props: PassphraseWayinRecord
  /** Which key deriver made the passphraseKey: `argon2id_web_v1`, or a host's own label. */
  readonly key_deriver_label: string
  /** This way in's passphraseSalt: fresh for every way in, and for every change of its passphrase. */
  readonly salt_b64: string

  /** The way in `record` stands for: made by {@link Wayin.make}, which checks the record first. */
  constructor(vault: WayinVault, record: PassphraseWayinRecord, holder: WayinHolder) {
    super(vault, record, holder)
    this.key_deriver_label = record.key_deriver_label
    this.salt_b64 = record.salt_b64
    Object.freeze(this)
  }

  /** Its kind, id, label, and the device and time that added it: never its salt, never its wrap. */
  get summary(): WayinSummary {
    const { wayinkind, wayin_id, wayinlabel, device_id, registered_at } = this
    return { wayinkind, wayin_id, wayinlabel, device_id, registered_at }
  }

  /**
   * True at another vaultKey epoch than its vault props, or, made by the vault's own key deriver,
   * with a salt that is not base64url of the deriver's `salt_bytes`: no deriver made such a salt.
   * A salt for another key deriver is not this vault's to judge.
   */
  isDamaged(): boolean {
    if (this.vault_key_epoch !== this.holder.vault_key_epoch) { return true }
    const { keyDeriver } = this.vault
    return this.key_deriver_label === keyDeriver.key_deriver_label && saltBytesOf(this.salt_b64)?.length !== keyDeriver.salt_bytes
  }

  /**
   * {@link Wayin.tryOpen} for a passphrase: one key derivation. Refuses with kind
   * 'unknown_key_deriver' when another key deriver made it, before any derivation; 'damaged_wayin'
   * when it is damaged, likewise; 'wrong_passphrase' when the passphrase does not open it (a way in
   * altered in storage fails alike, so the message names both); and 'bad_option' for a passkey's
   * answer, or for a key deriver handing back other than 32 fresh bytes.
   *
   * @example const { ok } = await wayin.tryOpen(PassphraseProof.parse(vault, typed))
   */
  async tryOpen(proof: Proof): Promise<Outcome<VaultKeyPair>> {
    return await outcomeOf(async () => {
      if (! (proof instanceof PassphraseProof)) {
        throw new VaultError('bad_option', "A passkey's answer opens no passphrase's way in: hand it the passphrase the user typed.")
      }
      if (this.key_deriver_label !== this.vault.keyDeriver.key_deriver_label) { throw unknownKeyDeriver() }
      if (this.isDamaged()) { throw damagedPassphrase() }
      const opened = await this.unwrapUnder(await proof.wayinKeyFor(this))
      if (opened === null) { throw wrongPassphrase('') }
      return opened
    }, unexpectedError)
  }
}

/**
 * A passkey's way into the vault: the vaultKey wrapped under a passkeyKey made from what the
 * passkey's authenticator answers, through the WebAuthn PRF extension, when asked to evaluate its
 * PRF over this way in's own salt. The authenticator holds the secret; the way in holds only which
 * credential to ask and what to ask it.
 *
 * @example if (wayin.wayinkind === 'passkey') { await askPasskey([wayin]) }
 */
export class PasskeyWayin extends Wayin {
  declare readonly wayinkind: 'passkey'
  declare readonly props: PasskeyWayinRecord
  /** The WebAuthn credential's id, base64url, as `PublicKeyCredential.id` gives it: which passkey to ask. */
  readonly credential_id: string
  /** The salt the passkey's PRF is evaluated over: {@link PasskeySaltBytes} random bytes, fresh for every way in. */
  readonly prf_salt_b64: string

  /** The way in `record` stands for: made by {@link Wayin.make}, which checks the record first. */
  constructor(vault: WayinVault, record: PasskeyWayinRecord, holder: WayinHolder) {
    super(vault, record, holder)
    this.credential_id = record.credential_id
    this.prf_salt_b64 = record.prf_salt_b64
    Object.freeze(this)
  }

  /** Its kind, id, label, the device and time that added it, and the credential and salt a host asks its authenticator with: never its wrap. */
  get summary(): WayinSummary {
    const { wayinkind, wayin_id, wayinlabel, device_id, registered_at, credential_id, prf_salt_b64 } = this
    return { wayinkind, wayin_id, wayinlabel, device_id, registered_at, credential_id, prf_salt_b64 }
  }

  /** True at another vaultKey epoch than its vault props, or with a salt that is not base64url of {@link PasskeySaltBytes} bytes. */
  isDamaged(): boolean {
    return this.vault_key_epoch !== this.holder.vault_key_epoch || saltBytesOf(this.prf_salt_b64)?.length !== PasskeySaltBytes
  }

  /**
   * {@link Wayin.tryOpen} for a passkey's answer: one HKDF, no derivation to wait for. Refuses
   * with kind 'damaged_wayin' when it is damaged; 'wrong_passkey' when the answer is another
   * credential's, or over another salt than this way in keeps, or does not open it (an answer for
   * its own credential and salt that does not open it is most likely a way in altered in storage,
   * but a passkey asked without user verification answers differently too, and the vault cannot
   * tell how it was asked, so the message names both); and 'bad_option' for a passphrase.
   *
   * @example const { ok } = await wayin.tryOpen(PasskeyProof.parse(vault, answer))
   */
  async tryOpen(proof: Proof): Promise<Outcome<VaultKeyPair>> {
    return await outcomeOf(async () => {
      if (! (proof instanceof PasskeyProof)) {
        throw new VaultError('bad_option', "A passphrase opens no passkey's way in: hand it the passkey's answer, as askPasskey gives it.")
      }
      if (this.isDamaged()) { throw damagedPasskey() }
      if (proof.credentialId !== this.credential_id) {
        throw new VaultError('wrong_passkey', "That passkey is not this way in's: ask the credential the snapshot's wayins list for it.")
      }
      if (proof.prfSaltB64 !== this.prf_salt_b64) {
        throw new VaultError('wrong_passkey', "The passkey answered for a different salt than this vault keeps for it: ask it again with the prf_salt_b64 the snapshot's wayins list.")
      }
      const opened = await this.unwrapUnder(await proof.wayinKeyFor(this))
      if (opened === null) {
        throw new VaultError('wrong_passkey', "That passkey answered, but its answer didn't unlock the vault: its stored way in may be damaged. Unlock with a passphrase; if that works, remove this passkey and add it again.")
      }
      return opened
    }, unexpectedError)
  }
}

// == [Opening among several]: openWithPassphrase, openWithPasskey, sealUnderPassphrase, refusals

/** The vaultKey out of whichever of `wayins`' passphrases `proof` opens: see {@link Wayin.tryOpenAmong}. */
const openWithPassphrase = async (wayins: readonly Wayin[], proof: PassphraseProof, wayinId: string | undefined): Promise<VaultKeyPair & { wayinId: string }> => {
  const passphrases = wayins.filter((wayin): wayin is PassphraseWayin => wayin instanceof PassphraseWayin)
  const aimed = wayinId === undefined ? passphrases : passphrases.filter((wayin) => wayin.wayin_id === wayinId)
  if (aimed.length === 0) { throw absentWayin() }
  const derivable = aimed.filter((wayin) => wayin.key_deriver_label === proof.vault.keyDeriver.key_deriver_label)
  if (derivable.length === 0) { throw unknownKeyDeriver() }
  // Sorted out before the first derivation, so the outcome never hangs on order.
  const sound = derivable.filter((wayin) => ! wayin.isDamaged())
  if (sound.length === 0) {
    if (wayinId !== undefined) { throw damagedPassphrase() }
    const told = derivable.length < aimed.length
      ? "Every passphrase of this vault that this package can try is stored damaged, and the others were made with a key deriver this package does not carry. Update safebyok, or open the vault where it was made. The vault was left as it is."
      : "Every passphrase of this vault is stored damaged, so none could be tried. Unlock with a passkey, if the vault has one, then add a new passphrase. The vault was left as it is."
    throw new VaultError('damaged_wayin', told)
  }
  for (const wayin of sound) {
    const opened = await wayin.tryOpen(proof)
    if (opened.ok) { return { ...opened.val, wayinId: wayin.wayin_id } }
    if (opened.err.refusalkind !== 'wrong_passphrase') { throw opened.err }
  }
  const skipped = aimed.length - derivable.length
  const elsewhere = skipped === 0 ? '' : ` ${skippedByOtherDeriver(skipped)}`
  if (sound.length < derivable.length) {
    throw new VaultError('wrong_passphrase', `That passphrase didn't unlock the vault, and one of its passphrases is stored damaged, so could not be tried. Check for typos and try again; if it was that one, unlock another way.${elsewhere}`)
  }
  throw wrongPassphrase(elsewhere)
}

/**
 * The vaultKey out of the passkey's way in of the credential that answered `proof` -- given
 * `wayinId`, only if that is the way in it names. Nothing to try in turn: a credential has at most
 * one way into a vault.
 */
const openWithPasskey = async (wayins: readonly Wayin[], proof: PasskeyProof, wayinId: string | undefined): Promise<VaultKeyPair & { wayinId: string }> => {
  const wayin = wayins.find((candidate) => (
    candidate instanceof PasskeyWayin && candidate.credential_id === proof.credentialId
    && (wayinId === undefined || candidate.wayin_id === wayinId)
  ))
  if (wayin === undefined) {
    throw new VaultError('absent_wayin', "None of this vault's passkeys is the one that answered: it may have been removed on another device, or be a passkey for another vault. Look again at the snapshot's wayins.")
  }
  const opened = await wayin.tryOpen(proof)
  if (! opened.ok) { throw opened.err }
  return { ...opened.val, wayinId: wayin.wayin_id }
}

/** The way in around `vaultKey` under `proof`'s key, and that key. */
const sealUnderPassphrase = async (vault: WayinVault, proof: PassphraseProof, holder: WayinHolder, stamp: WayinStamp, vaultKey: CryptoKey) => {
  const { keyDeriver } = vault
  const header = {
    wayinkind:         'passphrase',
    ...stampOf(stamp),
    key_deriver_label: keyDeriver.key_deriver_label,
    salt_b64:          toB64(randomBytes(keyDeriver.salt_bytes)),
  } as const
  const wayinKey = await proof.wayinKeyFor(header)
  const wrapped = await wrapKeyUnder(wayinKey, vaultKey, wayinCtxOf(vault, holder, header))
  const wayin = new PassphraseWayin(vault, { ...header, vault_key_wayin_wrapped: wrapped }, holder)
  return { wayin, wayinKey }
}

/** What a wrong passphrase adds when `count` of the vault's passphrases were passed over for another key deriver's. */
const skippedByOtherDeriver = (count: number): string => {
  const [subject, verb, which] = count === 1
    ? ["One of this vault's passphrases was", 'it was', 'that one']
    : [`${String(count)} of this vault's passphrases were`, 'they were', 'one of those']
  return `${subject} made with a key deriver this package does not carry, so ${verb} not tried: if the passphrase you typed is ${which}, open the vault where it was made.`
}

/** The refusal of a passphrase that opened nothing, `elsewhere` saying what else was passed over. */
const wrongPassphrase = (elsewhere: string) => new VaultError('wrong_passphrase', `That passphrase didn't unlock the vault. Check for typos and try again. If you're sure it's right, the stored vault may be damaged.${elsewhere}`)

const unknownKeyDeriver = () => new VaultError('unknown_key_deriver', 'This vault was made with a key deriver this package does not carry: update safebyok, or open the vault where it was made.')

const damagedPassphrase = () => new VaultError('damaged_wayin', "That passphrase's way into the vault is stored damaged, so it could not be tried. Unlock another way, then remove it and add the passphrase again. The vault was left as it is.")

const damagedPasskey = () => new VaultError('damaged_wayin', "This passkey's way into the vault is stored damaged, so it could not be tried. Unlock with a passphrase, then remove this passkey and add it again. The vault was left as it is.")

/**
 * The refusal for a `wayin_id` that names no way in of the vault props: it may have been removed on
 * another device. Never quotes the id.
 */
export const absentWayin = () => new VaultError('absent_wayin', "This vault has no way in with that wayin_id: it may have been removed on another device. Look again at the snapshot's wayins.")
// --
