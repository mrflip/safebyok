import { Checkers, idbOpts, type VaultDBOpts } from 'safebyok'

/** What `idbVaultDB` and `inspectIdbVaultDB` are made with; `inspectIdbVaultDB` ignores `logger`. */
export type IdbVaultDBOpts = VaultDBOpts & {
  /** The name the IndexedDB databases are made under: non-empty text, default 'safebyok'.
   * Pass the same one to `browserOpts`, and the vault and its device store sit side by side.
   */
  dbName?: string | undefined
}

/** What the options hold, and nothing else: the core's IndexedDB options (`dbName`, defaulted), and the `logger` every VaultDB takes. Its `parse` refuses 'bad_option'. */
const { idbVaultDBOpts } = Checkers('bad_option', ({ unk }) => ({
  idbVaultDBOpts: idbOpts.extend({ logger: unk.optional() }).strict(),
}))

/** The database name a call was handed, or 'safebyok' without one.
 * Kind 'bad_option' for anything else, a field the options do not take among them, naming the call
 * the host made, quoting none of it.
 *
 * @param callname - The function the host called, as the refusal names it.
 *
 * @example parseDbName({ dbName: 'acme' }, 'idbVaultDB')  // 'acme'
 * @example parseDbName(undefined, 'idbVaultDB')           // 'safebyok'
 */
export const parseDbName = (opts: IdbVaultDBOpts | undefined, callname: string): string => idbVaultDBOpts.parse(opts ?? {}, { where: `In ${callname}'s options` }).dbName

/** The name of the change bell that every write to the shelf in `dbName` rings, in every tab.
 * Other tabs, and other versions of this package running in them, listen by this name: it never changes.
 *
 * @example ChangeBell.ring(bellnameOf('acme'))  // 'safebyok-idb:acme:vault_db'
 */
export const bellnameOf = (dbName: string): string => `safebyok-idb:${dbName}:vault_db`
