import type { RefusalKind } from 'safebyok'

/** Every refusal safebyok's Convex functions throw, as the `kind` in a `ConvexError`'s `data`; the host's `getUserId` may throw them too.
 * Each is the `VaultError` kind of the same name. A failed expectation, and a box write with no
 * room, are not refusals: an update or delete resolves `false` or `null`, and a box write resolves
 * why it did not land.
 */
export const safebyokErrorKindVals = ['identity_revoked', 'not_permitted'] as const satisfies readonly RefusalKind[]
/** One of {@link safebyokErrorKindVals}. */
export type SafebyokErrorKind = typeof safebyokErrorKindVals[number]

/** The `data` of a `ConvexError` safebyok's functions throw: a `kind` to branch on, and a calm message.
 * Neither ever names a user or quotes a record.
 */
export type SafebyokErrorData = {
  kind:    SafebyokErrorKind
  message: string
}

/** True when `data`, a `ConvexError`'s, is one of safebyok's own refusals. */
export const isSafebyokErrorData = (data: unknown): data is SafebyokErrorData => (
  typeof data === 'object' && data !== null
  && (safebyokErrorKindVals as readonly unknown[]).includes((data as { kind?: unknown }).kind)
  && typeof (data as { message?: unknown }).message === 'string'
)
