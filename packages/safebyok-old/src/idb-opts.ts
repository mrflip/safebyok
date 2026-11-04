import * as DX from './shapes/device'

/** The options the IndexedDB device store and `browserOpts` share, and their parser. Only the type is public, through `safebyok/idb` and, beside `idbOpts`, the main entry. */

export type IdbOpts = {
  /** The IndexedDB database to keep records in: a name, never empty. Default 'safebyok'. */
  dbName?: string | undefined
}

/** The database an adapter keeps its records in: `opts.dbName`, or 'safebyok'.
 * It refuses 'bad_option' for a name that is not non-empty text, or a field the options do not
 * take, naming the call the host made, quoting none of it.
 *
 * @param callname - The function the host called, as the refusal names it.
 *
 * @example parseDbName({ dbName: 'acme' }, 'idbDeviceDB')  // 'acme'
 * @example parseDbName({ dbname: 'acme' }, 'browserOpts')  // throws 'bad_option': "In browserOpts's options: There is a field it does not take ..."
 */
export const parseDbName = (opts: IdbOpts | undefined, callname: string): string => DX.idbOpts.parse(opts ?? {}, { where: `In ${callname}'s options` }).dbName
