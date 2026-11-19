// Kept off the front door (`safebyok`) so an app that derives, writes or judges some other way never ships the Argon2id code,
// idb-keyval or zxcvbn (notes/good_bank_opts_are_in_browser.md).
/** `safebyok/browser`: the key derivers and strength checker a browser app gives to `Device.make`, and the rest of `safebyok-big/browser`. */

export {
  Argon2idWebV1, IdbDeviceDB, MinPassphraseChars, MinZxcvbnScore, PassphraseSaltSize, argon2idWebV1Deriver, browserOpts, idbDeviceDB, makeArgon2idDeriver, parseKeyDeriverSpec,
  zxcvbnStrengthChecker, type Argon2idKeyDeriver, type BrowserOpts, type IdbDeviceDBOpts, type KeyDeriver, type KeyDeriverSpec,
} from 'safebyok-big/browser'
// Big's browser entry exports its own `StrengthChecker` as well; the one `Device.make` takes is `safebyok`'s.
export type { StrengthChecker } from './shapes/shapes-gateish'
