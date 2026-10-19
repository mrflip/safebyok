import type { VaultErrorKind } from 'safebyok'

/**
 * Every refusal safebyok's Convex functions throw, as the `kind` in a `ConvexError`'s `data`. Each
 * is the `VaultError` kind of the same name, and the compiler holds the list to the core's
 * `VaultErrorKindVals`: `identity_revoked`, for a caller who is signed out or is not the vault's
 * user, on which the vault locks itself; `vault_full`, for a box write that would take the
 * vault past the component's limits.
 * A failed expectation is not a refusal: the update or delete resolves `false`.
 */
export const SafebyokErrorKindVals = ['identity_revoked', 'vault_full'] as const satisfies readonly VaultErrorKind[]
export type SafebyokErrorKind = typeof SafebyokErrorKindVals[number]

/**
 * The `data` of a `ConvexError` safebyok's functions throw: a `kind` to branch on, and a calm
 * message. Neither ever names a user or quotes a record.
 */
export type SafebyokErrorData = {
  kind:    SafebyokErrorKind
  message: string
}

/**
 * True when `data`, a `ConvexError`'s, is one of safebyok's own refusals. Shared by the server,
 * which throws them, and the client, which reads them back; it imports nothing from either.
 */
export const isSafebyokErrorData = (data: unknown): data is SafebyokErrorData => (
  typeof data === 'object' && data !== null
  && (SafebyokErrorKindVals as readonly unknown[]).includes((data as { kind?: unknown }).kind)
  && typeof (data as { message?: unknown }).message === 'string'
)
