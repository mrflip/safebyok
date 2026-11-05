/** The throwers: every refusal the core raises is made here, from a phrase in helpers/phrases.ts, so they are audited in one place.
 *
 * A refusal kind earns its place one of three ways: the core or a host routes on it; it gives a material head start in
 * debugging (this is a package bug for sure; the vault was not tombstoned but disappeared; a check that should be
 * impossible to fail did); or it groups throwers that tell one story. Guessing which of two ways a strict object check
 * failed is no head start. The stronger rule is "don't make me read": a finer kind must be worth the reading it costs.
 *
 * A thrower's name, its kind and its phrase's name agree; the phrase is of a piece with the kind, mirroring, containing or
 * eliding its words; and all three read naturally at the call site. A caller passes what it has on hand and trusts the
 * thrower to sanitize and cherry-pick. A name carries no "error" or "refusal", ends in "issue" at a loss, and is
 * empathetic and frank to the person who trusted us with their data, and readable to the coder. Reuse is welcome, never
 * forced: a new refusal gets a new thrower and a new phrase. Templated phrases are encouraged. */

import { PassphraseKeyBytes } from '../helpers/consts'
import { VaultError, thrownNameOf } from './errors'
import * as Phrases   from '../helpers/phrases'
import type * as SX from '../shapes/shapes-storage'

// == [Outcome Throwers]: storageUnavailable, unexpectedError

/** A cause as a refusal keeps it: never null or undefined. */
const causeOf = (cause: unknown): unknown => cause ?? new Error(Phrases.NoErrorGiven)

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
export const storageUnavailable = (cause: unknown, message: string = Phrases.StorageUnavailable): VaultError => (
  new VaultError('storage_unavailable', message, { cause: causeOf(cause) })
)

/** An `unexpected_error` refusal, `thrown` its cause: a bug, in safebyok or in a function the app handed it.
 *
 * @example unexpectedError(new TypeError("Cannot read properties of undefined (reading 'passkey')"))
 */
export const unexpectedError = (thrown: unknown): VaultError => (
  new VaultError('unexpected_error', Phrases.UnexpectedError, { cause: thrown ?? new Error(Phrases.NothingThrown) })
)
// --

// == [Bank Throwers]: insecureContext, helloFirst, deviceRecordRewritten

export const insecureContext = (): VaultError => new VaultError('insecure_context', Phrases.InsecureContext)

export const helloFirst = (): VaultError => new VaultError('bad_option', Phrases.BankHelloFirst)

export const deviceRecordRewritten = (): VaultError => new VaultError('damaged_row', Phrases.DeviceRecordRewritten)
// --

// == [Vault Throwers]: lockedError, listingExpected, unlockFirst, noProofToUnlock, stampOfOtherVault

export const lockedError      = () => new VaultError('vault_locked', Phrases.VaultLocked)

export const listingExpected = (): VaultError => new VaultError('unexpected_error', Phrases.ListingExpected)

export const unlockFirst = (): VaultError => new VaultError('vault_locked', Phrases.UnlockFirst)

export const noProofToUnlock = (): VaultError => new VaultError('bad_option', Phrases.NoProofToUnlock)

export const stampOfOtherVault = (): VaultError => new VaultError('unexpected_error', Phrases.StampOfOtherVault)
// --

// == [Vault Listing Throwers]: delOfOtherLife, vaultStoredDamaged

export const delOfOtherLife = (): VaultError => new VaultError('vault_mismatch', Phrases.DelOfOtherLife)

export const vaultStoredDamaged = ({ vaultlabel }: SX.DamagedVault): VaultError => new VaultError('damaged_row', Phrases.vaultStoredDamaged(vaultlabel))
// --

// == [Listing Throwers]: putAnsweredNothing, otherVaultTokAtBirth

export const putAnsweredNothing = (): VaultError => new VaultError('record_conflict', Phrases.PutAnsweredNothing)

export const otherVaultTokAtBirth = (): VaultError => new VaultError('record_conflict', Phrases.OtherVaultTokAtBirth)
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

export const otherVaultTok = (): VaultError => new VaultError('record_conflict', Phrases.OtherVaultTok)

export const shapeUnreconciled = (): VaultError => new VaultError('unexpected_error', Phrases.ShapeUnreconciled)
// --

// == [Box Throwers]: recordForNewBox, undecodedWhisper, absentDamagedBoxError

/** The refusal of a put that said only-if-new, handed a whole record. */
export const recordForNewBox = (): VaultError => new VaultError('bad_option', Phrases.RecordForNewBox)

export const undecodedWhisper = (): VaultError => new VaultError('damaged_box', Phrases.UndecodedWhisper)

export const absentDamagedBoxError = ({ boxlabel }: { boxlabel: string }) => new VaultError('absent_box', Phrases.damagedBoxAbsent(boxlabel))
// --

// == [Lease Throwers]: damagedLease, unopenedWhisper, leaseNotInForce

export const damagedLease = (): VaultError => new VaultError('damaged_lease', Phrases.DamagedLease)

export const unopenedWhisper = (): VaultError => new VaultError('damaged_box', Phrases.UnopenedWhisper)

export const leaseNotInForce = (): VaultError => new VaultError('vault_locked', Phrases.LeaseNotInForce)
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

export const proofMissing = (): VaultError => new VaultError('bad_option', Phrases.ProofMissing)
// --

// == [Gate Throwers]: passkeyHeldAlready

export const passkeyHeldAlready = (): VaultError => new VaultError('bad_option', Phrases.PasskeyHeldAlready)
// --

// == [Proving Throwers]: notKeyBytes, wayinNotMadeYet, wayinMadeAlready, keyDeriverThrew, weakPassphrase, wrongPassphrase, wrongPasskey, noPasskeyWayin, otherPasskey, otherPrfSalt, unknownKeyDeriver, provingOfOtherVault, leaseOfOtherVault

export const notKeyBytes = (): VaultError => new VaultError('bad_option', Phrases.notKeyBytes(PassphraseKeyBytes))

export const wayinNotMadeYet = (): VaultError => new VaultError('unexpected_error', Phrases.WayinNotMadeYet)

export const wayinMadeAlready = (): VaultError => new VaultError('unexpected_error', Phrases.WayinMadeAlready)

export const keyDeriverThrew = (): VaultError => new VaultError('unexpected_error', Phrases.KeyDeriverThrew)

export const weakPassphrase = (reason: string): VaultError => new VaultError('weak_passphrase', reason)

export const wrongPassphrase = (): VaultError => new VaultError('wrong_passphrase', Phrases.WrongPassphrase)

export const wrongPasskey = (): VaultError => new VaultError('wrong_passkey', Phrases.WrongPasskey)

export const noPasskeyWayin = (): VaultError => new VaultError('absent_wayin', Phrases.NoPasskeyWayin)

export const otherPasskey = (): VaultError => new VaultError('wrong_passkey', Phrases.OtherPasskey)

export const otherPrfSalt = (): VaultError => new VaultError('wrong_passkey', Phrases.OtherPrfSalt)

export const unknownKeyDeriver = (): VaultError => new VaultError('newer_format', Phrases.UnknownKeyDeriver)

export const provingOfOtherVault = (): VaultError => new VaultError('unexpected_error', Phrases.ProvingOfOtherVault)

export const leaseOfOtherVault = (): VaultError => new VaultError('unexpected_error', Phrases.LeaseOfOtherVault)
// --

// == [Helper Throwers]: unboundCipherCtx, strengthCheckerMisanswered, strengthCheckerLoadFailed

export const unboundCipherCtx = (): VaultError => new VaultError('unexpected_error', Phrases.UnboundCipherCtx)

export const strengthCheckerMisanswered = (): VaultError => new VaultError('bad_option', Phrases.StrengthCheckerMisanswered)

export const strengthCheckerLoadFailed = (cause: unknown): VaultError => new VaultError('unexpected_error', Phrases.StrengthCheckerLoadFailed, { cause })
// --

// == [Deriver Throwers]: reservedLabel, suppliedSpecChanged, saltDoesNotFit

export const reservedLabel = (reservedPrefix: string): VaultError => new VaultError('bad_option', Phrases.reservedDeriverLabel(reservedPrefix))

export const suppliedSpecChanged = (label: string): VaultError => new VaultError('bad_option', Phrases.suppliedSpecChanged(label))

export const saltDoesNotFit = (expectedCount: number, handedCount: number): VaultError => new VaultError('bad_option', Phrases.saltDoesNotFit(expectedCount, handedCount))
// --

// == [VaultDB Throwers]: vaultEmpty, vaultMismatch, vaultGone, staleWrite, camped, absentBox, gateIssue, boxTooLarge, vaultFull, damagedRecord, newerFormat, seqNotNext, recordPreparedWrong, storageError

/* The refusals of a vaultDB, each read the same in an answer and an error: `meta` holds the `world` and `dbhas` the answer carries. */

export const vaultEmpty = (world: SX.VaultRow): VaultError => (
  new VaultError('vault_empty', Phrases.VaultEmpty, { meta: { world, dbhas: null } })
)

export const vaultMismatch = (world: SX.VaultRow): VaultError => (
  new VaultError('vault_mismatch', Phrases.VaultMismatch, { meta: { world, dbhas: world } })
)

export const vaultGone = (tombstone: SX.VaultRow): VaultError => (
  new VaultError('vault_gone', Phrases.VaultGone, { meta: { world: tombstone, dbhas: tombstone } })
)

export const staleWrite = (world: SX.VaultRow, dbhas: SX.VaultRow | SX.BoxRow | null): VaultError => (
  new VaultError('stale_write', Phrases.StaleWrite, { meta: { world, dbhas } })
)

export const camped = (world: SX.VaultRow, dbhas: SX.VaultRow | SX.BoxRow): VaultError => (
  new VaultError('camped', Phrases.Camped, { meta: { world, dbhas } })
)

export const absentBox = (world: SX.VaultRow, dbhas: SX.BoxRow | null): VaultError => (
  new VaultError('absent_box', Phrases.AbsentBox, { meta: { act: (dbhas === null) ? 'void' : 'gone', world, dbhas } })
)

export const gateIssue = (world: SX.VaultRow, why: string): VaultError => (
  new VaultError('gate_issue', Phrases.gateIssue(why), { meta: { world, dbhas: world } })
)

export const boxTooLarge = (recordBytes: number, maxRecordBytes: number): VaultError => (
  new VaultError('box_too_large', Phrases.boxTooLarge(recordBytes, maxRecordBytes))
)

export const vaultFull = (capacity: SX.Capacity): VaultError => (
  new VaultError('vault_full', Phrases.VaultFull, { meta: { capacity } })
)

export const damagedRecord = (): VaultError => new VaultError('damaged_row', Phrases.DamagedRecord)

export const newerFormat = (): VaultError => new VaultError('newer_format', Phrases.NewerFormat)

export const seqNotNext = (): VaultError => new VaultError('bad_option', Phrases.SeqNotNext)

export const recordPreparedWrong = (cause: unknown): VaultError => new VaultError('unexpected_error', Phrases.RecordPreparedWrong, { cause })

export const storageError = (cause: unknown): VaultError => new VaultError('storage_unavailable', Phrases.StorageError, { cause })
// --

// == [DeviceDB Throwers]: storeFailed

/** A store's failure as `storage_unavailable`, naming the verb and the thrown `name` and nothing else: the store is handed every lease row, and what it throws may quote one. */
export const storeFailed = (call: string, thrown: unknown): VaultError => {
  const thrownName = thrownNameOf(thrown)
  const named = (thrownName === null) ? '' : Phrases.storeThrew(thrownName)
  return new VaultError('storage_unavailable', Phrases.storeFailed(call, named))
}
// --
