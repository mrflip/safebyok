/** What the checks say when input fails them, every such sentence in one place, and the sentences of bank.ts's and vault.ts's own refusals and a vault's bad news (a refusal they pass on from another module, refusals.ts or gating.ts, keeps its words there): so wording and tone are reviewed together, and so is the rule that none quotes the input. */

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

// == [Values]: FunctionExpected, bytesExpected, LeaseKeyExpected, ListingExpected, VaultErrorExpected, LeftOutExpected

/** Anything but a function, where a host's verb or callback is asked. */
export const FunctionExpected = "Expected a function"

/** Anything but bytes, a Uint8Array, `count` of them when that many are asked. */
export const bytesExpected = (count?: number): string => (count === undefined ? "Expected bytes, a Uint8Array" : `Expected ${String(count)} bytes, a Uint8Array`)

/** Anything but a leaseKey as `makeLeaseKey` makes one, where a lease record keeps its key. */
export const LeaseKeyExpected = "Expected a non-extractable AES-GCM CryptoKey for wrapKey and unwrapKey"

/** The listing a storable is made in. */
export const ListingExpected = "Expected a Listing"

/** The `err` of a storage call's answer. */
export const VaultErrorExpected = "Expected a VaultError"

/** A field a bag must not carry beside another. */
export const LeftOutExpected = "Expected it left out"
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

// == [Vault: ways in]: PassphraseKept, NoPasskeyToRemove, PasskeyBeforePassphrase, ProvingBeforePassphrase, VaultChangedInStorage

/** Why a vault's passphrase is not removed: it can be replaced, never removed. */
export const PassphraseKept = "A vault keeps its passphrase: it can be replaced (putWayin('passphrase')), never removed. Nothing was changed."

/** Why removing a passkey the vault does not hold changes nothing. */
export const NoPasskeyToRemove = "This vault has no passkey to remove: it may have been removed on another device. Nothing was changed."

/** Why a passkey is not added to a vault with no passphrase yet. */
export const PasskeyBeforePassphrase = "This vault has no passphrase yet, and a passkey is added under the passphrase, so nothing was asked or changed: set the passphrase first -- ensureUnlocked() asks for it, with a passkey beside it if the dialog offers one -- then add the passkey."

/** Why a change that needs proving waits for the vault's first passphrase. */
export const ProvingBeforePassphrase = "This vault has no passphrase yet, so nothing can prove this change: set its passphrase first, as ensureUnlocked() or putWayin() does."

/** Why a new gate is not stored over a vault that changed in storage since this device read it. */
export const VaultChangedInStorage = "The vault changed in storage since this device read it -- a vault unlocker was changed, or it was deleted or made anew, elsewhere -- so this change was refused and nothing was written. Read the vault again before retrying."
// --

// == [Vault: lifecycle]: VaultLocked, VaultRemade, GateMoved, GatingLanded

/** Why a call that needs the vault unlocked does nothing while it is locked. */
export const VaultLocked = "The vault is locked, so nothing was read or written: call ensureUnlocked(), which asks the user through requestCleartext, and call again."

/** Why a call stops when its vault was deleted and made anew on another device as it worked. */
export const VaultRemade = "The vault this call was working on was deleted and made anew on another device, so nothing more was read or written: what the call held belongs to the vault that was deleted. Ask the bank for the vault again (bank.ensureVault), and unlock the one stored now."

/** Why a call stops when a wayin changed, here or on another device, as it worked. */
export const GateMoved = "A vault unlocker changed while this call was under way -- the passphrase or passkey was changed, here or on another device -- so nothing more was done. Unlock again to carry on."

/** Why a proof checked after its gating landed unlocks nothing. */
export const GatingLanded = "The prompt ended while this proof was being checked -- a lock landed, or it was answered or declined -- and its end wins: nothing was unlocked. Ask again when the user wants the vault."
// --

// == [Vault: options]: HelloOptionsAdvice, EnsureUnlockedOptionsAdvice, RenewPastLease, DemandOptionsAdvice

/** The advice a refusal of hello()'s options ends with: the one option it takes, and how a click handler hands it an event. */
export const HelloOptionsAdvice = "hello()'s only option is `staleMinutes`, how many minutes it trusts the vault's last read of storage. Handed to addEventListener or onClick as the handler itself, it is handed an event: wrap it, `() => vault.tryHello()`."

/** The advice a refusal of ensureUnlocked()'s options ends with: the one option it takes, and how a click handler hands it an event. */
export const EnsureUnlockedOptionsAdvice = "ensureUnlocked()'s only option is `renewMinutes`, how many minutes before the lease ends to ask the user anyway. Handed to addEventListener or onClick as the handler itself, it is handed an event: wrap it, `() => vault.tryEnsureUnlocked()`."

/** Why ensureUnlocked() refuses a renewMinutes as long as the lease or longer. */
export const RenewPastLease = "ensureUnlocked()'s renewMinutes is as long as the lease or longer (leaseHours), so every call would ask the user: give fewer minutes than the lease lasts, or leave it out. To ask every time, lock() once done."

/** The advice a refusal of demandConsistentWith()'s options ends with: the one option it takes. */
export const DemandOptionsAdvice = "demandConsistentWith()'s only option is `leaseBound`, true when the thing must also have a lease in force."
// --

// == [Vault: boxes]: BoxAbsent, NoWhisperToKeep, BoxDamagedBeyondNaming, whisperTooLarge, vaultFullOfBoxes, noRoomForBox, VaultGoneWhileGettingBox, VaultDeletedWhilePuttingBox

/** Why a call naming a box the vault does not hold refuses. */
export const BoxAbsent = "No box is stored under that boxlabel in this vault: its snapshot lists the ones it holds."

/** Why putBox() with no whisper, over a box the vault does not hold, refuses. */
export const NoWhisperToKeep = "No box is stored under that boxlabel, so there is no whisper to keep: hand putBox() the whisper to store."

/** Why nothing is written over a damaged box whose stored record names no revision. */
export const BoxDamagedBeyondNaming = "That box is damaged beyond naming: its stored record does not say which revision it is, so nothing can be written over it safely. Nothing was written. Remove it with delBox() first, then store its whisper again."

/** Why a whisper and sidecar over the vault's limit of `maxWhisperBytes` bytes of JSON together are not stored. */
export const whisperTooLarge = (maxWhisperBytes: number): string => `That whisper and its box's sidecar are over this vault's limit of ${String(maxWhisperBytes)} bytes of JSON together: check that the right value is being stored. If it really is meant to be this large, pass a larger maxWhisperBytes to Bank.make.`

/** Why a vault that holds its limit of `maxBoxes` boxes takes no new one. */
export const vaultFullOfBoxes = (maxBoxes: number): string => `This vault already holds its limit of ${String(maxBoxes)} boxes: remove one before storing another. A vault meant to hold more can be opened with a larger maxBoxes, up to what its storage adapter allows.`

/** Why a box that would take the vault past the `maxVaultBytes` its storage holds of one vault is not stored. */
export const noRoomForBox = (maxVaultBytes: number): string => `This vault has no room for that box in the ${String(maxVaultBytes)} bytes its storage holds of one vault, counting each box's boxlabel and room for a whisper and sidecar of maxWhisperBytes: remove a box, or store under a shorter boxlabel.`

/** Why a box is not read from a vault deleted, or deleted and made anew, on another device, and the Vault object is gone. */
export const VaultGoneWhileGettingBox = "The vault this device held was deleted, or deleted and made anew, on another device, so no box was read, and this Vault object is gone: what is stored now is another vault, or none. Ask the bank for the vault again (bank.ensureVault) to see what is stored."

/** Why a box is not stored into a vault deleted, or deleted and made anew, on another device as it was being stored. */
export const VaultDeletedWhilePuttingBox = "The vault was deleted, or deleted and made anew, on another device while this one was storing into it, so nothing was written. Read the vault again (hello) to see what is stored now."
// --

// == [Vault: bad news]: BoxStoredDamaged, WayinStoredDamaged, BadNewsHandlerThrew

/** Bad news of a box stored damaged, which its meta.box_listed names. */
export const BoxStoredDamaged = "A box in this vault is stored damaged, so it can't be read: this error's meta.box_listed names it. It was left as it is; remove it with delBox(), or store its whisper again over it."

/** Bad news of a wayin stored damaged, which its meta.wayin_listed names. */
export const WayinStoredDamaged = "One of this vault's unlockers is stored damaged, so it can't be tried: this error's meta.wayin_listed names it. The other vault unlocker, if the vault has one, still opens it. A damaged passkey is mended by adding the passkey again; a damaged passphrase only by removing the vault and making it again."

/** Why the vault's trouble holds a throw from the host's onBadNews handler. */
export const BadNewsHandlerThrew = "The onBadNews handler passed to Bank.make threw as it was told of bad news: fix the handler. What it threw is this error's cause. The call that met the news went on as it would have."
// --

// == [Storables]: RecordNotFull, MovedUnderEdit, AlreadyHeld, WhisperAndSidecarRequired, OneRevisionTwoToks, OneRevisionTwoFates, OtherVaultTok, ShapeUnreconciled

/** Why a record in hand that is not full cannot be opened. */
export const RecordNotFull = "The record in hand is not full, so it cannot be opened: hydrate it, and call again."

/** Why an edit laid over a central that moved while it was being made stages nothing. */
export const MovedUnderEdit = "Storage delivered a newer record while this edit was being made, so the edit was laid over a record storage no longer holds, and nothing was staged. The record in hand is the one delivered, and this refusal carries it: call again to edit it."

/** Why `build` makes nothing of a dna for a scope the listing already holds. */
export const AlreadyHeld = "This listing already holds an instance under the dna's scope, so build made nothing of the dna: edit the instance that listing.at(scope) answers, which also brings a deleted or damaged one back to life."

/** Why an update of a box given no whisper or no sidecar stages nothing. */
export const WhisperAndSidecarRequired = "Every update of a box names both its whisper and its sidecar, and this one lacked one or both, so nothing was staged: give both, as { whisper: { val }, sidecar }. To keep either as it is, give it again: box.unsealWhisper() answers the whisper stored, and box.sidecar, once that has hydrated the box, the sidecar."

/** Why a record storage holds under the revision_seq held, but another revision_tok, is not taken in. */
export const OneRevisionTwoToks = "Storage and this device disagree about one revision of a record: storage holds that revision_seq under another revision_tok, as if two puts landed as one revision. This device kept its own copy and did not take in the one storage sent. Fetching the record again is worth one try; if it refuses the same way, the system is fundamentally not working: storage lost or rewrote the record, and the storage adapter is where to look."

/** Why a record storage holds deleted at the revision held alive, or the other way round, is not taken in. */
export const OneRevisionTwoFates = "Storage and this device disagree about one revision of a record: one of them holds it alive and the other holds it deleted, or storage holds nothing for it. This device kept its own copy and did not take in what storage sent. Fetching the record again is worth one try; if it refuses the same way, the system is fundamentally not working: storage lost or rewrote the record, and the storage adapter is where to look."

/** Why a record under another vault_tok than the instance holds is not taken in. */
export const OtherVaultTok = "Storage holds this record under another vault_tok than this device holds it under: the vault was deleted and made anew, or storage mixed the records of two vaults. This device kept its own copy and did not take in the one storage sent. Load the vault again from storage, and its boxes with it: safebyok does not yet remake what it holds of a vault made anew."

/** Why a record under another vault_tok than the vault its listing lies in is not made into an instance. */
export const OtherVaultTokAtBirth = "Storage gave a record under another vault_tok than the vault this listing lies in, so no instance was made of it: the vault was deleted and made anew, or storage mixed the records of two vaults. Load the vault again from storage, and its boxes with it."

/** Why a record delivered under one scope that names another is not taken in. */
export const RecordOfOtherScope = "Storage answered with a record whose scope is not the one the answer says it is for, so nothing was made or changed of it: a bug in the storage adapter, which should answer each call with the record stored under the scope asked."

/** Why a put whose `revision_seq` does not fit the `revision_tok` it is laid over is refused, by this device before it is sent or by storage. */
export const PutUnfitForPrior = "A put's revision_seq does not fit the record it is laid over, so nothing was stored: revision 0 goes over no record, and each later revision over the record at the revision before it, named by its revision_tok. An edit mints the revision that fits: put the record an edit staged, not one as it was received or made elsewhere."

/** Why an answer for one scope that was asked for another is not taken in. */
export const AnswerOfOtherScope = "Storage answered for a scope other than the one asked, so nothing was made or changed of the answer: a bug in the storage adapter, which should answer each call about the scope it is given."

/** Why a pair of shapes no row of the reconcile table names is refused: a bug. */
export const ShapeUnreconciled = "An unexpected shape was reconciled: a bug in Storable."
// --
