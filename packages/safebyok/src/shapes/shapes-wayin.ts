/** The checks and types of a wayin, as a gate record has it under `wayins`. */

import type * as Z from 'zod'
import { CX, Validator } from 'safebyok-big/internals'

// == [The wayin's forms]: WayinChecks, PassphraseWayinHeader, PasskeyWayinHeader, WayinHeader, PassphraseWayinRecord, PasskeyWayinRecord, WayinRecord

// Its own module, not shapes-gateish.ts: the gate's record checks it, and shapes-gateish.ts reads the Thing checks.
/** The checks of a wayin's forms, and of a gate's bag of them.
 * Each kind's record, its header (the record without the wrapped bankKey), and the union of each on `wayinkind`.
 * Each kind has the one `label` it is stored under in the bag: `main` for the passphrase, `passkey0` for the passkey.
 */
export const WayinChecks = Validator.Checkers('bad_record', ({ obj, lit, discrim, epochMillis, key_deriver_label, credential_id, salt_b64, prfSalt, devicetok, bank_key_wayin_wrapped }) => {
  const passphraseWayinRecord = obj({ wayinkind: lit('passphrase'), label: lit('main'), key_deriver_label, salt_b64, devicetok, born_at: epochMillis, bank_key_wayin_wrapped }).strict()
  const passkeyWayinRecord    = obj({ wayinkind: lit('passkey'), label: lit('passkey0'), credential_id, prf_salt_b64: prfSalt, devicetok, born_at: epochMillis, bank_key_wayin_wrapped }).strict()
  const passphraseWayinHeader = passphraseWayinRecord.omit({ bank_key_wayin_wrapped: true }).strip()
  const passkeyWayinHeader    = passkeyWayinRecord.omit({ bank_key_wayin_wrapped: true }).strip()
  return {
    passphraseWayinRecord,
    passkeyWayinRecord,
    passphraseWayinHeader,
    passkeyWayinHeader,
    wayinHeader: discrim('wayinkind', [passphraseWayinHeader, passkeyWayinHeader]),
    wayinRecord: discrim('wayinkind', [passphraseWayinRecord, passkeyWayinRecord]),
    // A record has no optional part: a gate with no passkey has `passkey0: null`.
    wayins:      obj({ main: passphraseWayinRecord, passkey0: passkeyWayinRecord.nullable() }).strict(),
  }
}, [CX])

/** A passphrase wayin without its wrapped bankKey. */
export type PassphraseWayinHeader = Z.infer<typeof WayinChecks.passphraseWayinHeader>
/** A passkey wayin without its wrapped bankKey. */
export type PasskeyWayinHeader    = Z.infer<typeof WayinChecks.passkeyWayinHeader>
/** A wayin without its wrapped bankKey: a tagged union on `wayinkind`. */
export type WayinHeader           = Z.infer<typeof WayinChecks.wayinHeader>
/** A passphrase wayin as its gate record has it, under `main`. */
export type PassphraseWayinRecord = Z.infer<typeof WayinChecks.passphraseWayinRecord>
/** A passkey wayin as its gate record has it, under `passkey0`. */
export type PasskeyWayinRecord    = Z.infer<typeof WayinChecks.passkeyWayinRecord>
/** A stored wayin: a tagged union on `wayinkind` of {@link PassphraseWayinRecord} and {@link PasskeyWayinRecord}. */
export type WayinRecord           = Z.infer<typeof WayinChecks.wayinRecord>
// --
