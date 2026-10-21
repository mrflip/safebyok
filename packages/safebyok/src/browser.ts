import { argon2idWebV1Deriver } from './key-deriver'
import { idbDeviceDB, type IdbOpts } from './idb'
import { parseDbName } from './idb-opts'
import type { MakeVaultOpts } from './vault-opts'
import { zxcvbnStrengthChecker } from './zxcvbn-strength-checker'

export { MinPassphraseChars, MinZxcvbnScore, zxcvbnStrengthChecker } from './zxcvbn-strength-checker'

/** `safebyok/browser`: the answers nearly every browser app gives to `Vault.make`'s options, so an app that answers otherwise never ships them. */

/** The Vault.make options {@link browserOpts} supplies: spread them in beside your own. */
export type BrowserOpts = Readonly<Pick<MakeVaultOpts, 'keyDeriver' | 'deviceDB' | 'strengthChecker'>>

// One bag per dbName, so a React host may call browserOpts() during render: the provider reopens
// its vault whenever an option changes identity, and a fresh deviceDB each render would loop.
const bagsByDbName = new Map<string, BrowserOpts>()

/** A frozen bag of the browser's `keyDeriver`, `deviceDB` and `strengthChecker`, to spread into `Vault.make` beside your storage adapter.
 * They are {@link argon2idWebV1Deriver}, {@link idbDeviceDB} and {@link zxcvbnStrengthChecker}. A
 * field you pass after the spread wins. The same `dbName` always answers the same bag, so it is
 * safe to call during render. It refuses 'bad_option' for a `dbName` that is not non-empty text.
 *
 * @param opts - Where the device store keeps its records: `dbName`, default 'safebyok'.
 *
 * @example
 *   const vault = Vault.make({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB, ...browserOpts() })
 * @example
 *   const vault = Vault.make({ ...browserOpts({ dbName: 'acme' }), applabel: 'acme', userId, vaultlabel: 'main', vaultDB })
 * @example
 *   const vault = Vault.make({ ...browserOpts(), applabel: 'acme', userId, vaultlabel: 'main', vaultDB, strengthChecker: myStrengthChecker })
 * @example
 *   browserOpts({ dbName: 'acme' }) === browserOpts({ dbName: 'acme' })  // true
 */
export const browserOpts = (opts?: IdbOpts): BrowserOpts => {
  const dbName = parseDbName(opts, 'browserOpts')
  const kept = bagsByDbName.get(dbName)
  if (kept !== undefined) { return kept }
  const bag: BrowserOpts = Object.freeze({
    keyDeriver:      argon2idWebV1Deriver,
    deviceDB:        idbDeviceDB({ dbName }),
    strengthChecker: zxcvbnStrengthChecker,
  })
  bagsByDbName.set(dbName, bag)
  return bag
}
