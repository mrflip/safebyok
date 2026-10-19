import { expect } from 'vitest'
import { type VaultErrorKind, VaultError } from '../../src/errors'


/** What {@link expectRefusal} sees in place of an error when the operation resolved. */
const NotRefused = Symbol('not refused')

/**
 * The VaultError `operation` rejected with, once the test has checked it is one, of `kind`; the
 * test fails if `operation` resolves, or rejects with anything else: a plain Error, a lookalike
 * from another copy of the package, a VaultError of another kind.
 *
 * @param operation - The call that should refuse.
 * @param kind - The refusal's expected `kind`.
 * @returns The refusal, for a closer look at its message or cause.
 *
 * @example await TH.expectRefusal(vault.readBox('anthropic_api_key'), 'vault_locked')
 * @example
 *   const err = await TH.expectRefusal(TH.settledVault(TH.omitting(opts, 'keyDeriver')), 'bad_option')
 *   expect(err.message).to.include('safebyok/browser')
 */
export const expectRefusal = async (operation: Promise<unknown>, kind: VaultErrorKind): Promise<VaultError> => {
  let refusal: unknown = NotRefused
  try {
    await operation
  } catch (err) {
    refusal = err
  }
  expect(refusal, `expected a refusal of kind '${kind}', but the operation resolved`).to.not.eq(NotRefused)
  expect(refusal).to.be.instanceOf(VaultError)
  expect(refusal).to.have.property('kind', kind)
  return refusal as VaultError
}

/**
 * Asserts that `attempt` throws, there and then, a VaultError of kind `kind`, and returns it: the
 * synchronous twin of {@link expectRefusal}, for a check that throws rather than rejects.
 *
 * @param attempt - The call expected to throw.
 * @param kind - The refusal's expected `kind`.
 * @returns The refusal, for a closer look at its message.
 *
 * @example TH.expectSyncRefusal(() => Ckeys.box({ ...scope, user_id: 'a^b' }, 'x'), 'bad_label')
 */
export const expectSyncRefusal = (attempt: () => unknown, kind: VaultErrorKind): VaultError => {
  let refusal: unknown = NotRefused
  try {
    attempt()
  } catch (err) {
    refusal = err
  }
  expect(refusal, `expected a refusal of kind '${kind}', but the call returned`).to.not.eq(NotRefused)
  expect(refusal).to.be.instanceOf(VaultError)
  expect(refusal).to.have.property('kind', kind)
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
