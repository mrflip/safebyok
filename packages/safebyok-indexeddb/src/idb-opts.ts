import * as Z from 'zod/mini'
import { VaultError, type VaultDBOpts } from 'safebyok'

/** What `idbVaultDB` and `inspectIdbVaultDB` are made with: the database, and optionally a logger. */
export type IdbVaultDBOpts = VaultDBOpts & {
  /**
   * The name the IndexedDB databases are made under: non-empty text, default 'safebyok'. Pass the
   * same one to `browserOpts`, and the vault and its device store sit side by side.
   */
  dbName?: string | undefined
}

const DefaultDbName = 'safebyok'

const dbName = Z.string().check(Z.minLength(1))
const idbVaultDBOpts = Z.object({ dbName: Z._default(dbName, DefaultDbName) })

/**
 * The database name a call was handed: `opts.dbName`, or 'safebyok' when there is none. Kind
 * 'bad_option' for anything else, quoting none of it.
 *
 * @param opts - What the host handed the call, or nothing.
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

/**
 * The change bell of the vault shelf in `dbName`: every write rings it, here and in every other
 * tab. Its name is shared with every other tab, and with any other version of this package running
 * in one, so it stays as it is.
 *
 * @example ChangeBell.ring(bellnameOf('acme'))  // 'safebyok-idb:acme:vault_db'
 */
export const bellnameOf = (dbName: string): string => `safebyok-idb:${dbName}:vault_db`
