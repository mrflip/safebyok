import * as Z from 'zod/mini'
import { VaultError } from './errors'
import { isPlainBag } from './types'

/** The parse options that have Zod say what it refused in its own English.
 * zod/mini alone says only "Invalid input". Handed to each parse, never set with `Z.config`,
 * which would change the host's Zod too. A message a schema gives itself wins over these. In
 * English, Zod names a refused value's type, never the value; it does quote a bag's field names.
 *
 * @example const checked = schema.safeParse(candidate, InEnglish)
 */
export const InEnglish = { error: Z.locales.en().localeError }

/** What a parse refused, in Zod's words: each issue's message, after the path to its field.
 * Run on an error from a parse handed {@link InEnglish}.
 *
 * @example issuesText(Z.strictObject({}).safeParse({ staleMinute: 0 }, InEnglish).error)  // 'Unrecognized key: "staleMinute"'
 * @example issuesText(Z.object({ leaseHours: Z.number() }).safeParse({ leaseHours: 'week' }, InEnglish).error)  // 'leaseHours: Invalid input: expected number, received string'
 */
export const issuesText = (err: Z.core.$ZodError): string => err.issues.map((issue) => (
  issue.path.length === 0 ? issue.message : `${Z.core.toDotPath(issue.path)}: ${issue.message}`
)).join('; ')

/**
 * A check of a host's bag of options, made once, for a call to run on each bag handed in: the bag,
 * exactly as handed in, once it is left out or is an object holding only fields `shape` knows,
 * each passing its schema. Kind 'bad_option' otherwise, so a misspelt option, or one this version
 * no longer takes, is refused at once rather than quietly ignored. The refusal says what Zod
 * found, naming the fields but quoting no value, then `said`; and, for something handed in that
 * is no plain bag, `notBagHint` after that.
 *
 * @param shape - Each field the bag may hold, and its schema; wrap a field's schema in
 *   `Z.optional` to let it be left out.
 * @param said - What the bag may hold, and what to check.
 * @param notBagHint - What, other than a bag, was most likely handed in, and what to do instead.
 * @returns The check, which hands back the bag it was given.
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
