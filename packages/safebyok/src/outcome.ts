import { RefusalFamilyForKind, VaultError, isVaultError } from './errors'
import * as Refusals from './refusals'

/**
 * What a safebyok call resolves to, at every layer: a {@link GoodOutcome} holding its `val`, or a
 * {@link BadOutcome} holding its refusal as `err`. A refusal is data, never thrown: `ok` tells the
 * two apart, and TypeScript narrows on it.
 *
 * @example
 *   const { ok, val, err } = await vaultDB.getVaultProps(scope)
 *   if (! ok) { return err }
 *   val  // VaultProps | null
 */
export type Outcome<ValT> = GoodOutcome<ValT> | BadOutcome

/** A call that succeeded: `ok` true, and its answer as `val`. */
export type GoodOutcome<ValT> = { ok: true, val: ValT, err?: never }

/**
 * A call that was refused: `ok` false, and the refusal as `err`, always a {@link VaultError}, so
 * `throw err` always works.
 */
export type BadOutcome = { ok: false, val?: never, err: VaultError }

/**
 * `val` as the outcome of a call that succeeded.
 *
 * @example good(vaultProps)  // { ok: true, val: vaultProps }
 */
export const good = <ValT>(val: ValT): GoodOutcome<ValT> => ({ ok: true, val })

/**
 * `err` as the outcome of a call that was refused.
 *
 * @example bad(Refusals.staleWrite('box'))  // { ok: false, err }
 */
export const bad = (err: VaultError): BadOutcome => ({ ok: false, err })

/**
 * The outcome of `thunk`, a body that answers by returning and refuses by throwing: what it
 * returns, or resolves to, as a good outcome; what it throws, or rejects with, as a bad one. A
 * VaultError is kept as it came, one from another copy of safebyok loaded beside this one (an ESM
 * and a CJS build, side by side) included, as {@link isVaultError} tells them. Anything else -- a backend's own error, a thrown string, a
 * rejection with nothing -- becomes the VaultError `otherwise` makes of it: by default one of kind
 * `storage_unavailable`, the thrown value as its `cause`, as a call out to storage wants. It never
 * rejects, so a call made through it is one `Outcome` whatever happens.
 *
 * @param thunk - The body to run, sync or async.
 * @param otherwise - What a throw that is no VaultError becomes: by default `storage_unavailable`,
 *   which says "try again". A body that calls nothing a retry could mend says otherwise.
 * @returns Its outcome.
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

/**
 * A refusal of kind `unexpected_error`, `thrown` its cause: what a throw that is no VaultError
 * becomes where nothing a retry could mend was called -- a bug, in safebyok or in a function the
 * app handed it. It is misuse: fix the code, never retry.
 *
 * @param thrown - What was thrown, as it came.
 * @returns The refusal.
 *
 * @example unexpectedError(new TypeError("Cannot read properties of undefined (reading 'wayins')"))
 */
export const unexpectedError = (thrown: unknown): VaultError => (
  new VaultError('unexpected_error', "Something went wrong that safebyok did not expect: a bug, in safebyok or in a function the app handed it (a key deriver, a passphrase test, a passkey maker). Nothing was retried, and a retry is unlikely to help; what was thrown is this error's cause.", { cause: thrown ?? new Error('Nothing was thrown with it.') })
)

/**
 * The refusal in place of what a function the app handed the vault threw, when that function
 * hears the passphrase -- the key deriver, the passphrase strength test: a condition it raised
 * (its word list out of reach, an empty passphrase) as itself, from this copy of safebyok or
 * another loaded beside it, for the caller to show or retry; anything else, a VaultError of misuse
 * among them, as 'unexpected_error' with the throw as its cause, so that no message of its, which
 * may quote the passphrase, is ever the refusal's own.
 *
 * @param thrown - What the function threw, as it came.
 * @returns The refusal.
 */
export const hostThrewRefusal = (thrown: unknown): VaultError => (
  isVaultError(thrown) && RefusalFamilyForKind[thrown.refusalkind] !== 'misuse' ? thrown : unexpectedError(thrown)
)

/**
 * True for a value shaped as an {@link Outcome} -- `ok` a boolean, beside a `val` or an `err` --
 * which a stored record never is: an answer handed up still wrapped.
 *
 * @example isOutcomeShaped(await inner.getBox(scope, boxlabel))  // true: the caller forgot valOf
 */
export const isOutcomeShaped = (candidate: unknown): boolean => (
  typeof candidate === 'object' && candidate !== null && typeof (candidate as { ok?: unknown }).ok === 'boolean' && ('val' in candidate || 'err' in candidate)
)

/**
 * `outcome`'s `val`, or its `err` thrown: an outcome handed to code that refuses by throwing, as a
 * VaultDB that hands each call on to another must hand on each answer, unwrapped.
 *
 * @example const vaultProps = valOf(await vaultDB.getVaultProps(scope))  // throws the refusal, if any
 * @example
 *   protected async doGetBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
 *     return valOf(await this.inner.getBox(scope, boxlabel))
 *   }
 */
export const valOf = <ValT>(outcome: Outcome<ValT>): ValT => {
  if (! outcome.ok) { throw outcome.err }
  return outcome.val
}
