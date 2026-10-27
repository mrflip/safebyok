import { VaultError, isVaultError } from './errors'
import { Validator } from './checks/validator'

/** The options the IndexedDB device store and `browserOpts` share, and their parser. Only the type is public, through `safebyok/idb`. */

export type IdbOpts = {
  /** The IndexedDB database to keep records in: a name, never empty. Default 'safebyok'. */
  dbName?: string | undefined
}

const DefaultDbName = 'safebyok'

/** What the IndexedDB options hold, and nothing else: `dbName`, defaulted. Its `parse` refuses 'bad_option'. safebyok-indexeddb's options extend it. */
export const { idbOpts } = Validator('bad_option', ({ obj, str }) => ({ idbOpts: obj({ dbName: str.min(1).default(DefaultDbName) }).strict() }))

/** The database an adapter keeps its records in: `opts.dbName`, or 'safebyok'.
 * It refuses 'bad_option' for a name that is not non-empty text, or a field the options do not
 * take, quoting none of it.
 *
 * @param said - The function the host called, as the refusal names it.
 *
 * @example parseDbName({ dbName: 'acme' }, 'idbDeviceDB')  // 'acme'
 * @example parseDbName({ dbname: 'acme' }, 'browserOpts')  // throws 'bad_option': a field it does not take
 */
export const parseDbName = (opts: IdbOpts | undefined, said: string): string => {
  try {
    return idbOpts.parse(opts ?? {}).dbName
  } catch (err) {
    if (! isVaultError(err, 'bad_option')) { throw err }
    throw new VaultError('bad_option', `${said} takes an optional dbName, the name of the IndexedDB database to keep records in, non-empty text ('${DefaultDbName}' when left out): ${err.message}.`, err.meta === undefined ? {} : { meta: err.meta })
  }
}
