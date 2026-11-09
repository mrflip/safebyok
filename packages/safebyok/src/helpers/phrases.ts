/** What the checks say when input fails them, every such sentence in one place, and the sentences of bank.ts's and vault.ts's own refusals and a vault's bad news (a refusal they pass on from another module, refusals.ts or gating.ts, keeps its words there): so wording and tone are reviewed together, and so is the rule that none quotes the input.
 * The rules for a refusal, its thrower and its phrase are at the top of refusals/throwers.ts.
 */

import { PassphraseSaltBytes, ScopepathDelimiter } from './consts'

// == [Names]: labelTooLong, LabelShape, DeviceIdShape, UserIdMissing, userIdTooLong, UserIdChars

/** A label longer than `maxChars`. */
export const labelTooLong = (maxChars: number): string => `A label is at most ${String(maxChars)} characters`

/** A label of the wrong shape. */
export const LabelShape = "A label is lowercase letters, digits and single underscores, starting with a letter and ending on a letter or digit, two characters at least"

/** A device_id that is no UUID. */
export const DeviceIdShape = "A device_id is a UUID, such as crypto.randomUUID() makes, kept by the host for this device"

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

// == [Scopes]: DatabaseInVaultScope

/** Why a vaultDB or deviceDB in the scope naming a vault refuses: it goes in the second bag, the options. */
export const DatabaseInVaultScope = "A vault's vaultDB and deviceDB go in the second bag, its options, not in the scope naming the vault"
// --

// == [Values]: FunctionExpected, GuardedExpected, GuardedLoggerExpected, VaultDBExpected, DeviceDBExpected, bytesExpected, LeaseKeyExpected, CtxStampExpected, ListingExpected, BankExpected, VaultErrorExpected

/** Anything but a function, where a host's verb or callback is asked. */
export const FunctionExpected = "Expected a function"

/** A host's bare function, or anything else, where a bank's world holds that function as the bank wraps it. */
export const GuardedExpected = "Expected a host's function as Bank.make wraps it"

/** A host's bare logger, or anything else, where a bank's world holds its logger as the bank guards it. */
export const GuardedLoggerExpected = "Expected a logger as Bank.make guards it"

/** Anything but a vaultDB branded by safebyok and answering each of its verbs, where a vaultDB is asked. */
export const VaultDBExpected = "Expected a VaultDB: an adapter or client branded by safebyok, answering each of its verbs"

/** Anything but an instance of a class extending safebyok's DeviceDB, where a deviceDB is asked. */
export const DeviceDBExpected = "Expected a DeviceDB: an instance of a class extending safebyok's DeviceDB"

/** Anything but bytes, a Uint8Array, `count` of them when that many are asked. */
export const bytesExpected = (count?: number): string => (count === undefined ? "Expected bytes, a Uint8Array" : `Expected ${String(count)} bytes, a Uint8Array`)

/** Anything but a leaseKey as `makeLeaseKey` makes one, where a lease record keeps its key. */
export const LeaseKeyExpected = "Expected a non-extractable AES-GCM CryptoKey for wrapKey and unwrapKey"

/** Anything but a stamp a lease binds a seal to. */
export const CtxStampExpected = "Expected a flat object of strings and numbers, with at least one field"

/** The listing a storable is made in. */
export const ListingExpected = "Expected a Listing"

/** Anything but a Bank, where one is named. */
export const BankExpected = "Expected a Bank"

/** Anything but a VaultError, where bad news is told. */
export const VaultErrorExpected = "Expected a VaultError"
// --

// == [Passphrases]: PassphraseNotText, passphraseSaltShape, passphraseTooShort, PassphraseGuessable, PassphraseUnjudged

/** A passphrase handed over as anything but text. */
export const PassphraseNotText = "A passphrase is the text the user typed, as a string"

/** A passphrase wayin's salt that is not `saltChars` characters of base64url text, for `saltBytes` bytes. */
export const passphraseSaltShape = (saltBytes: number, saltChars: number): string => `A passphrase salt is base64url text of ${String(saltBytes)} bytes: ${String(saltChars)} characters`

/** zxcvbnStrengthChecker's reason for a new passphrase of fewer than `minChars` characters. */
export const passphraseTooShort = (minChars: number): string => `A passphrase needs ${String(minChars)} characters or more: a few words together make a strong one, and easy to remember.`

/** zxcvbnStrengthChecker's reason for a new passphrase a guesser would reach early. */
export const PassphraseGuessable = "That passphrase would be easy to guess: add a word or two that don't usually go together, and leave out names, dates and this app's own words."

/** zxcvbnStrengthChecker's reason for a new passphrase it could not judge, as its dictionary did not load. */
export const PassphraseUnjudged = "This passphrase can't be checked just now: the list of common passwords it is checked against didn't load. Check your connection, then try again."
// --

// == [Passkeys]: PasskeyAnswerUsed, prfSaltNotFresh

/** A passkey's answer whose PRF bytes are zeroed: the vault zeroes an answer once it has used it. */
export const PasskeyAnswerUsed = "This passkey's answer was used already, and its bytes zeroed: ask the passkey again, as safebyok-react's askPasskey does, and hand in its fresh answer"

/** A new passkey's answer over a salt that is not `count` bytes as base64url text: a wayin sealed over it would read as damaged at every unlock. */
export const prfSaltNotFresh = (count: number): string => `A new passkey answers over a fresh salt of ${String(count)} random bytes, as base64url text: safebyok-react's createPasskey mints one`
// --

// == [Options]: leaseHoursShape, MinutesShape, VaultDBShape, DeviceDBShape, KeyDeriverShape, LoggerShape, KeyDeriverSpecShape, memoryPerLane, StrengthCheckerShape

/** A `leaseHours` that is no number of hours a lease may last, up to `maxHours`. */
export const leaseHoursShape = (maxHours: number): string => `Expected a number of hours above zero and at most ${String(maxHours)}, fractions too (0.25 is fifteen minutes), or Infinity for never: until lock()`

/** A `staleMinutes` or `renewMinutes` that is no number of minutes. */
export const MinutesShape = "Expected a number of minutes, zero or more, fractions too (0.5 is thirty seconds), or Infinity"

/** A `vaultDB` that is no storage adapter. */
export const VaultDBShape = "Expected a storage adapter, an instance of the AdapterVaultDB class: idbVaultDB() from 'safebyok-indexeddb', or your backend's own"

/** A `deviceDB` that is no device database. */
export const DeviceDBShape = "Expected a device database, an instance of the DeviceDB class: new MemoryDeviceDB(), or your own class that extends DeviceDB, both imported from 'safebyok'"

/** A `keyDeriver` left out, or no object. */
export const KeyDeriverShape = `Expected a KeyDeriver: in a browser, argon2idWebV1Deriver from 'safebyok/browser'; elsewhere, your own, with a key_deriver_label, a salt_bytes of ${String(PassphraseSaltBytes)} and a deriveKeyBytes function`

/** A `logger` that is no object. */
export const LoggerShape = "Expected a VaultLogger, with log, warn and error functions: leave it out for the default logger, or pass functions that do nothing to log nowhere"

/** A keyDeriverSpec that is no object. */
export const KeyDeriverSpecShape = `Expected a keyDeriverSpec: algorithm 'argon2id', key_deriver_label, memory_kib, iterations, parallelism, salt_bytes (${String(PassphraseSaltBytes)}) and output_bytes`

/** An Argon2id spec with less than `minKib` of memory for each of its lanes. */
export const memoryPerLane = (minKib: number): string => `Expected at least ${String(minKib)} KiB of memory for each lane (parallelism)`

/** A `strengthChecker` that is no checker. */
export const StrengthCheckerShape = "Expected a function from the passphrase, and the vault's scope, to a verdict, { strong: true } or { strong: false, reason }, its load, if it carries one, a function too. Pass zxcvbnStrengthChecker from safebyok/browser, or your own (CUSTOMIZATION.md, Pluggable Passphrase Strength Checker)"
// --

// == [Refusals]: unknownFields, moreFailures, WhisperShape, fieldsDisagree, BagNotObject, WhisperBagShape

/** An object holding `count` fields it does not accept, never named, as a name may be the caller's data, and the `fieldnames` it accepts. */
export const unknownFields = (count: number, fieldnames: readonly string[]): string => {
  const refused = count === 1 ? 'There is a field it does not accept (its name is not repeated)' : `There are ${String(count)} fields it does not accept (their names are not repeated)`
  const accepted = fieldnames.length === 0 ? 'it accepts no fields' : `it accepts only ${fieldnames.join(', ')}`
  return `${refused}: ${accepted}. Check the spelling, or leave ${count === 1 ? 'it' : 'them'} out`
}

/** How many more failures a refusal found than it names. */
export const moreFailures = (count: number): string => `and ${String(count)} more ${count === 1 ? 'failure' : 'failures'}`

/** A whisper that is no plain object of JSON. */
export const WhisperShape = "A whisper is a plain object of JSON, with no symbol key anywhere: a bare string, number, boolean, array, null or undefined cannot be put, so wrap one as { apiKey: 'sk-...' }. To empty a box, delete it (null inside an array or object is fine)"
/** A bag holding `fieldnames` at other values than the bag it is checked against holds them. */
export const fieldsDisagree = (fieldnames: readonly string[]): string => `This holds another ${fieldnames.join(' and ')} than what it is checked against: a field both hold must agree`

/** A bag to check another against that is not an object. */
export const BagNotObject = "What a bag is checked against is an object, holding the fields to compare"

/** An object in a whisper or a sidecar that is not plain JSON. */
export const WhisperBagShape = "An object in a whisper or a sidecar is a plain object of JSON: strings, numbers, booleans, null, arrays and plain objects, never undefined, a Date, a Map, a class's instance or a symbol key"
// --

// == [Scopepaths]: BankScopepathShape, VaultScopepathShape, LeaseScopepathShape, BoxScopepathShape

/** A bank's scopepath of the wrong shape. */
export const BankScopepathShape = `A bank's scopepath is 'bank', an applabel and a user_id, joined on ${ScopepathDelimiter}`

/** A vault's scopepath of the wrong shape. */
export const VaultScopepathShape = `A vault's scopepath is 'vault', an applabel, a user_id and a vaultlabel, joined on ${ScopepathDelimiter}`

/** A lease's scopepath of the wrong shape. */
export const LeaseScopepathShape = `A lease's scopepath is 'lease', an applabel, a user_id and a vaultlabel, joined on ${ScopepathDelimiter}`

/** A box's scopepath of the wrong shape. */
export const BoxScopepathShape = `A box's scopepath is 'box', an applabel, a user_id, a vaultlabel and a boxlabel, joined on ${ScopepathDelimiter}`
// --

// == [Bank and vault]: VaultScopeAdvice, otherScope, VaultGoneWhileOpening, OtherDatabasesThanListed, VaultBehindWhileOpening, VaultObjectGone, VaultBehind

/** The advice a refusal of the scope naming a vault ends with: what that scope accepts, and what else names a vault. */
export const VaultScopeAdvice = "That scope holds the vault's vaultlabel, and the bank's own applabel and user_id if you like: a Vault object, its snapshot or a BankVault will do."

/** Why a scope naming another applabel or user_id than the bank's refuses, `fieldnames` the ones that differ, never their values. */
export const otherScope = (fieldnames: readonly string[]): string => `This names another ${fieldnames.join(' and ')} than the bank's, which serves one app and one signed-in user. Use the bank of the app and user it belongs to.`

/** Why a vault let go while the bank was opening it hands out no Vault object. */
export const VaultGoneWhileOpening = "The app let this vault go while it was being opened, so no Vault object was handed out. Ask the bank for the vault again (bank.ensureVault)."

/** Why options naming another vaultDB or deviceDB than the listed vault was born from refuse. */
export const OtherDatabasesThanListed = "The bank already lists this vault, born from another vaultDB or deviceDB than these options name (their vaultDB or deviceDB, or the bank's own where they leave one out): one vault lives in one place. Databases are compared as objects, so the options must name the same vaultDB object and deviceDB object the vault was opened with, not new ones made over the same storage: make each database once and pass it every time. To open the vault from other databases, let it go first (bank.reopenVault)."

/** Why the bank will not open a vault that storage offers older than this device has seen. */
export const VaultBehindWhileOpening = "This device has already seen a newer copy of this vault than storage offers now, so it won't open this one: nothing was unlocked or written. Storage restored from a backup, or altered, does this. If the vault's storage was restored from an older copy on purpose, the app can have this device accept it (bank.clearCachedVault) and ask for the vault again; otherwise the app's support should look at its storage."

/** Why a Vault object whose vault was deleted, or which the app let go, reads and writes nothing more. */
export const VaultObjectGone = "This Vault object is gone -- the vault was deleted, here or on another device, or the app let this Vault object go -- so nothing more was read or written. Ask the bank for the vault again (bank.ensureVault) to see what is stored now."

/** Why a vault that storage offers older than this device has seen is not used, and locks. */
export const VaultBehind = "This device has already seen a newer copy of this vault than storage offers now, so it won't use this one, and the vault locked: nothing was unlocked or written. Storage restored from a backup, or altered, does this. If the vault's storage was restored from an older copy on purpose, the app can have this device accept it (bank.clearCachedVault) and ask the bank for the vault again; otherwise the app's support should look at its storage."
// --

// == [Vault: ways in]: PassphraseKept, NoPasskeyToRemove, PasskeyBeforePassphrase, ProvingBeforePassphrase

/** Why a vault's passphrase is not removed: it can be replaced, never removed. */
export const PassphraseKept = "A vault keeps its passphrase: it can be replaced (putWayin('passphrase')), never removed. Nothing was changed."

/** Why removing a passkey the vault does not hold changes nothing. */
export const NoPasskeyToRemove = "This vault has no passkey to remove: it may have been removed on another device. Nothing was changed."

/** Why a passkey is not added to a vault with no passphrase yet. */
export const PasskeyBeforePassphrase = "This vault has no passphrase yet, and a passkey is added under the passphrase, so nothing was asked or changed: set the passphrase first -- ensureUnlocked() asks for it, with a passkey beside it if the dialog offers one -- then add the passkey."

/** Why a change that needs proving waits for the vault's first passphrase. */
export const ProvingBeforePassphrase = "This vault has no passphrase yet, so nothing can prove this change: set its passphrase first, as ensureUnlocked() or putWayin() does."

// --

// == [Vault: lifecycle]: VaultLocked, GateMoved

/** Why a call that needs the vault unlocked does nothing while it is locked. */
export const VaultLocked = "The vault locked mid-operation. Please unlock again to carry on."

/** Why a call stops when a wayin changed, here or on another device, as it worked. */
export const GateMoved = "Unlock method changed elsewhere. Please unlock again to carry on."

// --

// == [Vault: boxes]: BoxAbsent, NoWhisperToKeep, RecordForNewBox, vaultFullOfBoxes, VaultGoneWhileGettingBox, VaultDeletedWhilePuttingBox

/** Why a call naming a box the vault does not hold refuses. */
export const BoxAbsent = "No box is stored for that boxlabel."

/** Why putBox() with no whisper, over a box the vault does not hold, refuses. */
export const NoWhisperToKeep = "No box is stored for that boxlabel."

/** Why a put told to only create refuses a whole record: what it would put is recycled. */
export const RecordForNewBox = "A create operation found a record already present."

/** Why a vault that holds its limit of `maxBoxes` boxes accepts no new one. */
export const vaultFullOfBoxes = (maxBoxes: number): string => `This vault already holds its limit of ${String(maxBoxes)} boxes: remove one before putting another. A vault meant to hold more can be opened with a larger maxBoxes, up to what its storage adapter allows.`

/** Why a box is not read from a vault deleted, or deleted and made anew, on another device, and the Vault object is gone. */
export const VaultGoneWhileGettingBox = "The vault this device held was deleted, so the box cannot be fetched: try again"

/** Why a box is not put into a vault deleted, or deleted and made anew, on another device as it was being put. */
export const VaultDeletedWhilePuttingBox = "The vault was deleted while this box was being put. This should not happen: report this as a bug."
// --

// == [Vault: bad news]: BoxStoredDamaged, WayinStoredDamaged

/** Bad news of a box stored damaged, which its meta.box_listed names. */
export const BoxStoredDamaged = "Storage discovered a damaged box. This should not happen: report this as a bug."

/** Bad news of a wayin stored damaged, which its meta.wayin_listed names. */
export const WayinStoredDamaged = "One of this vault's unlockers is stored damaged. This should not happen: report this as a bug."
// --

// == [Storables]: PartialLoad, AlreadyListed, BoxPatchAdvice, PatchNamesNeitherHalf, patchOfOtherScope, WhisperedIsNoWhisper, NotExposed, BoxExpected, PuttingVeiledFields, NoFieldsBound, OneRevisionTwoToks, OneRevisionTwoFates, OneRevisionTwoLives, OtherVaultTok, ShapeUnreconciled

/** Why a record in hand that is not full cannot be opened. */
export const PartialLoad = "The record in hand is not full, so it cannot be opened: hydrate it, and call again."

/** Why a birth makes nothing of a dna for a scope the listing already holds alive. */
export const AlreadyListed = "This listing already has an instance under the dna's scope, so nothing was made of the dna: listing.at(scope) answers it."

/** Why a put that storage answered with no record refuses: only a broken adapter answers that. */
export const PutAnsweredNothing = "A put was answered with no record, which a vaultDB never does: the storage adapter needs a developer's look."

/** Why an update of a box naming neither its whisper nor its sidecar writes nothing. */
export const BoxPatchAdvice = "Nothing was written. An update of a box names its whisper, its sidecar, or both: the half left out is kept."
export const PatchNamesNeitherHalf = "This update names neither a whisper nor a sidecar, so there is nothing to write."

/** Why an update of a box whose patch names another's scope writes nothing. */
export const patchOfOtherScope = (fieldnames: readonly string[]): string => `This update names another ${fieldnames.join(' and ')} than its own, so nothing was written: update the one it names, which listing.at(scope) answers.`

/** Why a bag marked `Whispered`, which a box answers for a whisper it will not show, is refused where a whisper is wanted. */
export const WhisperedIsNoWhisper = "That is what a box shows for a whisper it will not show, as it is encrypted, locked or veiled. It is not a whisper: expose and unlock one first, or call box.putExposed()."

/** Why a call that works on the exposed whisper is refused on a box with none. */
export const NotExposed = "This box has no whisper exposed: call box.expose() first."

/** Why `BoxFields.of` refuses what is not a box. */
export const BoxExpected = "BoxFields.of accepts a Box, as vault.getBox answers one."

/** Why saving a box's fields is refused while they show a blank. */
export const PuttingVeiledFields = "This box's whisper is veiled, so its fields hold no whisper to put: call box.unveil() first."

/** Why saving a box's fields is refused with none to read. */
export const NoFieldsBound = "This box has no field bound, so there is nothing to put: bind one with BoxFields.of(box).bind(path), or call box.putExposed()."

/** Why a record storage holds under the revision_seq held, but another revision_tok, is not adopted. */
export const OneRevisionTwoToks = "Storage and this device disagree about a record's history (the expected revision sequence matched, but its confirming token did not). Report this as a bug."

/** Why a record storage holds deleted at the revision held alive, or the other way round, is not adopted. */
export const OneRevisionTwoFates = "Storage and this device disagree about a record's history (one records a deleted record, the other a live one). Report this as a bug."

/** Why a record storage holds under the revision held, but of another life of the thing, is not adopted. */
export const OneRevisionTwoLives = "Storage and this device disagree about a record's history (it has been deleted and recreated). This should not happen: report this as a bug."

/** Why a record under another vault_tok than the instance holds is not adopted. */
export const OtherVaultTok = "Storage delivered a record from a deleted vault. This should not happen: report this as a bug."

/** Why a record under another vault_tok than the vault its listing lies in is not made into an instance. */
export const OtherVaultTokAtBirth = "Storage delivered a record from a different version of the vault. This should not happen: report this as a bug."

/** Why a record delivered under one scope that names another is not adopted. */
export const RecordOfOtherScope = "Storage delivered a misnamed record. This should not happen: report this as a bug."

/** Why a pair of shapes no row of the reconcile table names is refused: a bug. */
export const ShapeUnreconciled = "An unexpected shape was reconciled: a bug in Storable."
// --

// == [Models: provings]: ProofMissing, WrongPassphrase, WrongPasskey, NoPasskeyWayin, OtherPasskey, OtherPrfSalt, UnknownKeyDeriver, UndecodedSalt, notKeyBytes, WayinNotMadeYet, WayinMadeAlready, ProvingOfOtherVault, LeaseOfOtherVault, StampOfOtherVault, ProofClosureThrew, KeyDeriverThrew

/** Why a proof that hands in neither a passphrase nor a passkey's answer is refused. */
export const ProofMissing = "A proof hands in the vault's passphrase or a passkey's answer, and this one handed in neither, so nothing was tried."

/** Why a passphrase whose key does not open the vault's passphrase wayin is refused. */
export const WrongPassphrase = "That passphrase didn't unlock the vault. Check for typos and try again. If you're sure it's right, the stored vault may be damaged."

/** Why a passkey's answer whose key does not open the vault's passkey wayin is refused. */
export const WrongPasskey = "That passkey answered, but its answer didn't unlock the vault: its stored way in may be damaged. Unlock with the passphrase; if that works, add the passkey again, which replaces it."

/** Why a passkey's answer is refused by a vault that has no passkey wayin. */
export const NoPasskeyWayin = "This vault has no passkey: it may have been removed on another device. Unlock with the passphrase."

/** Why a passkey's answer for another credential than the vault's passkey wayin names is refused. */
export const OtherPasskey = "That passkey is not this vault's: it may have been replaced or removed on another device, or belong to another vault. Ask the credential the vault's passkey wayin names."

/** Why a passkey's answer over another PRF salt than the vault's passkey wayin keeps is refused. */
export const OtherPrfSalt = "The passkey answered for a different salt than this vault keeps for it: ask it again with the prf_salt_b64 the vault's passkey wayin names."

/** Why a passphrase wayin made under another key deriver than the world's is not tried. */
export const UnknownKeyDeriver = "This vault was made with a key deriver this package does not carry: update safebyok, or open the vault where it was made."

/** Why a stored passphrase wayin whose salt is not base64url text of whole bytes is refused: its record is damaged. */
export const UndecodedSalt = "This vault's stored passphrase salt is not valid base64url text: its record is damaged."

/** Why what a keyDeriver hands back is refused when it is not `count` fresh key bytes. */
export const notKeyBytes = (count: number): string => `The keyDeriver handed back something other than ${String(count)} fresh key bytes.`

/** Why a proving asked for the vaultKey before it holds a wayin refuses: a bug. */
export const WayinNotMadeYet = "A proving was asked for the vaultKey before it made or opened a wayin: a bug in the caller."

/** Why a proving that holds a wayin already makes no other. */
export const WayinMadeAlready = "This proving holds a wayin already, and a proving holds one: make a new proving for another wayin. A bug in the caller."

/** Why a wayin is not made under the vaultKey of a proving of another vault. */
export const ProvingOfOtherVault = "The source proving is of another vault: a wayin is made only under the vaultKey of the vault it lets into, so none was made. This is a bug in safebyok."

/** Why a lease is not granted to a vault other than the one a proving is of. */
export const LeaseOfOtherVault = "This proving is of another vault: a lease is granted only to the vault whose stamp its wayin binds, so none was granted. This is a bug in safebyok."

/** Why a seal verb refuses a stamp of another vault, or another life of it. */
export const StampOfOtherVault = "This stamp names another vault than this one, or another life of it, so nothing was sealed or opened. This is a bug in safebyok."

/** Why a keyDeriver's throw is replaced: it heard the passphrase. */
export const KeyDeriverThrew = "The keyDeriver threw rather than deriving a key. What it threw is left out, as it heard the passphrase."
// --

// == [Models: leases, vaults and boxes]: DamagedLease, UnopenedWhisper, UndecodedWhisper, LeaseNotInForce, UnlockFirst, LetGoInstance, vaultAbsent, boxAbsent, boxNotListed, VaultDeleted

/** Why a lease on this device is no use: whether found so in the cache, or in force and failing to open. */
export const DamagedLease = "This device's lease is damaged and will not open, so it was not used: unlock the vault again to carry on."

/** Why a whisper that will not open under the vault's key is refused. */
export const UnopenedWhisper = "That whisper would not open under this vault's key: it was altered in storage, or sealed under another vault. Nothing was changed."

/** Why a whisper that opened but is no whisper this package knows is refused. */
export const UndecodedWhisper = "That box opened, but what was inside is not a whisper this package knows, so it is damaged. It was left as it is; remove it, or seal a whisper over it."

/** Why a lease dropped opens nothing. */
export const LeaseNotInForce = "This lease is out of force, as the vault locked or the lease would not open, so nothing was read or written: unlock the vault again."

/** Why a call that needs the vault unlocked is refused while it is locked. */
export const UnlockFirst = "The vault is locked, so nothing was read or written: unlock it (vault.ensureUnlocked) and call again."


/** Why an instance past a sweep, a vacate or a delete answers nothing. */
export const LetGoInstance = "This object was let go, by a sweep, a vacate or a delete, so it answers nothing more: ask the bank for the vault again."

/** Why a vault absent from storage is refused, by its vaultlabel. */
export const vaultAbsent = (vaultlabel: string): string => `No vault is stored under the label ${vaultlabel}.`

export const boxAbsent = (boxlabel: string): string => `No box is stored under the label ${boxlabel}.`

/** Why a put that must find a box refuses where none is listed, with nothing fetched. */
export const boxNotListed = (boxlabel: string): string => `No box is listed under the label ${boxlabel}, though one may be stored: call vault.hello() to list what is stored.`


export const VaultDeleted = "This vault was deleted. Ask the bank for the vault again (bank.ensureVault) to make it anew."
// --

// == [Models: gates]: PasskeyHeldAlready, DelOfOtherLife

/** Why a passkey is not added to a gate that holds one. */
export const PasskeyHeldAlready = "This vault has a passkey already, and holds one at a time, so nothing was asked or changed: revoke it first (vault.revokePasskeyPrompt), then add the new one."

/** Why a stale Vault's delete does not reach the vault made since in its slot. */
export const DelOfOtherLife = "The vault listed in this slot is under another vault_tok than this Vault, and a delete names one life of a vault, so nothing was deleted. Read the vault again and ask again."
// --

// == [Models: banks, gatings and derivers]: InsecureContext, PositiveMinutesShape, GatingDismissed, AlreadyAsking, AttemptInFlight, GatingConcluded, RequestCleartextThrew, ClearsThrew, StrengthCheckerThrew, SamePassphrase, reservedDeriverLabel, suppliedSpecChanged, TestDeriverNotice

export const InsecureContext = "This page is not a secure context -- it was served over plain http -- so the browser withholds the cryptography the vault needs: serve the app over https (http://localhost counts as secure, for development)."

export const PositiveMinutesShape = "Expected a number of minutes above zero, fractions too (0.5 is thirty seconds), or Infinity for never"

export const GatingDismissed = "The prompt was dismissed before an attempt succeeded, so nothing was unlocked or changed: ask again when the user wants the vault."

export const AlreadyAsking = "A prompt is already open on this bank, so this one was not shown: the host owns the one dialog, and disables what opens it meanwhile."


export const AttemptInFlight = "An attempt is already under way on this prompt, so this one was not tried: disable the submit button until it answers."

export const GatingConcluded = "This prompt has ended -- it was answered, dismissed, or refused for good -- so this attempt did nothing: ask again if the user still wants the vault."

export const RequestCleartextThrew = "The requestCleartext handed to Bank.make threw rather than showing the prompt and resolving once it closed. What it threw is left out, as the prompt hears the passphrase."

export const ClearsThrew = "Reading what was handed to this attempt threw, so nothing was tried. What it threw is left out, as it may quote the passphrase: hand attempt a plain object."


export const StrengthCheckerThrew = "The strengthChecker handed to Bank.make threw, or answered a verdict that throws when read. What it threw is left out, as it heard the passphrase: have it catch its own failures."

export const SamePassphrase = "The new passphrase is the one the vault has already, so nothing was changed: choose another."

export const reservedDeriverLabel = (prefix: string): string => `Labels beginning ${prefix} are reserved for the specs safebyok supplies, present and future: choose a label of your own, naming your app, say.`

export const suppliedSpecChanged = (label: string): string => `A key deriver labelled ${label} must carry that spec's parameters exactly, or vaults made under it will not open elsewhere: spread the exported spec into yours, or choose a label of your own.`

export const TestDeriverNotice = "The keyDeriver's label begins test_, the mark of a deriver made cheap for tests: it gives a passphrase next to no protection against guessing. If this vault holds real secrets, open it with argon2idWebV1Deriver (from safebyok/browser), or another vetted Argon2id deriver."
// --

// == [The models' bank]: BankHelloFirst, BankLetGo, vaultStoredDamaged

export const BankHelloFirst = "This bank isn't ready: call bank.hello() and wait for it first."

export const BankLetGo = "This bank was let go, by a sweep or a vacate, so it answers nothing more: make another with Bank.make."

/** Bad news of a vault row `listVaults` set aside. */
export const vaultStoredDamaged = (vaultlabel: string): string => `The vault ${vaultlabel} is stored damaged, so it can't be read. It was left as it is.`
// --

// == [Refusals: outcomes and helpers]: NoErrorGiven, nonErrorThrown, StorageUnavailable, UnexpectedError, UnboundCipherCtx, StrengthCheckerMisanswered, StrengthCheckerLoadFailed, KeyDeriverLoadFailed

/** The cause's message where what failed threw null or undefined. */
export const NoErrorGiven = "What failed threw nothing: null or undefined, not an Error."

/** The cause's message where what failed threw a value that is neither an Error nor a string, `typeName` its typeof. */
export const nonErrorThrown = (typeName: string): string => `What failed threw a value of type ${typeName}, not an Error; that value is this error's cause.`

/** The message of `storage_unavailable` where an adapter says no more exactly what failed. */
export const StorageUnavailable = "The vault's storage could not be reached, or failed partway: try again shortly. The storage adapter's own error is this error's cause."

/** A bug, in safebyok or in a function the app handed it. */
export const UnexpectedError = "Something went wrong that safebyok did not expect: a bug, in safebyok or in a function the app handed it (a storage adapter, say). Nothing was retried, and a retry is unlikely to help; what was thrown is this error's cause."

/** A cipher ctx handed no stamp, or a part or field that is undefined or null. */
export const UnboundCipherCtx = "A cipher ctx was handed no stamp, or a part or a field of one that is undefined or null, which would bind as if it were something else, so nothing was encrypted or opened. This is a bug in the code calling it."

/** The host's strengthChecker answering no verdict. */
export const StrengthCheckerMisanswered = "The strengthChecker handed to Bank.make answered something other than a verdict: have it answer { strong: true }, or { strong: false, reason } with the reason as non-empty text."

/** The strengthChecker's load() failing at bank.hello(). */
export const StrengthCheckerLoadFailed = "The strengthChecker's load() failed: check your package and build settings."

/** The keyDeriver's load() failing at bank.hello(). */
export const KeyDeriverLoadFailed = "The keyDeriver's load() failed: check your package and build settings."
// --

// == [Refusals: vaultDB and deviceDB]: rowOfOtherAddress, VaultEmpty, VaultMismatch, VaultGone, StaleWrite, Camped, AbsentBox, gateIssue, RegisteredAtNotStored, boxTooLarge, VaultFull, StorageFull, SeqNotNext, deviceDBFailed, thrownNamed

/** A well-formed row out of storage, whose own `fieldnames` are not the address it was asked for at. */
export const rowOfOtherAddress = (fieldnames: readonly string[]): string => `The vault's storage answered with a row naming another ${fieldnames.join(' and ')} than the one asked for: the database or its storage adapter has filed it under the wrong address.`

/** No row stored for this life of the vault, where one was. */
export const VaultEmpty = "Nothing is stored for this life of the vault: read the vault again by its scope."

/** A live vault stored under another vault_tok than the call names. */
export const VaultMismatch = "A live vault stands here under another vault_tok, so nothing was read or written: read the vault again by its scope."

/** A vault deleted, its tombstone stored. */
export const VaultGone = "This vault was deleted."

/** What is stored moved since the revision the call names. */
export const StaleWrite = "What is stored moved since this revision was read, so nothing was written: read it again."

/** A live record stored where the call was told not to replace one. */
export const Camped = "A live record is already stored here, and this call was told not to replace it."

/** No box stored under the label asked. */
export const AbsentBox = "No box is stored under that label."

/** A change of the gate refused, `why` saying which check it failed. */
export const gateIssue = (why: string): string => `This change of the gate was refused: ${why}`

/** Why a gate verb naming a registered_at the stored vault does not hold is refused, as {@link gateIssue}'s `why`. */
export const RegisteredAtNotStored = "its registered_at is not the stored one."

/** A box record over the bytes its storage holds in one record. */
export const boxTooLarge = (recordBytes: number, maxRecordBytes: number): string => `That box weighs ${String(recordBytes)} bytes, over the ${String(maxRecordBytes)} its storage holds in one record.`

/** A vault holding as many boxes as its storage allows. */
export const VaultFull = "This vault holds as many boxes as its storage allows."

/** A write the storage itself had no room for. */
export const StorageFull = "The vault's storage has no room left for this write: free some, then try again. The storage adapter's own error is this error's cause."

/** A put whose revision_seq is not one past its prior's. */
export const SeqNotNext = "A record's revision_seq must be one past its prior's."

/** A device database's failure in `call`, `named` the sentence naming what it threw, or blank. */
export const deviceDBFailed = (call: string, named: string): string => `This device's own storage failed in ${call}: try again.${named}`

/** The sentence naming what a datastore threw, by its `name` alone. */
export const thrownNamed = (thrownName: string): string => ` It threw ${thrownName}.`
// --

// == [Refusals: storage backends]: storageFailed, StorageIssue, IdentityRevoked, NoBrowserDatastore, TransactionAborted, DatabaseClosed, StorageWithheld, BrowserDatadeviceDBFailed, SchemaNotServed, fetchFailed, WatchEnded

/** A vault's storage backend failing in `call`, `named` the sentence naming what it threw, or blank. */
export const storageFailed = (call: string, named: string): string => `The vault's storage could not be reached, or failed, in ${call}: try again shortly.${named}`

/** A row out of storage that is not an object at all. */
export const StorageIssue = "The vault's storage answered with a row that is not an object, which nothing safebyok writes could be. Trying again is unlikely to help: the database or its storage adapter needs someone to look at it."

/** A storage backend that no longer serves the user the call names. */
export const IdentityRevoked = "The vault's storage no longer serves this user: they signed out, or another user signed in. Open the vault again for the user signed in."

/** A context with no browser datastore (IndexedDB) at all. */
export const NoBrowserDatastore = "This context has no IndexedDB, so the vault has nowhere to keep its rows: run it in a browser that offers IndexedDB."

/** A browser datastore's transaction aborted before it committed. */
export const TransactionAborted = "An IndexedDB transaction was aborted before it committed, and wrote nothing: try again."

/** A browser datastore closed under the vault. */
export const DatabaseClosed = "The vault's IndexedDB database was closed under it, by the browser or another tab upgrading it: reload the page."

/** A browser datastore the page is not allowed to use. */
export const StorageWithheld = "The browser withholds IndexedDB from this page (site data blocked, or a private window that keeps none), so the vault has nowhere to keep its rows."

/** A browser datastore failing in a way none of the others names. */
export const BrowserDatastoreFailed = "IndexedDB failed while the vault was reading or writing its rows: try again shortly. IndexedDB's own error is this error's cause."

/** A GraphQL server whose answer lacks the field asked for. */
export const SchemaNotServed = "The GraphQL server answered without what was asked of it: is it serving safebyok-graphql's VaultSchemaSdl?"

/** A request to a GraphQL server that failed, named by what it threw, its HTTP status and its code, where each is known. */
export const fetchFailed = (thrownName: string, status: number | null, code: string | null): string => {
  const said = [thrownName, ...((status === null) ? [] : [`HTTP ${String(status)}`]), ...((code === null) ? [] : [code])]
  return `A request to the GraphQL server failed: ${said.join(', ')}.`
}

/** A watch's stream that the GraphQL server ended. */
export const WatchEnded = "The GraphQL server ended a watch's stream, so changes to its rows go unheard until the watch is started again."
// --
