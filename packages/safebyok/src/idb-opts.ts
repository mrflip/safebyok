import * as Z from 'zod/mini'
import { VaultError } from './errors'

/**
 * The options the IndexedDB device store and `browserOpts` share, and their parser: not an entry
 * point, so nothing here is public beyond the type `safebyok/idb` re-exports.
 */

export type IdbOpts = {
  /** The IndexedDB database to keep records in: a name, never empty. Default 'safebyok'. */
  dbName?: string | undefined
  /**
   * The one character the device store's ckeys join names on (`Ckeys`), which no name may then
   * hold: `^` when left out. Every vault on one database must be kept under the same one.
   */
  ckeyDelimiter?: string | undefined
}

const DefaultDbName = 'safebyok'

const dbName = Z.string().check(Z.minLength(1))
const idbOpts = Z.object({ dbName: Z._default(dbName, DefaultDbName), ckeyDelimiter: Z.optional(Z.string()) })

const badIdbOpts = (said: string) => new VaultError('bad_option', `${said} takes an optional dbName, the name of the IndexedDB database to keep records in, as non-empty text (leave it out for '${DefaultDbName}'), and an optional ckeyDelimiter, one character.`)

/**
 * The database an adapter keeps its records in: `opts.dbName`, or 'safebyok' when there is none.
 * Kind 'bad_option' for anything else, quoting none of it.
 *
 * @param opts - What the host handed the adapter, or nothing.
 * @param said - The function the host called, as the refusal names it.
 */
export const parseDbName = (opts: IdbOpts | undefined, said: string): string => parseIdbOpts(opts, said).dbName

/**
 * What an adapter was handed, checked: its `dbName`, 'safebyok' when there is none, and its
 * `ckeyDelimiter`, undefined when there is none. Kind 'bad_option' for anything else, quoting
 * none of it; the delimiter's own check is `Ckeys.joiner`'s.
 *
 * @param opts - What the host handed the adapter, or nothing.
 * @param said - The function the host called, as the refusal names it.
 */
export const parseIdbOpts = (opts: IdbOpts | undefined, said: string): { dbName: string, ckeyDelimiter?: string | undefined } => {
  const checked = idbOpts.safeParse(opts ?? {})
  if (! checked.success) { throw badIdbOpts(said) }
  return checked.data
}
