/** The refusals that cross from the host's functions to the client as a `ConvexError`. The client turns each back into a VaultError of its kind. */

import * as DB from 'safebyok/storage'
import type { Value } from 'convex/values'

/** The kinds of refusal that cross: the wrapper's `identity_revoked`, and those the core throws inside the component for an ask or a row stored. */
export const safebyokErrorKindVals = ['identity_revoked', 'bad_record', 'damaged_row', 'damaged_vault', 'storage_issue', 'gate_issue'] as const

/** The kinds the core throws inside the component that cross with its sentence alone: an ask that fails its checks, and a row stored that fails its own. */
export const sentenceKindVals = ['bad_record', 'damaged_row', 'damaged_vault', 'storage_issue'] as const

/** One of {@link safebyokErrorKindVals}. */
export type SafebyokErrorKind = typeof safebyokErrorKindVals[number]

/** The `data` of a `ConvexError` that carries a refusal: its kind; the core's sentence, but on `identity_revoked`; and on `gate_issue`, the vault row tested. */
export type SafebyokErrorData =
  | { kind: 'identity_revoked' }
  | { kind: typeof sentenceKindVals[number], message: string }
  | { kind: 'gate_issue', message: string, world: Value }

/** The check of a crossed refusal's `data`, as the client receives it. */
export const safebyokErrorData = DB.Checker(({ discrim, obj, lit, oneof, str }) => discrim('kind', [
  obj({ kind: lit('identity_revoked') }),
  obj({ kind: oneof(sentenceKindVals), message: str }),
  obj({ kind: lit('gate_issue'), message: str, world: DB.vaultRow }),
]), 'unexpected_error')

true satisfies DB.AssertEqual<SafebyokErrorKind, 'identity_revoked' | 'gate_issue' | typeof sentenceKindVals[number]>

/** True when `data`, taken from a `ConvexError`, is one of the refusals that cross. */
export function isSafebyokErrorData(data: unknown): data is SafebyokErrorData {
  return safebyokErrorData.safeParse(data).success
}
