// Kept off the front door (`safebyok`) so an app that derives, stores or judges some other way never ships the Argon2id code,
// idb-keyval or zxcvbn (notes/good_bank_opts_are_in_browser.md).
/** `safebyok/browser`: the key derivers, device database and strength checker a browser app gives to `Bank.make`, and {@link browserOpts}, the three in one bag. */

import { argon2idWebV1Deriver } from './deriver/argon2id-webv1'
import type { KeyDeriver } from './deriver/basederiver'
import type { StrengthChecker } from './helpers/passphrase-strength'
import { zxcvbnStrengthChecker } from './helpers/zxcvbn-strength-checker'
import { type IdbDeviceDB, idbDeviceDB, idbDeviceDBOpts, type IdbDeviceDBOpts } from './storage/idb-device-db'

export { argon2idDeriver, argon2idWebV1Deriver } from './deriver/argon2id-webv1'
export { parseKeyDeriverSpec } from './deriver/basederiver'
export type { Argon2idKeyDeriver, KeyDeriver } from './deriver/basederiver'
export { PassphraseSaltBytes } from './helpers/consts'
export { Argon2idWebV1 } from './deriver/shapes'
export type { KeyDeriverSpec } from './deriver/shapes'
export type { StrengthChecker } from './helpers/passphrase-strength'
export { MinPassphraseChars, MinZxcvbnScore, zxcvbnStrengthChecker } from './helpers/zxcvbn-strength-checker'
export { IdbDeviceDB, idbDeviceDB } from './storage/idb-device-db'
export type { IdbDeviceDBOpts } from './storage/idb-device-db'

// == [The bag]: BrowserOpts, bagsByDbName, browserOpts

/** The `Bank.make` options {@link browserOpts} answers, to spread in beside your own. */
export interface BrowserOpts {
  /** {@link argon2idWebV1Deriver}. */
  readonly keyDeriver:      KeyDeriver
  /** An {@link IdbDeviceDB} over the database of the `dbName` asked. */
  readonly deviceDB:        IdbDeviceDB
  /** {@link zxcvbnStrengthChecker}. */
  readonly strengthChecker: StrengthChecker
}

// One bag per dbName, so a React host may call browserOpts() during render: a provider that reopens its bank whenever an
// option changes identity would loop on a fresh deviceDB each render.
/** The bag answered for each dbName so far. */
const bagsByDbName = new Map<string, BrowserOpts>()

/** A frozen bag of the browser's `keyDeriver`, `deviceDB` and `strengthChecker`, the same bag for the same `dbName`, to spread into `Bank.make`. */
export const browserOpts = (opts: IdbDeviceDBOpts = {}): BrowserOpts => {
  const { dbName = 'safebyok' } = idbDeviceDBOpts.parse(opts, { where: "In browserOpts's options" })
  const kept = bagsByDbName.get(dbName)
  if (kept !== undefined) { return kept }
  const bag: BrowserOpts = Object.freeze({ keyDeriver: argon2idWebV1Deriver, deviceDB: idbDeviceDB({ dbName }), strengthChecker: zxcvbnStrengthChecker })
  bagsByDbName.set(dbName, bag)
  return bag
}
// --
