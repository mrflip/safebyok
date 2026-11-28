/** `maskedOf`, a copy of a record or listing with each ciphertext cut short, for a devtool. */

import { cloneDeepWith } from 'es-toolkit'

// == [Masking]: MaskedChars, CiphertextFieldname, maskedCiphertextOf, maskedOf

// A masked ciphertext shows its end, which lies in its GCM tag. The tag depends on the whole ciphertext, and so on
// the key it wraps: while the bankKey is unknown, two characters of a wayin's tag check no guess at the passphrase,
// nor do those of up to 21 wraps of the one bankKey taken together: 12 bits each, against a key of 256. From the 22nd
// such wrap a guess at all their passphrases at once can be checked, and whoever has the bankKey already can check a
// guess against one.
// The start would not do: a passphrase replace rewraps the same bankKey, and two masks of its start, one from either
// side, XOR to keystream alone, which checks a guess at both passphrases. See notes/security.md.
/** How many characters of a ciphertext's end its mask shows. */
const MaskedChars = 2

/** The field of a ciphered value that has its ciphertext: a wrapped key, or a ciphered cleartext. */
const CiphertextFieldname = 'ciphertext_b64'

// A ciphertext is base64url without padding: its last characters are its own.
/** `ciphertext` masked, as `…yz(64)`: its last {@link MaskedChars} characters, and its length. */
function maskedCiphertextOf(ciphertext: string): string { return `…${ciphertext.slice(-MaskedChars)}(${String(ciphertext.length)})` }

/** A copy of `val`, a record, null or listing, with the text at every `ciphertext_b64` masked: its last 2 characters and its length, as `…yz(64)`. */
export function maskedOf(val: unknown): unknown {
  return cloneDeepWith(val, (inner: unknown, fieldname) => (((fieldname === CiphertextFieldname) && (typeof inner === 'string')) ? maskedCiphertextOf(inner) : undefined))
}
// --
