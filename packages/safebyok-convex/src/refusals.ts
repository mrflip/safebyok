/** Refusals that the host's safebyok functions send to the client as a `ConvexError`. The client rethrows each as a VaultError of the same kind. */

import * as DB from 'safebyok-big/storage'

/** The refusal kinds a `ConvexError` from the host's safebyok functions may carry:
 * `identity_revoked` from the wrapper, and the kinds the core throws inside the component.
 */
export const safebyokErrorKindVals = ['identity_revoked', 'bad_record', 'bad_scope', 'damaged_row'] as const

/** The refusal kinds that reach the client with the core's message and nothing else.
 * The core throws them for an ask that fails its checks, and for a bank row that fails its checks in `tidyGone` or `watchRows`.
 */
export const sentenceKindVals = ['bad_record', 'bad_scope', 'damaged_row'] as const

/** One of {@link safebyokErrorKindVals}. */
export type SafebyokErrorKind = typeof safebyokErrorKindVals[number]

/** A refusal as a `ConvexError` carries it, in its `data`. Every kind but `identity_revoked` has the core's message. */
export type SafebyokRefusal =
  | { kind: 'identity_revoked' }
  | { kind: typeof sentenceKindVals[number], message: string }

/** Validator for {@link SafebyokRefusal}, as the client receives it. */
export const safebyokRefusal = DB.Checker(({ discrim, obj, lit, oneof, str }) => discrim('kind', [
  obj({ kind: lit('identity_revoked') }),
  obj({ kind: oneof(sentenceKindVals), message: str }),
]), 'unexpected_error')

true satisfies DB.AssertEqual<SafebyokErrorKind, 'identity_revoked' | typeof sentenceKindVals[number]>

/** True when `val`, a `ConvexError`'s `data`, is a {@link SafebyokRefusal}. */
export function isSafebyokRefusal(val: unknown): val is SafebyokRefusal {
  return safebyokRefusal.safeParse(val).success
}
