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
 * forced: a new refusal gets a new thrower and a new phrase. Templated phrases are encouraged.
 *
 * A refusal's `meta` holds what reads at a glance, and an adapter may hand a bag of its own beside the cause: props to
 * depth two only; no arrays, which are kept as their JSON text; an object past depth two replaced by the string '{...}'.
 */

import { PassphraseKeyBytes } from '../helpers/consts'
import { VaultError, thrownNameOf } from './errors'
import type { Thrown } from './errors'
import * as Phrases   from '../helpers/phrases'
import type * as SX from '../shapes/shapes-storage'

// == [Outcome Throwers]: sanitizeForeignError, storageUnavailable, unexpectedError

/** The Error that stands as a refusal's cause for whatever was thrown: an Error as it is, anything else wrapped in one.
 * The header's rule on `meta` is advisory for the bag a thrower keeps: this function trims nothing it is handed.
 *
 * @example sanitizeForeignError('ECONNRESET')  // new Error('ECONNRESET')
 * @example sanitizeForeignError(42)            // an Error naming type number, 42 its cause
 */
export const sanitizeForeignError = (thrown: Thrown): Error => {
  if (thrown instanceof Error) { return thrown }
  if (typeof thrown === 'string') { return new Error(thrown) }
  if (thrown === null || thrown === undefined) { return new Error(Phrases.NoErrorGiven) }
  return new Error(Phrases.nonErrorThrown(typeof thrown), { cause: thrown })
}

/** A `storage_unavailable` refusal: the backend could not be reached, or failed.
 * @param cause - What the backend threw, kept for debugging as {@link sanitizeForeignError} makes it.
 *   It holds only what the backend holds: ciphertext and unencrypted fields. True of a `VaultDB`
 *   adapter, never of the device store, which is handed lease records: `DeviceDB` replaces what its
 *   store throws with a condition that keeps only its `name`.
 * @param message - What failed, when there is more to say than that storage failed: which read or
 *   write it was, say. Never quotes a record or a name.
 *
 * @example
 *   try { return await client.query(text, params) } catch (err) { throw storageUnavailable(err) }
 */
export const storageUnavailable = (cause: Thrown, message: string = Phrases.StorageUnavailable): VaultError => (
  new VaultError('storage_unavailable', message, { cause: sanitizeForeignError(cause) })
)

/** An `unexpected_error` refusal, `thrown` its cause: a bug, in safebyok or in a function the app handed it. */
export const unexpectedError = (thrown: Thrown): VaultError => (
  new VaultError('unexpected_error', Phrases.UnexpectedError, { cause: sanitizeForeignError(thrown) })
)
// --

// == [Bank Throwers]: insecureContext, helloFirst, bankDisabled

/** An `insecure_context` refusal: the page is not a secure context. */
export const insecureContext = (): VaultError => new VaultError('insecure_context', Phrases.InsecureContext)

/** A `bad_option` refusal: the bank is not ready until `bank.hello()` returns. */
export const helloFirst = (): VaultError => new VaultError('bad_option', Phrases.BankHelloFirst)

/** A `disabled` refusal: this bank was let go by a sweep or a vacate. */
export const bankDisabled = (): VaultError => new VaultError('disabled', Phrases.BankLetGo)
// --

// == [Vault Throwers]: lockedError, unlockFirst, stampOfOtherVault

/** A `vault_locked` refusal: the vault is locked, and `ensureUnlocked()` will ask the user. */
export const lockedError      = () => new VaultError('vault_locked', Phrases.VaultLocked)

/** A `vault_locked` refusal: the vault has no lease for a seal or unseal to use. */
export const unlockFirst = (): VaultError => new VaultError('vault_locked', Phrases.UnlockFirst)

/** An `unexpected_error` refusal: a stamp names another vault, or another life of this one. */
export const stampOfOtherVault = (): VaultError => new VaultError('unexpected_error', Phrases.StampOfOtherVault)
// --

// == [Vault Listing Throwers]: delOfOtherLife, vaultStoredDamaged

/** A `vault_mismatch` refusal: a delete named a different life of the vault than the life in its slot. */
export const delOfOtherLife = (): VaultError => new VaultError('vault_mismatch', Phrases.DelOfOtherLife)

/** A `damaged_row` refusal: this vault is stored damaged and cannot be read. */
export const vaultStoredDamaged = ({ vaultlabel }: SX.DamagedVault): VaultError => new VaultError('damaged_row', Phrases.vaultStoredDamaged(vaultlabel))
// --

// == [Listing Throwers]: putAnsweredNothing, otherVaultTokAtBirth

/** A `record_conflict` refusal: a vaultDB answered a put with no record. */
export const putAnsweredNothing = (): VaultError => new VaultError('record_conflict', Phrases.PutAnsweredNothing)

/** A `record_conflict` refusal: storage gave a record under another vault_tok than this listing's vault. */
export const otherVaultTokAtBirth = (): VaultError => new VaultError('record_conflict', Phrases.OtherVaultTokAtBirth)
// --

// == [Storable Throwers]: partialLoadError, alreadyEnlistedError, disabledError, absentBoxError, notListedBoxError, absentVaultError, deletedVaultError, oneRevisionTwoToks, oneRevisionTwoLives, oneRevisionTwoFates, otherVaultTok, shapeUnreconciled

/** A `bad_option` refusal: the record in hand is not full, and needs hydrating first. */
export const partialLoadError = () => new VaultError('bad_option', Phrases.PartialLoad)

/** A `bad_option` refusal: the listing already holds an instance under the dna's scope. */
export const alreadyEnlistedError    = () => new VaultError('bad_option', Phrases.AlreadyEnlisted)

/** A `disabled` refusal: this object was let go by a sweep, a vacate or a delete. */
export const disabledError    = () => new VaultError('disabled', Phrases.LetGoInstance)

/** An `absent_box` refusal: no box is stored under the label given. */
export const absentBoxError   = ({ boxlabel }: { boxlabel: string }) => new VaultError('absent_box', Phrases.boxAbsent(boxlabel))

/** An `absent_box` refusal: no box is listed under the label given, though one may be stored. */
export const notListedBoxError = ({ boxlabel }: { boxlabel: string }) => new VaultError('absent_box', Phrases.boxNotListed(boxlabel))

/** An `absent_vault` refusal: no vault is stored under the label given. */
export const absentVaultError = ({ vaultlabel }: { vaultlabel: string }) => new VaultError('absent_vault', Phrases.vaultAbsent(vaultlabel))

/** A `vault_gone` refusal: this vault was deleted. */
export const deletedVaultError = () => new VaultError('vault_gone', Phrases.VaultDeleted)

/** A `record_conflict` refusal: storage holds this revision_seq under another revision_tok. */
export const oneRevisionTwoToks = (): VaultError => new VaultError('record_conflict', Phrases.OneRevisionTwoToks)

/** A `record_conflict` refusal: storage holds this revision as another life of the thing. */
export const oneRevisionTwoLives = (): VaultError => new VaultError('record_conflict', Phrases.OneRevisionTwoLives)

/** A `record_conflict` refusal: storage and this device disagree on whether this revision is alive or deleted. */
export const oneRevisionTwoFates = (): VaultError => new VaultError('record_conflict', Phrases.OneRevisionTwoFates)

/** A `record_conflict` refusal: storage holds this record under another vault_tok than this device does. */
export const otherVaultTok = (): VaultError => new VaultError('record_conflict', Phrases.OtherVaultTok)

/** An `unexpected_error` refusal: `Storable` met a shape it cannot reconcile, which is a bug. */
export const shapeUnreconciled = (): VaultError => new VaultError('unexpected_error', Phrases.ShapeUnreconciled)
// --

// == [Box Throwers]: recordForNewBox, undecodedWhisper, notExposedError

/** The refusal of a put that said only-if-new, handed a whole record. */
export const recordForNewBox = (): VaultError => new VaultError('bad_option', Phrases.RecordForNewBox)

/** A `damaged_box` refusal: the box opened, but what is inside is not a whisper this package can read. */
export const undecodedWhisper = (): VaultError => new VaultError('damaged_box', Phrases.UndecodedWhisper)

/** The refusal of a call that works on the exposed whisper, on a box with none. */
export const notExposedError = (): VaultError => new VaultError('bad_option', Phrases.NotExposed)
// --

// == [Lease Throwers]: damagedLease, unopenedWhisper, leaseNotInForce

/** A `damaged_lease` refusal: this device's lease will not open. */
export const damagedLease = (): VaultError => new VaultError('damaged_lease', Phrases.DamagedLease)

/** A `damaged_box` refusal: the whisper would not open under this vault's key. */
export const unopenedWhisper = (): VaultError => new VaultError('damaged_box', Phrases.UnopenedWhisper)

/** A `vault_locked` refusal: this lease is out of force. */
export const leaseNotInForce = (): VaultError => new VaultError('vault_locked', Phrases.LeaseNotInForce)
// --

// == [Gating Throwers]: alreadyAsking, requestCleartextThrew, clearsThrew, samePassphrase, gatingDismissed, gatingConcluded, attemptInFlight, proofMissing

/** An `already_asking` refusal: a prompt is already open on this bank. */
export const alreadyAsking = (): VaultError => new VaultError('already_asking', Phrases.AlreadyAsking)

/** An `unexpected_error` refusal that keeps nothing of what the host's `requestCleartext` threw. */
export const requestCleartextThrew = (): VaultError => new VaultError('unexpected_error', Phrases.RequestCleartextThrew)

/** An `unexpected_error` refusal that keeps nothing of what reading an attempt's cleartext threw. */
export const clearsThrew = (): VaultError => new VaultError('unexpected_error', Phrases.ClearsThrew)

/** A `same_passphrase` refusal: the new passphrase matches the current passphrase. */
export const samePassphrase = (): VaultError => new VaultError('same_passphrase', Phrases.SamePassphrase)

/** A `dismissed` refusal: the prompt was dismissed before an attempt succeeded. */
export const gatingDismissed = (): VaultError => new VaultError('dismissed', Phrases.GatingDismissed)

/** A `gating_landed` refusal: an attempt reached a prompt that has already ended. */
export const gatingConcluded = (): VaultError => new VaultError('gating_landed', Phrases.GatingConcluded)

/** An `attempt_in_flight` refusal: another attempt on this prompt is still running. */
export const attemptInFlight = (): VaultError => new VaultError('attempt_in_flight', Phrases.AttemptInFlight)

/** A `bad_option` refusal: an attempt handed in neither a passphrase nor a passkey's answer. */
export const proofMissing = (): VaultError => new VaultError('bad_option', Phrases.ProofMissing)
// --

// == [Gate Throwers]: passkeyHeldAlready

/** A `bad_option` refusal: this vault already has a passkey. */
export const passkeyHeldAlready = (): VaultError => new VaultError('bad_option', Phrases.PasskeyHeldAlready)
// --

// == [Proving Throwers]: notKeyBytes, wayinNotMadeYet, wayinMadeAlready, keyDeriverThrew, keyDeriverLoadFailed, weakPassphrase, wrongPassphrase, wrongPasskey, noPasskeyWayin, otherPasskey, otherPrfSalt, unknownKeyDeriver, undecodedSalt, provingOfOtherVault, leaseOfOtherVault

/** A `bad_option` refusal: the key deriver handed back something other than fresh key bytes of the right length. */
export const notKeyBytes = (): VaultError => new VaultError('bad_option', Phrases.notKeyBytes(PassphraseKeyBytes))

/** An `unexpected_error` refusal: a proving was asked for the vaultKey before it made or opened a wayin. */
export const wayinNotMadeYet = (): VaultError => new VaultError('unexpected_error', Phrases.WayinNotMadeYet)

/** An `unexpected_error` refusal: this proving already holds a wayin. */
export const wayinMadeAlready = (): VaultError => new VaultError('unexpected_error', Phrases.WayinMadeAlready)

/** An `unexpected_error` refusal that keeps nothing of what the key deriver threw. */
export const keyDeriverThrew = (): VaultError => new VaultError('unexpected_error', Phrases.KeyDeriverThrew)

/** An `unexpected_error` refusal: the key deriver's `load()` failed, with its error as `cause`. */
export const keyDeriverLoadFailed = (cause: unknown): VaultError => new VaultError('unexpected_error', Phrases.KeyDeriverLoadFailed, { cause })

/** A `weak_passphrase` refusal carrying the strength checker's `reason`. */
export const weakPassphrase = (reason: string): VaultError => new VaultError('weak_passphrase', reason)

/** A `wrong_passphrase` refusal: the passphrase did not unlock the vault. */
export const wrongPassphrase = (): VaultError => new VaultError('wrong_passphrase', Phrases.WrongPassphrase)

/** A `wrong_passkey` refusal: the passkey answered, but its answer did not unlock the vault. */
export const wrongPasskey = (): VaultError => new VaultError('wrong_passkey', Phrases.WrongPasskey)

/** An `absent_wayin` refusal: this vault has no passkey wayin. */
export const noPasskeyWayin = (): VaultError => new VaultError('absent_wayin', Phrases.NoPasskeyWayin)

/** A `wrong_passkey` refusal: the passkey is not the credential this vault's wayin names. */
export const otherPasskey = (): VaultError => new VaultError('wrong_passkey', Phrases.OtherPasskey)

/** A `wrong_passkey` refusal: the passkey answered for a different salt than this vault keeps for it. */
export const otherPrfSalt = (): VaultError => new VaultError('wrong_passkey', Phrases.OtherPrfSalt)

/** A `newer_format` refusal: the vault was made with a key deriver this package does not carry. */
export const unknownKeyDeriver = (): VaultError => new VaultError('newer_format', Phrases.UnknownKeyDeriver)

/** A `bad_record` refusal: the stored passphrase salt is not valid base64url text. */
export const undecodedSalt = (): VaultError => new VaultError('bad_record', Phrases.UndecodedSalt)

/** An `unexpected_error` refusal: the source proving belongs to another vault. */
export const provingOfOtherVault = (): VaultError => new VaultError('unexpected_error', Phrases.ProvingOfOtherVault)

/** An `unexpected_error` refusal: a proving was asked for a lease on another vault. */
export const leaseOfOtherVault = (): VaultError => new VaultError('unexpected_error', Phrases.LeaseOfOtherVault)
// --

// == [Helper Throwers]: unboundCipherCtx, strengthCheckerMisanswered, strengthCheckerLoadFailed

/** An `unexpected_error` refusal: a cipher ctx is missing a stamp, or a part or field of a stamp. */
export const unboundCipherCtx = (): VaultError => new VaultError('unexpected_error', Phrases.UnboundCipherCtx)

/** A `bad_option` refusal: the host's strength checker answered something other than a verdict. */
export const strengthCheckerMisanswered = (): VaultError => new VaultError('bad_option', Phrases.StrengthCheckerMisanswered)

/** An `unexpected_error` refusal: the strength checker's `load()` failed, with its error as `cause`. */
export const strengthCheckerLoadFailed = (cause: unknown): VaultError => new VaultError('unexpected_error', Phrases.StrengthCheckerLoadFailed, { cause })
// --

// == [Deriver Throwers]: reservedLabel, suppliedSpecChanged

/** A `bad_option` refusal: a key deriver's label starts with a reserved prefix. */
export const reservedLabel = (reservedPrefix: string): VaultError => new VaultError('bad_option', Phrases.reservedDeriverLabel(reservedPrefix))

/** A `bad_option` refusal: a spec reuses a supplied label with different settings. */
export const suppliedSpecChanged = (label: string): VaultError => new VaultError('bad_option', Phrases.suppliedSpecChanged(label))
// --

// == [VaultDB Throwers]: vaultEmpty, vaultMismatch, vaultGone, staleWrite, camped, absentBox, gateIssue, boxTooLarge, vaultFull, storageFull, seqNotNext

/* The refusals of a vaultDB, each read the same in an answer and an error: `meta` holds the `world` and `dbhas` the answer carries. */

/** A `vault_empty` refusal: nothing is stored for this life of the vault. */
export const vaultEmpty = (world: SX.VaultRow): VaultError => (
  new VaultError('vault_empty', Phrases.VaultEmpty, { meta: { world, dbhas: null } })
)

/** A `vault_mismatch` refusal: a live vault stands here under another vault_tok. */
export const vaultMismatch = (stored: SX.VaultRow): VaultError => (
  new VaultError('vault_mismatch', Phrases.VaultMismatch, { meta: { world: null, dbhas: stored } })
)

/** A `vault_gone` refusal: this vault was deleted. */
export const vaultGone = (tombstone: SX.VaultRow): VaultError => (
  new VaultError('vault_gone', Phrases.VaultGone, { meta: { world: tombstone, dbhas: tombstone } })
)

/** A `stale_write` refusal: what is stored moved since this revision was read. */
export const staleWrite = (world: SX.VaultRow, dbhas: SX.VaultRow | SX.BoxRow | null): VaultError => (
  new VaultError('stale_write', Phrases.StaleWrite, { meta: { world, dbhas } })
)

/** A `camped` refusal: a live record is stored here, and the call said not to replace it. */
export const camped = (world: SX.VaultRow, dbhas: SX.VaultRow | SX.BoxRow): VaultError => (
  new VaultError('camped', Phrases.Camped, { meta: { world, dbhas } })
)

/** An `absent_box` refusal from a vaultDB: no box is stored under that label. */
export const absentBox = (world: SX.VaultRow, dbhas: SX.BoxRow | null): VaultError => (
  new VaultError('absent_box', Phrases.AbsentBox, { meta: { act: (dbhas === null) ? 'void' : 'gone', world, dbhas } })
)

/** A `gate_issue` refusal: a change of the gate was refused for the reason `why`. */
export const gateIssue = (world: SX.VaultRow, why: string): VaultError => (
  new VaultError('gate_issue', Phrases.gateIssue(why), { meta: { world, dbhas: world } })
)

/** A `box_too_large` refusal: the record's `recordBytes` exceed `maxRecordBytes`. */
export const boxTooLarge = (recordBytes: number, maxRecordBytes: number): VaultError => (
  new VaultError('box_too_large', Phrases.boxTooLarge(recordBytes, maxRecordBytes))
)

/** A `vault_full` refusal: the vault holds as many boxes as its storage allows. */
export const vaultFull = (capacity: SX.Capacity): VaultError => (
  new VaultError('vault_full', Phrases.VaultFull, { meta: { capacity } })
)

/** A `vault_full` refusal for a write storage itself had no room for, `cause` what the backend threw. */
export const storageFull = (cause: Thrown): VaultError => (
  new VaultError('vault_full', Phrases.StorageFull, { cause: sanitizeForeignError(cause) })
)

/** A `bad_option` refusal: a record's revision_seq is not one past its prior's. */
export const seqNotNext = (): VaultError => new VaultError('bad_option', Phrases.SeqNotNext)
// --

// == [DeviceDB Throwers]: storeFailed

/** A store's failure as `storage_unavailable`, naming the verb and the thrown `name` and nothing else: the store is handed every lease row, and what it throws may quote one. */
export const storeFailed = (call: string, thrown: unknown): VaultError => {
  const thrownName = thrownNameOf(thrown)
  const named = (thrownName === null) ? '' : Phrases.storeThrew(thrownName)
  return new VaultError('storage_unavailable', Phrases.storeFailed(call, named))
}
// --

// == [Backend Throwers]: storageFailed, storageIssue, identityRevoked

// A backend's error may quote the call's arguments, so only its `name` is kept.
/** A storage backend's failure as `storage_unavailable`, naming the call and the thrown `name` and nothing else. */
export const storageFailed = (call: string, thrown: unknown): VaultError => {
  const thrownName = thrownNameOf(thrown)
  const named = (thrownName === null) ? '' : Phrases.storeThrew(thrownName)
  return new VaultError('storage_unavailable', Phrases.storageFailed(call, named))
}

/** A `storage_issue` refusal: a row out of storage is not an object at all. */
export const storageIssue = (): VaultError => new VaultError('storage_issue', Phrases.StorageIssue)

/** An `identity_revoked` refusal: the storage backend no longer serves the user the call names. */
export const identityRevoked = (): VaultError => new VaultError('identity_revoked', Phrases.IdentityRevoked)
// --
