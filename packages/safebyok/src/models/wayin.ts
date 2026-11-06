import type { Modelkind } from '../helpers/consts'
import { cipherCtx } from '../helpers/crypto'
import { tattoo } from '../helpers/helpers'
import type { Wayinkind } from '../shapes/shapes-enums'
import type * as CX from '../shapes/shapes-core'
import { type VaultStamp, type WayinHeader, type WayinRecord, vaultStamp, wayinHeader, wayinRecord } from '../shapes/shapes-gateish'

// == [The ctx]: PurposeForWayinkind, wayinCtxOf

export const PurposeForWayinkind = Object.freeze({
  passphrase: 'vault_key_passphrase_wrapped',
  passkey:    'vault_key_passkey_wrapped',
} as const satisfies Readonly<Record<Wayinkind, string>>)

export const wayinCtxOf = (stamp: VaultStamp, header: WayinHeader): Uint8Array => {
  const checked = wayinHeader.parse(header)
  return cipherCtx(vaultStamp.parse(stamp), PurposeForWayinkind[checked.wayinkind], checked)
}
// --

export class Wayin {
  // == [Props]: wayinkind, device_id, registered_at, vault_key_wayin_wrapped, key_deriver_label, salt_b64, credential_id, prf_salt_b64, #pickle

  declare readonly wayinkind:               Wayinkind
  declare readonly device_id:               string
  declare readonly registered_at:           number
  declare readonly vault_key_wayin_wrapped: CX.VaultKeyWayinWrapped
  declare readonly key_deriver_label?:      string
  declare readonly salt_b64?:               CX.PassphraseSalt
  declare readonly credential_id?:          string
  declare readonly prf_salt_b64?:           CX.PrfSalt

  readonly #pickle: WayinRecord
  // --

  // == [Construction]: constructor

  constructor(record: unknown) {
    const parsed = wayinRecord.parse(record)
    Object.freeze(parsed.vault_key_wayin_wrapped)
    this.#pickle = Object.freeze(parsed)
    tattoo(this, this.#pickle)
    Object.freeze(this)
  }
  // --

  // == [Methods]: pickle, toJSON

  pickle(): WayinRecord { return this.#pickle }

  toJSON(): WayinHeader {
    const { vault_key_wayin_wrapped: _wrapped, ...header } = this.#pickle
    return header
  }
  // --

  /** Answers 'wayin', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'wayin' { return 'wayin' satisfies Modelkind }
}
