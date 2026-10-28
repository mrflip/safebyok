/** What the checks say when input fails them, every such sentence in one place, and the sentences of the bank's refusals and of a Vault object's gone and behind ones: so wording and tone are reviewed together, and so is the rule that none quotes the input. */

import { ScopepathDelimiter } from './consts'

// == [Names]: labelTooLong, LabelShape, UserIdMissing, userIdTooLong, UserIdChars

/** A label longer than `maxChars`. */
export const labelTooLong = (maxChars: number): string => `A label is at most ${String(maxChars)} characters`

/** A label of the wrong shape. */
export const LabelShape = "A label is lowercase words of letters and digits joined by single underscores, starting with a letter, two characters at least"

/** An empty user_id. */
export const UserIdMissing = "A user_id names the signed-in user, so it can't be empty"

/** A user_id longer than `maxChars`. */
export const userIdTooLong = (maxChars: number): string => `A user_id is at most ${String(maxChars)} characters`

/** A user_id holding a character outside its set, or only dots. */
export const UserIdChars = "A user_id is ASCII letters, digits and - _ . ~ : @ + | %, and not dots alone: percent-encode (RFC 3986) any other character"
// --

// == [Tokens]: TokenMissing

/** An empty token. */
export const TokenMissing = "A token is minted by safebyok, so it can't be empty"
// --

// == [Instants]: InstantTooEarly, InstantTooLate, InstantNotWhole

/** An instant before 1981. */
export const InstantTooEarly = "An instant is epoch milliseconds no earlier than 1981; a smaller number is likely epoch seconds"

/** An instant after 2255. */
export const InstantTooLate = "An instant is epoch milliseconds no later than 2255; a larger number is likely epoch microseconds"

/** An instant with a fraction of a millisecond. */
export const InstantNotWhole = "An instant is whole epoch milliseconds"
// --

// == [Records]: GateEpochAndGate

/** A vault record whose `gate_epoch` and `gate` disagree: a gate at epoch 0, or none at a later epoch. */
export const GateEpochAndGate = "A vault record's gate_epoch is 0 exactly when its gate is null: a novel vault has neither, and a gated one both"
// --

// == [Bags]: StoreInVaultBag

/** Why a store in the bag naming a vault refuses: it goes in the second bag, the options. */
export const StoreInVaultBag = "A vault's stores go in the second bag, its options, not in the bag naming the vault"
// --

// == [Values]: FunctionExpected, bytesExpected, LeaseKeyExpected

/** Anything but a function, where a host's verb or callback is asked. */
export const FunctionExpected = "Expected a function"

/** Anything but bytes, a Uint8Array, `count` of them when that many are asked. */
export const bytesExpected = (count?: number): string => (count === undefined ? "Expected bytes, a Uint8Array" : `Expected ${String(count)} bytes, a Uint8Array`)

/** Anything but a leaseKey as `makeLeaseKey` makes one, where a lease record keeps its key. */
export const LeaseKeyExpected = "Expected a non-extractable AES-GCM CryptoKey for wrapKey and unwrapKey"
// --

// == [Passphrases]: PassphraseNotText

/** A passphrase handed over as anything but text. */
export const PassphraseNotText = "A passphrase is the text the user typed, as a string"
// --

// == [Passkeys]: PasskeyAnswerUsed, prfSaltNotFresh

/** A passkey's answer whose PRF bytes are zeroed: the vault zeroes an answer once it has used it. */
export const PasskeyAnswerUsed = "This passkey's answer was used already, and its bytes zeroed: ask the passkey again, as safebyok-react's askPasskey does, and hand in its fresh answer"

/** A new passkey's answer over a salt that is not `count` bytes as base64url text: a wayin sealed over it would read as damaged at every unlock. */
export const prfSaltNotFresh = (count: number): string => `A new passkey answers over a fresh salt of ${String(count)} random bytes, as base64url text: safebyok-react's createPasskey mints one`
// --

// == [Options]: leaseHoursShape, MinutesShape, VaultDBShape, DeviceDBShape, KeyDeriverShape, LoggerShape, StringStoreShape, KeyDeriverSpecShape, memoryPerLane, StrengthCheckerShape

/** A `leaseHours` that is no number of hours a lease may last, up to `maxHours`. */
export const leaseHoursShape = (maxHours: number): string => `Expected a number of hours above zero and at most ${String(maxHours)}, fractions too (0.25 is fifteen minutes), or Infinity for never: until lock()`

/** A `staleMinutes` or `renewMinutes` that is no number of minutes. */
export const MinutesShape = "Expected a number of minutes, zero or more, fractions too (0.5 is thirty seconds), or Infinity"

/** A `vaultDB` that is no storage adapter. */
export const VaultDBShape = "Expected a storage adapter, an instance of the VaultDB class: localVaultDB({ store }), idbVaultDB() from 'safebyok-indexeddb', or your backend's own"

/** A `deviceDB` that is no device store. */
export const DeviceDBShape = "Expected a DeviceDB: in a browser, spread browserOpts() from 'safebyok/browser' into Bank.make's options; elsewhere, pass memoryDeviceDB(), or your own device store, which extends the DeviceDB class"

/** A `keyDeriver` left out, or no object. */
export const KeyDeriverShape = "Expected a KeyDeriver: in a browser, spread browserOpts() from 'safebyok/browser' into Bank.make's options"

/** A `logger` that is no object. */
export const LoggerShape = "Expected a VaultLogger, with log, warn and error functions: leave it out for the default logger, or pass functions that do nothing to log nowhere"

/** A `store` that is no object. */
export const StringStoreShape = "Expected a StringStore, such as memoryStore() or domStore(localStorage, prefix)"

/** A keyDeriverSpec that is no object. */
export const KeyDeriverSpecShape = "Expected a keyDeriverSpec: algorithm 'argon2id', key_deriver_label, memory_kib, iterations, parallelism, salt_bytes and output_bytes"

/** An Argon2id spec with less than `minKib` of memory for each of its lanes. */
export const memoryPerLane = (minKib: number): string => `Expected at least ${String(minKib)} KiB of memory for each lane (parallelism)`

/** A `strengthChecker` that is no checker. */
export const StrengthCheckerShape = "expected a function from the passphrase, and the vault's scope, to a verdict, { strong: true } or { strong: false, reason }, its load, if it carries one, a function too. In a browser, spread browserOpts() from safebyok/browser, which supplies zxcvbnStrengthChecker; elsewhere, pass your own."
// --

// == [Refusals]: unknownFields, moreFailures, WhisperShape, fieldsDisagree, BagNotObject, WhisperBagShape

/** An object holding `count` fields it does not take, never named, as a name may be the caller's data, and the `fieldnames` it takes. */
export const unknownFields = (count: number, fieldnames: readonly string[]): string => {
  const held  = count === 1 ? 'There is a field it does not take (its name is not repeated)' : `There are ${String(count)} fields it does not take (their names are not repeated)`
  const takes = fieldnames.length === 0 ? 'it takes no fields' : `it takes only ${fieldnames.join(', ')}`
  return `${held}: ${takes}. Check the spelling, or leave ${count === 1 ? 'it' : 'them'} out`
}

/** How many more failures a refusal found than it names. */
export const moreFailures = (count: number): string => `and ${String(count)} more ${count === 1 ? 'failure' : 'failures'}`

/** A whisper that is no JSON value, or a bare null. */
export const WhisperShape = "A whisper is a JSON value: a string, number, boolean, array or plain object. A bare null or undefined cannot be stored: to empty a box, delete it (null inside an array or object is fine)"
/** A bag holding `fieldnames` at other values than the bag it is checked against holds them. */
export const fieldsDisagree = (fieldnames: readonly string[]): string => `This holds another ${fieldnames.join(' and ')} than what it is checked against: a field both hold must agree`

/** A bag to check another against that is not an object. */
export const BagNotObject = "What a bag is checked against is an object, holding the fields to compare"

/** An object in a whisper or a sidecar that is not plain JSON. */
export const WhisperBagShape = "An object in a whisper or a sidecar is a plain object of JSON: strings, numbers, booleans, null, arrays and plain objects, never undefined, a Date, a Map or a class's instance"
// --

// == [Scopepaths]: BankScopepathShape, VaultScopepathShape, LeaseScopepathShape, DeviceScopepathShape, BoxScopepathShape

/** A bank's scopepath of the wrong shape. */
export const BankScopepathShape = `A bank's scopepath is 'bank', an applabel and a user_id, joined on ${ScopepathDelimiter}`

/** A vault's scopepath of the wrong shape. */
export const VaultScopepathShape = `A vault's scopepath is 'vault', an applabel, a user_id and a vaultlabel, joined on ${ScopepathDelimiter}`

/** A lease's scopepath of the wrong shape. */
export const LeaseScopepathShape = `A lease's scopepath is 'lease', an applabel, a user_id and a vaultlabel, joined on ${ScopepathDelimiter}`

/** A device record's scopepath of the wrong shape. */
export const DeviceScopepathShape = `A device record's scopepath is 'device', an applabel, a user_id and a vaultlabel, joined on ${ScopepathDelimiter}`

/** A box's scopepath of the wrong shape. */
export const BoxScopepathShape = `A box's scopepath is 'box', an applabel, a user_id, a vaultlabel and a boxlabel, joined on ${ScopepathDelimiter}`
// --

// == [Bank and vault]: VaultBagAdvice, otherScope, VaultGoneWhileOpening, OtherStoresThanHeld, VaultBehindWhileOpening, VaultObjectGone, VaultBehind

/** The advice a refusal of the bag naming a vault ends with: what that bag takes, and what else names a vault. */
export const VaultBagAdvice = "That bag holds the vault's vaultlabel, and the bank's own applabel and user_id if you like: a Vault object, its snapshot or a BankVault will do."

/** Why a bag naming another applabel or user_id than the bank's refuses, `fieldnames` the ones that differ, never their values. */
export const otherScope = (fieldnames: readonly string[]): string => `This names another ${fieldnames.join(' and ')} than the bank's, which serves one app and one signed-in user. Use the bank of the app and user it belongs to.`

/** Why a vault let go while the bank was opening it hands out no Vault object. */
export const VaultGoneWhileOpening = "The app let this vault go while it was being opened, so no Vault object was handed out. Ask the bank for the vault again (bank.ensureVault)."

/** Why options naming other stores than the vault the bank holds was born from refuse. */
export const OtherStoresThanHeld = "The bank already holds this vault, born from other stores than these options name (their vaultDB or deviceDB, or the bank's own where they leave one out): one vault lives in one place. Stores are compared as objects, so the options must name the same vaultDB object and deviceDB object the vault was opened with, not new ones made over the same storage: make each store once and pass it every time. To open the vault from other stores, let it go first (bank.reopenVault)."

/** Why the bank will not open a vault that storage offers older than this device has seen. */
export const VaultBehindWhileOpening = "This device has already seen a newer copy of this vault than storage offers now, so it won't open this one: nothing was unlocked or written. Storage restored from a backup, or altered, does this. If the vault's storage was restored from an older copy on purpose, the app can have this device accept it (bank.clearCachedVault) and ask for the vault again; otherwise the app's support should look at its storage."

/** Why a Vault object whose vault was deleted, or which the app let go, reads and writes nothing more. */
export const VaultObjectGone = "This Vault object is gone -- the vault was deleted, here or on another device, or the app let this Vault object go -- so nothing more was read or written. Ask the bank for the vault again (bank.ensureVault) to see what is stored now."

/** Why a vault that storage offers older than this device has seen is not used, and locks. */
export const VaultBehind = "This device has already seen a newer copy of this vault than storage offers now, so it won't use this one, and the vault locked: nothing was unlocked or written. Storage restored from a backup, or altered, does this. If the vault's storage was restored from an older copy on purpose, the app can have this device accept it (bank.clearCachedVault) and ask the bank for the vault again; otherwise the app's support should look at its storage."
// --
