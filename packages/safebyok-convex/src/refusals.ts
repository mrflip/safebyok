/** Refusals that the host's safebyok functions send to the client as a `ConvexError`. The client rethrows each as a VaultError of the same kind. */

import * as DB from 'safebyok-big/storage'

/** The refusal kinds a `ConvexError` from the host's safebyok functions may carry:
 * `identity_revoked` from the wrapper, and the kinds the core throws inside the component.
 */
export const safebyokErrorKindVals = ['identity_revoked', 'bad_record', 'damaged_row', 'damaged_vault', 'storage_issue'] as const

/** The refusal kinds that reach the client with the core's message and nothing else. The core throws them for an `ask` or a stored row that fails its checks. */
export const sentenceKindVals = ['bad_record', 'damaged_row', 'damaged_vault', 'storage_issue'] as const

/** One of {@link safebyokErrorKindVals}. */
export type SafebyokErrorKind = typeof safebyokErrorKindVals[number]

/** The `data` of a `ConvexError` that carries a refusal. Every kind but `identity_revoked` has the core's message. */
export type SafebyokErrorData =
  | { kind: 'identity_revoked' }
  | { kind: typeof sentenceKindVals[number], message: string }

/** Validator for {@link SafebyokErrorData}, as the client receives it. */
export const safebyokErrorData = DB.Checker(({ discrim, obj, lit, oneof, str }) => discrim('kind', [
  obj({ kind: lit('identity_revoked') }),
  obj({ kind: oneof(sentenceKindVals), message: str }),
]), 'unexpected_error')

true satisfies DB.AssertEqual<SafebyokErrorKind, 'identity_revoked' | typeof sentenceKindVals[number]>

/** True when `data`, from a `ConvexError`, is a {@link SafebyokErrorData}. */
export function isSafebyokErrorData(data: unknown): data is SafebyokErrorData {
  return safebyokErrorData.safeParse(data).success
}
