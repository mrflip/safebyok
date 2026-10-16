import * as Z from 'zod/mini'
import { VaultError } from 'safebyok'

/** What `idbVaultDB` and `inspectIdbVaultDB` are made with. */
export type IdbVaultDBOpts = {
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
