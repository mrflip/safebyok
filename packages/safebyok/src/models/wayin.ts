import type * as Z from 'zod'
import type { CX, EX } from 'safebyok-big/internals'
import { Crypto, Helpers } from 'safebyok-big/internals'
import type * as Stamps from '../shapes/shapes-stamps'
import { type WayinHeader, type WayinRecord, WayinChecks } from '../shapes/shapes-wayin'
import type { DeviceTok, EpochMillis } from '../shapes/primitives'
import type { Modelkind } from '../shapes/shapes-thing'
import { BankChecks, GateChecks } from '../shapes/shapes-thingkinds'

// == [The ctx]: PurposeForWayinkind, wayinCtxOf

/** The purpose that each kind of wayin's wrapped bankKey is bound to (see {@link wayinCtxOf}). */
export const PurposeForWayinkind = Object.freeze({
  passphrase: 'bank_key_passphrase_wrapped',
  passkey:    'bank_key_passkey_wrapped',
} as const satisfies Readonly<Record<EX.Wayinkind, string>>)

/** The context a wayin's wrapped bankKey is bound to: the bank's stamp, the gate's stamp, the wayin's purpose and its header.
 * The bankKey unwraps only given the same context: any change, such as another `userid` or a forged `born_at`, prevents it.
 */
export function wayinCtxOf(bankStamp: Stamps.BankStamp, gateStamp: Stamps.GateStamp, header: WayinHeader): Uint8Array {
  const headerChecked = WayinChecks.wayinHeader.parse(header)
  return Crypto.cipherCtx([BankChecks.stamp.parse(bankStamp), GateChecks.stamp.parse(gateStamp)], PurposeForWayinkind[headerChecked.wayinkind], headerChecked)
}
// --

/** One way into a bank, recorded in its gate: its passphrase or its passkey. */
export class Wayin {
  // == [Props]: wayinkind, label, device_tok, born_at, bank_key_wayin_wrapped, key_deriver_label, salt_b64, credential_id, prf_salt_b64, #pickle

  declare readonly wayinkind:              EX.Wayinkind
  /** The ckey its gate's `wayins` keep it under. */
  declare readonly label:                  'main' | 'passkey0'
  declare readonly device_tok:             DeviceTok
  declare readonly born_at:                EpochMillis
  declare readonly bank_key_wayin_wrapped: WayinRecord['bank_key_wayin_wrapped']
  /** Only on a passphrase wayin. */
  declare readonly key_deriver_label?:     string
  /** Only on a passphrase wayin. */
  declare readonly salt_b64?:              CX.PassphraseSalt
  /** Only on a passkey wayin. */
  declare readonly credential_id?:         string
  /** Only on a passkey wayin. */
  declare readonly prf_salt_b64?:          CX.PrfSalt

  readonly #pickle: WayinRecord
  // --

  // == [Construction]: make, constructor

  /** Make the Wayin of `record`, checked as a {@link WayinRecord}. */
  static make(record: Z.input<typeof WayinChecks.wayinRecord>): Wayin { return new Wayin(record) }

  private constructor(record: Z.input<typeof WayinChecks.wayinRecord>) {
    const wayinRecord = WayinChecks.wayinRecord.parse(record)
    Object.freeze(wayinRecord.bank_key_wayin_wrapped)
    this.#pickle = Object.freeze(wayinRecord)
    Helpers.tattoo(this, this.#pickle)
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

  /** Always `'wayin'`: this model's {@link Modelkind}. */
  get modelkind(): 'wayin' { return 'wayin' satisfies Modelkind }
}
