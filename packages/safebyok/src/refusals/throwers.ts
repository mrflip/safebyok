/** The throwers: every refusal the core throws is made here, from a phrase in helpers/phrases.ts. */

// Every refusal is made here so that they can be audited in one place.
//
// A refusal kind earns its place one of three ways: the core or a host routes on it; it gives a material head start in
// debugging (this is a package bug for sure; the vault was not tombstoned but disappeared; a check that should be
// impossible to fail did); or it groups throwers that tell one story. Guessing which of two ways a strict object check
// failed is no head start. The stronger rule is "don't make me read": a finer kind must be worth the reading it costs.
//
// A thrower's name, its kind and its phrase's name agree; the phrase is of a piece with the kind, mirroring, containing or
// eliding its words; and all three read naturally at the call site. A caller passes what it has on hand and trusts the
// thrower to sanitize and cherry-pick. A name carries no "error" or "refusal", ends in "issue" at a loss, and is
// empathetic and frank to the person who trusted us with their data, and readable to the coder. Reuse is welcome, never
// forced: a new refusal gets a new thrower and a new phrase. Templated phrases are encouraged.
//
// A refusal's `meta` has what reads at a glance, and an adapter may hand a bag of its own beside the cause: props to
// depth two only; no arrays, which are kept as their JSON text; an object past depth two replaced by the string '{...}'.

import { disagreeingFieldnames } from '../helpers/validator'
import { PassphraseKeySize } from '../helpers/consts'
import { VaultError, isVaultError, thrownNameOf } from './errors'
import type { Refusalkind, RefusalMeta, Thrown } from './errors'
import type * as EX from '../shapes/shapes-enums'
import * as Phrases   from '../helpers/phrases'
import type * as SX from '../shapes/shapes-storage'
import type * as BX from '../shapes/shapes-bankdb'

// == [Outcome Throwers]: sanitizeForeignError, storageUnavailable, storageBlocked, unexpectedError

/** The Error that stands as a refusal's cause for whatever was thrown: an Error as it is, anything else wrapped in one.
 * It trims nothing: an Error is kept whole, its message included.
 *
 * @example sanitizeForeignError('ECONNRESET')  // new Error('ECONNRESET')
 * @example sanitizeForeignError(42)            // an Error naming type number, 42 its cause
 */
export function sanitizeForeignError(thrown: Thrown): Error {
  if (thrown instanceof Error) { return thrown }
  if (typeof thrown === 'string') { return new Error(thrown) }
  if (thrown === null || thrown === undefined) { return new Error(Phrases.NoErrorGiven) }
  return new Error(Phrases.nonErrorThrown(typeof thrown), { cause: thrown })
}

/** A `storage_unavailable` refusal: the backend could not be reached, or failed.
 * @param cause - What a bankDB's backend threw, kept for debugging as {@link sanitizeForeignError} makes it.
 *   Never pass a device database's throw, which may quote a lease row: use {@link deviceDBFailed}.
 * @param message - Which call failed, when there is more to say than that storage failed. Never quote a record or a name.
 *
 * @example
 *   try { return await client.query(text, params) } catch (err) { throw storageUnavailable(err) }
 */
export const storageUnavailable = (cause: Thrown, message: string = Phrases.StorageUnavailable): VaultError => (
  new VaultError('storage_unavailable', message, { cause: sanitizeForeignError(cause) })
)

/** A `storage_blocked` refusal: the browser withholds its storage from this page, which a retry will not mend.
 * @example if (err.name === 'SecurityError') { throw storageBlocked(err) }
 */
export function storageBlocked(cause: Thrown, message: string = Phrases.StorageWithheld): VaultError {
  return new VaultError('storage_blocked', message, { cause: sanitizeForeignError(cause) })
}

/** An `unexpected_error` refusal, `thrown` its cause: a bug, in safebyok or in a function the app handed it. */
export const unexpectedError = (thrown: Thrown): VaultError => (
  new VaultError('unexpected_error', Phrases.UnexpectedError, { cause: sanitizeForeignError(thrown) })
)
// --

// == [Device Throwers]: insecureContext, deviceDisabled

/** An `insecure_context` refusal: the page is not a secure context. */
export function insecureContext(): VaultError { return new VaultError('insecure_context', Phrases.InsecureContext) }

/** A `disabled` refusal: this device was let go by a sweep or a vacate, and its bank with it. */
export function deviceDisabled(): VaultError { return new VaultError('disabled', Phrases.DeviceLetGo) }
// --

// == [Vault Throwers]: needUnlocked

/** A `bank_locked` refusal: the bank is locked, so nothing was read or written, and `bank.ensureUnlocked()` will ask the user. */
export function needUnlocked(): VaultError { return new VaultError('bank_locked', Phrases.BankLocked) }

// --

// == [Vault Listing Throwers]: delOfOtherLife, vaultStoredDamaged

/** A `vault_reborn` refusal: a delete named a different life of the vault than the life listed. */
export function delOfOtherLife(): VaultError { return new VaultError('vault_reborn', Phrases.DelOfOtherLife) }

/** A `damaged_row` refusal: this vault is stored damaged and cannot be read. */
export function vaultStoredDamaged({ vaultlabel }: SX.DamagedVault): VaultError { return new VaultError('damaged_row', Phrases.vaultStoredDamaged(vaultlabel)) }
// --

// == [Listing Throwers]: rowOfOtherWorld, writtenByOwnVerbs

/** A `storage_issue` refusal: storage answered a row whose `tokname` is not that of the thing above it, such as a box of another vault life. */
export function rowOfOtherWorld(received: unknown, tokname: 'bank_tok' | 'vault_tok'): VaultError { return new VaultError('storage_issue', Phrases.rowOfOtherAddress([tokname]), { rows: { dbhas: received } }) }

/** A `bad_option` refusal: a bank's row or its gate's is written only by the bank's own verbs, never put or deleted through its listing. */
export function writtenByOwnVerbs(): VaultError { return new VaultError('bad_option', Phrases.WrittenByOwnVerbs) }
// --

// == [Storable Throwers]: partialLoad, instanceDisabled, boxAbsent, boxNotListed, vaultAbsent, deletedVault, oneRevisionTwoToks, oneRevisionTwoLives, oneRevisionTwoFates, nothingStoredWhereLive, deliveredNotAsSent

/** A `bad_option` refusal: the record in hand is not full, and needs hydrating first. */
export function partialLoad(): VaultError { return new VaultError('bad_option', Phrases.PartialLoad) }

/** A `disabled` refusal: this object was let go, because its bank or vault life ended or its row was found damaged. */
export function instanceDisabled(): VaultError { return new VaultError('disabled', Phrases.LetGoInstance) }

/** An `absent_box` refusal: no box is stored under the label given. */
export function boxAbsent({ boxlabel }: { boxlabel: string }): VaultError { return new VaultError('absent_box', Phrases.boxAbsent(boxlabel)) }

/** An `absent_box` refusal: no box is listed under the label given, though one may be stored. */
export function boxNotListed({ boxlabel }: { boxlabel: string }): VaultError { return new VaultError('absent_box', Phrases.boxNotListed(boxlabel)) }

/** An `absent_vault` refusal: no vault is stored under the label given. */
export function vaultAbsent({ vaultlabel }: { vaultlabel: string }): VaultError { return new VaultError('absent_vault', Phrases.vaultAbsent(vaultlabel)) }

/** A `vault_gone` refusal: this vault was deleted. */
export function deletedVault(): VaultError { return new VaultError('vault_gone', Phrases.VaultDeleted) }

/** A `record_conflict` refusal: this revision_seq is stored under another revision_tok. */
export function oneRevisionTwoToks(received: unknown): VaultError { return new VaultError('record_conflict', Phrases.OneRevisionTwoToks, { rows: { dbhas: received } }) }

/** A `record_conflict` refusal: this revision is stored as another life of the thing. */
export function oneRevisionTwoLives(received: unknown): VaultError { return new VaultError('record_conflict', Phrases.OneRevisionTwoLives, { rows: { dbhas: received } }) }

/** A `record_conflict` refusal: storage and this device disagree on whether this revision is alive or deleted. */
export function oneRevisionTwoFates(received: unknown): VaultError { return new VaultError('record_conflict', Phrases.OneRevisionTwoFates, { rows: { dbhas: received } }) }

/** A `record_conflict` refusal: storage answered that nothing is stored where this device has a live record. */
export function nothingStoredWhereLive(): VaultError { return new VaultError('record_conflict', Phrases.NothingStoredWhereLive, { rows: { dbhas: null } }) }

/** A `storage_issue` refusal: storage delivered `received`, which disagrees with `pins`, the fields of what was sent.
 * `pins` is the record itself for a record stored (`as_sent`), else its scope.
 */
export function deliveredNotAsSent(fielding: 'as_sent' | 'as_got' | 'as_db', received: object, pins: object): VaultError {
  const message = (fielding === 'as_db') ? Phrases.RecordOfOtherScope : Phrases.AnswerNotAsSent
  return new VaultError('storage_issue', message, { meta: { fieldnames: disagreeingFieldnames(received, pins) }, rows: { dbhas: received } })
}

/** The refusal for `thrown` while deciding how to deliver `answer`: a refusal as it is, anything else as `unexpected_error`.
 * Its meta gains the delivery as `oplabel`, and `answer`'s ask.
 */
export function refusalOfDelivering(thrown: unknown, answer: { ask: BX.LoggableAsk }): VaultError {
  const refusal = isVaultError(thrown) ? thrown : unexpectedError(thrown)
  return Object.assign(refusal, { meta: { ...refusal.meta, oplabel: 'deliver', ask: answer.ask } })
}

// --

// == [Box Throwers]: boxStoredDamaged, undecodedWhisper, notExposed

/** A `damaged_row` refusal: this box is stored damaged and cannot be read. */
export function boxStoredDamaged({ boxlabel }: SX.DamagedBox): VaultError { return new VaultError('damaged_row', Phrases.boxStoredDamaged(boxlabel)) }

/** A `damaged_whisper` refusal: the box opened, but what is inside is not a whisper this package can read. */
export function undecodedWhisper(): VaultError { return new VaultError('damaged_whisper', Phrases.UndecodedWhisper) }

/** A `bad_option` refusal: the box has no exposed whisper to work on. */
export function notExposed(): VaultError { return new VaultError('bad_option', Phrases.NotExposed) }
// --

// == [Lease Throwers]: damagedLease, undecipheredWhisper, leaseNotInForce

/** A `damaged_lease` refusal: this device's lease will not unwrap the bankKey. */
export function damagedLease(): VaultError { return new VaultError('damaged_lease', Phrases.DamagedLease) }

/** A `damaged_whisper` refusal: the whisper would not decipher under this vault's key. */
export function undecipheredWhisper(): VaultError { return new VaultError('damaged_whisper', Phrases.UndecipheredWhisper) }

/** A `bank_locked` refusal: this lease is out of force. */
export function leaseNotInForce(): VaultError { return new VaultError('bank_locked', Phrases.LeaseNotInForce) }
// --

// == [Gating Throwers]: alreadyAsking, requestCleartextThrew, cleartextsThrew, samePassphrase, gateMadeElsewhere, gatingDismissed, gatingConcluded, attemptInFlight

/** An `already_asking` refusal: a prompt is already open on this device. */
export function alreadyAsking(): VaultError { return new VaultError('already_asking', Phrases.AlreadyAsking) }

/** An `unexpected_error` refusal that keeps nothing of what the host's `requestCleartext` threw. */
export function requestCleartextThrew(): VaultError { return new VaultError('unexpected_error', Phrases.RequestCleartextThrew) }

/** An `unexpected_error` refusal that keeps nothing of what reading an attempt's cleartext threw. */
export function cleartextsThrew(): VaultError { return new VaultError('unexpected_error', Phrases.CleartextsThrew) }

/** A `same_passphrase` refusal: the new passphrase matches the current passphrase. */
export function samePassphrase(): VaultError { return new VaultError('same_passphrase', Phrases.SamePassphrase) }

/** A `dismissed` refusal: the prompt was dismissed before an attempt succeeded. */
export function gatingDismissed(): VaultError { return new VaultError('dismissed', Phrases.GatingDismissed) }

/** A `gating_concluded` refusal: an attempt reached a prompt that has already ended. */
export function gatingConcluded(): VaultError { return new VaultError('gating_concluded', Phrases.GatingConcluded) }

/** A `gate_made_elsewhere` refusal: another device or tab made this vault first. */
export function gateMadeElsewhere(): VaultError { return new VaultError('gate_made_elsewhere', Phrases.GateMadeElsewhere) }

/** An `attempt_in_flight` refusal: another attempt on this prompt is still running. */
export function attemptInFlight(): VaultError { return new VaultError('attempt_in_flight', Phrases.AttemptInFlight) }

// --

// == [Gate Throwers]: passkeyAlreadyAdded

/** A `bad_option` refusal: this vault already has a passkey. */
export function passkeyAlreadyAdded(): VaultError { return new VaultError('bad_option', Phrases.PasskeyAlreadyAdded) }
// --

// == [Proving Throwers]: notKeyBytes, wayinNotMadeYet, wayinMadeAlready, keyDeriverThrew, keyDeriverLoadFailed, weakPassphrase, wrongPassphrase, wrongPasskey, noPasskeyWayin, otherPasskey, otherPrfSalt, unknownKeyDeriver

/** A `bad_option` refusal: the key deriver handed back something other than fresh key bytes of the right length. */
export function notKeyBytes(): VaultError { return new VaultError('bad_option', Phrases.notKeyBytes(PassphraseKeySize)) }

/** An `unexpected_error` refusal: a proving was asked for the bankKey before it made or opened a wayin. */
export function wayinNotMadeYet(): VaultError { return new VaultError('unexpected_error', Phrases.WayinNotMadeYet) }

/** An `unexpected_error` refusal: this proving already has a wayin. */
export function wayinMadeAlready(): VaultError { return new VaultError('unexpected_error', Phrases.WayinMadeAlready) }

/** An `unexpected_error` refusal that keeps nothing of what the key deriver threw. */
export function keyDeriverThrew(): VaultError { return new VaultError('unexpected_error', Phrases.KeyDeriverThrew) }

/** An `unexpected_error` refusal: the key deriver's `load()` failed, with its error as `cause`. */
export function keyDeriverLoadFailed(cause: unknown): VaultError { return new VaultError('unexpected_error', Phrases.KeyDeriverLoadFailed, { cause }) }

/** A `weak_passphrase` refusal whose message is the strength checker's `reason`. */
export function weakPassphrase(reason: string): VaultError { return new VaultError('weak_passphrase', reason) }

/** A `wrong_passphrase` refusal: the passphrase did not unlock the vault. */
export const wrongPassphrase = (): VaultError => new VaultError('wrong_passphrase', Phrases.WrongPassphrase)

/** A `wrong_passkey` refusal: the passkey answered, but its answer did not unlock the vault. */
export const wrongPasskey = (): VaultError => new VaultError('wrong_passkey', Phrases.WrongPasskey)

/** An `absent_wayin` refusal: this vault has no passkey wayin. */
export function noPasskeyWayin(): VaultError { return new VaultError('absent_wayin', Phrases.NoPasskeyWayin) }

/** A `wrong_passkey` refusal: the passkey is not the credential this vault's wayin names. */
export function otherPasskey(): VaultError { return new VaultError('wrong_passkey', Phrases.OtherPasskey) }

/** A `wrong_passkey` refusal: the passkey answered for a different salt than this vault keeps for it. */
export function otherPrfSalt(): VaultError { return new VaultError('wrong_passkey', Phrases.OtherPrfSalt) }

/** A `newer_format` refusal: the vault was made with a key deriver this package does not carry. */
export function unknownKeyDeriver(): VaultError { return new VaultError('newer_format', Phrases.UnknownKeyDeriver) }

// --

// == [Helper Throwers]: strengthCheckerLoadFailed, noJsonText

/** An `unexpected_error` refusal: the strength checker's `load()` failed, with its error as `cause`. */
export function strengthCheckerLoadFailed(cause: unknown): VaultError { return new VaultError('unexpected_error', Phrases.StrengthCheckerLoadFailed, { cause }) }

/** An `unexpected_error` refusal: a value with no JSON text was handed to be serialized. */
export function noJsonText(): VaultError { return new VaultError('unexpected_error', Phrases.NoJsonText) }
// --

// == [Refusal throwers]: actRefused, boxTooLarge, storageFull

/* The refusals of a bankDB, each read the same in an answer and an error: `meta` has the `parent` and `dbhas` the answer carries. */

// Each refusal kind calls for one response from the caller, whichever act produced it: treat the row as missing, fetch
// again and rewrite, leave the live row alone, or report it. An expected refusal and an impossible one never share a kind.
const RefusalkindForBoxAct = {
  void: 'absent_box', gone: 'absent_box', dubdel: 'absent_box',
  stale: 'stale_write', retcon: 'stale_write',
  camped: 'camped',
  clash: 'record_conflict', forked: 'record_conflict', ahead: 'record_conflict',
  vault_void: 'absent_vault', vault_gone: 'absent_vault', vault_reborn: 'vault_reborn', vault_full: 'vault_full',
  // A bankDB's vault or gate verb under a bank that is not live: its rows are missing, as a box's are under a vault that is not.
  bank_void: 'absent_vault', bank_gone: 'absent_vault', bank_reborn: 'vault_reborn',
} as const satisfies Record<EX.RefusedAct | EX.BoxVaultAct | EX.ParentBankAct, Refusalkind>

const RefusalkindForVaultAct = { ...RefusalkindForBoxAct, void: 'absent_vault', gone: 'absent_vault', dubdel: 'absent_vault' } as const satisfies Record<EX.RefusedAct, Refusalkind>

// No rows go on this error: the rows the refusal found are in its answer, as `parent` and `dbhas`.
/** The refusal for a get, put or del whose `act` is a refusal. Its message is its kind, and `meta.act` is the act.
 * @param rowkind - Whose call it was: a `box`'s, or a `vault`'s, which a bankDB's bank and gate verbs count as.
 * @param meta    - Extra context: the `oplabel`, its `ask`, and for `vault_full` the `capacity`.
 */
export function actRefused(rowkind: 'box' | 'vault', act: EX.RefusedAct | EX.BoxVaultAct | EX.ParentBankAct, meta: RefusalMeta = {}): VaultError {
  const refusalkind = ((rowkind === 'vault') ? RefusalkindForVaultAct : RefusalkindForBoxAct)[act]
  return new VaultError(refusalkind, refusalkind, { meta: { ...meta, act } })
}

/** A `box_too_large` refusal: the record's estimated size, `recordSizeEst`, exceeds `maxRecordSizeEst`. */
export function boxTooLarge(recordSizeEst: number, maxRecordSizeEst: number): VaultError {
  return new VaultError('box_too_large', Phrases.boxTooLarge(recordSizeEst, maxRecordSizeEst))
}

/** A `vault_full` refusal for a write storage itself had no room for, `cause` what the backend threw. */
export function storageFull(cause: Thrown): VaultError {
  return new VaultError('vault_full', Phrases.StorageFull, { cause: sanitizeForeignError(cause) })
}

// --

// == [BankDB Throwers]: mainGateMissing

/** A `damaged_row` refusal from a bankDB: the live bank `parent` is stored without its `main` gate row. */
export function mainGateMissing(parent: BX.BankSparse): VaultError {
  return new VaultError('damaged_row', Phrases.MainGateMissing, { rows: { parent } })
}
// --

// == [DeviceDB Throwers]: deviceDBFailed

/** A device database's failure as `storage_unavailable`, naming only the verb and the thrown `name`.
 * What a device database throws may quote a lease row, so nothing else of it is kept.
 */
export function deviceDBFailed(oplabel: string, thrown: unknown): VaultError {
  const thrownName = thrownNameOf(thrown)
  const named = (thrownName === null) ? '' : Phrases.thrownNamed(thrownName)
  return new VaultError('storage_unavailable', Phrases.deviceDBFailed(oplabel, named))
}
// --

// == [Backend Throwers]: storageFailed, storageIssue, identityRevoked

// A backend's error may quote the call's arguments, so only its `name` is kept.
/** A storage backend's failure as `storage_unavailable`, naming the call and the thrown `name` and nothing else. */
export function storageFailed(oplabel: string, thrown: unknown): VaultError {
  const thrownName = thrownNameOf(thrown)
  const named = (thrownName === null) ? '' : Phrases.thrownNamed(thrownName)
  return new VaultError('storage_unavailable', Phrases.storageFailed(oplabel, named))
}

/** A `storage_issue` refusal: a row out of storage is not an object at all. */
export function storageIssue(): VaultError { return new VaultError('storage_issue', Phrases.StorageIssue) }

/** An `identity_revoked` refusal: the storage backend no longer serves the user the call names. */
export function identityRevoked(): VaultError { return new VaultError('identity_revoked', Phrases.IdentityRevoked) }
// --
