import { VaultError, isVaultError } from './errors'
import { storageUnavailable, unexpectedError } from './throwers'

/** The answer a non-throwing safebyok call resolves to: a {@link GoodOutcome} holding its `val`, or a {@link BadOutcome} holding its refusal as `err`.
 * TypeScript narrows on `ok`.
 *
 * @example
 *   const { ok, val, err } = await vaultDB.tryGetVault(scope)
 *   if (! ok) { return err }
 *   val  // VaultRecord | null
 */
export type Outcome<ValT> = GoodOutcome<ValT> | BadOutcome

/** The outcome of a call that succeeded, its answer as `val`. */
export type GoodOutcome<ValT> = { ok: true, val: ValT, err?: never }

/** The outcome of a call that was refused, its refusal as `err`. */
export type BadOutcome = { ok: false, val?: never, err: VaultError }

/** `val` as the outcome of a call that succeeded. */
export const good = <ValT>(val: ValT): GoodOutcome<ValT> => ({ ok: true, val })

/** `err` as the outcome of a call that was refused. */
export const bad = (err: VaultError): BadOutcome => ({ ok: false, err })

/** The outcome of `thunk`, a body that refuses by throwing: what it returns as a good outcome, what it throws as a bad one. Never rejects.
 * A thrown VaultError is kept as it came, as {@link isVaultError} tells one. Anything else thrown
 * becomes the VaultError `otherwise` makes of it.
 *
 * @param otherwise - What a throw that is no VaultError becomes. By default it is an
 *   `unexpected_error`, its cause the throw: a bug, which a retry will not mend. A body that calls
 *   out to storage passes `storageUnavailable`, so a caller knows a retry may help.
 *
 * @example
 *   const { ok, val, err } = await outcomeOf(() => fetchBackup(vaultlabel), storageUnavailable)
 *   if (! ok) { showGripe(err.message) }
 */
export const outcomeOf = async <ValT>(thunk: () => ValT | Promise<ValT>, otherwise: (thrown: unknown) => VaultError = unexpectedError): Promise<Outcome<ValT>> => {
  try {
    return good(await thunk())
  } catch (err) {
    return bad(isVaultError(err) ? err : otherwise(err))
  }
}

/** `thrown`, what a call out to storage threw, as the refusal a storage verb throws: a VaultError as it came, anything else `storage_unavailable` with `thrown` its cause.
 *
 * @example
 *   try { return await client.query(sql, params) } catch (err) { throw storageTroubleOf(err) }   // a driver's Error as storage_unavailable, its words kept in the cause
 */
export const storageTroubleOf = (thrown: unknown): VaultError => (isVaultError(thrown) ? thrown : storageUnavailable(thrown))

/** `outcome`'s `val`, or its `err` thrown: the throwing form of a call that resolves an {@link Outcome}.
 *
 * @example const listed = valOf(await vaultDB.tryGetVault(scope))  // throws the refusal, if any: what vaultDB.getVault(scope) does itself
 */
export const valOf = <ValT>(outcome: Outcome<ValT>): ValT => {
  if (! outcome.ok) { throw outcome.err }
  return outcome.val
}
