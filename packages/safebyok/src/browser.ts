// Kept off the front door (`safebyok`) so an app that derives, writes or judges some other way never ships the Argon2id code,
// idb-keyval or zxcvbn (notes/good_bank_opts_are_in_browser.md).
/** `safebyok/browser`: the key derivers and strength checker a browser app gives to `Device.make`, and the rest of `safebyok-big/browser`. */

import { browserOpts as bigBrowserOpts, type IdbDeviceDB, type IdbDeviceDBOpts, type KeyDeriver } from 'safebyok-big/browser'
import type { StrengthChecker } from './shapes/shapes-gateish'

export {
  Argon2idWebV1, IdbDeviceDB, MinPassphraseChars, MinZxcvbnScore, PassphraseSaltSize, argon2idWebV1Deriver, idbDeviceDB, makeArgon2idDeriver, parseKeyDeriverSpec,
  zxcvbnStrengthChecker, type Argon2idKeyDeriver, type IdbDeviceDBOpts, type KeyDeriver, type KeyDeriverSpec,
} from 'safebyok-big/browser'
// Big's browser entry exports its own `StrengthChecker` and `BrowserOpts` as well; the ones `Device.make` takes are `safebyok`'s.
export type { StrengthChecker } from './shapes/shapes-gateish'

/** The `Device.make` options {@link browserOpts} answers, to spread in beside your own. `Device.make` ignores the `deviceDB`. */
export interface BrowserOpts {
  /** `argon2idWebV1Deriver`. */
  readonly keyDeriver:      KeyDeriver
  /** An {@link IdbDeviceDB} over the database of the `dbName` asked. */
  readonly deviceDB:        IdbDeviceDB
  /** `zxcvbnStrengthChecker`. */
  readonly strengthChecker: StrengthChecker
}

// safebyok-big's own, typed with this package's strength checker: big types the bag's checker with big's scope, which names
// the user `user_id`, but the checker in it, zxcvbnStrengthChecker, takes this package's scope as well (tests/browser.test.ts).
/** The browser's `keyDeriver`, `deviceDB` and `strengthChecker` in a frozen bag, to spread into `Device.make`.
 * The same `dbName` gets the same bag, so a React host may call it during render.
 */
export const browserOpts = bigBrowserOpts as unknown as (opts?: IdbDeviceDBOpts) => BrowserOpts
