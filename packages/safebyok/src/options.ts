import type * as Z from 'zod'
import { VaultError, isVaultError } from './errors'
import { isPlainBag } from './types'
import { type KitWith, Validator } from './checks/validator'

/** A check, made once, of a host's bag of options: it hands the bag back as given once it is left out, or holds only fields `fieldsOf` names that pass.
 * It refuses 'bad_option' otherwise, so a misspelt option is not quietly ignored. The refusal says
 * what failed, each field by name where it is shaped as one of ours, quoting no value, then `said`.
 *
 * @param fieldsOf - Each field the bag may hold, and its schema, from the `Validator` kit; make
 *   one `.optional()` to let it be left out.
 * @param notBagHint - Said too when what was handed in is no plain bag: what it most likely was,
 *   and what to do instead.
 *
 * @example
 *   const checkStoreOpts = optionsCheck(({ unk }) => ({ sidecar: unk.optional() }), "putBox()'s only option is `sidecar`.")
 *   checkStoreOpts({ sidecar: { note: 'work' } }) // the same bag
 *   checkStoreOpts({ note: 'work' })              // throws: bad_option, "There is no field note: check its spelling, or leave it out. putBox()'s only option is `sidecar`."
 */
export const optionsCheck = (fieldsOf: (kit: KitWith<readonly []>) => Z.ZodRawShape, said: string, notBagHint?: string) => {
  const { optionsBag } = Validator('bad_option', (kit) => ({ optionsBag: kit.obj(fieldsOf(kit)).strict().optional() }))
  return <Bag>(candidate: Bag): Bag => {
    try {
      optionsBag.parse(candidate)
      return candidate
    } catch (err) {
      if (! isVaultError(err, 'bad_option')) { throw err }
      const hint = notBagHint === undefined || isPlainBag(candidate) ? '' : ` ${notBagHint}`
      throw new VaultError('bad_option', `${err.message}. ${said}${hint}`, err.meta === undefined ? {} : { meta: err.meta })
    }
  }
}
