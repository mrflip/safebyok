import type * as Z from 'zod'
import { VaultError, isVaultError } from './errors'
import { type KitWith, Validator } from './checks/validator'

/** A check, made once, of a host's bag of options: it hands the bag back as given once it is left out, or holds only fields `fieldsOf` names that pass.
 * It refuses 'bad_option' otherwise, so a misspelt option is not quietly ignored. The refusal says
 * what failed, each field it judged by name, a field it does not take counted and never named,
 * quoting no value, then `said`.
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
      if (! isVaultError(err, 'bad_option')) { throw err }
      throw new VaultError('bad_option', `${err.message}. ${said}`, err.meta === undefined ? {} : { meta: err.meta })
    }
  }
}
