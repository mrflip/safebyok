// Kept out of the main entry (`safebyok`) so an app that derives, writes or judges some other way never ships the Argon2id code,
// idb-keyval or zxcvbn (notes/good_bank_opts_are_in_browser.md).
/** `safebyok/browser`: the key deriver, device database and strength checker a browser app gives to `Device.make`, the wrapper that runs a vaultDB's watch in one tab, and the rest of `safebyok-big/browser`. */

import { argon2idWebV1Deriver, zxcvbnStrengthChecker, type KeyDeriver } from 'safebyok-big/browser'
import type { StrengthChecker } from './shapes/shapes-gateish'
import { type IdbDeviceDBOpts, idbDeviceDBOpts } from './shapes/shapes-device-db'
import { type IdbDeviceDB, idbDeviceDB } from './storage/idb-device-db'

export {
  Argon2idWebV1, MinPassphraseChars, MinZxcvbnScore, PassphraseSaltSize, argon2idWebV1Deriver, makeArgon2idDeriver, parseKeyDeriverSpec,
  zxcvbnStrengthChecker, type Argon2idKeyDeriver, type KeyDeriver, type KeyDeriverSpec,
} from 'safebyok-big/browser'
// Big's browser entry exports its own `StrengthChecker`, `BrowserOpts`, `browserOpts` and device database as well; the ones `Device.make` takes are `safebyok`'s.
export type { StrengthChecker } from './shapes/shapes-gateish'
export { IdbDeviceDB, LeaseDBVersion, idbDeviceDB, leaseBellnameOf, leaseDatabasenameOf, scopepathOf, devicetokScopepathOf } from './storage/idb-device-db'
export { idbDeviceDBOpts, type IdbDeviceDBOpts, type DevicetokScopepath, type LeaseScopepath } from './shapes/shapes-device-db'
export { OneWatchVaultDB, oneWatchVaultDB, watchnameOf } from './storage/one-watch-vault-db'

// == [The bag]: BrowserOpts, bagsByDbName, browserOpts

/** The `Device.make` options {@link browserOpts} answers, to spread in beside your own. */
export interface BrowserOpts {
  /** `argon2idWebV1Deriver`. */
  readonly keyDeriver:      KeyDeriver
  /** An {@link IdbDeviceDB} over the database of the `dbName` asked, where the device keeps the lease every tab of the origin shares. */
  readonly deviceDB:        IdbDeviceDB
  /** `zxcvbnStrengthChecker`. */
  readonly strengthChecker: StrengthChecker
}

// One bag per dbName, so a React host may call browserOpts() during render: a provider that reopens its bank whenever an
// option changes identity would loop on a fresh deviceDB each render.
/** The bag answered for each dbName so far. */
const bagsByDbName = new Map<string | undefined, BrowserOpts>()

/** The browser's `keyDeriver`, `deviceDB` and `strengthChecker` in a frozen bag, to spread into `Device.make`.
 * The same `dbName` gets the same bag, so a React host may call it during render.
 */
export function browserOpts(opts: IdbDeviceDBOpts = {}): BrowserOpts {
  const { dbName } = idbDeviceDBOpts.parse(opts, { where: "In browserOpts's options" })
  const prior = bagsByDbName.get(dbName)
  if (prior !== undefined) { return prior }
  const bag: BrowserOpts = Object.freeze({ keyDeriver: argon2idWebV1Deriver, deviceDB: idbDeviceDB({ dbName }), strengthChecker: zxcvbnStrengthChecker })
  bagsByDbName.set(dbName, bag)
  return bag
}
// --
