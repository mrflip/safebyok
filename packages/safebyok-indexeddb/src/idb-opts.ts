import { object as obj, string as str } from 'zod'
import { VaultError, type VaultDBOpts } from 'safebyok'

/** What `idbVaultDB` and `inspectIdbVaultDB` are made with; `inspectIdbVaultDB` ignores `logger`. */
export type IdbVaultDBOpts = VaultDBOpts & {
  /** The name the IndexedDB databases are made under: non-empty text, default 'safebyok'.
   * Pass the same one to `browserOpts`, and the vault and its device store sit side by side.
   */
  dbName?: string | undefined
}

const DefaultDbName = 'safebyok'

/** What the options hold, `dbName` defaulted, as plain Zod: `parseDbName` refuses for it, in its own words. */
const idbVaultDBOpts = obj({ dbName: str().min(1).default(DefaultDbName) })

/** The database name a call was handed, or 'safebyok' without one.
 * Kind 'bad_option' for anything else, quoting none of it.
 *
 * @param said - The function the host called, as the refusal names it.
 *
 * @example parseDbName({ dbName: 'acme' }, 'idbVaultDB')  // 'acme'
 * @example parseDbName(undefined, 'idbVaultDB')           // 'safebyok'
 */
export const parseDbName = (opts: IdbVaultDBOpts | undefined, said: string): string => {
  const checked = idbVaultDBOpts.safeParse(opts ?? {})
  if (! checked.success) {
    throw new VaultError('bad_option', `${said} takes an optional dbName, the name of the IndexedDB database to keep records in: non-empty text. Leave it out for '${DefaultDbName}'.`)
  }
  return checked.data.dbName
}

/** The name of the change bell that every write to the shelf in `dbName` rings, in every tab.
 * Other tabs, and other versions of this package running in them, listen by this name: it never changes.
 *
 * @example ChangeBell.ring(bellnameOf('acme'))  // 'safebyok-idb:acme:vault_db'
 */
export const bellnameOf = (dbName: string): string => `safebyok-idb:${dbName}:vault_db`
