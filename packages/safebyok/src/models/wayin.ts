import type * as Z from 'zod'
import { Checkers } from '../checks/validator'
import { cipherCtx } from '../crypto'
import { tattoo } from '../helpers'
import * as FX from '../shapes/fields'
import { type VaultStamp, vaultStamp } from './stamps'

// == [Shapes]: passphraseWayinHeader, passkeyWayinHeader, wayinHeader, passphraseWayinRecord, passkeyWayinRecord, wayinRecord, WayinKind

export const { passphraseWayinHeader, passkeyWayinHeader, wayinHeader, passphraseWayinRecord, passkeyWayinRecord, wayinRecord } = Checkers('bad_record', ({ obj, lit, discrim, epochMillis, key_deriver_label, salt_b64, credential_id, prf_salt_b64, device_id, vault_key_wayin_wrapped }) => {
  const passphraseWayinHeader = obj({ wayinkind: lit('passphrase'), key_deriver_label, salt_b64, device_id, registered_at: epochMillis })
  const passkeyWayinHeader    = obj({ wayinkind: lit('passkey'), credential_id, prf_salt_b64, device_id, registered_at: epochMillis })
  const passphraseWayinRecord = passphraseWayinHeader.extend({ vault_key_wayin_wrapped }).strict()
  const passkeyWayinRecord    = passkeyWayinHeader.extend({ vault_key_wayin_wrapped }).strict()
  return {
    passphraseWayinHeader,
    passkeyWayinHeader,
    wayinHeader: discrim('wayinkind', [passphraseWayinHeader, passkeyWayinHeader]),
    passphraseWayinRecord,
    passkeyWayinRecord,
    wayinRecord: discrim('wayinkind', [passphraseWayinRecord, passkeyWayinRecord]),
  }
}, [FX])

export type PassphraseWayinHeader = Z.infer<typeof passphraseWayinHeader>
export type PasskeyWayinHeader    = Z.infer<typeof passkeyWayinHeader>
export type WayinHeader           = Z.infer<typeof wayinHeader>
export type PassphraseWayinRecord = Z.infer<typeof passphraseWayinRecord>
export type PasskeyWayinRecord    = Z.infer<typeof passkeyWayinRecord>
export type WayinRecord           = Z.infer<typeof wayinRecord>
export type WayinKind             = WayinRecord['wayinkind']
// --

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
