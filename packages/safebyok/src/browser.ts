/** `safebyok/browser`: the answers nearly every browser app gives to `Bank.make`'s options, so an app that answers otherwise never ships them. */

import { argon2idWebV1Deriver } from './key-deriver'
import { idbDeviceDB, type IdbOpts } from './idb'
import { parseDbName } from './idb-opts'
import type { MakeBankOpts } from './shapes/bank-opts'
import { zxcvbnStrengthChecker } from './zxcvbn-strength-checker'

export { MinPassphraseChars, MinZxcvbnScore, zxcvbnStrengthChecker } from './zxcvbn-strength-checker'

/** The Bank.make options {@link browserOpts} supplies: spread them in beside your own. */
export type BrowserOpts = Readonly<Pick<MakeBankOpts, 'keyDeriver' | 'deviceDB' | 'strengthChecker'>>

// One bag per dbName, so a React host may call browserOpts() during render: the provider reopens
// its vault whenever an option changes identity, and a fresh deviceDB each render would loop.
const bagsByDbName = new Map<string, BrowserOpts>()

/** A frozen bag of the browser's `keyDeriver`, `deviceDB` and `strengthChecker`, to spread into `Bank.make` beside your storage adapter.
 * They are {@link argon2idWebV1Deriver}, {@link idbDeviceDB} and {@link zxcvbnStrengthChecker}. A
 * field you pass after the spread wins. The same `dbName` always answers the same bag, so it is
 * safe to call during render. It refuses 'bad_option' for a `dbName` that is not non-empty text,
 * or an option it does not take.
 *
 * @param opts - Where the device store keeps its records: `dbName`, default 'safebyok'.
 *
 * @example
 *   const bank = Bank.make({ applabel: 'acme', user_id: session.user_id, vaultDB, ...browserOpts() })
 * @example
 *   const bank = Bank.make({ ...browserOpts({ dbName: 'acme' }), applabel: 'acme', user_id: session.user_id, vaultDB })
 * @example
 *   const bank = Bank.make({ ...browserOpts(), applabel: 'acme', user_id: session.user_id, vaultDB, strengthChecker: myStrengthChecker })
 * @example
 *   browserOpts({ dbName: 'acme' }) === browserOpts({ dbName: 'acme' })  // true
 */
export const browserOpts = (opts?: IdbOpts): BrowserOpts => {
  const dbName = parseDbName(opts, 'browserOpts')
  const cached = bagsByDbName.get(dbName)
  if (cached !== undefined) { return cached }
  const bag: BrowserOpts = Object.freeze({
    keyDeriver:      argon2idWebV1Deriver,
    deviceDB:        idbDeviceDB({ dbName }),
    strengthChecker: zxcvbnStrengthChecker,
  })
  bagsByDbName.set(dbName, bag)
  return bag
}
