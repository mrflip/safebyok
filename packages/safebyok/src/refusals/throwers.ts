import { PassphraseKeyBytes } from '../helpers/consts'
import { VaultError, thrownNameOf } from './errors'
import * as Phrases   from '../helpers/phrases'
import type * as VS   from '../storage/vault-db-shapes'

// == [Vault Throwers]: goneError, lockedError, otherStoresError, behindError, listingExpected, unlockFirst, noProofToUnlock

export const goneError        = () => new VaultError('vault_gone', Phrases.VaultGoneWhileOpening)

export const lockedError      = () => new VaultError('vault_locked', Phrases.VaultLocked)

export const otherStoresError = () => new VaultError('bad_option', Phrases.OtherStoresThanHeld)

export const behindError      = () => new VaultError('vault_behind', Phrases.VaultBehindWhileOpening)

export const listingExpected = (): VaultError => new VaultError('bad_option', Phrases.ListingExpected)

export const unlockFirst = (): VaultError => new VaultError('vault_locked', Phrases.UnlockFirst)

export const noProofToUnlock = (): VaultError => new VaultError('vault_locked', Phrases.NoProofToUnlock)
// --

// == [Storable Throwers]: partialLoadError, alreadyHeldError, disabledError, absentBoxError, notListedBoxError, absentVaultError, deletedVaultError, oneRevisionTwoToks, oneRevisionTwoLives, oneRevisionTwoFates, otherVaultTok, shapeUnreconciled

export const partialLoadError = () => new VaultError('bad_option', Phrases.PartialLoad)

export const alreadyHeldError    = () => new VaultError('bad_option', Phrases.AlreadyHeld)

export const disabledError    = () => new VaultError('disabled', Phrases.LetGoInstance)

export const absentBoxError   = ({ boxlabel }: { boxlabel: string }) => new VaultError('absent_box', Phrases.boxAbsent(boxlabel))

export const notListedBoxError = ({ boxlabel }: { boxlabel: string }) => new VaultError('absent_box', Phrases.boxNotListed(boxlabel))

export const absentVaultError = ({ vaultlabel }: { vaultlabel: string }) => new VaultError('absent_vault', Phrases.vaultAbsent(vaultlabel))

export const deletedVaultError = () => new VaultError('vault_gone', Phrases.VaultDeleted)

export const oneRevisionTwoToks = (): VaultError => new VaultError('record_conflict', Phrases.OneRevisionTwoToks)

export const oneRevisionTwoLives = (): VaultError => new VaultError('record_conflict', Phrases.OneRevisionTwoLives)

export const oneRevisionTwoFates = (): VaultError => new VaultError('record_conflict', Phrases.OneRevisionTwoFates)

export const otherVaultTok = (): VaultError => new VaultError('unexpected_error', Phrases.OtherVaultTok)

export const shapeUnreconciled = (): VaultError => new VaultError('unexpected_error', Phrases.ShapeUnreconciled)
// --

// == [Gating Throwers]: alreadyAsking, noRequestCleartext, requestCleartextThrew, clearsThrew, samePassphrase, gatingDeclined, lockedWhileAsking, gatingSettled, attemptInFlight, proofMissing

export const alreadyAsking = (): VaultError => new VaultError('already_asking', Phrases.AlreadyAsking)

export const noRequestCleartext = (): VaultError => new VaultError('bad_option', Phrases.NoRequestCleartext)

export const requestCleartextThrew = (): VaultError => new VaultError('unexpected_error', Phrases.RequestCleartextThrew)

export const clearsThrew = (): VaultError => new VaultError('unexpected_error', Phrases.ClearsThrew)

export const samePassphrase = (): VaultError => new VaultError('same_passphrase', Phrases.SamePassphrase)

export const gatingDeclined = (): VaultError => new VaultError('declined', Phrases.GatingDeclined)

export const lockedWhileAsking = (): VaultError => new VaultError('locked_while_asking', Phrases.LockedWhileAsking)

export const gatingSettled = (): VaultError => new VaultError('gating_landed', Phrases.GatingSettled)

export const attemptInFlight = (): VaultError => new VaultError('attempt_in_flight', Phrases.AttemptInFlight)

export const proofMissing = (): VaultError => new VaultError('unexpected_error', Phrases.ProofMissing)
// --

// == [Proving Throwers]: notKeyBytes, wayinNotMadeYet, wayinMadeAlready, keyDeriverThrew, strengthCheckerThrew, notAVerdict, weakPassphrase, wrongPassphrase, wrongPasskey, noPasskeyWayin, otherPasskey, otherPrfSalt, unknownKeyDeriver

export const notKeyBytes = (): VaultError => new VaultError('bad_option', Phrases.notKeyBytes(PassphraseKeyBytes))

export const wayinNotMadeYet = (): VaultError => new VaultError('unexpected_error', Phrases.WayinNotMadeYet)

export const wayinMadeAlready = (): VaultError => new VaultError('unexpected_error', Phrases.WayinMadeAlready)

export const keyDeriverThrew = (): VaultError => new VaultError('unexpected_error', Phrases.KeyDeriverThrew)

export const strengthCheckerThrew = (): VaultError => new VaultError('unexpected_error', Phrases.StrengthCheckerThrew)

export const notAVerdict = (): VaultError => new VaultError('bad_option', Phrases.NotAVerdict)

export const weakPassphrase = (reason: string): VaultError => new VaultError('weak_passphrase', reason)

export const wrongPassphrase = (): VaultError => new VaultError('wrong_passphrase', Phrases.WrongPassphrase)

export const wrongPasskey = (): VaultError => new VaultError('wrong_passkey', Phrases.WrongPasskey)

export const noPasskeyWayin = (): VaultError => new VaultError('absent_wayin', Phrases.NoPasskeyWayin)

export const otherPasskey = (): VaultError => new VaultError('wrong_passkey', Phrases.OtherPasskey)

export const otherPrfSalt = (): VaultError => new VaultError('wrong_passkey', Phrases.OtherPrfSalt)

export const unknownKeyDeriver = (): VaultError => new VaultError('unknown_key_deriver', Phrases.UnknownKeyDeriver)
// --

// == [Gate Throwers]: passkeyHeldAlready

export const passkeyHeldAlready = (): VaultError => new VaultError('bad_option', Phrases.PasskeyHeldAlready)
// --

// == [Lease Throwers]: damagedLease, unopenedWhisper, leaseNotInForce

export const damagedLease = (): VaultError => new VaultError('damaged_lease', Phrases.DamagedLease)

export const unopenedWhisper = (): VaultError => new VaultError('damaged_box', Phrases.UnopenedWhisper)

export const leaseNotInForce = (): VaultError => new VaultError('vault_locked', Phrases.LeaseNotInForce)
// --

// == [Box Throwers]: recordForNewBox, undecodedWhisper, absentDamagedBoxError

/** The refusal of a put that said only-if-new, handed a whole record. */
export const recordForNewBox = (): VaultError => new VaultError('bad_option', Phrases.RecordForNewBox)

export const undecodedWhisper = (): VaultError => new VaultError('damaged_box', Phrases.UndecodedWhisper)

export const absentDamagedBoxError = ({ boxlabel }: { boxlabel: string }) => new VaultError('absent_box', Phrases.damagedBoxAbsent(boxlabel))
// --

// == [Vault Listing Throwers]: delOfOtherLife, vaultStoredDamaged

export const delOfOtherLife = (): VaultError => new VaultError('stale_write', Phrases.DelOfOtherLife)

export const vaultStoredDamaged = ({ vaultlabel }: VS.DamagedVault): VaultError => new VaultError('damaged_record', Phrases.vaultStoredDamaged(vaultlabel))
// --

// == [Bank Throwers]: insecureContext, helloFirst, deviceRecordRewritten

export const insecureContext = (): VaultError => new VaultError('insecure_context', Phrases.InsecureContext)

export const helloFirst = (): VaultError => new VaultError('bad_option', Phrases.BankHelloFirst)

export const deviceRecordRewritten = (): VaultError => new VaultError('damaged_record', Phrases.DeviceRecordRewritten)
// --

// == [Listing Throwers]: putAnsweredNothing, otherVaultTokAtBirth

export const putAnsweredNothing = (): VaultError => new VaultError('unexpected_error', Phrases.PutAnsweredNothing)

export const otherVaultTokAtBirth = (): VaultError => new VaultError('unexpected_error', Phrases.OtherVaultTokAtBirth)
// --

// == [Deriver Throwers]: reservedLabel, suppliedSpecChanged, saltDoesNotFit

export const reservedLabel = (reservedPrefix: string): VaultError => new VaultError('bad_option', Phrases.reservedDeriverLabel(reservedPrefix))

export const suppliedSpecChanged = (label: string): VaultError => new VaultError('bad_option', Phrases.suppliedSpecChanged(label))

export const saltDoesNotFit = (expectedCount: number, handedCount: number): VaultError => new VaultError('bad_option', Phrases.saltDoesNotFit(expectedCount, handedCount))
// --

// == [Helper Throwers]: unboundCipherCtx, strengthCheckerMisanswered, strengthCheckerLoadFailed

export const unboundCipherCtx = (): VaultError => new VaultError('bad_option', "A cipher ctx was handed no stamp, or a part or a field of one that is undefined or null, which would bind as if it were something else, so nothing was encrypted or opened. This is a bug in the code calling it.")

export const strengthCheckerMisanswered = (): VaultError => new VaultError('bad_option', "The strengthChecker handed to Bank.make answered something other than a verdict: have it answer { strong: true }, or { strong: false, reason } with the reason as non-empty text.")

export const strengthCheckerLoadFailed = (cause: unknown): VaultError => new VaultError('unexpected_error', "The strengthChecker's load() failed, so the bank could not check a new passphrase, and bank.hello() was refused rather than open a vault in that state. Its error is this error's cause. For zxcvbnStrengthChecker, it is the chunk holding zxcvbn and its dictionary that would not load: check that your build ships it and your page may fetch it. A dropped connection mends at the next bank.hello().", { cause })
// --

// == [VaultDB Throwers]: vaultEmpty, vaultMismatch, vaultGone, staleWrite, camped, absentBox, gateIssue, boxTooLarge, vaultFull, damagedRecord, newerFormat, seqNotNext, storageError

/* The refusals of a vaultDB, each read the same in an answer and an error: `meta` holds the `world` and `dbhas` the answer carries. */

export const vaultEmpty = (world: VS.VaultRow): VaultError => (
  new VaultError('vault_empty', 'Nothing is stored for this life of the vault: read the vault again by its scope.', { meta: { world, dbhas: null } })
)

export const vaultMismatch = (world: VS.VaultRow): VaultError => (
  new VaultError('vault_mismatch', 'A live vault stands here under another vault_tok, so nothing was read or written: read the vault again by its scope.', { meta: { world, dbhas: world } })
)

export const vaultGone = (tombstone: VS.VaultRow): VaultError => (
  new VaultError('vault_gone', 'This vault was deleted.', { meta: { world: tombstone, dbhas: tombstone } })
)

export const staleWrite = (world: VS.VaultRow, dbhas: VS.VaultRow | VS.BoxRow | null): VaultError => (
  new VaultError('stale_write', 'What is stored moved since this revision was read, so nothing was written: read it again.', { meta: { world, dbhas } })
)

export const camped = (world: VS.VaultRow, dbhas: VS.VaultRow | VS.BoxRow): VaultError => (
  new VaultError('camped', 'A live record is already stored here, and this call was told not to replace it.', { meta: { world, dbhas } })
)

export const absentBox = (world: VS.VaultRow, dbhas: VS.BoxRow | null): VaultError => (
  new VaultError('absent_box', 'No box is stored under that label.', { meta: { act: (dbhas === null) ? 'void' : 'gone', world, dbhas } })
)

export const gateIssue = (world: VS.VaultRow, why: string): VaultError => (
  new VaultError('gate_issue', `This change of the gate was refused: ${why}`, { meta: { world, dbhas: world } })
)

export const boxTooLarge = (recordBytes: number, maxRecordBytes: number): VaultError => (
  new VaultError('box_too_large', `That box weighs ${String(recordBytes)} bytes, over the ${String(maxRecordBytes)} its storage holds in one record.`)
)

export const vaultFull = (capacity: VS.Capacity): VaultError => (
  new VaultError('vault_full', 'This vault holds as many boxes as its storage allows.', { meta: { capacity } })
)

export const damagedRecord = (): VaultError => new VaultError('damaged_record', 'The stored record failed its checks, so it is set aside.')

export const newerFormat = (): VaultError => new VaultError('newer_format', 'The stored record is in a format newer than this version of the package reads.')

export const seqNotNext = (): VaultError => new VaultError('invalid_input', "A record's revision_seq must be one past its prior's.")

export const storageError = (cause: unknown): VaultError => new VaultError('storage_error', "The vault's storage failed: its own error is this error's cause.", { cause })
// --

// == [DeviceDB Throwers]: storeFailed

/** A store's failure as `storage_unavailable`, naming the verb and the thrown `name` and nothing else: the store is handed every lease row, and what it throws may quote one. */
export const storeFailed = (call: string, thrown: unknown): VaultError => {
  const thrownName = thrownNameOf(thrown)
  const named = (thrownName === null) ? '' : ` It threw ${thrownName}.`
  return new VaultError('storage_unavailable', `This device's own storage failed in ${call}: try again.${named}`)
}
// --

// == [Outcome Throwers]: storageUnavailable, unexpectedError

/** The message of the cause given a backend that failed without an error. */
const NoErrorGiven = 'The storage backend failed without giving an error.'

/** A cause as a refusal keeps it: never null or undefined. */
const causeOf = (cause: unknown): unknown => cause ?? new Error(NoErrorGiven)

/** The message of `storage_unavailable` where an adapter says no more exactly what failed. */
export const StorageTroubleMessage = "The vault's storage could not be reached, or failed partway: try again shortly. The storage adapter's own error is this error's cause."

/** A `storage_unavailable` refusal: the backend could not be reached, or failed.
 * @param cause - What the backend threw, as it came, kept for debugging. It holds only what the
 *   backend holds: ciphertext and unencrypted fields. True of a `VaultDB` adapter, never of the
 *   device store, which is handed lease records: `DeviceDB` replaces what its store throws with a
 *   condition that keeps only its `name`.
 * @param message - What failed, when there is more to say than that storage failed: which read or
 *   write it was, say. Never quotes a record or a name.
 *
 * @example
 *   try { return await client.query(text, params) } catch (err) { throw storageUnavailable(err) }
 * @example throw storageUnavailable(err, "This device's own storage failed reading its mark of this vault: try again.")
 */
export const storageUnavailable = (cause: unknown, message: string = StorageTroubleMessage): VaultError => (
  new VaultError('storage_unavailable', message, { cause: causeOf(cause) })
)

/** An `unexpected_error` refusal, `thrown` its cause: a bug, in safebyok or in a function the app handed it.
 *
 * @example unexpectedError(new TypeError("Cannot read properties of undefined (reading 'passkey')"))
 */
export const unexpectedError = (thrown: unknown): VaultError => (
  new VaultError('unexpected_error', "Something went wrong that safebyok did not expect: a bug, in safebyok or in a function the app handed it (a storage adapter, say). Nothing was retried, and a retry is unlikely to help; what was thrown is this error's cause.", { cause: thrown ?? new Error('Nothing was thrown with it.') })
)
// --
