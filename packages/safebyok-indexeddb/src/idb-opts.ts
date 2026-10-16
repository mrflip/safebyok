import * as Z from 'zod/mini'
import { VaultError } from 'safebyok'

/** What `idbVaultDB` and `inspectIdbVaultDB` are made with. */
export type IdbVaultDBOpts = {
  /**
   * The name the IndexedDB databases are made under: non-empty text, default 'safebyok'. Pass the
   * same one to `browserOpts`, and the vault and its device store sit side by side.
   */
  dbName?: string | undefined
  /**
   * The one character the rows' ckeys join names on (the core's `Ckeys`), which no name may then
   * hold: `^` when left out. Every vault in one database must be kept under the same one.
   */
  ckeyDelimiter?: string | undefined
}

const DefaultDbName = 'safebyok'

const dbName = Z.string().check(Z.minLength(1))
const idbVaultDBOpts = Z.object({ dbName: Z._default(dbName, DefaultDbName), ckeyDelimiter: Z.optional(Z.string()) })

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
export const parseDbName = (opts: IdbVaultDBOpts | undefined, said: string): string => parseIdbVaultDBOpts(opts, said).dbName

/**
 * What a call was handed, checked: its `dbName`, 'safebyok' when there is none, and its
 * `ckeyDelimiter`, undefined when there is none. Kind 'bad_option' for anything else, quoting
 * none of it; the delimiter's own check is `Ckeys.joiner`'s.
 *
 * @param opts - What the host handed the call, or nothing.
 * @param said - The function the host called, as the refusal names it.
 *
 * @example parseIdbVaultDBOpts({ dbName: 'acme', ckeyDelimiter: '/' }, 'idbVaultDB')  // { dbName: 'acme', ckeyDelimiter: '/' }
 */
export const parseIdbVaultDBOpts = (opts: IdbVaultDBOpts | undefined, said: string): { dbName: string, ckeyDelimiter?: string | undefined } => {
  const checked = idbVaultDBOpts.safeParse(opts ?? {})
  if (! checked.success) {
    throw new VaultError('bad_option', `${said} takes an optional dbName, the name of the IndexedDB database to keep records in, as non-empty text (leave it out for '${DefaultDbName}'), and an optional ckeyDelimiter, one character.`)
  }
  return checked.data
}
