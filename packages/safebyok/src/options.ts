import * as Z from 'zod/mini'
import { VaultError } from './errors'
import { isPlainBag } from './types'

/** The parse options that have Zod say what it refused in its own English, where zod/mini alone says only "Invalid input".
 * Hand it to each parse: `Z.config` would change the host's Zod too. A schema's own message wins.
 * Zod then names a refused value's type, never the value, though it quotes a bag's field names.
 *
 * @example const checked = schema.safeParse(candidate, InEnglish)
 */
export const InEnglish = { error: Z.locales.en().localeError }

/** What a parse handed {@link InEnglish} refused, in Zod's words: each issue's message, after the path to its field.
 *
 * @example issuesText(Z.strictObject({}).safeParse({ staleMinute: 0 }, InEnglish).error)  // 'Unrecognized key: "staleMinute"'
 * @example issuesText(Z.object({ leaseHours: Z.number() }).safeParse({ leaseHours: 'week' }, InEnglish).error)  // 'leaseHours: Invalid input: expected number, received string'
 */
export const issuesText = (err: Z.core.$ZodError): string => err.issues.map((issue) => (
  issue.path.length === 0 ? issue.message : `${Z.core.toDotPath(issue.path)}: ${issue.message}`
)).join('; ')

/** A check, made once, of a host's bag of options: it hands the bag back as given once it is left out, or holds only fields of `shape` that pass.
 * It refuses 'bad_option' otherwise, so a misspelt option is not quietly ignored. The refusal says
 * what Zod found, naming fields but quoting no value, then `said`.
 *
 * @param shape - Each field the bag may hold, and its schema; wrap one in `Z.optional` to let it
 *   be left out.
 * @param notBagHint - Said too when what was handed in is no plain bag: what it most likely was,
 *   and what to do instead.
 *
 * @example
 *   const checkStoreOpts = optionsCheck({ sidecar: Z.optional(Z.unknown()) }, "putBox()'s only option is `sidecar`.")
 *   checkStoreOpts({ sidecar: { note: 'work' } }) // the same bag
 *   checkStoreOpts({ note: 'work' })              // throws: bad_option, 'Unrecognized key: "note". putBox()'s only option is `sidecar`.'
 */
export const optionsCheck = (shape: Z.core.$ZodLooseShape, said: string, notBagHint?: string) => {
  const schema = Z.optional(Z.strictObject(shape))
  return <Bag>(candidate: Bag): Bag => {
    const checked = schema.safeParse(candidate, InEnglish)
    if (checked.success) { return candidate }
    const hint = notBagHint !== undefined && ! isPlainBag(candidate) ? ` ${notBagHint}` : ''
    throw new VaultError('bad_option', `${issuesText(checked.error)}. ${said}${hint}`)
  }
}
