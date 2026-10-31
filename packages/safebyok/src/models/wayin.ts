import { cipherCtx } from '../crypto'
import { tattoo } from '../helpers'
import type * as FX from '../shapes/fields'
import { type VaultStamp, type WayinHeader, type WayinKind, type WayinRecord, vaultStamp, wayinHeader, wayinRecord } from './models-shapes'

// == [The ctx]: PurposeForWayinkind, wayinCtxOf

export const PurposeForWayinkind = Object.freeze({
  passphrase: 'vault_key_passphrase_wrapped',
  passkey:    'vault_key_passkey_wrapped',
} as const satisfies Readonly<Record<WayinKind, string>>)

export const wayinCtxOf = (stamp: VaultStamp, header: WayinHeader): Uint8Array => {
  const checked = wayinHeader.parse(header)
  return cipherCtx(vaultStamp.parse(stamp), PurposeForWayinkind[checked.wayinkind], checked)
}
// --

// == [Wayin]

export class Wayin {
  declare readonly wayinkind:               WayinKind
  declare readonly device_id:               string
  declare readonly registered_at:           number
  declare readonly vault_key_wayin_wrapped: FX.VaultKeyWayinWrapped
  declare readonly key_deriver_label?:      string
  declare readonly salt_b64?:               FX.PassphraseSalt
  declare readonly credential_id?:          string
  declare readonly prf_salt_b64?:           FX.PrfSalt

  readonly #pickle: WayinRecord

  constructor(record: unknown) {
    const parsed = wayinRecord.parse(record)
    Object.freeze(parsed.vault_key_wayin_wrapped)
    this.#pickle = Object.freeze(parsed)
    tattoo(this, this.#pickle, { writable: false })
    Object.freeze(this)
  }

  pickle(): WayinRecord { return this.#pickle }

  toJSON(): WayinHeader {
    const { vault_key_wayin_wrapped: _wrapped, ...header } = this.#pickle
    return header
  }
}
// --
