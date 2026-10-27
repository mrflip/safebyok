import { Validator, Validators, VaultError, isVaultError, type VaultDBOpts } from 'safebyok'

/** What `idbVaultDB` and `inspectIdbVaultDB` are made with; `inspectIdbVaultDB` ignores `logger`. */
export type IdbVaultDBOpts = VaultDBOpts & {
  /** The name the IndexedDB databases are made under: non-empty text, default 'safebyok'.
   * Pass the same one to `browserOpts`, and the vault and its device store sit side by side.
   */
  dbName?: string | undefined
}

/** The database a call names when it names none: the core's own, so the vault and its device store sit side by side. */
const DefaultDbName = Validators.idbOpts.parse({}).dbName

/** What the options hold, and nothing else: the core's IndexedDB options (`dbName`, defaulted), and the `logger` every VaultDB takes. Its `parse` refuses 'bad_option'. */
const { idbVaultDBOpts } = Validator('bad_option', ({ unk }) => ({
  idbVaultDBOpts: Validators.idbOpts.extend({ logger: unk.optional() }).strict(),
}))

/** The database name a call was handed, or 'safebyok' without one.
 * Kind 'bad_option' for anything else, a field the options do not take among them, quoting none of it.
 *
 * @param said - The function the host called, as the refusal names it.
 *
 * @example parseDbName({ dbName: 'acme' }, 'idbVaultDB')  // 'acme'
 * @example parseDbName(undefined, 'idbVaultDB')           // 'safebyok'
 */
export const parseDbName = (opts: IdbVaultDBOpts | undefined, said: string): string => {
  try {
    return idbVaultDBOpts.parse(opts ?? {}).dbName
  } catch (err) {
    if (! isVaultError(err, 'bad_option')) { throw err }
    throw new VaultError('bad_option', `${said} takes an optional dbName, the name of the IndexedDB database to keep records in, non-empty text ('${DefaultDbName}' when left out), and an optional logger: ${err.message}.`, err.meta === undefined ? {} : { meta: err.meta })
  }
}

/** The name of the change bell that every write to the shelf in `dbName` rings, in every tab.
 * Other tabs, and other versions of this package running in them, listen by this name: it never changes.
 *
 * @example ChangeBell.ring(bellnameOf('acme'))  // 'safebyok-idb:acme:vault_db'
 */
export const bellnameOf = (dbName: string): string => `safebyok-idb:${dbName}:vault_db`
