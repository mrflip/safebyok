import { expect } from 'vitest'
import { type RefusalKind, VaultError } from '../../src/errors'
import type { Outcome } from '../../src/outcome'

export { good, bad } from '../../src/outcome'


/** What {@link expectRefusal} sees in place of an error when the operation resolved. */
const NotRefused = Symbol('not refused')

/**
 * The VaultError `operation` rejected with, once the test has checked it is one, of `refusalkind`; the
 * test fails if `operation` resolves, or rejects with anything else: a plain Error, one that only
 * names itself a VaultError, a VaultError of another kind.
 *
 * @param operation - The call that should refuse.
 * @param refusalkind - The refusal's expected `refusalkind`.
 * @returns The refusal, for a closer look at its message or cause.
 *
 * @example await TH.expectRefusal(vault.getBox('anthropic_api_key'), 'vault_locked')
 * @example
 *   const err = await TH.expectRefusal(TH.settledVault(TH.omitting(opts, 'keyDeriver')), 'bad_option')
 *   expect(err.message).to.include('safebyok/browser')
 */
export const expectRefusal = async (operation: Promise<unknown>, refusalkind: RefusalKind): Promise<VaultError> => {
  let refusal: unknown = NotRefused
  try {
    await operation
  } catch (err) {
    refusal = err
  }
  expect(refusal, `expected a refusal of refusalkind '${refusalkind}', but the operation resolved: expectBad checks a call that resolves an Outcome`).to.not.eq(NotRefused)
  expect(refusal).to.be.instanceOf(VaultError)
  expect(refusal).to.have.property('refusalkind', refusalkind)
  return refusal as VaultError
}

/**
 * The `val` of the good Outcome `operation` resolved to, once the test has checked it is one; the
 * test fails, naming the refusal, if it resolved a bad one, and with the rejection if it rejected,
 * which no Outcome-returning call may.
 *
 * @param operation - The call that should succeed, or its outcome.
 * @returns Its `val`.
 *
 * @example expect(await TH.expectGood(vaultDB.getVaultProps(scope))).to.be.null
 */
export const expectGood = async <ValT>(operation: Outcome<ValT> | Promise<Outcome<ValT>>): Promise<ValT> => {
  const outcome = await operation
  expect(outcome.ok, `expected a good outcome, but it was refused: ${outcome.err?.refusalkind ?? ''} ${outcome.err?.message ?? ''}`).to.be.true
  return outcome.val as ValT
}

/** `DbT` with each verb that resolves an Outcome resolving its `val` instead: what {@link expectingGood} hands back. */
export type ExpectingGood<DbT> = {
  [CkeyT in keyof DbT]: DbT[CkeyT] extends (...args: infer ArgsT) => Promise<Outcome<infer ValT>> ? (...args: ArgsT) => Promise<ValT> : DbT[CkeyT]
}

/**
 * `db` -- a VaultDB, or anything whose verbs resolve Outcomes -- with each such verb resolving its
 * good Outcome's `val`, once {@link expectGood} has checked it is one: the test fails, naming the
 * refusal, on a bad one. Every other member is `db`'s own.
 *
 * @param db - The store whose answers the test reads.
 * @returns `db`, its verbs answering with their `val`s.
 *
 * @example expect(await TH.expectingGood(vaultDB).getBox(scope, 'anthropic')).to.be.null
 */
export const expectingGood = <DbT extends object>(db: DbT): ExpectingGood<DbT> => new Proxy(db, {
  get: (target, prop) => {
    const member: unknown = Reflect.get(target, prop, target)
    if (typeof member !== 'function') { return member }
    return (...args: unknown[]) => {
      const answer: unknown = member.apply(target, args)
      return answer instanceof Promise ? goodValOf(answer) : answer
    }
  },
}) as ExpectingGood<DbT>

/** What `answer` settles to: a good Outcome's `val`, once checked, or anything else as it came. */
const goodValOf = async (answer: Promise<unknown>): Promise<unknown> => {
  const settled = await answer
  return isOutcome(settled) ? expectGood(settled) : settled
}

/** True for an Outcome, good or bad. */
const isOutcome = (settled: unknown): settled is Outcome<unknown> => (
  typeof settled === 'object' && settled !== null && 'ok' in settled && typeof settled.ok === 'boolean'
)

/**
 * The VaultError of the bad Outcome `operation` resolved to, once the test has checked it is one,
 * of `refusalkind`; the test fails if it resolved a good one, if it rejected (which no
 * Outcome-returning call may), or if its `err` is anything but a VaultError of that kind.
 *
 * @param operation - The call that should refuse, or its outcome.
 * @param refusalkind - The refusal's expected `refusalkind`.
 * @returns The refusal, for a closer look at its message, cause or meta.
 *
 * @example await TH.expectBad(vaultDB.putBox(scope, box, TH.noBoxYet), 'stale_write')
 */
export const expectBad = async (operation: Outcome<unknown> | Promise<Outcome<unknown>>, refusalkind: RefusalKind): Promise<VaultError> => {
  const outcome = await operation
  expect(outcome.ok, `expected a refusal of refusalkind '${refusalkind}', but the outcome was good`).to.be.false
  expect(outcome.err).to.be.instanceOf(VaultError)
  expect(outcome.err).to.have.property('refusalkind', refusalkind)
  return outcome.err!
}

/**
 * Asserts that `attempt` throws, there and then, a VaultError of `refusalkind`, and returns it: the
 * synchronous twin of {@link expectRefusal}, for a check that throws rather than rejects.
 *
 * @param attempt - The call expected to throw.
 * @param refusalkind - The refusal's expected `refusalkind`.
 * @returns The refusal, for a closer look at its message.
 *
 * @example TH.expectSyncRefusal(() => Ckeys.box({ ...scope, user_id: 'a^b' }, 'x'), 'bad_label')
 */
export const expectSyncRefusal = (attempt: () => unknown, refusalkind: RefusalKind): VaultError => {
  let refusal: unknown = NotRefused
  try {
    attempt()
  } catch (err) {
    refusal = err
  }
  expect(refusal, `expected a refusal of refusalkind '${refusalkind}', but the call returned`).to.not.eq(NotRefused)
  expect(refusal).to.be.instanceOf(VaultError)
  expect(refusal).to.have.property('refusalkind', refusalkind)
  return refusal as VaultError
}

/**
 * `bag` with its `ckey` field left out, still typed as the whole bag: for a test that an
 * entrypoint refuses a caller who forgot a required option, which `exactOptionalPropertyTypes`
 * otherwise lets a test write only with a cast.
 *
 * @param bag - A complete bag of options.
 * @param ckey - The field to leave out.
 * @returns A copy of `bag` without that field.
 *
 * @example TH.settledVault(TH.omitting(opts, 'keyDeriver'))  // refuses: no keyDeriver
 */
export const omitting = <Bag extends object>(bag: Bag, ckey: keyof Bag): Bag => {
  const { [ckey]: _omitted, ...rest } = bag
  return rest as Bag
}
