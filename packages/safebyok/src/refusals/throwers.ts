import { PassphraseKeyBytes } from '../helpers/consts'
import { VaultError } from './errors'
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

// == [Storable Throwers]

export const partialLoadError = () => new VaultError('bad_option', Phrases.PartialLoad)

export const alreadyHeldError    = () => new VaultError('bad_option', Phrases.AlreadyHeld)

export const disabledError    = () => new VaultError('disabled', Phrases.LetGoInstance)

export const absentBoxError   = ({ boxlabel }: { boxlabel: string }) => new VaultError('absent_box', Phrases.boxAbsent(boxlabel))

export const notListedBoxError = ({ boxlabel }: { boxlabel: string }) => new VaultError('absent_box', Phrases.boxNotListed(boxlabel))

export const absentVaultError = ({ vaultlabel }: { vaultlabel: string }) => new VaultError('absent_vault', Phrases.vaultAbsent(vaultlabel))

export const deletedVaultError = () => new VaultError('vault_gone', Phrases.VaultDeleted)
// --

// == [Gating Throwers]: alreadyAsking, noRequestCleartext, requestCleartextThrew, clearsThrew, samePassphrase, gatingDeclined, lockedWhileAsking, gatingSettled, attemptInFlight

export const alreadyAsking = (): VaultError => new VaultError('already_asking', Phrases.AlreadyAsking)

export const noRequestCleartext = (): VaultError => new VaultError('bad_option', Phrases.NoRequestCleartext)

export const requestCleartextThrew = (): VaultError => new VaultError('unexpected_error', Phrases.RequestCleartextThrew)

export const clearsThrew = (): VaultError => new VaultError('unexpected_error', Phrases.ClearsThrew)

export const samePassphrase = (): VaultError => new VaultError('same_passphrase', Phrases.SamePassphrase)

export const gatingDeclined = (): VaultError => new VaultError('declined', Phrases.GatingDeclined)

export const lockedWhileAsking = (): VaultError => new VaultError('locked_while_asking', Phrases.LockedWhileAsking)

export const gatingSettled = (): VaultError => new VaultError('gating_landed', Phrases.GatingSettled)

export const attemptInFlight = (): VaultError => new VaultError('attempt_in_flight', Phrases.AttemptInFlight)
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
