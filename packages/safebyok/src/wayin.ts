import { cipherCtx, fromB64OrNull } from './crypto'
import { VaultError } from './errors'
import { PasskeySaltBytes, WayinRecord, type PasskeyWayinRecord, type PasskeyWayinSummary, type PassphraseWayinRecord, type PassphraseWayinSummary, type WayinKind, type WayinSummary } from './types'
import type { KeyDeriver } from './key-deriver'
import type { Vault } from './vault'

/** Wayins: each the one vaultKey wrapped under the wayinKey its kind of proving makes, a passphrase's or a passkey's.
 * A Wayin is a record only: `Wayin.make` reads one from its record. A proving opens and seals one
 * (`src/proving.ts`).
 *
 * Each wrap is bound to its vault (the scope, and the `vault_tok` of the vault props it is one of,
 * random and never reused), to its own visible header, and to a purpose its wayinkind names. A
 * passkey's key is made with that same ctx as its HKDF `info`. The props' `gate_epoch` and the
 * other wayin are not bound, so changing one wayin leaves the other open.
 */

/** The slice of a {@link Vault} a wayin reads: the scope its wrap is bound to, the key deriver a passphrase wayin derives through, and the time a new one is stamped by. */
export type WayinVault = Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'keyDeriver' | 'now'>

/** `RecordT` with every field but its wrap, member by member of a union. */
type HeaderOf<RecordT> = RecordT extends unknown ? Omit<RecordT, 'vault_key_wayin_wrapped'> : never
/** A wayin's visible header, every field but its wrap: what the wrap is bound to. */
export type WayinHeader = HeaderOf<WayinRecord>

/** The ctx's first part: the vault props' format, under which every wayin's wrap is bound. */
const VaultPropsFormat = 'safebyok-vault-v6'

/** The ctx purpose of each wayinkind's wrap, so no kind of wayin opens as another. */
const PurposeForWayinkind = {
  passphrase: 'vault_key_passphrase_wrapped',
  passkey:    'vault_key_passkey_wrapped',
} as const satisfies Readonly<Record<WayinKind, string>>

/** The ctx a wayin's wrap is bound to, and a passkey's key made with: the vault it lets into (its scope and `vault_tok`), its purpose, and its whole visible header.
 *
 * @example await wrapKeyUnder(wayinKey, vaultKey, wayinCtxOf(vault, vault.vault_tok, header))
 */
export const wayinCtxOf = (vault: Pick<WayinVault, 'applabel' | 'user_id' | 'vaultlabel'>, vaultTok: string, header: WayinHeader): Uint8Array => (
  cipherCtx(VaultPropsFormat, vault.applabel, vault.user_id, vault.vaultlabel, vaultTok, PurposeForWayinkind[header.wayinkind], header)
)

/** `record` without its wrap. */
const headerOf = (record: WayinRecord): WayinHeader => {
  const { vault_key_wayin_wrapped: _wrapped, ...header } = record
  return header
}

/** A frozen copy of `record`, its wrap frozen with it: what a wayin holds as its `record`. */
export const frozenRecord = <RecordT extends WayinRecord>(record: RecordT): RecordT => {
  const frozen: RecordT = { ...record, vault_key_wayin_wrapped: Object.freeze({ ...record.vault_key_wayin_wrapped }) }
  return Object.freeze(frozen)
}

/** One way into a vault, a {@link PassphraseWayin} or a {@link PasskeyWayin}, told apart by `wayinkind`. Every field is read-only.
 * Its visible fields are its own: its wayinkind, the device and time that sealed it, a passkey's
 * credential and salt, which a host asks the passkey with, and the `vault_tok` of the vault props it
 * is one of, which its wrap is bound to. Its wrap, and a passphrase's salt and key deriver's label,
 * stay in its `record`. `{ ...wayin }`, `toJSON()` and a log line show each visible field once, and
 * nothing else. The vault shows those, never the wayins, as its `passphrase` and `passkey`.
 *
 * @example Wayin.make(vault, vaultProps.vault_tok, vaultProps.passphrase).wayinkind  // 'passphrase'
 * @example JSON.stringify(wayin)   // its visible fields alone: no wrap, and no passphrase's salt
 */
export abstract class Wayin<RecordT extends WayinRecord = WayinRecord> {
  /** The stored record, frozen, its wrap with it: the one source of every field. */
  readonly #record: RecordT
  /** The vault it lets into: its scope, its key deriver and its clock. */
  readonly #vault: WayinVault

  /** Which kind of proof opens it. */
  readonly wayinkind:     RecordT['wayinkind']
  /** This vault's id for the device that sealed the wayin. */
  readonly device_id:     string
  /** When the wayin was sealed. */
  readonly registered_at: number
  /** The token of the vault props it is one of: bound into its wrap. */
  readonly vault_tok:     string

  protected constructor(vault: WayinVault, vaultTok: string, record: RecordT) {
    this.#record = frozenRecord(record)
    this.#vault = vault
    this.wayinkind = record.wayinkind
    this.device_id = record.device_id
    this.registered_at = record.registered_at
    this.vault_tok = vaultTok
  }

  /** The stored record, frozen, its wrap with it: what the vault props hold of this wayin. */
  get record(): RecordT {
    return this.#record
  }

  /** The wayin a stored record stands for, checked through its schema; refuses 'damaged_wayin' for a record this package never writes.
   * The schema's complaint is the refusal's cause, as a wayin's record holds no secret.
   *
   * @param vaultTok - The `vault_tok` of the vault props it is one of.
   *
   * @example Wayin.make(vault, vaultProps.vault_tok, vaultProps.passphrase)  // a PassphraseWayin
   * @example Wayin.make(vault, vaultProps.vault_tok, { ...record, device_id: '' })  // throws 'damaged_wayin'
   */
  static make(vault: WayinVault, vaultTok: string, record: PassphraseWayinRecord): PassphraseWayin
  static make(vault: WayinVault, vaultTok: string, record: PasskeyWayinRecord): PasskeyWayin
  static make(vault: WayinVault, vaultTok: string, record: unknown): PassphraseWayin | PasskeyWayin
  static make(vault: WayinVault, vaultTok: string, record: unknown): PassphraseWayin | PasskeyWayin {
    const checked = WayinRecord.safeParse(record)
    if (! checked.success) {
      throw new VaultError('damaged_wayin', "A way into this vault is stored in a form this package never writes, so it can't be tried. The other way in, if the vault has one, still can.", { cause: checked.error })
    }
    return checked.data.wayinkind === 'passphrase' ? new PassphraseWayin(vault, vaultTok, checked.data) : new PasskeyWayin(vault, vaultTok, checked.data)
  }

  /** The ctx this wayin's wrap is bound to: its vault's scope, the `vault_tok` of the vault props it is one of, its purpose, and its whole header. */
  get wayinCtx(): Uint8Array {
    return wayinCtxOf(this.#vault, this.vault_tok, headerOf(this.#record))
  }

  /** The key deriver of its vault, which a passphrase wayin derives through. */
  protected get keyDeriver(): KeyDeriver {
    return this.#vault.keyDeriver
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
  constructor(vault: WayinVault, vaultTok: string, record: PassphraseWayinRecord) {
    super(vault, vaultTok, record)
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
  readonly prf_salt_b64: string

  /** The wayin `record` stands for, taken as checked: {@link Wayin.make} checks a record read from storage. */
  constructor(vault: WayinVault, vaultTok: string, record: PasskeyWayinRecord) {
    super(vault, vaultTok, record)
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

