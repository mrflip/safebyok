import { VaultError } from './errors'
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
 * VaultError is kept as it came. Anything else -- a backend's own error, a thrown string, a
 * rejection with nothing -- becomes a VaultError of kind `storage_unavailable`, the thrown value as
 * its `cause`. It never rejects, so a call made through it is one `Outcome` whatever happens.
 *
 * @param thunk - The body to run, sync or async.
 * @returns Its outcome.
 *
 * @example
 *   const { ok, val, err } = await outcomeOf(() => fetchBackup(vaultlabel))
 *   if (! ok) { showGripe(err.message) }
 * @example await outcomeOf(() => { throw new Error('socket closed') })  // err.refusalkind 'storage_unavailable', err.cause the Error
 */
export const outcomeOf = async <ValT>(thunk: () => ValT | Promise<ValT>): Promise<Outcome<ValT>> => {
  try {
    return good(await thunk())
  } catch (err) {
    return bad(err instanceof VaultError ? err : Refusals.storageUnavailable(err))
  }
}

/**
 * `outcome`'s `val`, or its `err` thrown: an outcome handed to code that refuses by throwing.
 *
 * @example const vaultProps = valOf(await vaultDB.getVaultProps(scope))  // throws the refusal, if any
 */
export const valOf = <ValT>(outcome: Outcome<ValT>): ValT => {
  if (! outcome.ok) { throw outcome.err }
  return outcome.val
}
