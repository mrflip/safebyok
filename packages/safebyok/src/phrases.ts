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

// == [Records]: GateEpochAndGate, VaultlabelRepeated

/** A vault record whose `gate_epoch` and `gate` disagree: a gate at epoch 0, or none at a later epoch. */
export const GateEpochAndGate = "A vault record's gate_epoch is 0 exactly when its gate is null: a novel vault has neither, and a gated one both"

/** A device record naming one vault twice among the epochs it has seen. */
export const VaultlabelRepeated = "A device record names each vault at most once among the gate epochs it has seen"
// --

// == [Bags]: StoreInVaultBag

/** Why a store in the bag naming a vault refuses: it goes in the second bag, the options. */
export const StoreInVaultBag = "A vault's stores go in the second bag, its options, not in the bag naming the vault"
// --

// == [Values]: FunctionExpected, bytesExpected, LeaseKeyExpected, CtxStampExpected, ListingExpected, VaultErrorExpected, ErrorExpected, LeftOutExpected

/** Anything but a function, where a host's verb or callback is asked. */
export const FunctionExpected = "Expected a function"

/** Anything but bytes, a Uint8Array, `count` of them when that many are asked. */
export const bytesExpected = (count?: number): string => (count === undefined ? "Expected bytes, a Uint8Array" : `Expected ${String(count)} bytes, a Uint8Array`)

/** Anything but a leaseKey as `makeLeaseKey` makes one, where a lease record keeps its key. */
export const LeaseKeyExpected = "Expected a non-extractable AES-GCM CryptoKey for wrapKey and unwrapKey"

/** Anything but a stamp a lease binds a seal to. */
export const CtxStampExpected = "Expected a flat object of strings and numbers, with at least one field"

/** The listing a storable is made in. */
export const ListingExpected = "Expected a Listing"

/** The `err` of a storage call's answer. */
export const VaultErrorExpected = "Expected a VaultError"

/** The `err` of a task a trigger is told failed. */
export const ErrorExpected = "Expected an Error"

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

// == [Bank and vault]: VaultBagAdvice, otherScope, boxOfOtherVault, VaultGoneWhileOpening, OtherStoresThanHeld, VaultBehindWhileOpening, VaultObjectGone, VaultBehind

/** The advice a refusal of the bag naming a vault ends with: what that bag takes, and what else names a vault. */
export const VaultBagAdvice = "That bag holds the vault's vaultlabel, and the bank's own applabel and user_id if you like: a Vault object, its snapshot or a BankVault will do."

/** Why a bag naming another applabel or user_id than the bank's refuses, `fieldnames` the ones that differ, never their values. */
export const otherScope = (fieldnames: readonly string[]): string => `This names another ${fieldnames.join(' and ')} than the bank's, which serves one app and one signed-in user. Use the bank of the app and user it belongs to.`

/** Why a vault reaches no box of another vault. */
export const boxOfOtherVault = (fieldnames: readonly string[]): string => `This names another ${fieldnames.join(' and ')} than the vault's, which reaches only its own boxes. Ask the vault it names for the box.`

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

// == [Vault: ways in]: PassphraseIrremovable, NoPasskeyToRemove, PasskeyBeforePassphrase, ProvingBeforePassphrase, VaultChangedInStorage

/** Why a vault's passphrase is not removed: it can be replaced, never removed. */
export const PassphraseIrremovable = "A vault keeps its passphrase: it can be replaced (putWayin('passphrase')), never removed. Nothing was changed."

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

// == [Vault: bad news]: BoxStoredDamaged, WayinStoredDamaged, VaultStoredDamaged, BadNewsHandlerThrew

/** Bad news of a box stored damaged, which its meta.box_listed names. */
export const BoxStoredDamaged = "A box in this vault is stored damaged, so it can't be read: this error's meta.box_listed names it. It was left as it is; remove it with delBox(), or store its whisper again over it."

/** Bad news of a wayin stored damaged, which its meta.wayin_listed names. */
export const WayinStoredDamaged = "One of this vault's unlockers is stored damaged, so it can't be tried: this error's meta.wayin_listed names it. The other vault unlocker, if the vault has one, still opens it. A damaged passkey is mended by adding the passkey again; a damaged passphrase only by removing the vault and making it again."

/** A vault's trouble where its stored record is damaged, as its snapshot shows it. */
export const VaultStoredDamaged = "This vault's stored record is damaged, so no vault unlocker (passphrase or passkey) can be tried against it, and the vault can't be opened or changed. It was left as it is: restore it from a backup, or, if the user chooses to start over, delDamagedVault() clears it."

/** Why the vault's trouble holds a throw from the host's onBadNews handler. */
export const BadNewsHandlerThrew = "The onBadNews handler passed to Bank.make threw as it was told of bad news: fix the handler. What it threw is this error's cause. The call that met the news went on as it would have."
// --

// == [Storables]: PartialLoad, MovedUnderEdit, AlreadyHeld, DnaHandedToBuild, BoxPatchAdvice, patchOfOtherScope, LockedIsNoWhisper, OneRevisionTwoToks, OneRevisionTwoFates, OneRevisionTwoLives, OtherVaultTok, ShapeUnreconciled

/** Why a record in hand that is not full cannot be opened. */
export const PartialLoad = "The record in hand is not full, so it cannot be opened: hydrate it, and call again."

/** Why an edit laid over a central that moved while it was being made stages nothing. */
export const MovedUnderEdit = "Storage delivered a newer record while this edit was being made, so the edit was laid over a record storage no longer holds, and nothing was staged. The record in hand is now the one delivered: call again to edit it."

/** Why `build` makes nothing of a dna for a scope the listing already holds. */
export const AlreadyHeld = "This listing already holds an instance under the dna's scope, so build made nothing of the dna: edit the instance that listing.at(scope) answers, which also brings a deleted or damaged one back to life."

/** Why `build` makes nothing of a dna in a listing whose things are born only as stored. */
export const DnaHandedToBuild = "This listing makes nothing of a dna in build, as each of its instances is born only once storage holds it: ensure it instead (vaultListing.ensure, or bank.ensureVault)."

/** What to do about an update of a box whose patch fails its check, said after the failures. */
export const BoxPatchAdvice = "Nothing was staged. Every update of a box names both its whisper and its sidecar, as { whisper: { val }, sidecar }; to keep either as it is, give it again: box.unsealWhisper() answers the whisper stored, and box.sidecar, once that has hydrated the box, the sidecar."

/** Why an update of a box or a vault whose patch names another's scope stages nothing. */
export const patchOfOtherScope = (fieldnames: readonly string[]): string => `This update names another ${fieldnames.join(' and ')} than its own, so nothing was staged: update the one it names, which listing.at(scope) answers.`

/** Why LOCKED, which a locked box answers for its whisper, is refused where a whisper is wanted. */
export const LockedIsNoWhisper = "LOCKED is not a whisper: unseal or expose one first"

/** Why a record storage holds under the revision_seq held, but another revision_tok, is not taken in. */
export const OneRevisionTwoToks = "Storage and this device disagree about one revision of a record: storage holds that revision_seq under another revision_tok, as if two puts landed as one revision. This device kept its own copy and did not take in the one storage sent. Fetching the record again is worth one try; if it refuses the same way, the system is fundamentally not working: storage lost or rewrote the record, and the storage adapter is where to look."

/** Why a record storage holds deleted at the revision held alive, or the other way round, is not taken in. */
export const OneRevisionTwoFates = "Storage and this device disagree about one revision of a record: one of them holds it alive and the other holds it deleted, or storage holds nothing for it. This device kept its own copy and did not take in what storage sent. Fetching the record again is worth one try; if it refuses the same way, the system is fundamentally not working: storage lost or rewrote the record, and the storage adapter is where to look."

/** Why a record storage holds under the revision held, but of another life of the thing, is not taken in. */
export const OneRevisionTwoLives = "Storage and this device disagree about one revision of a record: storage holds it as another life of the thing, as if the thing were deleted and made anew within one revision. This device kept its own copy and did not take in the one storage sent. Fetching the record again is worth one try; if it refuses the same way, the system is fundamentally not working: storage lost or rewrote the record, and the storage adapter is where to look."

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

// == [Models: stores]: VaultRowDamaged, BoxRowDamaged, ScopeOutsideStore, StoreRowsMiscounted

/** Why a vault row that does not read as a vault record or its tombstone is refused. */
export const VaultRowDamaged = "The vault stored under this scope does not read as a vault record this version writes, nor as its tombstone: it was damaged, or written by another version. It was left as it is: no way in can be tried, and nothing can be stored over it until it is removed."

/** Why a box row that does not read as a box record or its tombstone is refused. */
export const BoxRowDamaged = "The box stored under this scope does not read as a box record this version writes, nor as its tombstone: it was damaged, or written by another version. It was left as it is, and nothing can be stored over it until it is removed."

/** Why a store asked about a scope outside the bank or vault it was made for refuses. */
export const ScopeOutsideStore = "This store was made for one bank's vaults or one vault's boxes, and was asked about a scope outside them: ask the store made for that scope."

/** Why rows a store front's doGetRows answered in another number than asked are refused. */
export const StoreRowsMiscounted = "The store front's doGetRows answered other than one row, or null, for each scopepath asked, in order: a bug in the storage adapter."
// --

// == [Models: provings]: ProofMissing, WrongPassphrase, WrongPasskey, NoPasskeyWayin, OtherPasskey, OtherPrfSalt, UnknownKeyDeriver, notKeyBytes, WayinNotMadeYet, WayinMadeAlready, ProvingOfOtherVault, LeaseOfOtherVault, KeyDeriverThrew

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

/** Why what a keyDeriver hands back is refused when it is not `count` fresh key bytes. */
export const notKeyBytes = (count: number): string => `The keyDeriver handed back something other than ${String(count)} fresh key bytes.`

/** Why a proving asked for the vaultKey before it holds a wayin refuses: a bug. */
export const WayinNotMadeYet = "A proving was asked for the vaultKey before it made or opened a wayin: a bug in the caller."

/** Why a proving that holds a wayin already makes no other. */
export const WayinMadeAlready = "This proving holds a wayin already, and a proving holds one: make a new proving for another wayin. A bug in the caller."

/** Why a wayin is not made under the vaultKey of a proving of another vault. */
export const ProvingOfOtherVault = "The source proving is of another vault: a wayin is made only under the vaultKey of the vault it lets into."

/** Why a lease is not granted to a vault other than the one a proving is of. */
export const LeaseOfOtherVault = "This proving is of another vault: a lease is granted only to the vault whose stamp its wayin binds."

/** Why a keyDeriver's throw is replaced: it heard the passphrase. */
export const KeyDeriverThrew = "The keyDeriver threw rather than deriving a key. What it threw is left out, as it heard the passphrase."
// --

// == [Models: leases, vaults and boxes]: DamagedLease, UnopenedWhisper, UndecodedWhisper, LeaseNotInForce, NeedVaultUnlocked, LockedWhileUnlocking, LeaseOfOtherHolder, vaultAbsent, boxAbsent

/** Why a lease that will not open locks its vault. */
export const DamagedLease = "This device's lease would not open, so the vault was locked and the lease dropped: unlock it again to carry on."

/** Why a whisper that will not open under the vault's key is refused. */
export const UnopenedWhisper = "That whisper would not open under this vault's key: it was altered in storage, or sealed under another vault. Nothing was changed."

/** Why a whisper that opened but is no whisper this package knows is refused. */
export const UndecodedWhisper = "That box opened, but what was inside is not a whisper this package knows, so it is damaged. It was left as it is; remove it, or seal a whisper over it."

/** Why a lease past its autolock_at, or forgotten, opens nothing. */
export const LeaseNotInForce = "This lease is no longer in force -- its time ran out, or it was forgotten when the vault locked -- so nothing was read or written: unlock the vault again."

/** Why a call that needs the vault unlocked is refused while it is locked. */
export const NeedVaultUnlocked = "The vault is locked, so nothing was read or written: unlock it (vault.ensureUnlocked) and call again."

/** Why an unlock that a lock overtook unlocks nothing. */
export const LockedWhileUnlocking = "The vault was locked while it was being unlocked, so it stays locked: unlock it again when the user wants the vault."

/** Why a vault takes up no lease of another vault, or granted to another Vault object. */
export const LeaseOfOtherHolder = "This lease was granted to another vault, or to another Vault object of this one, so this one did not take it up: a bug in the caller."

/** Why a vault absent from storage is refused, by its vaultlabel. */
export const vaultAbsent = (vaultlabel: string): string => `No vault is stored under the label ${vaultlabel}.`

/** Why a box absent from storage is refused, by its boxlabel. */
export const boxAbsent = (boxlabel: string): string => `No box is stored under the label ${boxlabel}.`
// --

// == [Models: gates]: GateMovedUnderChange, PasskeyHeldAlready, NoPasskeyToRevoke

/** Why a gate change proved against a record that has since moved is not sent. */
export const GateMovedUnderChange = "The vault's record was changed elsewhere while this change was being proved, and its passphrase or passkey may have changed with it, so nothing was changed. The vault in hand now holds the newer record: call again to make the change over it."

/** Why a passkey is not added to a gate that holds one. */
export const PasskeyHeldAlready = "This vault has a passkey already, and holds one at a time, so nothing was asked or changed: revoke it first (vault.revokePasskey), then add the new one."

/** Why revoking a passkey changes nothing where the gate holds none. */
export const NoPasskeyToRevoke = "This vault has no passkey to revoke: it may have been revoked on another device. Nothing was asked or changed."
// --

// == [Models: banks, gatings and derivers]: InsecureContext, PositiveMinutesShape, GatingDeclined, LockedWhileAsking, GatingSettled, PasskeyProvesNot, PasskeyMovedSinceLaunch, GateMadeElsewhere, RequestCleartextThrew, StrengthCheckerThrew, NotAVerdict, NoStrengthChecker, SamePassphrase, reservedDeriverLabel, suppliedSpecChanged, saltDoesNotFit, TestDeriverNotice

export const InsecureContext = "This page is not a secure context -- it was served over plain http -- so the browser withholds the cryptography the vault needs: serve the app over https (http://localhost counts as secure, for development)."

export const PositiveMinutesShape = "Expected a number of minutes above zero, fractions too (0.5 is thirty seconds), or Infinity for never"

export const GatingDeclined = "The prompt was declined, or closed before an attempt succeeded, so nothing was unlocked or changed: ask again when the user wants the vault."

export const LockedWhileAsking = "The vault was locked while this prompt was open or waiting its turn, which closed it, so nothing was unlocked or changed: ask again when the user wants the vault."

export const GatingSettled = "This prompt has ended -- it was answered, declined, or refused for good -- so this attempt did nothing: ask again if the user still wants the vault."

export const PasskeyProvesNot = "A passkey does not prove this kind of prompt, so nothing was attempted: ask for the passphrase, as the prompt's provedBy says."

export const PasskeyMovedSinceLaunch = "This vault's passkey changed since the prompt opened, on this device or another, so the passkey it asked for is not the vault's now, and nothing was unlocked: ask again, and the new prompt asks for the passkey the vault has."

export const GateMadeElsewhere = "This vault's passphrase was just set on another device, so the one entered here was not set, and nothing was changed. Enter the passphrase chosen there to unlock it."

export const RequestCleartextThrew = "The requestCleartext handed to Bank.make threw rather than showing the prompt and resolving once it closed. What it threw is left out, as the prompt hears the passphrase."

export const StrengthCheckerThrew = "The strengthChecker threw rather than answering a verdict, or answered one that threw as it was read. What it threw is left out, as it heard the passphrase."

export const NotAVerdict = "The strengthChecker answered something other than a verdict: have it answer { strong: true }, or { strong: false, reason } with the reason as non-empty text."

export const NoStrengthChecker = "This app cannot accept a passphrase until a strength checker is configured. For the app's makers: see notes/configuration.md, under Strength checker, for instructions."

export const SamePassphrase = "The new passphrase is the one the vault has already, so nothing was changed: choose another."

export const reservedDeriverLabel = (prefix: string): string => `Labels beginning ${prefix} are reserved for the specs safebyok supplies, present and future: choose a label of your own, naming your app, say.`

export const suppliedSpecChanged = (label: string): string => `A key deriver labelled ${label} must carry that spec's parameters exactly, or vaults made under it will not open elsewhere: spread the exported spec into yours, or choose a label of your own.`

export const saltDoesNotFit = (expectedCount: number, handedCount: number): string => `This key deriver takes a salt of ${String(expectedCount)} bytes, and was handed one of ${String(handedCount)}: a salt made by another deriver, or a stored salt that has been damaged.`

export const TestDeriverNotice = "The keyDeriver's label begins test_, the mark of a deriver made cheap for tests: it gives a passphrase next to no protection against guessing. If this vault holds real secrets, open it with argon2idWebV1Deriver, or another vetted Argon2id deriver."
// --

// == [Models: the device store]: DeviceStoreFailed, DeviceStoreSaid, deviceStoreBlocked, deviceStoreUnavailable, MisfiledCachedCopy

/** For each verb of the models' device store, what its failure leaves undone, and what the user may do instead of trying again, if anything. */
export const DeviceStoreFailed = Object.freeze({
  getLease:            { failed: "reading the lease it keeps for this vault, so the vault could not take it up", instead: "unlock with the passphrase or a passkey" },
  putLease:            { failed: "writing the lease it keeps for this vault, so this device may ask for the passphrase again at the next open" },
  delLease:            { failed: "erasing the lease it keeps for this vault, so the next open on this device may still take it up" },
  getDeviceRecord:     { failed: "reading its record of this user's vaults (the newest gate of each it has seen)" },
  advanceDeviceRecord: { failed: "writing its record of this user's vaults (the newest gate of each it has seen), so it may not be kept" },
  findCachedVaults:    { failed: "reading the copies of this user's vaults it keeps, so each loads from storage instead" },
  putCachedVault:      { failed: "writing its copy of this vault, so the next open loads it from storage" },
  clearCachedVault:    { failed: "erasing what it keeps of this vault, so some of it may remain" },
  delAll:              { failed: "erasing everything it keeps for safebyok, so some of it may remain" },
})

/** One entry of {@link DeviceStoreFailed}. */
export type DeviceStoreSaid = Readonly<{ failed: string, instead?: string }>

/** The device store's own `name` for what it threw, where it has one, closing the message. */
const thrownNameSaid = (thrownName: string | null): string => (thrownName === null ? '' : ` The device store threw ${thrownName}.`)

export const deviceStoreBlocked = ({ failed, instead }: DeviceStoreSaid, thrownName: string | null): string => {
  const meanwhile = instead === undefined ? '' : `: ${instead} instead`
  return `This browser does not let the app keep anything on this device -- storage blocked for this site, a private window or frame that withholds it, or no room left -- so it failed ${failed}. Trying again will not help until that changes${meanwhile}.${thrownNameSaid(thrownName)}`
}

export const deviceStoreUnavailable = ({ failed, instead }: DeviceStoreSaid, thrownName: string | null): string => {
  const retry = instead === undefined ? 'try again' : `try again, or ${instead}`
  return `This device's own storage failed ${failed}: ${retry}. If it fails every time, this device may not let the app keep anything: storage blocked or full, or a private window.${thrownNameSaid(thrownName)}`
}

export const MisfiledCachedCopy = "This device kept a copy of one of this user's vaults that was no copy, or held another vault's records than the one it was filed under, so it was erased: that vault loads from storage instead. This package never files a copy so, so the device store, or something else writing to it, damaged it."
// --
