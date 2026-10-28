import { VaultError, isVaultError } from './errors'
import * as Refusals from './refusals'

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

/** `val` as the outcome of a call that succeeded.
 *
 * @example good(vaultRecord)  // { ok: true, val: vaultRecord }
 */
export const good = <ValT>(val: ValT): GoodOutcome<ValT> => ({ ok: true, val })

/** `err` as the outcome of a call that was refused.
 *
 * @example bad(Refusals.staleDel())  // { ok: false, err }
 */
export const bad = (err: VaultError): BadOutcome => ({ ok: false, err })

/** The outcome of `thunk`, a body that refuses by throwing: what it returns as a good outcome, what it throws as a bad one. Never rejects.
 * A thrown VaultError is kept as it came, as {@link isVaultError} tells one. Anything else thrown
 * becomes the VaultError `otherwise` makes of it.
 *
 * @param otherwise - What a throw that is no VaultError becomes. By default it is an
 *   `unexpected_error`, its cause the throw: a bug, which a retry will not mend. A body that calls
 *   out to storage passes `Refusals.storageUnavailable`, so a caller knows a retry may help.
 *
 * @example
 *   const { ok, val, err } = await outcomeOf(() => fetchBackup(vaultlabel), Refusals.storageUnavailable)
 *   if (! ok) { showGripe(err.message) }
 * @example await outcomeOf(() => parseImport(file))   // a TypeError thrown: err.refusalkind 'unexpected_error', err.cause the TypeError
 * @example await outcomeOf(() => { throw new Error('socket closed') }, Refusals.storageUnavailable)  // err.refusalkind 'storage_unavailable', err.cause the Error
 */
export const outcomeOf = async <ValT>(thunk: () => ValT | Promise<ValT>, otherwise: (thrown: unknown) => VaultError = Refusals.unexpectedError): Promise<Outcome<ValT>> => {
  try {
    return good(await thunk())
  } catch (err) {
    return bad(isVaultError(err) ? err : otherwise(err))
  }
}

/** `thrown`, what a call out to storage threw, as the refusal a storage verb throws: a VaultError as it came, anything else `storage_unavailable` with `thrown` its cause.
 * The line every `VaultDB` verb applies to what its adapter's `do*` hook threw, for a server or an
 * adapter that relays a VaultDB's throw onward: a retry may help, where `outcomeOf`'s
 * `unexpected_error` says it will not. A `storage_unavailable` it makes carries safebyok's own
 * message, so a driver's words stay in the cause (`Refusals.storageUnavailable`).
 *
 * @example
 *   try { return await vaultDB.getBox(scope, boxlabel, expected) } catch (err) { throw crossing(storageTroubleOf(err)) }   // a server relaying a verb: a refusal as it came, a driver's Error as storage_unavailable
 */
export const storageTroubleOf = (thrown: unknown): VaultError => (isVaultError(thrown) ? thrown : Refusals.storageUnavailable(thrown))

/** `thrown` as the refusal it stands for: a VaultError as it came, anything else as the 'unexpected_error' {@link Refusals.unexpectedError} makes of it, that throw its cause.
 * The one catch that ends a throwing form, in the Lease, Box and Bank methods alike: a bug in its
 * body (a TypeError, a rejection that is no refusal) reaches the caller as a VaultError, never raw,
 * and every refusal passes untouched. Its `try` twin is one `outcomeOf` over the throwing form.
 *
 * @example
 *   async cipheredWith(serialized: Uint8Array, visible: BoxSparse): Promise<BoxCiphered> {
 *     try {
 *       // ...the body, which throws its refusals
 *     } catch (err) {
 *       throw refusalOf(err)
 *     }
 *   }
 * @example refusalOf(new VaultError('vault_locked', 'The vault is locked.'))   // that VaultError, as it came
 * @example refusalOf(new TypeError('ctx is not a function'))   // a VaultError 'unexpected_error', the TypeError its cause
 */
export const refusalOf = (thrown: unknown): VaultError => (isVaultError(thrown) ? thrown : Refusals.unexpectedError(thrown))

/** `outcome`'s `val`, or its `err` thrown: the throwing form of a call that resolves an {@link Outcome}.
 *
 * @example const listed = valOf(await vaultDB.tryGetVault(scope))  // throws the refusal, if any: what vaultDB.getVault(scope) does itself
 * @example
 *   protected async doGetBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation): Promise<unknown> {
 *     return valOf(await this.inner.tryGetBox(scope, boxlabel, expected))   // or this.inner.getBox(...), which throws the same
 *   }
 */
export const valOf = <ValT>(outcome: Outcome<ValT>): ValT => {
  if (! outcome.ok) { throw outcome.err }
  return outcome.val
}
