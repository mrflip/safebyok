import { VaultError, isVaultError } from './errors'
import * as Refusals from './refusals'

/** What a non-throwing safebyok call resolves to: a {@link GoodOutcome} holding its `val`, or a {@link BadOutcome} holding its refusal as `err`.
 * TypeScript narrows on `ok`.
 *
 * @example
 *   const { ok, val, err } = await vaultDB.getVault(scope)
 *   if (! ok) { return err }
 *   val  // VaultRecord | null
 */
export type Outcome<ValT> = GoodOutcome<ValT> | BadOutcome

/** A call that succeeded: `ok` true, and its answer as `val`. */
export type GoodOutcome<ValT> = { ok: true, val: ValT, err?: never }

/** A call that was refused: `ok` false, and the refusal as `err`, always a {@link VaultError}. */
export type BadOutcome = { ok: false, val?: never, err: VaultError }

/** `val` as the outcome of a call that succeeded.
 *
 * @example good(vaultRecord)  // { ok: true, val: vaultRecord }
 */
export const good = <ValT>(val: ValT): GoodOutcome<ValT> => ({ ok: true, val })

/** `err` as the outcome of a call that was refused.
 *
 * @example bad(Refusals.staleWrite('del'))  // { ok: false, err }
 */
export const bad = (err: VaultError): BadOutcome => ({ ok: false, err })

/** The outcome of `thunk`, a body that refuses by throwing: what it returns as a good outcome, what it throws as a bad one. Never rejects.
 * A thrown VaultError is kept as it came, as {@link isVaultError} tells one. Anything else thrown
 * becomes the VaultError `otherwise` makes of it.
 *
 * @param otherwise - What a throw that is no VaultError becomes. By default it is a
 *   `storage_unavailable`, its cause the throw, as suits a call out to storage. A body that calls
 *   nothing a retry could mend passes {@link unexpectedError}.
 *
 * @example
 *   const { ok, val, err } = await outcomeOf(() => fetchBackup(vaultlabel))
 *   if (! ok) { showGripe(err.message) }
 * @example await outcomeOf(() => { throw new Error('socket closed') })  // err.refusalkind 'storage_unavailable', err.cause the Error
 * @example await outcomeOf(() => parseImport(file), unexpectedError)   // err.refusalkind 'unexpected_error': a bug, not an outage
 */
export const outcomeOf = async <ValT>(thunk: () => ValT | Promise<ValT>, otherwise: (thrown: unknown) => VaultError = Refusals.storageUnavailable): Promise<Outcome<ValT>> => {
  try {
    return good(await thunk())
  } catch (err) {
    return bad(isVaultError(err) ? err : otherwise(err))
  }
}

/** An `unexpected_error` refusal, `thrown` its cause: a bug, in safebyok or in a function the app handed it.
 *
 * @example unexpectedError(new TypeError("Cannot read properties of undefined (reading 'passkey')"))
 */
export const unexpectedError = (thrown: unknown): VaultError => (
  new VaultError('unexpected_error', "Something went wrong that safebyok did not expect: a bug, in safebyok or in a function the app handed it (a storage adapter, say). Nothing was retried, and a retry is unlikely to help; what was thrown is this error's cause.", { cause: thrown ?? new Error('Nothing was thrown with it.') })
)

/** True for a value shaped as an {@link Outcome}: an answer handed up still wrapped, since a stored record never is one.
 *
 * @example isOutcomeShaped(await inner.getBox(scope, boxlabel, expected))  // true: the caller forgot valOf
 */
export const isOutcomeShaped = (candidate: unknown): boolean => (
  typeof candidate === 'object' && candidate !== null && typeof (candidate as { ok?: unknown }).ok === 'boolean' && ('val' in candidate || 'err' in candidate)
)

/** `outcome`'s `val`, or its `err` thrown: how a VaultDB that hands each call on to another unwraps each answer.
 *
 * @example const listed = valOf(await vaultDB.getVault(scope))  // throws the refusal, if any
 * @example
 *   protected async doGetBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation): Promise<unknown> {
 *     return valOf(await this.inner.getBox(scope, boxlabel, expected))
 *   }
 */
export const valOf = <ValT>(outcome: Outcome<ValT>): ValT => {
  if (! outcome.ok) { throw outcome.err }
  return outcome.val
}
