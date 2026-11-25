/** Refusals that the host's safebyok functions send to the client as a `ConvexError`. The client rethrows each as a VaultError of the same kind. */

import * as DB from 'safebyok/storage'

/** The refusal kinds a `ConvexError` from the host's safebyok functions may carry:
 * `identity_revoked` from the wrapper, and `bad_record` for an ask the component's own check refuses.
 */
export const safebyokErrorkindVals = ['identity_revoked', 'bad_record'] as const

/** One of {@link safebyokErrorkindVals}. */
export type SafebyokErrorkind = typeof safebyokErrorkindVals[number]

/** A refusal as a `ConvexError` carries it, in its `data`. A `bad_record` has the core's message. */
export type SafebyokRefusal =
  | { kind: 'identity_revoked' }
  | { kind: 'bad_record', message: string }

/** Validator for {@link SafebyokRefusal}, as the client receives it. */
export const safebyokRefusal = DB.Checker(({ discrim, obj, lit, str }) => discrim('kind', [
  obj({ kind: lit('identity_revoked') }),
  obj({ kind: lit('bad_record'), message: str }),
]), 'unexpected_error')

// The kinds are written three times, in the list, the type and the checker; these tie each to the next.
true satisfies DB.AssertEqual<SafebyokErrorkind, SafebyokRefusal['kind']>
true satisfies DB.AssertEqual<SafebyokRefusal, DB.CheckerInput<typeof safebyokRefusal>>

/** True when `val`, a `ConvexError`'s `data`, is a {@link SafebyokRefusal}. */
export function isSafebyokRefusal(val: unknown): val is SafebyokRefusal {
  return safebyokRefusal.safeParse(val).success
}
