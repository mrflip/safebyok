import { VaultError } from './errors'
import { Validator } from './checks/validator'

/** The options the IndexedDB device store and `browserOpts` share, and their parser. Only the type is public, through `safebyok/idb`. */

export type IdbOpts = {
  /** The IndexedDB database to keep records in: a name, never empty. Default 'safebyok'. */
  dbName?: string | undefined
}

const DefaultDbName = 'safebyok'

/** What the IndexedDB options hold, `dbName` defaulted, refusing 'bad_option'. */
export const { idbOpts } = Validator('bad_option', ({ obj, str }) => ({ idbOpts: obj({ dbName: str.min(1).default(DefaultDbName) }) }))

const badDbName = (said: string) => new VaultError('bad_option', `${said} takes an optional dbName, the name of the IndexedDB database to keep records in: non-empty text. Leave it out for '${DefaultDbName}'.`)

/** The database an adapter keeps its records in: `opts.dbName`, or 'safebyok'.
 * It refuses 'bad_option' for a name that is not non-empty text, quoting none of it.
 *
 * @param said - The function the host called, as the refusal names it.
 */
export const parseDbName = (opts: IdbOpts | undefined, said: string): string => {
  const checked = idbOpts.safeParse(opts ?? {})
  if (! checked.success) { throw badDbName(said) }
  return checked.data.dbName
}
