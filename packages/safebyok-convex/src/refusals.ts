/** The refusals the host's wrapper throws as a `ConvexError`, for the client to read back as the VaultError of the same kind. */

/** Each `kind` a `ConvexError` from the wrapper carries. */
export const safebyokErrorKindVals = ['identity_revoked'] as const

/** One of {@link safebyokErrorKindVals}. */
export type SafebyokErrorKind = typeof safebyokErrorKindVals[number]

/** The `data` of a `ConvexError` the wrapper throws. */
export type SafebyokErrorData = { kind: SafebyokErrorKind }

/** True when `data`, a `ConvexError`'s, is one of the wrapper's refusals. */
export const isSafebyokErrorData = (data: unknown): data is SafebyokErrorData => (
  (typeof data === 'object') && (data !== null) && ('kind' in data) && (safebyokErrorKindVals as readonly unknown[]).includes(data.kind)
)
