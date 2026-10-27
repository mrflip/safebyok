import { cipherCtx, fromB64OrNull } from './crypto'
import { PasskeySaltBytes, type PasskeyWayinSummary, type PassphraseWayinSummary, type WayinKind, type WayinSummary, VaultStamp, WayinRecord, type PasskeyWayinRecord, type PassphraseWayinRecord, type WayinHeader, headerOf } from './shapes/vault'
import type { KeyDeriver } from './key-deriver'
import type { PrfSalt } from './shapes/fields'

/** Wayins: each the one vaultKey wrapped under the wayinKey its kind of proving makes, a passphrase's or a passkey's.
 * A Wayin is a record only: `Wayin.make` reads one from its record. A proving opens and seals one
 * (`src/proving.ts`).
 *
 * Each wrap's ctx is the stamp of the vault record whose gate holds it (its format, scope,
 * `vault_tok` and `registered_at`, each fixed for the vault's life), a purpose its wayinkind names,
 * and its own visible header. A passkey's key is made with that same ctx as its HKDF `info`. The
 * record's epochs and the other wayin are not in it, so changing one wayin leaves the other open.
 */

/** The ctx purpose of each wayinkind's wrap, so no kind of wayin opens as another. */
const PurposeForWayinkind = {
  passphrase: 'vault_key_passphrase_wrapped',
  passkey:    'vault_key_passkey_wrapped',
} as const satisfies Readonly<Record<WayinKind, string>>

/** The ctx a wayin's wrap is bound to, and a passkey's key made with: the stamp of the vault record it lets into, its purpose, and its whole visible header.
 * `vaultStamp` may be the whole vault record: only its six stamp fields are taken. It refuses
 * 'bad_record' for one missing any of them.
 *
 * @example await wrapKeyUnder(wayinKey, vaultKey, wayinCtxOf(vaultRecord, header))
 */
export const wayinCtxOf = (vaultStamp: VaultStamp, header: WayinHeader): Uint8Array => (
  cipherCtx(VaultStamp.parse(vaultStamp), PurposeForWayinkind[header.wayinkind], header)
)

/** A frozen copy of `record`, its wrap frozen with it: what a wayin holds as its `record`. */
export const frozenRecord = <RecordT extends WayinRecord>(record: RecordT): RecordT => {
  const frozen: RecordT = { ...record, vault_key_wayin_wrapped: Object.freeze({ ...record.vault_key_wayin_wrapped }) }
  return Object.freeze(frozen)
}

/** One way into a vault, a {@link PassphraseWayin} or a {@link PasskeyWayin}, told apart by `wayinkind`. Every field is read-only.
 * Its visible fields are its own: its wayinkind, the device and time that sealed it, a passkey's
 * credential and salt, which a host asks the passkey with, and the `vault_tok` of the vault record it
 * is one of. Its wrap, and a passphrase's salt and key deriver's label, stay in its `record`; the
 * stamp of its vault record, which its wrap's ctx holds, stays private. `{ ...wayin }`, `toJSON()` and a log line show each visible field once, and
 * nothing else. A vault's snapshot shows each, never the wayin, as its `gate`'s sparse shape:
 * those fields but the `vault_tok`.
 *
 * @example Wayin.make(vaultRecord, vaultRecord.gate.passphrase, { keyDeriver }).wayinkind  // 'passphrase'
 * @example JSON.stringify(wayin)   // its visible fields alone: no wrap, and no passphrase's salt
 */
export abstract class Wayin<RecordT extends WayinRecord = WayinRecord> {
  /** The stored record, frozen, its wrap with it: the one source of every field. */
  readonly #record: RecordT
  /** The key deriver of the vault it lets into, which a passphrase wayin is judged by. */
  readonly #keyDeriver: KeyDeriver
  /** The stamp of the vault record it is one of, frozen: what its wrap's ctx begins with. */
  readonly #vaultStamp: VaultStamp

  /** Which kind of proof opens it. */
  readonly wayinkind:     RecordT['wayinkind']
  /** This vault's id for the device that sealed the wayin. */
  readonly device_id:     string
  /** When the wayin was sealed. */
  readonly registered_at: number
  /** The token of the vault record it is one of: in its wrap's ctx, with the rest of that record's stamp. */
  readonly vault_tok:     string

  protected constructor(vaultStamp: VaultStamp, record: RecordT, kit: { keyDeriver: KeyDeriver }) {
    this.#record = frozenRecord(record)
    this.#keyDeriver = kit.keyDeriver
    this.#vaultStamp = Object.freeze(VaultStamp.parse(vaultStamp))
    this.wayinkind = record.wayinkind
    this.device_id = record.device_id
    this.registered_at = record.registered_at
    this.vault_tok = this.#vaultStamp.vault_tok
  }

  /** The stored record, frozen, its wrap with it: what the vault record's gate holds of this wayin. */
  get record(): RecordT {
    return this.#record
  }

  /** The wayin a stored record stands for, checked through its schema: 'bad_record', the schema's own refusal, for a record this package never writes.
   *
   * @param vaultStamp - The stamp of the vault record it is one of: that record itself will do, or
   *   the Vault object, as only its six stamp fields are taken. One missing any refuses 'bad_record'.
   * @param kit.keyDeriver - The vault's key deriver, which judges a passphrase wayin's salt.
   *
   * @example Wayin.make(vaultRecord, vaultRecord.gate.passphrase, { keyDeriver })  // a PassphraseWayin
   * @example Wayin.make(vaultRecord, { ...record, device_id: '' }, { keyDeriver })  // throws 'bad_record'
   */
  static make(vaultStamp: VaultStamp, record: PassphraseWayinRecord, kit: { keyDeriver: KeyDeriver }): PassphraseWayin
  static make(vaultStamp: VaultStamp, record: PasskeyWayinRecord, kit: { keyDeriver: KeyDeriver }): PasskeyWayin
  static make(vaultStamp: VaultStamp, record: unknown, kit: { keyDeriver: KeyDeriver }): PassphraseWayin | PasskeyWayin
  static make(vaultStamp: VaultStamp, record: unknown, kit: { keyDeriver: KeyDeriver }): PassphraseWayin | PasskeyWayin {
    const checked = WayinRecord.parse(record)
    return checked.wayinkind === 'passphrase' ? new PassphraseWayin(vaultStamp, checked, kit) : new PasskeyWayin(vaultStamp, checked, kit)
  }

  /** The ctx this wayin's wrap is bound to: the stamp of the vault record it is one of, its purpose, and its whole header. */
  get wayinCtx(): Uint8Array {
    return wayinCtxOf(this.#vaultStamp, headerOf(this.#record))
  }

  /** The key deriver of its vault, which a passphrase wayin derives through. */
  protected get keyDeriver(): KeyDeriver {
    return this.#keyDeriver
  }

  /** True when this wayin is stored in a form this package never writes, so it cannot be tried.
   * That is a salt its kind never makes.
   */
  abstract isDamaged(): boolean

  /** Its visible fields, each once: all JSON and a log line show of this wayin. */
  abstract toJSON(): WayinSummary
}

/** A passphrase wayin: the vaultKey wrapped under the passphraseKey made of the passphrase and this wayin's passphraseSalt.
 *
 * @example if (wayin.wayinkind === 'passphrase') { wayin.key_deriver_label }   // 'argon2id_web_v1'
 */
export class PassphraseWayin extends Wayin<PassphraseWayinRecord> {
  /** The wayin `record` stands for, taken as checked: {@link Wayin.make} checks a record read from storage. */
  constructor(vaultStamp: VaultStamp, record: PassphraseWayinRecord, kit: { keyDeriver: KeyDeriver }) {
    super(vaultStamp, record, kit)
    Object.freeze(this)
  }

  /** Its kind, and the device and time that sealed it, each once. */
  toJSON(): PassphraseWayinSummary {
    const { ...visible } = this
    return visible
  }

  /** True with a salt the vault's own key deriver could not have made.
   * A salt for another key deriver is not this vault's to judge.
   */
  isDamaged(): boolean {
    const { keyDeriver, record } = this
    return record.key_deriver_label === keyDeriver.key_deriver_label && fromB64OrNull(record.salt_b64)?.length !== keyDeriver.salt_bytes
  }
}

/** A passkey wayin: the vaultKey wrapped under the passkeyKey made from the authenticator's PRF answer over this wayin's own salt.
 * The authenticator holds the secret. The wayin holds only which credential to ask, and what.
 *
 * @example if (wayin.wayinkind === 'passkey') { await askPasskey(wayin.toJSON()) }
 */
export class PasskeyWayin extends Wayin<PasskeyWayinRecord> {
  /** The WebAuthn credential's id, base64url, as `PublicKeyCredential.id` gives it: which passkey to ask. */
  readonly credential_id: string
  /** The salt the passkey's PRF is evaluated over: {@link PasskeySaltBytes} random bytes, fresh for every wayin. */
  readonly prf_salt_b64: PrfSalt

  /** The wayin `record` stands for, taken as checked: {@link Wayin.make} checks a record read from storage. */
  constructor(vaultStamp: VaultStamp, record: PasskeyWayinRecord, kit: { keyDeriver: KeyDeriver }) {
    super(vaultStamp, record, kit)
    this.credential_id = record.credential_id
    this.prf_salt_b64 = record.prf_salt_b64
    Object.freeze(this)
  }

  /** Its kind, the device and time that added it, and the credential and salt a host asks its authenticator with, each once. */
  toJSON(): PasskeyWayinSummary {
    const { ...visible } = this
    return visible
  }

  /** True with a salt that is not base64url of {@link PasskeySaltBytes} bytes. */
  isDamaged(): boolean {
    return fromB64OrNull(this.prf_salt_b64)?.length !== PasskeySaltBytes
  }
}

