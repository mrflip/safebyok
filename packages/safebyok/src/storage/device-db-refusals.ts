/** The refusals of a deviceDB. */

import { VaultError, thrownNameOf } from '../refusals/errors'

/** A store's failure as `storage_unavailable`, naming the verb and the thrown `name` and nothing else: the store is handed every lease row, and what it throws may quote one. */
export const storeFailed = (call: string, thrown: unknown): VaultError => {
  const thrownName = thrownNameOf(thrown)
  const named = (thrownName === null) ? '' : ` It threw ${thrownName}.`
  return new VaultError('storage_unavailable', `This device's own storage failed in ${call}: try again.${named}`)
}
