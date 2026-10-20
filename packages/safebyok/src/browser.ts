import { argon2idWebV1Deriver } from './key-deriver'
import { idbDeviceDB, type IdbOpts } from './idb'
import { parseDbName } from './idb-opts'
import type { MakeVaultOpts } from './vault-opts'
import { zxcvbnStrengthChecker } from './zxcvbn-strength-checker'

export { MinPassphraseChars, MinZxcvbnScore, zxcvbnStrengthChecker } from './zxcvbn-strength-checker'

/**
 * The defaults for an app in a browser, as an entry point of their own, `safebyok/browser`: the
 * options `Vault.make` asks for that nearly every browser app answers the same way. The main entry
 * asks for each of them outright, so an app that answers differently -- another key deriver, a
 * device store of its own -- never ships the code for these. Among them is `zxcvbnStrengthChecker`,
 * the passphrase strength checker, whose dictionary loads only when a passphrase is first checked.
 */

/** The Vault.make options {@link browserOpts} supplies: spread them in beside your own. */
export type BrowserOpts = Readonly<Pick<MakeVaultOpts, 'keyDeriver' | 'deviceDB' | 'strengthChecker'>>

// One bag per dbName, so a React host may call browserOpts() during render: the provider reopens
// its vault whenever an option changes identity, and a fresh deviceDB each render would loop.
const bagsByDbName = new Map<string, BrowserOpts>()

/**
 * The browser's answers to Vault.make's options: the pinned Argon2id key deriver
 * (`argon2idWebV1Deriver`), the IndexedDB device store (`idbDeviceDB`), and the passphrase
 * strength checker (`zxcvbnStrengthChecker`), whose zxcvbn dictionary loads, as a chunk of its own,
 * only when a passphrase is first checked. Spread the bag into `Vault.make` beside the storage
 * adapter for your backend, which is never a default; any field you pass after the spread wins,
 * a strength checker of your own among them. The same `dbName` always answers the same bag.
 *
 * @param opts - Where the device store keeps its records: `dbName`, default 'safebyok'.
 * @returns A frozen bag of `keyDeriver`, `deviceDB` and `strengthChecker`. Kind 'bad_option' for a `dbName` that is
 *   not non-empty text.
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
