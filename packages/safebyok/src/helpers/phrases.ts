/** Every sentence safebyok says to a host or a user: the messages of its refusals, checks, notices and bad news.
 * The rules for a refusal, its thrower and its phrase are at the top of refusals/throwers.ts.
 */

// In one file so that wording and tone are reviewed together, and so is the rule that no phrase quotes the input.

import { PassphraseSaltSize } from './consts'

// == [Names]: LabelShape, DeviceTokShape, UserIdMissing, UserIdChars

/** A label of the wrong shape. */
export const LabelShape = "A label is lowercase letters, digits and single underscores, starting with a letter and ending on a letter or digit, two characters at least"

/** A device_tok that is no UUID. */
export const DeviceTokShape = "A device_tok is a UUID, such as crypto.randomUUID() makes, kept by the host for this device"

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

/** Why a bankDB or deviceDB in the scope naming a vault refuses: each goes to `Device.make`. */
export const DatabaseInVaultScope = "A bankDB and a deviceDB go to Device.make, never in the scope naming a vault"
// --

// == [Values]: FunctionExpected, GuardedExpected, GuardedLoggerExpected, BankDBExpected, DeviceDBExpected, bytesExpected, LeaseKeyExpected, CtxStampExpected, ListingExpected, DeviceExpected, BankExpected, VaultExpected, VaultErrorExpected

/** Anything but a function, where a host's verb or callback is asked. */
export const FunctionExpected = "Expected a function"

/** A host's bare function, or anything else, where the core expects one `Device.make` has wrapped. */
export const GuardedExpected = "Expected a host's function as Device.make wraps it"

/** A host's bare logger, or anything else, where the core expects one `Device.make` has wrapped. */
export const GuardedLoggerExpected = "Expected a logger as Device.make guards it"

/** Anything but a bankDB branded by safebyok and answering each of its verbs, where a bankDB is asked. */
export const BankDBExpected = "Expected a BankDB: an adapter or client branded by safebyok, answering each of its verbs"

/** Anything but an instance of a class extending safebyok's DeviceDB, where a deviceDB is asked. */
export const DeviceDBExpected = "Expected a DeviceDB: an instance of a class extending safebyok's DeviceDB"

/** Anything but a Uint8Array, or one not `count` bytes long when a count is given. */
export function bytesExpected(count?: number): string { return (count === undefined ? "Expected bytes, a Uint8Array" : `Expected ${String(count)} bytes, a Uint8Array`) }

/** Anything but a leaseKey as `makeLeaseKey` makes one, where a lease record keeps its key. */
export const LeaseKeyExpected = "Expected a non-extractable AES-GCM CryptoKey for wrapKey and unwrapKey"

/** Anything but a stamp a lease binds a seal to. */
export const CtxStampExpected = "Expected a flat object of strings and numbers, with at least one field"

/** Anything but a listing, where a storable or a gating is given its listing. */
export const ListingExpected = "Expected a Listing"

/** Anything but a Device, where one is named. */
export const DeviceExpected = "Expected a Device"
/** Anything but a Bank, where one is named. */
export const BankExpected = "Expected a Bank"
/** Anything but a Vault, where one is named. */
export const VaultExpected = "Expected a Vault"

/** Anything but a VaultError, where bad news is told. */
export const VaultErrorExpected = "Expected a VaultError"
// --

// == [Passphrases]: passphraseSaltShape, passphraseTooShort, PassphraseGuessable, PassphraseUnjudged

/** A passphrase wayin's salt that is not `saltChars` characters of base64url text, for `saltBytes` bytes. */
export function passphraseSaltShape(saltBytes: number, saltChars: number): string { return `A passphrase salt is base64url text of ${String(saltBytes)} bytes: ${String(saltChars)} characters` }

/** zxcvbnStrengthChecker's reason for a new passphrase of fewer than `minChars` characters. */
export function passphraseTooShort(minChars: number): string { return `A passphrase needs ${String(minChars)} characters or more: a few words together make a strong one, and easy to remember.` }

/** zxcvbnStrengthChecker's reason for a new passphrase a guesser would reach early. */
export const PassphraseGuessable = "That passphrase would be easy to guess: add a word or two that don't usually go together, and leave out names, dates and this app's own words."

/** zxcvbnStrengthChecker's reason for a new passphrase it could not judge, as its dictionary did not load. */
export const PassphraseUnjudged = "This passphrase can't be checked just now: the list of common passwords it is checked against didn't load. Check your connection, then try again."
// --

// == [Passkeys]: PasskeyAnswerUsed, prfSaltShape

/** A passkey's answer whose PRF bytes are all zero, as a gating leaves an answer it has used. */
export const PasskeyAnswerUsed = "This passkey's answer was used already, and its bytes zeroed: ask the passkey again, as safebyok-react's askPasskey does, and hand in its fresh answer"

/** A passkey's salt that is not `count` bytes of base64url text. */
export function prfSaltShape(count: number): string { return `A passkey's salt is base64url text of ${String(count)} bytes` }
// --

// == [Options]: MinutesShape, KeyDeriverShape, LoggerShape, KeyDeriverSpecShape, memoryPerLane, StrengthCheckerShape

/** A `vaultRefreshMinutes` or `boxRefreshMinutes` that is no number of minutes. */
export const MinutesShape = "Expected a number of minutes, zero or more, fractions too (0.5 is thirty seconds), or Infinity"

/** A `keyDeriver` left out, or no object. */
export const KeyDeriverShape = `Expected a KeyDeriver: in a browser, argon2idWebV1Deriver from 'safebyok/browser'; elsewhere, your own, with a key_deriver_label, a salt_size of ${String(PassphraseSaltSize)} and a deriveKeyBytes function`

/** A `logger` that is no object. */
export const LoggerShape = "Expected a VaultLogger, with log, warn and error functions: leave it out for the default logger, or pass functions that do nothing to log nowhere"

/** A keyDeriverSpec that is no object. */
export const KeyDeriverSpecShape = `Expected a keyDeriverSpec: algorithm 'argon2id', key_deriver_label, memory_kib, iterations, parallelism, salt_size (${String(PassphraseSaltSize)}) and output_size`

/** An Argon2id spec with less than `minKib` of memory for each of its lanes. */
export function memoryPerLane(minKib: number): string { return `Expected at least ${String(minKib)} KiB of memory for each lane (parallelism)` }

/** A `strengthChecker` that is no checker. */
export const StrengthCheckerShape = "Expected a function from the passphrase, and the vault's scope, to a verdict, { strong: true } or { strong: false, reason }, its load, if it carries one, a function too. Pass zxcvbnStrengthChecker from safebyok/browser, or your own (notes/configuration.md, Pluggable Passphrase Strength Checker)"
// --

// == [Refusals]: unknownFields, moreFailures, WhisperShape, fieldsDisagree, BagNotObject, WhisperBagShape

/** An object with `count` fields it does not accept, and the `fieldnames` it does.
 * The refused fields are not named, as a name may be the caller's data.
 */
export function unknownFields(count: number, fieldnames: readonly string[]): string {
  const refused = count === 1 ? 'There is a field it does not accept (its name is not repeated)' : `There are ${String(count)} fields it does not accept (their names are not repeated)`
  const accepted = fieldnames.length === 0 ? 'it accepts no fields' : `it accepts only ${fieldnames.join(', ')}`
  return `${refused}: ${accepted}. Check the spelling, or leave ${count === 1 ? 'it' : 'them'} out`
}

/** How many more failures a refusal found than it names. */
export function moreFailures(count: number): string { return `and ${String(count)} more ${count === 1 ? 'failure' : 'failures'}` }

/** A whisper that is no plain object of JSON. */
export const WhisperShape = "A whisper is a plain object of JSON, with no symbol key anywhere: a bare string, number, boolean, array, null or undefined cannot be put, so wrap one as { apiKey: 'sk-...' }. To empty a box, delete it (null inside an array or object is fine)"
/** A bag whose `fieldnames` have other values than in the bag it is checked against. */
export function fieldsDisagree(fieldnames: readonly string[]): string { return `This has another ${fieldnames.join(' and ')} than what it is checked against: a field both have must agree` }

/** A bag to check another against that is not an object. */
export const BagNotObject = "What a bag is checked against is an object, with the fields to compare"

/** An object in a whisper or a sidecar that is not plain JSON. */
export const WhisperBagShape = "An object in a whisper or a sidecar is a plain object of JSON: strings, numbers, booleans, null, arrays and plain objects, never undefined, a Date, a Map, a class's instance or a symbol key"
// --

// == [Bank and vault]: otherScope

/** Why a scope naming another user_id or banklabel than the bank's is refused. It names the `fieldnames` that differ, never their values. */
export const otherScope = (fieldnames: readonly string[]): string => `This names another ${fieldnames.join(' and ')} than the bank's, which serves one app and one signed-in user. Use the bank of the app and user it belongs to.`
// --

// == [Vault: lifecycle]: BankLocked

/** Why a call that needs the bank unlocked does nothing while it is locked. */
export const BankLocked = "The bank is locked, so nothing was read or written: unlock it (bank.ensureUnlocked) and call again."

// --

// == [Vault: boxes]: RecordForNewBox

/** Why a create refuses a whole record, whose ciphertext it would otherwise reuse. */
export const RecordForNewBox = "A create operation found a record already present."
// --

// == [Storables]: PartialLoad, WrittenByOwnVerbs, PatchNamesNeitherHalf, patchOfOtherScope, WhisperedIsNoWhisper, NotExposed, BoxExpected, PuttingVeiledFields, NoFieldsBound, OneRevisionTwoToks, OneRevisionTwoFates, OneRevisionTwoLives

/** Why a record in hand that is not full cannot be opened. */
export const PartialLoad = "The record in hand is not full, so it cannot be opened: hydrate it, and call again."

/** Why a bank or a gate is never put or deleted as a vault or a box is. */
export const WrittenByOwnVerbs = "A bank's row and its gate's are written only by the bank's own verbs, so nothing was stored: build or change the bank through its prompts, and delete it with bank.delPrompt()."

/** Why an update of a box naming neither its whisper nor its sidecar writes nothing. */
export const PatchNamesNeitherHalf = "This update names neither a whisper nor a sidecar, so there is nothing to write."

/** Why an update of a box whose patch names another's scope writes nothing. */
export const patchOfOtherScope = (fieldnames: readonly string[]): string => `This update names another ${fieldnames.join(' and ')} than its own, so nothing was written: update the one it names, which listing.at(scope) answers.`

/** Why the stand-in a box returns for a whisper it will not show is refused where a whisper is wanted. */
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

/** Why a record stored deleted at a revision this device has live, or the other way round, is not adopted. */
export const OneRevisionTwoFates = "Storage and this device disagree about a record's history (one records a deleted record, the other a live one). Report this as a bug."

/** Why a record stored under the revision in hand, but of another life of the thing, is not adopted. */
export const OneRevisionTwoLives = "Storage and this device disagree about a record's history (it has been deleted and recreated). This should not happen: report this as a bug."

/** Why a record delivered under one scope that names another is not adopted. */
export const RecordOfOtherScope = "Storage delivered a misnamed record. This should not happen: report this as a bug."

/** Why storage's answer that nothing is stored is not adopted where this device has a live record. */
export const NothingStoredWhereLive = "Storage answered that nothing is stored where this device has a live record. This should not happen: report this as a bug."

/** Why a good answer whose record differs from what was sent in scope, life or revision is not adopted. */
export const AnswerNotAsSent = "Storage answered with a record other than the one it was asked about. This should not happen: report this as a bug."

// --

// == [Models: provings]: CleartextMissing, WrongPassphrase, WrongPasskey, NoPasskeyWayin, OtherPasskey, OtherPrfSalt, UnknownKeyDeriver, notKeyBytes, WayinNotMadeYet, WayinMadeAlready, ProvingOfOtherGate, LeaseOfOtherGate, StampOfOtherVault, KeyDeriverThrew

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

/** Why a passphrase wayin made under another key deriver than the device's is not tried. */
export const UnknownKeyDeriver = "This vault was made with a key deriver this package does not carry: update safebyok, or open the vault where it was made."

/** Why what a keyDeriver hands back is refused when it is not `count` fresh key bytes. */
export function notKeyBytes(count: number): string { return `The keyDeriver handed back something other than ${String(count)} fresh key bytes.` }

/** Why a proving asked for the bankKey before it has a wayin refuses, a bug in the caller. */
export const WayinNotMadeYet = "A proving was asked for the bankKey before it made or opened a wayin: a bug in the caller."

/** Why a proving that has a wayin already makes no other. */
export const WayinMadeAlready = "This proving has a wayin already, and a proving has one: make a new proving for another wayin. A bug in the caller."

/** Why a wayin is not made under the bankKey of a proving of another gate. */
export const ProvingOfOtherGate = "The source proving is of another bank or gate: a wayin is made only under the key of the bank it lets into, so none was made. This is a bug in safebyok."

/** Why a lease is not granted to a bank or gate other than the one a proving is of. */
export const LeaseOfOtherGate = "This proving is of another bank or gate: a lease is granted only to the bank and gate whose stamps its wayin binds, so none was granted. This is a bug in safebyok."

/** Why a seal verb refuses a stamp of another vault, or another life of it. */
export const StampOfOtherVault = "This stamp names another vault than this one, or another life of it, so nothing was sealed or opened. This is a bug in safebyok."

/** Why a keyDeriver's throw is replaced: it heard the passphrase. */
export const KeyDeriverThrew = "The keyDeriver threw rather than deriving a key. What it threw is left out, as it heard the passphrase."
// --

// == [Models: leases, vaults and boxes]: DamagedLease, UndecipheredWhisper, UndecodedWhisper, LeaseNotInForce, LetGoInstance, vaultAbsent, boxAbsent, boxNotListed, VaultDeleted

/** Why this device's lease is not used, whether it was found damaged in the cache or failed to open while in force. */
export const DamagedLease = "This device's lease is damaged and will not open, so it was not used: unlock the vault again to carry on."

/** Why a whisper that will not open under the vault's key is refused. */
export const UndecipheredWhisper = "That whisper would not open under this vault's key: it was altered in storage, or sealed under another vault. Nothing was changed."

/** Why a whisper that opened but is no whisper this package knows is refused. */
export const UndecodedWhisper = "That box opened, but what was inside is not a whisper this package knows, so it is damaged. It was left as it is; remove it, or seal a whisper over it."

/** Why a lease no longer in force opens nothing. */
export const LeaseNotInForce = "This lease is out of force, as the bank locked or the lease would not open, so nothing was read or written: unlock the bank again."

/** Why an instance whose bank or vault ended, or whose row was found damaged, answers nothing. */
export const LetGoInstance = "This object was let go: its bank or its vault ended, or its row was found damaged, so it answers nothing more: ask the device for its bank, and the bank for the vault, again."

/** Why a vault absent from storage is refused, by its vaultlabel. */
export function vaultAbsent(vaultlabel: string): string { return `No vault is stored under the label ${vaultlabel}.` }

/** Why a box absent from storage is refused, by its boxlabel. */
export function boxAbsent(boxlabel: string): string { return `No box is stored under the label ${boxlabel}.` }

/** Why a put that must find a box refuses where none is listed, with nothing fetched. */
export function boxNotListed(boxlabel: string): string { return `No box is listed under the label ${boxlabel}, though one may be stored: call vault.beginWatch() to list what is stored.` }

/** Why a call on a vault that was deleted is refused. */
export const VaultDeleted = "This vault was deleted. Ask the bank for the vault again (bank.ensureVault) to make it anew."
// --

// == [Models: gates]: PasskeyAlreadyAdded, DelOfOtherRevision, DelOfOtherLife

/** Why a passkey is not added to a gate that has one. */
export const PasskeyAlreadyAdded = "This vault has a passkey already, and may have only one, so nothing was asked or changed: revoke it first (bank.maingate.revokePasskeyPrompt), then add the new one."

/** Why a delete naming another life or revision than the one in hand deletes nothing. */
export const DelOfOtherRevision = "This thing is not at the life or revision the delete names, so nothing was deleted. Read it again and ask again."

/** Why a vault's delete deletes nothing where the vault listed is of another life. */
export const DelOfOtherLife = "The vault listed under this name is under another vault_tok than this Vault, and a delete names one life of a vault, so nothing was deleted. Read the vault again and ask again."
// --

// == [Models: banks, gatings and derivers]: InsecureContext, PositiveMinutesShape, GatingDismissed, AlreadyAsking, AttemptInFlight, GateMadeElsewhere, GatingConcluded, RequestCleartextThrew, CleartextsThrew, StrengthCheckerThrew, SamePassphrase, reservedDeriverLabel, suppliedSpecChanged, TestDeriverNotice

/** Why a device is not made on a page that is not a secure context. */
export const InsecureContext = "This page is not a secure context -- it was served over plain http -- so the browser withholds the cryptography the vault needs: serve the app over https (http://localhost counts as secure, for development)."

/** An `autolockMinutes` that is not a number of minutes above zero. */
export const PositiveMinutesShape = "Expected a number of minutes above zero, fractions too (0.5 is thirty seconds), or Infinity for never"

/** Why a gating dismissed before an attempt succeeded refuses its waiters. */
export const GatingDismissed = "The prompt was dismissed before an attempt succeeded, so nothing was unlocked or changed: ask again when the user wants the vault."

/** Why a prompt is not opened while another is open on the bank. */
export const AlreadyAsking = "A prompt is already open on this device, so this one was not shown: the host owns the one dialog, and disables what opens it meanwhile."

/** Why an attempt is not tried while another runs on the same prompt. */
export const AttemptInFlight = "An attempt is already under way on this prompt, so this one was not tried: disable the submit button until it answers."

/** Why a bank's first passphrase is not set where another device built the bank first. */
export const GateMadeElsewhere = "This vault's passphrase was just set on another device, so the one you entered was not set here, and nothing was changed. Enter the passphrase chosen there to unlock it."

/** Why an attempt on a prompt that has ended does nothing. */
export const GatingConcluded = "This prompt has ended -- it was answered, dismissed, or refused for good -- so this attempt did nothing: ask again if the user still wants the vault."

/** Why a `requestCleartext` throw is replaced: the prompt hears the passphrase. */
export const RequestCleartextThrew = "The requestCleartext handed to Device.make threw rather than showing the prompt and resolving once it closed. What it threw is left out, as the prompt hears the passphrase."

/** Why an attempt is not tried when reading what it was handed throws. */
export const CleartextsThrew = "Reading what was handed to this attempt threw, so nothing was tried. What it threw is left out, as it may quote the passphrase: hand attempt a plain object."

/** Why a `strengthChecker` throw is replaced: it heard the passphrase. */
export const StrengthCheckerThrew = "The strengthChecker handed to Device.make threw, or answered a verdict that throws when read. What it threw is left out, as it heard the passphrase: have it catch its own failures."

/** Why a passphrase replaced by itself changes nothing. */
export const SamePassphrase = "The new passphrase is the one the vault has already, so nothing was changed: choose another."

/** A key deriver's label beginning `prefix`, which is reserved for the specs safebyok supplies. */
export function reservedDeriverLabel(prefix: string): string { return `Labels beginning ${prefix} are reserved for the specs safebyok supplies, present and future: choose a label of your own, naming your app, say.` }

/** A key deriver under a supplied spec's `label` whose parameters differ from that spec's. */
export function suppliedSpecChanged(label: string): string { return `A key deriver labelled ${label} must carry that spec's parameters exactly, or vaults made under it will not open elsewhere: spread the exported spec into yours, or choose a label of your own.` }

/** The warning logged when a device is made with a test deriver, whose label begins `test_`. */
export const TestDeriverNotice = "The keyDeriver's label begins test_, the mark of a deriver made cheap for tests: it gives a passphrase next to no protection against guessing. If this vault has real secrets, open it with argon2idWebV1Deriver (from safebyok/browser), or another vetted Argon2id deriver."
// --

// == [The models' device and bank]: DeviceLetGo, GatesShape, vaultStoredDamaged, boxStoredDamaged

/** Why a device let go by a sweep or a vacate, and its bank, answer nothing. */
export const DeviceLetGo = "This device was let go, by a sweep or a vacate, so it and its bank answer nothing more: make another with Device.make."

/** A `gates` option other than `['main']`. */
export const GatesShape = "gates is ['main']: a bank has its main gate and no other"

/** Bad news of a vault row `listVaults` set aside. */
export function vaultStoredDamaged(vaultlabel: string): string { return `The vault ${vaultlabel} is stored damaged, so it can't be read. It was left as it is.` }

/** Bad news of a box row `listBoxes` set aside. */
export function boxStoredDamaged(boxlabel: string): string { return `The box ${boxlabel} is stored damaged, so it can't be read. It was left as it is.` }
// --

// == [Refusals: outcomes and helpers]: NoErrorGiven, nonErrorThrown, StorageUnavailable, UnexpectedError, UnboundCipherCtx, NoJsonText, StrengthCheckerMisanswered, StrengthCheckerLoadFailed, KeyDeriverLoadFailed

/** The cause's message where what failed threw null or undefined. */
export const NoErrorGiven = "What failed threw nothing: null or undefined, not an Error."

/** The cause's message where what failed threw a value that is neither an Error nor a string, `typeName` its typeof. */
export function nonErrorThrown(typeName: string): string { return `What failed threw a value of type ${typeName}, not an Error; that value is this error's cause.` }

/** The message of `storage_unavailable` where an adapter says no more of what failed. */
export const StorageUnavailable = "The vault's storage could not be reached, or failed partway: try again shortly. The storage adapter's own error is this error's cause."

/** A bug, in safebyok or in a function the app handed it. */
export const UnexpectedError = "Something went wrong that safebyok did not expect: a bug, in safebyok or in a function the app handed it (a storage adapter, say). Nothing was retried, and a retry is unlikely to help; what was thrown is this error's cause."

/** A cipher ctx given no stamp, or a part or field that is undefined or null. */
export const UnboundCipherCtx = "A cipher ctx was handed no stamp, or a part or a field of one that is undefined or null, which would bind as if it were something else, so nothing was encrypted or opened. This is a bug in the code calling it."

/** A value with no JSON text given to be serialized. */
export const NoJsonText = "A value with no JSON text (undefined, a function or a symbol) was handed to be serialized, so nothing was sealed or bound. This is a bug in the code calling it."

/** The host's strengthChecker returning no verdict. */
export const StrengthCheckerMisanswered = "The strengthChecker handed to Device.make answered something other than a verdict: have it answer { strong: true }, or { strong: false, reason } with the reason as non-empty text."

/** The strengthChecker's load() failing at device.ensureBank(). */
export const StrengthCheckerLoadFailed = "The strengthChecker's load() failed: check your package and build settings."

/** The keyDeriver's load() failing at device.ensureBank(). */
export const KeyDeriverLoadFailed = "The keyDeriver's load() failed: check your package and build settings."
// --

// == [Refusals: bankDB and deviceDB]: rowOfOtherAddress, gateIssue, RegisteredAtNotStored, OtherWayinMoved, boxTooLarge, StorageFull, SeqNotNext, RevisionTokNotNew, ExpectedHalfVoid, LifeTokMisplaced, ExpectedOfOtherVaultLife, GateVerbRecordMismatch, RecordOfOtherAddress, BankTokNotNew, GateOfOtherBank, GateNotBorn, MainGateMissing, deviceDBFailed, thrownNamed

/** A well-formed row from storage whose `fieldnames` name another address than the one asked for. */
export const rowOfOtherAddress = (fieldnames: readonly string[]): string => `The vault's storage answered with a row naming another ${fieldnames.join(' and ')} than the one asked for: the database or its storage adapter has filed it under the wrong address.`

/** A change of the gate refused, `why` saying which check it failed. */
export function gateIssue(why: string): string { return `This change of the gate was refused: ${why}` }

/** Why a gate verb naming a registered_at the stored gate does not have is refused, as {@link gateIssue}'s `why`. */
export const RegisteredAtNotStored = "its registered_at is not the stored one."

/** Why a gate verb whose record moves a wayin the verb leaves alone is refused, as {@link gateIssue}'s `why`. */
export const OtherWayinMoved = "it moves a wayin this verb does not."

/** A box record over the bytes its storage allows in one record. */
export function boxTooLarge(recordSizeEst: number, maxRecordSizeEst: number): string { return `That box weighs ${String(recordSizeEst)} bytes, over the ${String(maxRecordSizeEst)} its storage allows in one record.` }

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

/** Why a bankDB's box request is refused for the row it expects: both must be in the same life of the vault and of its bank. */
export const ExpectedOfOtherVaultLife = "A box's ask and the row it expects name the same bank_tok and vault_tok."

/** Why a gate verb's put is refused for its record: `addPasskey` adds a passkey wayin, and `revokePasskey` removes it. */
export const GateVerbRecordMismatch = "addPasskey's record has a passkey wayin, and revokePasskey's has none."

/** Why a put or del is refused for its record: the record must be at the request's address. */
export const RecordOfOtherAddress = "A put's or del's record is at the address its ask names."

/** Why a `buildBank` ask is refused for its bank record: a bank is built under a life tok of its own. */
export const BankTokNotNew = "buildBank's bank record brings a new bank_tok: neither the one of the row it expects, nor the void row's."

/** Why a `buildBank` ask is refused for its gate record: the gate is at its bank's scope, under the bank record's bank_tok. */
export const GateOfOtherBank = "buildBank's gate record is at its bank's scope, under its bank record's bank_tok."

/** Why a `buildBank` ask is refused for its gate record: a gate is built as the first revision of a new life. */
export const GateNotBorn = "buildBank's gate record is a first revision: revision_seq 0, with a revision_tok and a gate_tok of its own."

/** A live bank row stored without its `main` gate row. */
export const MainGateMissing = "This bank is stored without its main gate: the database or its storage adapter has lost a row."

/** A device database's failure in `oplabel`. `named` is the sentence naming what it threw, or blank. */
export function deviceDBFailed(oplabel: string, named: string): string { return `This device's own storage failed in ${oplabel}: try again.${named}` }

/** The sentence naming what a datastore threw, by its `name` alone. */
export function thrownNamed(thrownName: string): string { return ` It threw ${thrownName}.` }
// --

// == [Refusals: storage backends]: storageFailed, StorageIssue, IdentityRevoked, NoBrowserDatastore, TransactionAborted, DatabaseClosed, StorageWithheld, BrowserDatadeviceDBFailed, SchemaNotServed, fetchFailed, WatchEnded

/** A bankDB's backend failing in `oplabel`. `named` is the sentence naming what it threw, or blank. */
export function storageFailed(oplabel: string, named: string): string { return `The vault's storage could not be reached, or failed, in ${oplabel}: try again shortly.${named}` }

/** A row out of storage that is not an object at all. */
export const StorageIssue = "The vault's storage answered with a row that is not an object, which nothing safebyok writes could be. Trying again is unlikely to help: the database or its storage adapter needs someone to look at it."

/** A storage backend that no longer serves the user the call names. */
export const IdentityRevoked = "The vault's storage no longer serves this user: they signed out, or another user signed in. Open the vault again for the user signed in."

/** A context with no browser datastore (IndexedDB) at all. */
export const NoBrowserDatastore = "This context has no IndexedDB, so the vault has nowhere to keep its rows: run it in a browser that offers IndexedDB."

/** A browser datastore's transaction aborted before it committed. */
export const TransactionAborted = "An IndexedDB transaction was aborted before it committed, and wrote nothing: try again."

/** A browser datastore closed while in use. */
export const DatabaseClosed = "The vault's IndexedDB database was closed under it, by the browser or another tab upgrading it: reload the page."

/** A browser datastore the page is not allowed to use. */
export const StorageWithheld = "The browser withholds IndexedDB from this page (site data blocked, or a private window that keeps none), so the vault has nowhere to keep its rows."

/** A browser datastore failing in a way none of the others names. */
export const BrowserDatastoreFailed = "IndexedDB failed while the vault was reading or writing its rows: try again shortly. IndexedDB's own error is this error's cause."

/** A GraphQL server whose answer lacks the field asked for. */
export const SchemaNotServed = "The GraphQL server answered without what was asked of it: is it serving safebyok-graphql's BankSchemaSdl?"

/** A request to a GraphQL server that failed, named by what it threw, its HTTP status and its code, where each is known. */
export function fetchFailed(thrownName: string, status: number | null, code: string | null): string {
  const said = [thrownName, ...((status === null) ? [] : [`HTTP ${String(status)}`]), ...((code === null) ? [] : [code])]
  return `A request to the GraphQL server failed: ${said.join(', ')}.`
}

/** A watch's stream that the GraphQL server ended. */
export const WatchEnded = "The GraphQL server ended a watch's stream, so changes to its rows go unheard until the watch is started again."
// --
