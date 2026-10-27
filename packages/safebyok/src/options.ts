import type * as Z from 'zod'
import { VaultError, isVaultError } from './errors'
import { type KitWith, Validator } from './checks/validator'

/** `err` with its message put in `said`'s words when it refuses a host's options, 'bad_option', its meta kept; any other throw as it is: how a check of options names the call the host made around what failed.
 *
 * @example
 *   try { return makeBankOpts.parse(opts) } catch (err) { throw optionsRefusal(err, (message) => `In Bank.make's options: ${message}.`) }
 */
export const optionsRefusal = (err: unknown, said: (message: string) => string): unknown => {
  if (! isVaultError(err, 'bad_option')) { return err }
  return new VaultError('bad_option', said(err.message), err.meta === undefined ? {} : { meta: err.meta })
}

/** Make a check of a host's options bag, which hands the bag back as given when it is left out or every field passes `fieldsOf`.
 * It refuses 'bad_option' otherwise, so a misspelt option is never quietly ignored. The message
 * names each field it judged, counts a field it does not take without naming it, quotes no value,
 * and ends with `said`.
 *
 * @param fieldsOf - Each field the bag may hold, and its schema, from the `Validator` kit; make
 *   one `.optional()` to let it be left out.
 *
 * @example
 *   const checkStoreOpts = optionsCheck(({ unk }) => ({ sidecar: unk.optional() }), "putBox()'s only option is `sidecar`.")
 *   checkStoreOpts({ sidecar: { note: 'work' } }) // the same bag
 *   checkStoreOpts({ note: 'work' })              // throws: bad_option, "There is a field it does not take ...: it takes only sidecar. ..."
 */
export const optionsCheck = (fieldsOf: (kit: KitWith<readonly []>) => Z.ZodRawShape, said: string) => {
  const { optionsBag } = Validator('bad_option', (kit) => ({ optionsBag: kit.obj(fieldsOf(kit)).strict().optional() }))
  return <Bag>(candidate: Bag): Bag => {
    try {
      optionsBag.parse(candidate)
      return candidate
    } catch (err) {
      throw optionsRefusal(err, (message) => `${message}. ${said}`)
    }
  }
}
