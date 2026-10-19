import * as Z from 'zod/mini'
import { VaultError } from './errors'

/**
 * A check of a host's bag of options, made once, for a call to run on each bag handed in: the bag,
 * exactly as handed in, once it is left out or is an object holding only fields `shape` knows,
 * each passing its schema. Kind 'bad_option', saying `said`, otherwise, so a misspelt option, or
 * one this version no longer takes, is refused at once rather than quietly ignored. `said` names
 * the fields there are and what to do; it never quotes the bag, which may hold anything.
 *
 * @param shape - Each field the bag may hold, and its schema; wrap a field's schema in
 *   `Z.optional` to let it be left out.
 * @param said - The refusal's message: what the bag may hold, and what to check.
 * @returns The check, which hands back the bag it was given.
 *
 * @example
 *   const checkStoreOpts = optionsCheck({ sidecar: Z.optional(Z.unknown()) }, "storeBox()'s only option is `sidecar`.")
 *   checkStoreOpts({ sidecar: { note: 'work' } }) // the same bag
 *   checkStoreOpts({ note: 'work' })              // throws: bad_option
 */
export const optionsCheck = (shape: Z.core.$ZodLooseShape, said: string) => {
  const schema = Z.optional(Z.strictObject(shape))
  return <Bag>(candidate: Bag): Bag => {
    if (! schema.safeParse(candidate).success) { throw new VaultError('bad_option', said) }
    return candidate
  }
}
