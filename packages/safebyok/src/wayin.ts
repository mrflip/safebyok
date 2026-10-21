import { cipherCtx, fromB64OrNull, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder, type Ciphered } from './crypto'
import { VaultError } from './errors'
import { type Outcome, outcomeOf, unexpectedError } from './outcome'
import { PasskeyProof, PassphraseProof, Proof } from './proof'
import { PasskeySaltBytes, WayinRecord, type PasskeyWayinRecord, type PasskeyWayinSummary, type PassphraseWayinRecord, type PassphraseWayinSummary, type VaultProps, type WayinKind, type WayinSummary } from './types'
import { decorate } from './adorn'
import type { KeyDeriver } from './key-deriver'

/**
 * Ways in: each the vaultKey wrapped under a wayinKey one kind of way in makes, so a vault has
 * two ways in -- its passphrase, and its passkey when it has one -- and one vaultKey behind both.
 * A {@link Wayin} is made from its stored record by `Wayin.make`, a {@link PassphraseWayin} or a
 * {@link PasskeyWayin}; `wayin.tryOpen(proof)` opens one, the proof making the key;
 * `Wayin.seal(vaultProps, now, proof, deviceId, vaultKey)` makes one.
 *
 * Each way in's wrap is bound to its vault -- the scope, and the fields of the vault props that
 * never change, `vault_id` and `registered_at` -- and to its own visible header (every field but
 * the wrap itself, encoded with its keys sorted: its `device_id` and `registered_at` among them),
 * under a purpose its wayinkind names. A passkey's key is made with that same context as its HKDF
 * `info`. The vault props' `unlock_epoch` and the other way in are not in it: a change to one way
 * in bumps the epoch, and the other must still open.
 */

/**
 * The vaultKey's two lives after an unwrap. `transientKey` is extractable, because only an
 * extractable key can be wrapped (for the device record, or into a new way in); the
 * operation that needed it drops it on return. `sessionKey` is the handle the vault keeps
 * between operations: non-extractable, so the platform itself refuses to export its bytes.
 */
export type VaultKeyPair = { transientKey: CryptoKey, sessionKey: CryptoKey }

/**
 * The vault props a way in is one of, as far as it reads them: what its wrap is bound to -- the
 * scope (app, user and vault label) and the two fields that never change once the vault is made,
 * `vault_id` and `registered_at`. With the way in's own header, that is the whole of its ctx. A whole
 * {@link VaultProps} is one; the vault builds one from its own scope and the vault props it holds.
 */
export type WayinVaultProps = Pick<VaultProps, 'applabel' | 'user_id' | 'vaultlabel' | 'vault_id' | 'registered_at'>

/** `RecordT` with every field but its wrap, member by member of a union. */
type HeaderOf<RecordT> = RecordT extends unknown ? Omit<RecordT, 'vault_key_wayin_wrapped'> : never
/** A way in's visible header, every field but its wrap: what the wrap is bound to. */
export type WayinHeader = HeaderOf<WayinRecord>

/**
 * What a way in is stamped with besides its wayinkind's own fields: the `device_id` and
 * `registered_at` of the device and the time that sealed it. A way in is one; `Wayin.seal` stamps
 * a new one.
 */
export type WayinStamp = Pick<WayinRecord, 'device_id' | 'registered_at'>

/** The ctx's first part: the vault props' format, under which every way in's wrap is bound. */
const VaultPropsFormat = 'safebyok-vault-v6'

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
const wayinCtxOf = (vaultProps: WayinVaultProps, header: WayinHeader): Uint8Array => (
  cipherCtx(VaultPropsFormat, vaultProps.applabel, vaultProps.user_id, vaultProps.vaultlabel, vaultProps.vault_id, vaultProps.registered_at, PurposeForWayinkind[header.wayinkind], header)
)

/** `record` without its wrap. */
const headerOf = (record: WayinRecord): WayinHeader => {
  const { vault_key_wayin_wrapped: _wrapped, ...header } = record
  return header
}

/** `record`, a frozen copy, its wrap frozen with it: what a way in hands back as its `props`. */
export const frozenRecord = <RecordT extends WayinRecord>(record: RecordT): RecordT => {
  const frozen: RecordT = { ...record, vault_key_wayin_wrapped: Object.freeze({ ...record.vault_key_wayin_wrapped }) }
  return Object.freeze(frozen)
}

/**
 * One way into a vault: a passphrase's ({@link PassphraseWayin}) or a passkey's
 * ({@link PasskeyWayin}), told apart by `wayinkind`. Its stored fields are its own, read-only;
 * `props` is the stored record, frozen. It holds `vaultProps` (the vault props it is one of) too,
 * and a passphrase's way in its `keyDeriver`, neither enumerable. `summary` is what a locked vault may show of it, and all that
 * `toJSON()` gives, so a log line never carries its wrap, nor a passphrase's salt (a passkey's
 * prfSalt, which it is asked with, is in its summary). The vault makes each from
 * the vault props it reads, and shows their summaries, never the ways in themselves, as its
 * `passphrase` and `passkey`.
 *
 * @example Wayin.make(vaultProps, vaultProps.passphrase, keyDeriver).wayinkind   // 'passphrase'
 * @example JSON.stringify(wayin) === JSON.stringify(wayin.summary)   // true: no wrap, and no passphrase's salt
 */
export abstract class Wayin {
  /** The vault props this way in is one of: the vault its wrap is bound to. Not enumerable, not in `props`. */
  declare readonly vaultProps: WayinVaultProps
  /** The stored record, frozen: what crosses a storage boundary. Not enumerable. */
  declare readonly props: WayinRecord

  /** `passphrase` or `passkey`: which kind of proof opens it. */
  readonly wayinkind: WayinKind
  /** This vault's id for the device that sealed the way in. */
  readonly device_id: string
  /** When the way in was sealed, in epoch milliseconds. */
  readonly registered_at: number
  /** The vaultKey, wrapped under this way in's wayinKey, bound to its `wayinCtx`. */
  readonly vault_key_wayin_wrapped: Ciphered

  protected constructor(vaultProps: WayinVaultProps, record: WayinRecord) {
    decorate<Wayin>(this, { vaultProps, props: frozenRecord(record) })
    this.wayinkind = record.wayinkind
    this.device_id = record.device_id
    this.registered_at = record.registered_at
    this.vault_key_wayin_wrapped = this.props.vault_key_wayin_wrapped
  }

  /**
   * The way in a stored record stands for, checked through its schema: a {@link PassphraseWayin}
   * or a {@link PasskeyWayin}, by its `wayinkind`. Refuses a record that is not one this package
   * writes with kind 'damaged_wayin', the schema's complaint its cause (a way in's record holds no
   * secret).
   *
   * @param vaultProps - The vault props it is one of.
   * @param record - The way in as the vault props store it.
   * @param keyDeriver - The vault's key deriver, which a passphrase's way in derives through; a passkey's reads none.
   *
   * @example Wayin.make(vaultProps, vaultProps.passphrase, keyDeriver)   // a PassphraseWayin
   * @example Wayin.make(vaultProps, { ...record, device_id: '' }, keyDeriver)   // throws 'damaged_wayin'
   */
  static make(vaultProps: WayinVaultProps, record: PassphraseWayinRecord, keyDeriver: KeyDeriver): PassphraseWayin
  static make(vaultProps: WayinVaultProps, record: PasskeyWayinRecord, keyDeriver: KeyDeriver): PasskeyWayin
  static make(vaultProps: WayinVaultProps, record: unknown, keyDeriver: KeyDeriver): PassphraseWayin | PasskeyWayin
  static make(vaultProps: WayinVaultProps, record: unknown, keyDeriver: KeyDeriver): PassphraseWayin | PasskeyWayin {
    const checked = WayinRecord.safeParse(record)
    if (! checked.success) {
      throw new VaultError('damaged_wayin', "A way into this vault is stored in a form this package never writes, so it can't be tried. The other way in, if the vault has one, still can.", { cause: checked.error })
    }
    return checked.data.wayinkind === 'passphrase' ? new PassphraseWayin(vaultProps, checked.data, keyDeriver) : new PasskeyWayin(vaultProps, checked.data)
  }

  /** What a locked vault may show of this way in: every field but its wrap and, for a passphrase, its salt. */
  abstract get summary(): WayinSummary

  /** The context this way in's wrap is bound to: its vault's scope, `vault_id` and `registered_at`, its purpose, and its whole header. */
  get wayinCtx(): Uint8Array {
    return wayinCtxOf(this.vaultProps, headerOf(this.props))
  }

  /**
   * True when this way in is stored in a form this package never writes, so it cannot be tried:
   * with a salt its kind never makes.
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

  /** Its {@link summary}: all JSON and a log line show of this way in, never its wrap nor a passphrase's salt. */
  toJSON(): WayinSummary {
    return this.summary
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
   * A new way in around `vaultKey` for `proof`, stamped with `deviceId` and `now`. For a passphrase, a fresh passphraseSalt for the key deriver the proof
   * derives through, which the way in names, and the passphraseKey the proof makes over it: one
   * key derivation, whose refusals are `proof.wayinKeyFor`'s. For a passkey, the credential's id and the salt it answered over, kept
   * so the vault can ask it again (never the answer), and the passkeyKey its answer makes: one HKDF.
   * The proof is taken as already checked: a new passphrase by `proof.checkStrongEnough()`, a new
   * passkey's salt by `checkSaltShape`. Writes nothing, and hands back no key.
   *
   * @param vaultProps - The vault props it will be one of: their scope, `vault_id` and `registered_at` are bound into the wrap.
   * @param now - The time of this sealing, in epoch milliseconds: its `registered_at`.
   * @param proof - The passphrase the way in admits, or what the new passkey answered.
   * @param deviceId - This device's id for the vault, stamped on the way in.
   * @param vaultKey - The vaultKey to wrap: extractable, as only such a key can be.
   *
   * @example const wayin = await Wayin.seal(vaultProps, Date.now(), PassphraseProof.parse(vault, chosen), deviceId, proven.transientKey)
   * @example const wayin = await Wayin.seal(vaultProps, Date.now(), PasskeyProof.parse(vault, await createPasskey(opts)), deviceId, proven.transientKey)
   */
  static async seal(vaultProps: WayinVaultProps, now: number, proof: PassphraseProof, deviceId: string, vaultKey: CryptoKey): Promise<PassphraseWayin>
  static async seal(vaultProps: WayinVaultProps, now: number, proof: PasskeyProof, deviceId: string, vaultKey: CryptoKey): Promise<PasskeyWayin>
  static async seal(vaultProps: WayinVaultProps, now: number, proof: PassphraseProof | PasskeyProof, deviceId: string, vaultKey: CryptoKey): Promise<PassphraseWayin | PasskeyWayin>
  static async seal(vaultProps: WayinVaultProps, now: number, proof: PassphraseProof | PasskeyProof, deviceId: string, vaultKey: CryptoKey): Promise<PassphraseWayin | PasskeyWayin> {
    const stamp: WayinStamp = { device_id: deviceId, registered_at: now }
    if (proof instanceof PassphraseProof) {
      const { header, wayinCtx, wayinKey } = await passphraseKeying(vaultProps, proof, stamp)
      return new PassphraseWayin(vaultProps, { ...header, vault_key_wayin_wrapped: await wrapKeyUnder(wayinKey, vaultKey, wayinCtx) }, proof.vault.keyDeriver)
    }
    const { header, wayinCtx, wayinKey } = await passkeyKeying(vaultProps, proof, stamp)
    return new PasskeyWayin(vaultProps, { ...header, vault_key_wayin_wrapped: await wrapKeyUnder(wayinKey, vaultKey, wayinCtx) })
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
  /** The vault's key deriver, which this way in's passphraseKey is derived through. Not enumerable, not in `props`. */
  declare readonly keyDeriver: KeyDeriver
  /** Which key deriver made the passphraseKey: `argon2id_web_v1`, or a host's own label. */
  readonly key_deriver_label: string
  /** This way in's passphraseSalt: fresh for every passphrase the vault takes. */
  readonly salt_b64: string

  /** The way in `record` stands for, taken as already checked: {@link Wayin.make} checks a record read from storage. */
  constructor(vaultProps: WayinVaultProps, record: PassphraseWayinRecord, keyDeriver: KeyDeriver) {
    super(vaultProps, record)
    decorate<PassphraseWayin>(this, { keyDeriver })
    this.key_deriver_label = record.key_deriver_label
    this.salt_b64 = record.salt_b64
    Object.freeze(this)
  }

  /** Its kind, and the device and time that sealed it: never its salt, never its wrap. */
  get summary(): PassphraseWayinSummary {
    const { wayinkind, device_id, registered_at } = this
    return { wayinkind, device_id, registered_at }
  }

  /**
   * True when, made by the vault's own key deriver, it holds a salt that is not base64url of the
   * deriver's `salt_bytes`: no deriver made such a salt. A salt for another key deriver is not
   * this vault's to judge.
   */
  isDamaged(): boolean {
    const { keyDeriver } = this
    return this.key_deriver_label === keyDeriver.key_deriver_label && fromB64OrNull(this.salt_b64)?.length !== keyDeriver.salt_bytes
  }

  /**
   * {@link Wayin.tryOpen} for a passphrase: one key derivation. Refuses with kind
   * 'unknown_key_deriver' when another key deriver made it, before any derivation; 'damaged_wayin'
   * when it is damaged, likewise; 'wrong_passphrase' when the passphrase does not open it (a way in
   * altered in storage fails alike, so the message names both), and for a blank one before any
   * derivation, as it opens nothing and trying it would cost one; and 'bad_option' for a passkey's
   * answer, or for a key deriver handing back other than 32 fresh bytes.
   *
   * @example const { ok } = await wayin.tryOpen(PassphraseProof.parse(vault, typed))
   */
  async tryOpen(proof: Proof): Promise<Outcome<VaultKeyPair>> {
    return await outcomeOf(async () => {
      if (! (proof instanceof PassphraseProof)) {
        throw new VaultError('bad_option', "A passkey's answer opens no passphrase's way in: hand it the passphrase the user typed.")
      }
      if (this.key_deriver_label !== this.keyDeriver.key_deriver_label) { throw unknownKeyDeriver() }
      if (this.isDamaged()) { throw damagedPassphrase() }
      if (proof.isBlank) { throw new VaultError('wrong_passphrase', "A passphrase can't be empty or only spaces: type the vault's passphrase.") }
      const opened = await this.unwrapUnder(await proof.wayinKeyFor(this))
      if (opened === null) { throw wrongPassphrase() }
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
 * @example if (wayin.wayinkind === 'passkey') { await askPasskey(wayin.summary) }
 */
export class PasskeyWayin extends Wayin {
  declare readonly wayinkind: 'passkey'
  declare readonly props: PasskeyWayinRecord
  /** The WebAuthn credential's id, base64url, as `PublicKeyCredential.id` gives it: which passkey to ask. */
  readonly credential_id: string
  /** The salt the passkey's PRF is evaluated over: {@link PasskeySaltBytes} random bytes, fresh for every way in. */
  readonly prf_salt_b64: string

  /** The way in `record` stands for, taken as already checked: {@link Wayin.make} checks a record read from storage. */
  constructor(vaultProps: WayinVaultProps, record: PasskeyWayinRecord) {
    super(vaultProps, record)
    this.credential_id = record.credential_id
    this.prf_salt_b64 = record.prf_salt_b64
    Object.freeze(this)
  }

  /** Its kind, the device and time that added it, and the credential and salt a host asks its authenticator with: never its wrap. */
  get summary(): PasskeyWayinSummary {
    const { wayinkind, device_id, registered_at, credential_id, prf_salt_b64 } = this
    return { wayinkind, device_id, registered_at, credential_id, prf_salt_b64 }
  }

  /** True with a salt that is not base64url of {@link PasskeySaltBytes} bytes. */
  isDamaged(): boolean {
    return fromB64OrNull(this.prf_salt_b64)?.length !== PasskeySaltBytes
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
        throw new VaultError('wrong_passkey', "That passkey is not this vault's: it may have been replaced or removed on another device, or belong to another vault. Ask the credential the snapshot's passkey names.")
      }
      if (proof.prfSaltB64 !== this.prf_salt_b64) {
        throw new VaultError('wrong_passkey', "The passkey answered for a different salt than this vault keeps for it: ask it again with the prf_salt_b64 the snapshot's passkey names.")
      }
      const opened = await this.unwrapUnder(await proof.wayinKeyFor(this))
      if (opened === null) {
        throw new VaultError('wrong_passkey', "That passkey answered, but its answer didn't unlock the vault: its stored way in may be damaged. Unlock with the passphrase; if that works, add the passkey again, which replaces it.")
      }
      return opened
    }, unexpectedError)
  }
}

// == [Sealing and refusals]: Keying, passphraseKeying, passkeyKeying, wrongPassphrase, unknownKeyDeriver, damagedPassphrase, damagedPasskey

/**
 * What sealing a new way in needs of its kind: its header, the ctx that header and its vault make,
 * built once, and the wayinKey its proof makes. For a passkey the same ctx is the HKDF's `info` and
 * the wrap's, by construction.
 */
type Keying<HeaderT extends WayinHeader> = { header: HeaderT, wayinCtx: Uint8Array, wayinKey: CryptoKey }

/** A new passphrase's way in's {@link Keying}: its header under a fresh salt for the key deriver `proof` derives through, and the key it makes over that salt. */
const passphraseKeying = async (vaultProps: WayinVaultProps, proof: PassphraseProof, stamp: WayinStamp): Promise<Keying<Omit<PassphraseWayinRecord, 'vault_key_wayin_wrapped'>>> => {
  const { keyDeriver } = proof.vault
  const header = {
    wayinkind:         'passphrase',
    ...stamp,
    key_deriver_label: keyDeriver.key_deriver_label,
    salt_b64:          toB64(randomBytes(keyDeriver.salt_bytes)),
  } as const
  return { header, wayinCtx: wayinCtxOf(vaultProps, header), wayinKey: await proof.wayinKeyFor(header) }
}

/** A new passkey's way in's {@link Keying}: its header for the credential and salt `proof` answered over, and the key its answer makes under that header's ctx. */
const passkeyKeying = async (vaultProps: WayinVaultProps, proof: PasskeyProof, stamp: WayinStamp): Promise<Keying<Omit<PasskeyWayinRecord, 'vault_key_wayin_wrapped'>>> => {
  const header = {
    wayinkind:     'passkey',
    ...stamp,
    credential_id: proof.credentialId,
    prf_salt_b64:  proof.prfSaltB64,
  } as const
  const wayinCtx = wayinCtxOf(vaultProps, header)
  return { header, wayinCtx, wayinKey: await proof.wayinKeyFor({ wayinCtx }) }
}

/** The refusal of a passphrase that opened nothing. */
const wrongPassphrase = () => new VaultError('wrong_passphrase', "That passphrase didn't unlock the vault. Check for typos and try again. If you're sure it's right, the stored vault may be damaged.")

const unknownKeyDeriver = () => new VaultError('unknown_key_deriver', 'This vault was made with a key deriver this package does not carry: update safebyok, or open the vault where it was made.')

const damagedPassphrase = () => new VaultError('damaged_wayin', "This vault's passphrase is stored damaged, so it could not be tried. If the vault has a passkey, unlock with it to read what it holds; a damaged passphrase can't be replaced, so the vault is then to be removed and made again. The vault was left as it is.")

const damagedPasskey = () => new VaultError('damaged_wayin', "This vault's passkey is stored damaged, so it could not be tried. Unlock with the passphrase, then add the passkey again, which replaces it. The vault was left as it is.")
// --
