import type { Modelkind } from '../helpers/consts'
import { cipherCtx } from '../helpers/crypto'
import { tattoo } from '../helpers/helpers'
import type { Wayinkind } from '../shapes/shapes-enums'
import type * as CX from '../shapes/shapes-core'
import { type BankStamp, type GateStamp, type WayinHeader, type WayinRecord, bankStamp, gateStamp, wayinHeader, wayinRecord } from '../shapes/shapes-gateish'

// == [The ctx]: PurposeForWayinkind, wayinCtxOf

/** The purpose that each kind of wayin's wrapped bankKey is bound to (see {@link wayinCtxOf}). */
export const PurposeForWayinkind = Object.freeze({
  passphrase: 'bank_key_passphrase_wrapped',
  passkey:    'bank_key_passkey_wrapped',
} as const satisfies Readonly<Record<Wayinkind, string>>)

/** Serialized name/value pairs bound into a wayin's wrapped bankKey as cryptographic context.
 * They are the bank's stamp, the gate's stamp, the wayin's purpose and its header.
 * The bankKey cannot be unwrapped unless the same bytes, unchanged, are independently provided along with the wrapping
 * key. With any change to them, such as another `user_id` or a forged `registered_at`, it will not unwrap.
 */
export function wayinCtxOf(bank: BankStamp, gate: GateStamp, header: WayinHeader): Uint8Array {
  const checked = wayinHeader.parse(header)
  return cipherCtx([bankStamp.parse(bank), gateStamp.parse(gate)], PurposeForWayinkind[checked.wayinkind], checked)
}
// --

/** One way into a bank, kept in its gate: its passphrase or its passkey. */
export class Wayin {
  // == [Props]: wayinkind, wayinlabel, device_tok, registered_at, bank_key_wayin_wrapped, key_deriver_label, salt_b64, credential_id, prf_salt_b64, #pickle

  declare readonly wayinkind:               Wayinkind
  declare readonly wayinlabel:              'main' | 'passkey0'
  declare readonly device_tok:              string
  declare readonly registered_at:           number
  declare readonly bank_key_wayin_wrapped: CX.BankKeyWayinWrapped
  /** Only on a passphrase wayin. */
  declare readonly key_deriver_label?:      string
  /** Only on a passphrase wayin. */
  declare readonly salt_b64?:               CX.PassphraseSalt
  /** Only on a passkey wayin. */
  declare readonly credential_id?:          string
  /** Only on a passkey wayin. */
  declare readonly prf_salt_b64?:           CX.PrfSalt

  readonly #pickle: WayinRecord
  // --

  // == [Construction]: constructor

  /** A Wayin of `record`, checked as a {@link WayinRecord}. */
  constructor(record: unknown) {
    const parsed = wayinRecord.parse(record)
    Object.freeze(parsed.bank_key_wayin_wrapped)
    this.#pickle = Object.freeze(parsed)
    tattoo(this, this.#pickle)
    Object.freeze(this)
  }
  // --

  // == [Methods]: pickle, toJSON

  /** This wayin as a frozen plain {@link WayinRecord}. */
  pickle(): WayinRecord { return this.#pickle }

  /** This wayin's {@link WayinHeader}: its record without the wrapped bankKey. */
  toJSON(): WayinHeader {
    const { bank_key_wayin_wrapped: _wrapped, ...header } = this.#pickle
    return header
  }
  // --

  /** Always `'wayin'`: marks this model for a {@link Modelkind} check. */
  get modelkind(): 'wayin' { return 'wayin' satisfies Modelkind }
}
