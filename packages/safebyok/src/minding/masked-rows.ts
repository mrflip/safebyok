/** `maskedRowsOf`, the rows a devtool is shown of one bank's queries in a TanStack Query client, each ciphertext masked. */

import type * as TSQ from '@tanstack/query-core'
import { cloneDeepWith } from 'es-toolkit'
import { Outcome } from 'safebyok-big/internals'
import type { MaskedRow } from '../shapes/shapes-masked-view'

// == [Masked rows]: maskedRowsOf

/** The rows of every query in `queryClient` whose key starts with `keyHead`, masked for a devtool.
 * Each has its key, its state, and a copy of its record or listing with each ciphertext masked.
 */
export function maskedRowsOf(queryClient: TSQ.QueryClient, keyHead: TSQ.QueryKey): MaskedRow[] {
  return queryClient.getQueryCache().findAll({ queryKey: keyHead }).map((tsqQuery) => {
    const { status, fetchStatus, dataUpdatedAt, isInvalidated, error: err, data: val } = tsqQuery.state
    return {
      queryKey:        [...tsqQuery.queryKey],
      status,
      fetchStatus,
      dataUpdatedAt,
      isInvalidated,
      lastRefusalkind: (err === null) ? null : Outcome.storageRefusalOf(err).refusalkind,
      val:             maskedOf(val),
    }
  })
}
// --

// == [Helpers]: MaskedChars, CiphertextFieldname, maskedCiphertextOf, maskedOf

// A masked ciphertext shows its end, which lies in its GCM tag. The tag depends on the whole ciphertext, and so on
// the key it wraps: while the bankKey is unknown, two characters of a wayin's tag check no guess at the passphrase,
// nor do those of up to 21 wraps of the one bankKey taken together: 12 bits each, against a key of 256. From the 22nd
// such wrap a guess at all their passphrases at once can be checked, and whoever holds the bankKey already can check a
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

/** A copy of `val`, a record, null or listing, with the text at every {@link CiphertextFieldname} masked by {@link maskedCiphertextOf}. */
function maskedOf(val: unknown): unknown {
  return cloneDeepWith(val, (inner: unknown, fieldname) => (((fieldname === CiphertextFieldname) && (typeof inner === 'string')) ? maskedCiphertextOf(inner) : undefined))
}
// --
