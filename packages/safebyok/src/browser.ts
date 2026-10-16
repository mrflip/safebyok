import { DefaultDelimiter } from './ckeys'
import { argon2idWebV1Deriver } from './key-deriver'
import { idbDeviceDB, type IdbOpts } from './idb'
import { parseIdbOpts } from './idb-opts'
import type { OpenVaultOpts } from './vault'

/**
 * The defaults for an app in a browser, as an entry point of their own, `safebyok/browser`: the
 * options `openVault` asks for that nearly every browser app answers the same way. The main entry
 * asks for each of them outright, so an app that answers differently -- another key deriver, a
 * device store of its own -- never ships the code for these.
 */

/** The openVault options {@link browserOpts} supplies: spread them in beside your own. */
export type BrowserOpts = Readonly<Pick<OpenVaultOpts, 'keyDeriver' | 'deviceDB'>>

// One bag per dbName and delimiter, so a React host may call browserOpts() during render: the
// provider reopens its vault whenever an option changes identity, and a fresh deviceDB each render
// would loop.
const bagsByShelf = new Map<string, BrowserOpts>()

/**
 * The browser's answers to openVault's options: the pinned Argon2id key deriver
 * (`argon2idWebV1Deriver`) and the IndexedDB device store (`idbDeviceDB`). Spread the bag into
 * `openVault` beside the storage adapter for your backend, which is never a default; any field
 * you pass after the spread wins. The same `dbName` and `ckeyDelimiter` always answer the same bag.
 *
 * @param opts - Where the device store keeps its records: `dbName`, default 'safebyok'; and
 *   `ckeyDelimiter`, the one character its ckeys join a scope's names on, default `^`, for a
 *   host whose applabel, user_id or vaultlabel may hold `^`.
 * @returns A frozen bag of `keyDeriver` and `deviceDB`. Kind 'bad_option' for a `dbName` that is
 *   not non-empty text, or a `ckeyDelimiter` that is not one character.
 *
 * @example
 *   const vault = await openVault({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB, ...browserOpts() })
 * @example
 *   const vault = await openVault({ ...browserOpts({ dbName: 'acme' }), applabel: 'acme', userId, vaultlabel: 'main', vaultDB })
 * @example
 *   browserOpts({ dbName: 'acme' }) === browserOpts({ dbName: 'acme' })  // true
 */
export const browserOpts = (opts?: IdbOpts): BrowserOpts => {
  const { dbName, ckeyDelimiter = DefaultDelimiter } = parseIdbOpts(opts, 'browserOpts')
  const shelf = JSON.stringify([dbName, ckeyDelimiter])
  const kept = bagsByShelf.get(shelf)
  if (kept !== undefined) { return kept }
  const bag: BrowserOpts = Object.freeze({ keyDeriver: argon2idWebV1Deriver, deviceDB: idbDeviceDB({ dbName, ckeyDelimiter }) })
  bagsByShelf.set(shelf, bag)
  return bag
}
