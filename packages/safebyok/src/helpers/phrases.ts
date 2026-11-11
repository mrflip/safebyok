/** What the checks say when input fails them, every such sentence in one place, and the sentences of bank.ts's and vault.ts's own refusals and a vault's bad news (a refusal they pass on from another module, refusals.ts or gating.ts, keeps its words there): so wording and tone are reviewed together, and so is the rule that none quotes the input.
 * The rules for a refusal, its thrower and its phrase are at the top of refusals/throwers.ts.
 */

import { PassphraseSaltBytes } from './consts'

// == [Names]: LabelShape, DeviceIdShape, UserIdMissing, UserIdChars

/** A label of the wrong shape. */
export const LabelShape = "A label is lowercase letters, digits and single underscores, starting with a letter and ending on a letter or digit, two characters at least"

/** A device_id that is no UUID. */
export const DeviceIdShape = "A device_id is a UUID, such as crypto.randomUUID() makes, kept by the host for this device"

/** An empty user_id. */
export const UserIdMissing = "A user_id names the signed-in user, so it can't be empty"

/** A user_id containing a character outside its set, or only dots. */
export const UserIdChars = "A user_id is ASCII letters, digits and - _ . ~ : @ + | %, and not dots alone: percent-encode (RFC 3986) any other character"
// --

// == [Instants]: InstantTooEarly, InstantTooLate

/** An instant before 1981. */
export const InstantTooEarly = "An instant is epoch milliseconds no earlier than 1981; a smaller number is likely epoch seconds"

/** An instant after 2255. */
export const InstantTooLate = "An instant is epoch milliseconds no later than 2255; a larger number is likely epoch microseconds"
// --

// == [Scopes]: DatabaseInVaultScope

/** Why a vaultDB or deviceDB in the scope naming a vault refuses: each goes to `Bank.make`. */
export const DatabaseInVaultScope = "A vaultDB and a deviceDB go to Bank.make, never in the scope naming a vault"
// --

// == [Values]: FunctionExpected, GuardedExpected, GuardedLoggerExpected, VaultDBExpected, DeviceDBExpected, bytesExpected, LeaseKeyExpected, CtxStampExpected, ListingExpected, BankExpected, VaultExpected, VaultErrorExpected

/** Anything but a function, where a host's verb or callback is asked. */
export const FunctionExpected = "Expected a function"

/** A host's bare function, or anything else, where a bank's world has that function as the bank wraps it. */
export const GuardedExpected = "Expected a host's function as Bank.make wraps it"

/** A host's bare logger, or anything else, where a bank's world has its logger as the bank guards it. */
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
export const VaultExpected = "Expected a Vault"

/** Anything but a VaultError, where bad news is told. */
export const VaultErrorExpected = "Expected a VaultError"
// --

// == [Passphrases]: passphraseSaltShape, passphraseTooShort, PassphraseGuessable, PassphraseUnjudged

/** A passphrase wayin's salt that is not `saltChars` characters of base64url text, for `saltBytes` bytes. */
export const passphraseSaltShape = (saltBytes: number, saltChars: number): string => `A passphrase salt is base64url text of ${String(saltBytes)} bytes: ${String(saltChars)} characters`

/** zxcvbnStrengthChecker's reason for a new passphrase of fewer than `minChars` characters. */
export const passphraseTooShort = (minChars: number): string => `A passphrase needs ${String(minChars)} characters or more: a few words together make a strong one, and easy to remember.`

/** zxcvbnStrengthChecker's reason for a new passphrase a guesser would reach early. */
export const PassphraseGuessable = "That passphrase would be easy to guess: add a word or two that don't usually go together, and leave out names, dates and this app's own words."

/** zxcvbnStrengthChecker's reason for a new passphrase it could not judge, as its dictionary did not load. */
export const PassphraseUnjudged = "This passphrase can't be checked just now: the list of common passwords it is checked against didn't load. Check your connection, then try again."
// --

// == [Passkeys]: PasskeyAnswerUsed, prfSaltShape

/** A passkey's answer whose PRF bytes are zeroed: the vault zeroes an answer once it has used it. */
export const PasskeyAnswerUsed = "This passkey's answer was used already, and its bytes zeroed: ask the passkey again, as safebyok-react's askPasskey does, and hand in its fresh answer"

/** A passkey's salt that is not `count` bytes of base64url text. */
export const prfSaltShape = (count: number): string => `A passkey's salt is base64url text of ${String(count)} bytes`
// --

// == [Options]: MinutesShape, KeyDeriverShape, LoggerShape, KeyDeriverSpecShape, memoryPerLane, StrengthCheckerShape

/** A `staleMinutes` or `renewMinutes` that is no number of minutes. */
export const MinutesShape = "Expected a number of minutes, zero or more, fractions too (0.5 is thirty seconds), or Infinity"

/** A `keyDeriver` left out, or no object. */
export const KeyDeriverShape = `Expected a KeyDeriver: in a browser, argon2idWebV1Deriver from 'safebyok/browser'; elsewhere, your own, with a key_deriver_label, a salt_bytes of ${String(PassphraseSaltBytes)} and a deriveKeyBytes function`

/** A `logger` that is no object. */
export const LoggerShape = "Expected a VaultLogger, with log, warn and error functions: leave it out for the default logger, or pass functions that do nothing to log nowhere"

/** A keyDeriverSpec that is no object. */
export const KeyDeriverSpecShape = `Expected a keyDeriverSpec: algorithm 'argon2id', key_deriver_label, memory_kib, iterations, parallelism, salt_bytes (${String(PassphraseSaltBytes)}) and output_bytes`

/** An Argon2id spec with less than `minKib` of memory for each of its lanes. */
export const memoryPerLane = (minKib: number): string => `Expected at least ${String(minKib)} KiB of memory for each lane (parallelism)`

/** A `strengthChecker` that is no checker. */
export const StrengthCheckerShape = "Expected a function from the passphrase, and the vault's scope, to a verdict, { strong: true } or { strong: false, reason }, its load, if it carries one, a function too. Pass zxcvbnStrengthChecker from safebyok/browser, or your own (notes/configuration.md, Pluggable Passphrase Strength Checker)"
// --

// == [Refusals]: unknownFields, moreFailures, WhisperShape, fieldsDisagree, BagNotObject, WhisperBagShape

/** An object with `count` fields it does not accept, never named, as a name may be the caller's data, and the `fieldnames` it accepts. */
export const unknownFields = (count: number, fieldnames: readonly string[]): string => {
  const refused = count === 1 ? 'There is a field it does not accept (its name is not repeated)' : `There are ${String(count)} fields it does not accept (their names are not repeated)`
  const accepted = fieldnames.length === 0 ? 'it accepts no fields' : `it accepts only ${fieldnames.join(', ')}`
  return `${refused}: ${accepted}. Check the spelling, or leave ${count === 1 ? 'it' : 'them'} out`
}

/** How many more failures a refusal found than it names. */
export const moreFailures = (count: number): string => `and ${String(count)} more ${count === 1 ? 'failure' : 'failures'}`

/** A whisper that is no plain object of JSON. */
export const WhisperShape = "A whisper is a plain object of JSON, with no symbol key anywhere: a bare string, number, boolean, array, null or undefined cannot be put, so wrap one as { apiKey: 'sk-...' }. To empty a box, delete it (null inside an array or object is fine)"
/** A bag whose `fieldnames` have other values than in the bag it is checked against. */
export const fieldsDisagree = (fieldnames: readonly string[]): string => `This has another ${fieldnames.join(' and ')} than what it is checked against: a field both have must agree`

/** A bag to check another against that is not an object. */
export const BagNotObject = "What a bag is checked against is an object, with the fields to compare"

/** An object in a whisper or a sidecar that is not plain JSON. */
export const WhisperBagShape = "An object in a whisper or a sidecar is a plain object of JSON: strings, numbers, booleans, null, arrays and plain objects, never undefined, a Date, a Map, a class's instance or a symbol key"
// --

// == [Bank and vault]: otherScope

/** Why a scope naming another applabel or user_id than the bank's refuses, `fieldnames` the ones that differ, never their values. */
export const otherScope = (fieldnames: readonly string[]): string => `This names another ${fieldnames.join(' and ')} than the bank's, which serves one app and one signed-in user. Use the bank of the app and user it belongs to.`
// --

// == [Vault: lifecycle]: VaultLocked

/** Why a call that needs the vault unlocked does nothing while it is locked. */
export const VaultLocked = "The vault locked mid-operation. Please unlock again to carry on."

// --

// == [Vault: boxes]: RecordForNewBox

/** Why a put told to only create refuses a whole record: what it would put is recycled. */
export const RecordForNewBox = "A create operation found a record already present."
// --

// == [Storables]: PartialLoad, AlreadyListed, PatchNamesNeitherHalf, patchOfOtherScope, WhisperedIsNoWhisper, NotExposed, BoxExpected, PuttingVeiledFields, NoFieldsBound, OneRevisionTwoToks, OneRevisionTwoFates, OneRevisionTwoLives, OtherVaultTok, ShapeUnreconciled

/** Why a record in hand that is not full cannot be opened. */
export const PartialLoad = "The record in hand is not full, so it cannot be opened: hydrate it, and call again."

/** Why a birth makes nothing of a dna for a scope the listing already has alive. */
export const AlreadyListed = "This listing already has an instance under the dna's scope, so nothing was made of the dna: listing.at(scope) answers it."

/** Why an update of a box naming neither its whisper nor its sidecar writes nothing. */
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
export const PuttingVeiledFields = "This box's whisper is veiled, so its fields have no whisper to put: call box.unveil() first."

/** Why saving a box's fields is refused with none to read. */
export const NoFieldsBound = "This box has no field bound, so there is nothing to put: bind one with BoxFields.of(box).bind(path), or call box.putExposed()."

/** Why a record stored under the revision_seq in hand, but another revision_tok, is not adopted. */
export const OneRevisionTwoToks = "Storage and this device disagree about a record's history (the expected revision sequence matched, but its confirming token did not). Report this as a bug."

/** Why a record stored deleted, at a revision the instance has alive, or the other way round, is not adopted. */
export const OneRevisionTwoFates = "Storage and this device disagree about a record's history (one records a deleted record, the other a live one). Report this as a bug."

/** Why a record stored under the revision in hand, but of another life of the thing, is not adopted. */
export const OneRevisionTwoLives = "Storage and this device disagree about a record's history (it has been deleted and recreated). This should not happen: report this as a bug."

/** Why a record under another vault_tok than the instance has is not adopted. */
export const OtherVaultTok = "Storage delivered a record from a deleted vault. This should not happen: report this as a bug."

/** Why a record delivered under one scope that names another is not adopted. */
export const RecordOfOtherScope = "Storage delivered a misnamed record. This should not happen: report this as a bug."

/** Why a good answer whose record differs from what was sent in scope, life or revision is not adopted. */
export const AnswerNotAsSent = "Storage answered with a record other than the one it was asked about. This should not happen: report this as a bug."

/** Why a pair of shapes no row of the reconcile table names is refused: a bug. */
export const ShapeUnreconciled = "An unexpected shape was reconciled: a bug in Storable."
// --

// == [Models: provings]: CleartextMissing, WrongPassphrase, WrongPasskey, NoPasskeyWayin, OtherPasskey, OtherPrfSalt, UnknownKeyDeriver, notKeyBytes, WayinNotMadeYet, WayinMadeAlready, ProvingOfOtherVault, LeaseOfOtherVault, StampOfOtherVault, KeyDeriverThrew

/** Why cleartexts that hand in neither a passphrase nor a passkey's answer are refused. */
export const CleartextMissing = "An attempt hands in the vault's passphrase or a passkey's answer, and this one handed in neither, so nothing was tried."

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

/** Why what a keyDeriver hands back is refused when it is not `count` fresh key bytes. */
export const notKeyBytes = (count: number): string => `The keyDeriver handed back something other than ${String(count)} fresh key bytes.`

/** Why a proving asked for the vaultKey before it has a wayin refuses: a bug. */
export const WayinNotMadeYet = "A proving was asked for the vaultKey before it made or opened a wayin: a bug in the caller."

/** Why a proving that has a wayin already makes no other. */
export const WayinMadeAlready = "This proving has a wayin already, and a proving has one: make a new proving for another wayin. A bug in the caller."

/** Why a wayin is not made under the vaultKey of a proving of another vault. */
export const ProvingOfOtherVault = "The source proving is of another vault: a wayin is made only under the vaultKey of the vault it lets into, so none was made. This is a bug in safebyok."

/** Why a lease is not granted to a vault other than the one a proving is of. */
export const LeaseOfOtherVault = "This proving is of another vault: a lease is granted only to the vault whose stamp its wayin binds, so none was granted. This is a bug in safebyok."

/** Why a seal verb refuses a stamp of another vault, or another life of it. */
export const StampOfOtherVault = "This stamp names another vault than this one, or another life of it, so nothing was sealed or opened. This is a bug in safebyok."

/** Why a keyDeriver's throw is replaced: it heard the passphrase. */
export const KeyDeriverThrew = "The keyDeriver threw rather than deriving a key. What it threw is left out, as it heard the passphrase."
// --

// == [Models: leases, vaults and boxes]: DamagedLease, UndecipheredWhisper, UndecodedWhisper, LeaseNotInForce, UnlockFirst, LetGoInstance, vaultAbsent, boxAbsent, boxNotListed, VaultDeleted

/** Why a lease on this device is no use: whether found so in the cache, or in force and failing to open. */
export const DamagedLease = "This device's lease is damaged and will not open, so it was not used: unlock the vault again to carry on."

/** Why a whisper that will not open under the vault's key is refused. */
export const UndecipheredWhisper = "That whisper would not open under this vault's key: it was altered in storage, or sealed under another vault. Nothing was changed."

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

// == [Models: gates]: PasskeyAlreadyAdded, DelOfOtherRevision, DelOfOtherLife

/** Why a passkey is not added to a gate that has one. */
export const PasskeyAlreadyAdded = "This vault has a passkey already, and may have only one, so nothing was asked or changed: revoke it first (vault.revokePasskeyPrompt), then add the new one."

/** Why a stale Vault's delete does not reach the vault made since in its slot. */
export const DelOfOtherRevision = "This thing is not at the life or revision the delete names, so nothing was deleted. Read it again and ask again."

export const DelOfOtherLife = "The vault listed in this slot is under another vault_tok than this Vault, and a delete names one life of a vault, so nothing was deleted. Read the vault again and ask again."
// --

// == [Models: banks, gatings and derivers]: InsecureContext, PositiveMinutesShape, GatingDismissed, AlreadyAsking, AttemptInFlight, GateMadeElsewhere, GatingConcluded, RequestCleartextThrew, CleartextsThrew, StrengthCheckerThrew, SamePassphrase, reservedDeriverLabel, suppliedSpecChanged, TestDeriverNotice

export const InsecureContext = "This page is not a secure context -- it was served over plain http -- so the browser withholds the cryptography the vault needs: serve the app over https (http://localhost counts as secure, for development)."

export const PositiveMinutesShape = "Expected a number of minutes above zero, fractions too (0.5 is thirty seconds), or Infinity for never"

export const GatingDismissed = "The prompt was dismissed before an attempt succeeded, so nothing was unlocked or changed: ask again when the user wants the vault."

export const AlreadyAsking = "A prompt is already open on this bank, so this one was not shown: the host owns the one dialog, and disables what opens it meanwhile."


export const AttemptInFlight = "An attempt is already under way on this prompt, so this one was not tried: disable the submit button until it answers."

export const GateMadeElsewhere = "This vault's passphrase was just set on another device, so the one you entered was not set here, and nothing was changed. Enter the passphrase chosen there to unlock it."

export const GatingConcluded = "This prompt has ended -- it was answered, dismissed, or refused for good -- so this attempt did nothing: ask again if the user still wants the vault."

export const RequestCleartextThrew = "The requestCleartext handed to Bank.make threw rather than showing the prompt and resolving once it closed. What it threw is left out, as the prompt hears the passphrase."

export const CleartextsThrew = "Reading what was handed to this attempt threw, so nothing was tried. What it threw is left out, as it may quote the passphrase: hand attempt a plain object."


export const StrengthCheckerThrew = "The strengthChecker handed to Bank.make threw, or answered a verdict that throws when read. What it threw is left out, as it heard the passphrase: have it catch its own failures."

export const SamePassphrase = "The new passphrase is the one the vault has already, so nothing was changed: choose another."

export const reservedDeriverLabel = (prefix: string): string => `Labels beginning ${prefix} are reserved for the specs safebyok supplies, present and future: choose a label of your own, naming your app, say.`

export const suppliedSpecChanged = (label: string): string => `A key deriver labelled ${label} must carry that spec's parameters exactly, or vaults made under it will not open elsewhere: spread the exported spec into yours, or choose a label of your own.`

export const TestDeriverNotice = "The keyDeriver's label begins test_, the mark of a deriver made cheap for tests: it gives a passphrase next to no protection against guessing. If this vault has real secrets, open it with argon2idWebV1Deriver (from safebyok/browser), or another vetted Argon2id deriver."
// --

// == [The models' bank]: BankHelloFirst, BankLetGo, vaultStoredDamaged, boxStoredDamaged

export const BankHelloFirst = "This bank isn't ready: call bank.hello() and wait for it first."

export const BankLetGo = "This bank was let go, by a sweep or a vacate, so it answers nothing more: make another with Bank.make."

/** Bad news of a vault row `listVaults` set aside. */
export const vaultStoredDamaged = (vaultlabel: string): string => `The vault ${vaultlabel} is stored damaged, so it can't be read. It was left as it is.`

/** Bad news of a box row `listBoxes` set aside. */
export const boxStoredDamaged = (boxlabel: string): string => `The box ${boxlabel} is stored damaged, so it can't be read. It was left as it is.`
// --

// == [Refusals: outcomes and helpers]: NoErrorGiven, nonErrorThrown, StorageUnavailable, UnexpectedError, UnboundCipherCtx, NoJsonText, StrengthCheckerMisanswered, StrengthCheckerLoadFailed, KeyDeriverLoadFailed

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

/** A value with no JSON text handed to be serialized. */
export const NoJsonText = "A value with no JSON text (undefined, a function or a symbol) was handed to be serialized, so nothing was sealed or bound. This is a bug in the code calling it."

/** The host's strengthChecker answering no verdict. */
export const StrengthCheckerMisanswered = "The strengthChecker handed to Bank.make answered something other than a verdict: have it answer { strong: true }, or { strong: false, reason } with the reason as non-empty text."

/** The strengthChecker's load() failing at bank.hello(). */
export const StrengthCheckerLoadFailed = "The strengthChecker's load() failed: check your package and build settings."

/** The keyDeriver's load() failing at bank.hello(). */
export const KeyDeriverLoadFailed = "The keyDeriver's load() failed: check your package and build settings."
// --

// == [Refusals: vaultDB and deviceDB]: rowOfOtherAddress, VaultEmpty, VaultReborn, VaultGone, StaleWrite, Camped, AbsentBox, gateIssue, RegisteredAtNotStored, GateEpochNotNext, OtherWayinMoved, boxTooLarge, VaultFull, StorageFull, SeqNotNext, RevisionTokNotNew, ExpectedHalfVoid, LifeTokMisplaced, ExpectedOfOtherVault, GateVerbRecordMismatch, RecordOfOtherAddress, deviceDBFailed, thrownNamed

/** A well-formed row out of storage, whose own `fieldnames` are not the address it was asked for at. */
export const rowOfOtherAddress = (fieldnames: readonly string[]): string => `The vault's storage answered with a row naming another ${fieldnames.join(' and ')} than the one asked for: the database or its storage adapter has filed it under the wrong address.`

/** No row stored for this life of the vault, where one was. */
export const VaultEmpty = "Nothing is stored for this life of the vault: read the vault again by its scope."

/** A live vault stored under another vault_tok than the call names. */
export const VaultReborn = "A live vault stands here under another vault_tok, so nothing was read or written: read the vault again by its scope."

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

/** Why a gate verb naming a registered_at the stored vault does not have is refused, as {@link gateIssue}'s `why`. */
export const RegisteredAtNotStored = "its registered_at is not the stored one."

/** Why a gate verb whose record does not move `gate_epoch` one up from the stored vault is refused, as {@link gateIssue}'s `why`. */
export const GateEpochNotNext = "its gate_epoch is not one past the stored one."

/** Why a gate verb whose record moves a wayin the verb leaves alone is refused, as {@link gateIssue}'s `why`. */
export const OtherWayinMoved = "it moves a wayin this verb does not."

/** A box record over the bytes its storage allows in one record. */
export const boxTooLarge = (recordBytes: number, maxRecordBytes: number): string => `That box weighs ${String(recordBytes)} bytes, over the ${String(maxRecordBytes)} its storage allows in one record.`

/** A vault with as many boxes as its storage allows. */
export const VaultFull = "This vault has as many boxes as its storage allows."

/** A write the storage itself had no room for. */
export const StorageFull = "The vault's storage has no room left for this write: free some, then try again. The storage adapter's own error is this error's cause."

/** A put whose revision_seq is not one past its prior's. */
export const SeqNotNext = "A record's revision_seq must be one past its prior's."

/** Why a write's record is refused for its `revision_tok`: every revision is written under a tok of its own. */
export const RevisionTokNotNew = "A record's revision_tok must be new: neither the one of the row it expects, nor the void row's."

/** Why a write is refused for the revision it expects: the void row's revision is cited whole or not at all. */
export const ExpectedHalfVoid = "The revision a write expects is the void row's, tok and seq together, or neither of them."

/** Why a write's record is refused for its life tok: a life begins over a tombstone or nothing, and lasts until it is deleted. */
export const LifeTokMisplaced = "A record keeps the life tok of the live row it replaces. A tombstone, and a record over a tombstone or nothing, brings a new one."

/** Why a box request is refused for the row it expects: both must be in the same vault life. */
export const ExpectedOfOtherVault = "A box's ask and the row it expects name the same vault_tok."

/** Why a gate verb's put is refused for its record: `addPasskey` adds a passkey wayin, and `revokePasskey` removes it. */
export const GateVerbRecordMismatch = "addPasskey's record has a passkey wayin, and revokePasskey's has none."

/** Why a put or del is refused for its record: the record must be at the request's address. */
export const RecordOfOtherAddress = "A put's or del's record is at the address its ask names."

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
