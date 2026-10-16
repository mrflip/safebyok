import { argon2idWebV1Deriver } from './key-deriver'
import { idbDeviceDB, type IdbOpts } from './idb'
import { parseDbName } from './idb-opts'
import type { OpenVaultOpts } from './vault'

export { MinZxcvbnScore, zxcvbnPassphraseTest } from './zxcvbn-passphrase-test'

/**
 * The defaults for an app in a browser, as an entry point of their own, `safebyok/browser`: the
 * options `openVault` asks for that nearly every browser app answers the same way. The main entry
 * asks for each of them outright, so an app that answers differently -- another key deriver, a
 * device store of its own -- never ships the code for these. Beside them, `zxcvbnPassphraseTest`,
 * a `passphraseStrengthTest` that knows common passwords: its own import, with its dictionary,
 * which `browserOpts()` never brings in.
 */

/** The openVault options {@link browserOpts} supplies: spread them in beside your own. */
export type BrowserOpts = Readonly<Pick<OpenVaultOpts, 'keyDeriver' | 'deviceDB'>>

// One bag per dbName, so a React host may call browserOpts() during render: the provider reopens
// its vault whenever an option changes identity, and a fresh deviceDB each render would loop.
const bagsByDbName = new Map<string, BrowserOpts>()

/**
 * The browser's answers to openVault's options: the pinned Argon2id key deriver
 * (`argon2idWebV1Deriver`) and the IndexedDB device store (`idbDeviceDB`). Spread the bag into
 * `openVault` beside the storage adapter for your backend, which is never a default; any field
 * you pass after the spread wins. The same `dbName` always answers the same bag.
 *
 * @param opts - Where the device store keeps its records: `dbName`, default 'safebyok'.
 * @returns A frozen bag of `keyDeriver` and `deviceDB`. Kind 'bad_option' for a `dbName` that is
 *   not non-empty text.
 *
 * @example
 *   const vault = await openVault({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB, ...browserOpts() })
 * @example
 *   const vault = await openVault({ ...browserOpts({ dbName: 'acme' }), applabel: 'acme', userId, vaultlabel: 'main', vaultDB })
 * @example
 *   browserOpts({ dbName: 'acme' }) === browserOpts({ dbName: 'acme' })  // true
 */
export const browserOpts = (opts?: IdbOpts): BrowserOpts => {
  const dbName = parseDbName(opts, 'browserOpts')
  const kept = bagsByDbName.get(dbName)
  if (kept !== undefined) { return kept }
  const bag: BrowserOpts = Object.freeze({ keyDeriver: argon2idWebV1Deriver, deviceDB: idbDeviceDB({ dbName }) })
  bagsByDbName.set(dbName, bag)
  return bag
}
