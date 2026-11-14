import type * as Z from 'zod'
import type { Consts, CX, EX } from 'safebyok-big/internals'
import { Crypto, GX, Helpers } from 'safebyok-big/internals'

// == [The ctx]: PurposeForWayinkind, wayinCtxOf

/** The purpose that each kind of wayin's wrapped bankKey is bound to (see {@link wayinCtxOf}). */
export const PurposeForWayinkind = Object.freeze({
  passphrase: 'bank_key_passphrase_wrapped',
  passkey:    'bank_key_passkey_wrapped',
} as const satisfies Readonly<Record<EX.Wayinkind, string>>)

/** Serialized name/value pairs bound into a wayin's wrapped bankKey as cryptographic context.
 * They are the bank's stamp, the gate's stamp, the wayin's purpose and its header.
 * The bankKey cannot be unwrapped unless the same bytes, unchanged, are independently provided along with the wrapping
 * key. With any change to them, such as another `user_id` or a forged `registered_at`, it will not unwrap.
 */
export function wayinCtxOf(bank: GX.BankStamp, gate: GX.GateStamp, header: GX.WayinHeader): Uint8Array {
  const checked = GX.wayinHeader.parse(header)
  return Crypto.cipherCtx([GX.bankStamp.parse(bank), GX.gateStamp.parse(gate)], PurposeForWayinkind[checked.wayinkind], checked)
}
// --

/** One way into a bank, kept in its gate: its passphrase or its passkey. */
export class Wayin {
  // == [Props]: wayinkind, wayinlabel, device_tok, registered_at, bank_key_wayin_wrapped, key_deriver_label, salt_b64, credential_id, prf_salt_b64, #pickle

  declare readonly wayinkind:              EX.Wayinkind
  declare readonly wayinlabel:             'main' | 'passkey0'
  declare readonly device_tok:             string
  declare readonly registered_at:          number
  declare readonly bank_key_wayin_wrapped: GX.WayinRecord['bank_key_wayin_wrapped']
  /** Only on a passphrase wayin. */
  declare readonly key_deriver_label?:     string
  /** Only on a passphrase wayin. */
  declare readonly salt_b64?:              CX.PassphraseSalt
  /** Only on a passkey wayin. */
  declare readonly credential_id?:         string
  /** Only on a passkey wayin. */
  declare readonly prf_salt_b64?:          CX.PrfSalt

  readonly #pickle: GX.WayinRecord
  // --

  // == [Construction]: make, constructor

  /** A Wayin of `record`, checked as a {@link GX.WayinRecord}. */
  static make(record: Z.input<typeof GX.wayinRecord>): Wayin { return new Wayin(record) }

  private constructor(record: Z.input<typeof GX.wayinRecord>) {
    const parsed = GX.wayinRecord.parse(record)
    Object.freeze(parsed.bank_key_wayin_wrapped)
    this.#pickle = Object.freeze(parsed)
    Helpers.tattoo(this, this.#pickle)
    Object.freeze(this)
  }
  // --

  // == [Methods]: pickle, toJSON

  /** This wayin as a frozen plain {@link GX.WayinRecord}. */
  pickle(): GX.WayinRecord { return this.#pickle }

  /** This wayin's {@link GX.WayinHeader}: its record without the wrapped bankKey. */
  toJSON(): GX.WayinHeader {
    const { bank_key_wayin_wrapped: _wrapped, ...header } = this.#pickle
    return header
  }
  // --

  /** Always `'wayin'`: marks this model for a {@link Consts.Modelkind} check. */
  get modelkind(): 'wayin' { return 'wayin' satisfies Consts.Modelkind }
}
