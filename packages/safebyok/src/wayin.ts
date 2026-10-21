import { cipherCtx, fromB64OrNull, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder, type Ciphered } from './crypto'
import { VaultError } from './errors'
import { type Outcome, outcomeOf, unexpectedError } from './outcome'
import { PasskeyProof, PassphraseProof, Proof } from './proof'
import { PasskeySaltBytes, WayinRecord, type PasskeyWayinRecord, type PasskeyWayinSummary, type PassphraseWayinRecord, type PassphraseWayinSummary, type VaultProps, type WayinKind, type WayinSummary } from './types'
import { decorate } from './adorn'
import type { KeyDeriver } from './key-deriver'

/** Wayins: each the one vaultKey wrapped under the wayinKey its kind of proof makes, a passphrase's or a passkey's.
 * `Wayin.make` reads one from its record, `wayin.tryOpen(proof)` opens one, and `Wayin.seal` makes one.
 *
 * Each wrap is bound to its vault (the scope, and the props' unchanging `vault_id` and
 * `registered_at`), to its own visible header, and to a purpose its wayinkind names. A passkey's
 * key is made with that same ctx as its HKDF `info`. The props' `unlock_epoch` and the other
 * wayin are not bound, so changing one wayin leaves the other open.
 */

/** The vaultKey's two forms after an unwrap: a `transientKey` to wrap anew, and a non-extractable `sessionKey` to keep.
 * The `transientKey` is extractable, as a key must be to be wrapped into a lease or a new wayin:
 * drop it when the operation returns. The vault keeps the `sessionKey` between operations, and the
 * platform refuses to export its bytes.
 */
export type VaultKeyPair = { transientKey: CryptoKey, sessionKey: CryptoKey }

/** The vault props a wayin is one of, as far as it reads them: a whole {@link VaultProps} is one.
 * Its wrap is bound to their scope, `vault_id` and `registered_at`: with its own header, the whole
 * of its ctx.
 */
export type WayinVaultProps = Pick<VaultProps, 'applabel' | 'user_id' | 'vaultlabel' | 'vault_id' | 'registered_at'>

/** `RecordT` with every field but its wrap, member by member of a union. */
type HeaderOf<RecordT> = RecordT extends unknown ? Omit<RecordT, 'vault_key_wayin_wrapped'> : never
/** A wayin's visible header, every field but its wrap: what the wrap is bound to. */
export type WayinHeader = HeaderOf<WayinRecord>

/** What `Wayin.seal` stamps on a wayin beside its kind's own fields: the device and time that sealed it. */
export type WayinStamp = Pick<WayinRecord, 'device_id' | 'registered_at'>

/** The ctx's first part: the vault props' format, under which every wayin's wrap is bound. */
const VaultPropsFormat = 'safebyok-vault-v6'

/** The ctx purpose of each wayinkind's wrap, so no kind of wayin opens as another. */
const PurposeForWayinkind = {
  passphrase: 'vault_key_passphrase_wrapped',
  passkey:    'vault_key_passkey_wrapped',
} as const satisfies Readonly<Record<WayinKind, string>>

/** The usages of the vaultKey a vault keeps: it wraps a boxKey and unwraps one, nothing else. */
const SessionUsage = { extractable: false, usage: ['wrapKey', 'unwrapKey'] } as const
// The transient is only ever the wrapped argument of a wrap; WebCrypto refuses an empty usage
// list, so it carries the narrowest one.
const TransientUsage = { extractable: true, usage: ['wrapKey'] } as const

/** The ctx a wayin's wrap is bound to, and a passkey's key made with: the vault it lets into, and its own visible header. */
const wayinCtxOf = (vaultProps: WayinVaultProps, header: WayinHeader): Uint8Array => (
  cipherCtx(VaultPropsFormat, vaultProps.applabel, vaultProps.user_id, vaultProps.vaultlabel, vaultProps.vault_id, vaultProps.registered_at, PurposeForWayinkind[header.wayinkind], header)
)

/** `record` without its wrap. */
const headerOf = (record: WayinRecord): WayinHeader => {
  const { vault_key_wayin_wrapped: _wrapped, ...header } = record
  return header
}

/** A frozen copy of `record`, its wrap frozen with it: what a wayin hands back as its `props`. */
export const frozenRecord = <RecordT extends WayinRecord>(record: RecordT): RecordT => {
  const frozen: RecordT = { ...record, vault_key_wayin_wrapped: Object.freeze({ ...record.vault_key_wayin_wrapped }) }
  return Object.freeze(frozen)
}

/** One way into a vault, a {@link PassphraseWayin} or a {@link PasskeyWayin}, told apart by `wayinkind`. Every field is read-only.
 * `toJSON()` is its `summary` alone, so a log line never carries its wrap, nor a passphrase's
 * salt. The vault shows the summaries, never the wayins, as its `passphrase` and `passkey`.
 *
 * @example Wayin.make(vaultProps, vaultProps.passphrase, keyDeriver).wayinkind   // 'passphrase'
 * @example JSON.stringify(wayin) === JSON.stringify(wayin.summary)   // true: no wrap, and no passphrase's salt
 */
export abstract class Wayin {
  /** The vault props this wayin is one of. Not enumerable. */
  declare readonly vaultProps: WayinVaultProps
  /** The stored record, frozen. Not enumerable. */
  declare readonly props: WayinRecord

  /** Which kind of proof opens it. */
  readonly wayinkind: WayinKind
  /** This vault's id for the device that sealed the wayin. */
  readonly device_id: string
  /** When the wayin was sealed. */
  readonly registered_at: number
  /** The vaultKey, wrapped under this wayin's wayinKey, bound to its `wayinCtx`. */
  readonly vault_key_wayin_wrapped: Ciphered

  protected constructor(vaultProps: WayinVaultProps, record: WayinRecord) {
    decorate<Wayin>(this, { vaultProps, props: frozenRecord(record) })
    this.wayinkind = record.wayinkind
    this.device_id = record.device_id
    this.registered_at = record.registered_at
    this.vault_key_wayin_wrapped = this.props.vault_key_wayin_wrapped
  }

  /** The wayin a stored record stands for, checked through its schema; refuses 'damaged_wayin' for a record this package never writes.
   * The schema's complaint is the refusal's cause, as a wayin's record holds no secret.
   *
   * @param vaultProps - The vault props it is one of.
   * @param keyDeriver - The vault's key deriver, which a passphrase wayin derives through; a passkey's reads none.
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

  /** What a locked vault may show of this wayin: never its wrap, nor a passphrase's salt. */
  abstract get summary(): WayinSummary

  /** The ctx this wayin's wrap is bound to: its vault's scope, `vault_id` and `registered_at`, its purpose, and its whole header. */
  get wayinCtx(): Uint8Array {
    return wayinCtxOf(this.vaultProps, headerOf(this.props))
  }

  /** True when this wayin is stored in a form this package never writes, so it cannot be tried.
   * That is a salt its kind never makes.
   */
  abstract isDamaged(): boolean

  /** The vaultKey out of this wayin's own wrap, under the wayinKey `proof` makes: there is no comparison and no shortcut.
   * The proof is not kept, and nothing is logged. It refuses 'wrong_passphrase' or 'wrong_passkey'
   * when the proof does not open it, and 'damaged_wayin' when it {@link isDamaged}. Each kind adds
   * its own.
   *
   * @param proof - A {@link PassphraseProof} for a passphrase wayin, a {@link PasskeyProof} for a
   *   passkey's; the other kind refuses 'bad_option'.
   *
   * @example const { ok, val } = await wayin.tryOpen(Proof.parse(vault, typed))
   */
  abstract tryOpen(proof: Proof): Promise<Outcome<VaultKeyPair>>

  /** Its {@link summary}: all JSON and a log line show of this wayin. */
  toJSON(): WayinSummary {
    return this.summary
  }

  /** Both forms of the vaultKey out of this wayin's wrap under `wayinKey`, or null when it will not open. */
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

  /** A new wayin wrapping `vaultKey` for `proof`, stamped with `deviceId`, and `now` as its `registered_at`.
   * A passphrase wayin gets a fresh passphraseSalt for the key deriver `proof` derives through, and
   * refuses as {@link PassphraseProof.wayinKeyFor} does. A passkey wayin keeps the credential's id
   * and salt to ask it again, never its answer. Check the proof first: a new passphrase with
   * `proof.checkStrongEnough()`, a new passkey's salt with `checkSaltShape`. It writes nothing, and
   * hands back no key.
   *
   * @param vaultProps - The vault props it will be one of.
   * @param vaultKey - The vaultKey to wrap, which must be extractable.
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

/** A passphrase wayin: the vaultKey wrapped under the passphraseKey made of the passphrase and this wayin's passphraseSalt.
 *
 * @example if (wayin.wayinkind === 'passphrase') { wayin.key_deriver_label }   // 'argon2id_web_v1'
 */
export class PassphraseWayin extends Wayin {
  declare readonly wayinkind: 'passphrase'
  declare readonly props: PassphraseWayinRecord
  /** The vault's key deriver, which this wayin's passphraseKey is derived through. Not enumerable. */
  declare readonly keyDeriver: KeyDeriver
  /** Which key deriver made the passphraseKey: `argon2id_web_v1`, or a host's own label. */
  readonly key_deriver_label: string
  /** This wayin's passphraseSalt, fresh for every passphrase the vault takes. */
  readonly salt_b64: string

  /** The wayin `record` stands for, taken as checked: {@link Wayin.make} checks a record read from storage. */
  constructor(vaultProps: WayinVaultProps, record: PassphraseWayinRecord, keyDeriver: KeyDeriver) {
    super(vaultProps, record)
    decorate<PassphraseWayin>(this, { keyDeriver })
    this.key_deriver_label = record.key_deriver_label
    this.salt_b64 = record.salt_b64
    Object.freeze(this)
  }

  /** Its kind, and the device and time that sealed it. */
  get summary(): PassphraseWayinSummary {
    const { wayinkind, device_id, registered_at } = this
    return { wayinkind, device_id, registered_at }
  }

  /** True with a salt the vault's own key deriver could not have made.
   * A salt for another key deriver is not this vault's to judge.
   */
  isDamaged(): boolean {
    const { keyDeriver } = this
    return this.key_deriver_label === keyDeriver.key_deriver_label && fromB64OrNull(this.salt_b64)?.length !== keyDeriver.salt_bytes
  }

  /** {@link Wayin.tryOpen} for a passphrase: one key derivation, refused 'unknown_key_deriver' when another deriver made the wayin.
   * A blank passphrase refuses 'wrong_passphrase' before any derivation. A wayin altered in
   * storage fails as a wrong passphrase does, so the message names both. The key deriver's
   * refusals are {@link PassphraseProof.wayinKeyFor}'s.
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

/** A passkey wayin: the vaultKey wrapped under the passkeyKey made from the authenticator's PRF answer over this wayin's own salt.
 * The authenticator holds the secret. The wayin holds only which credential to ask, and what.
 *
 * @example if (wayin.wayinkind === 'passkey') { await askPasskey(wayin.summary) }
 */
export class PasskeyWayin extends Wayin {
  declare readonly wayinkind: 'passkey'
  declare readonly props: PasskeyWayinRecord
  /** The WebAuthn credential's id, base64url, as `PublicKeyCredential.id` gives it: which passkey to ask. */
  readonly credential_id: string
  /** The salt the passkey's PRF is evaluated over: {@link PasskeySaltBytes} random bytes, fresh for every wayin. */
  readonly prf_salt_b64: string

  /** The wayin `record` stands for, taken as checked: {@link Wayin.make} checks a record read from storage. */
  constructor(vaultProps: WayinVaultProps, record: PasskeyWayinRecord) {
    super(vaultProps, record)
    this.credential_id = record.credential_id
    this.prf_salt_b64 = record.prf_salt_b64
    Object.freeze(this)
  }

  /** Its kind, the device and time that added it, and the credential and salt a host asks its authenticator with. */
  get summary(): PasskeyWayinSummary {
    const { wayinkind, device_id, registered_at, credential_id, prf_salt_b64 } = this
    return { wayinkind, device_id, registered_at, credential_id, prf_salt_b64 }
  }

  /** True with a salt that is not base64url of {@link PasskeySaltBytes} bytes. */
  isDamaged(): boolean {
    return fromB64OrNull(this.prf_salt_b64)?.length !== PasskeySaltBytes
  }

  /** {@link Wayin.tryOpen} for a passkey's answer: one HKDF, with no derivation to wait for.
   * It refuses 'wrong_passkey' for another credential's answer, or one over another salt. An answer
   * for its own credential and salt that does not open it is most likely a wayin altered in storage.
   * But a passkey asked without user verification answers differently too, so the message names both.
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

/** What sealing a new wayin needs of its kind: its header, the ctx built once from it, and the wayinKey its proof makes.
 * For a passkey the same ctx is the HKDF's `info` and the wrap's, by construction.
 */
type Keying<HeaderT extends WayinHeader> = { header: HeaderT, wayinCtx: Uint8Array, wayinKey: CryptoKey }

/** A new passphrase wayin's {@link Keying}: its header under a fresh salt for the key deriver `proof` derives through, and the key it makes over that salt. */
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

/** A new passkey wayin's {@link Keying}: its header for the credential and salt `proof` answered over, and the key its answer makes. */
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
