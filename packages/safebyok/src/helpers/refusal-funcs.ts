import { PassphraseKeyBytes } from '../consts'
import { type RefusalMeta, type VaultErrorOpts, VaultError } from '../errors'
import * as Phrases from '../phrases'
import type { ModelsRefusalKind } from '../models/models-shapes'

// Every refusal the models throw, each made fresh by its factory: `throw RefusalFuncs.vaultLocked()`.
// A factory is named for what was observed, never for a guess at its cause or remedy, and makes
// its refusal through `listedRefusal`, so its kind is one the models list (`modelsRefusalKindVals`).

const listedRefusal = (refusalkind: ModelsRefusalKind, message: string, opts?: VaultErrorOpts): VaultError => new VaultError(refusalkind, message, opts)

// == [Opening a vault]: vaultGoneWhileOpening, otherStoresThanHeld, vaultBehindWhileOpening

export const vaultGoneWhileOpening = (): VaultError => listedRefusal('vault_gone', Phrases.VaultGoneWhileOpening)

export const otherStoresThanHeld = (): VaultError => listedRefusal('bad_option', Phrases.OtherStoresThanHeld)

export const vaultBehindWhileOpening = (): VaultError => listedRefusal('vault_behind', Phrases.VaultBehindWhileOpening)
// --

// == [Storables]: vaultLocked, partialLoad, movedUnderEdit, oneRevisionTwoToks, oneRevisionTwoLives, oneRevisionTwoFates, otherVaultTok, shapeUnreconciled

export const vaultLocked = (): VaultError => listedRefusal('vault_locked', Phrases.VaultLocked)

export const partialLoad = (): VaultError => listedRefusal('bad_option', Phrases.PartialLoad)

/** The 'stale_write' of an edit laid over a central that moved meanwhile, its `meta` carrying both revisions. */
export const movedUnderEdit = (meta: RefusalMeta): VaultError => listedRefusal('stale_write', Phrases.MovedUnderEdit, { meta })

export const oneRevisionTwoToks = (): VaultError => listedRefusal('record_conflict', Phrases.OneRevisionTwoToks)

export const oneRevisionTwoLives = (): VaultError => listedRefusal('record_conflict', Phrases.OneRevisionTwoLives)

export const oneRevisionTwoFates = (): VaultError => listedRefusal('record_conflict', Phrases.OneRevisionTwoFates)

export const otherVaultTok = (): VaultError => listedRefusal('unexpected_error', Phrases.OtherVaultTok)

export const shapeUnreconciled = (): VaultError => listedRefusal('unexpected_error', Phrases.ShapeUnreconciled)
// --

// == [Listings]: alreadyHeld, dnaHandedToBuild, putUnfitForPrior, answerOfOtherScope, recordOfOtherScope, otherVaultTokAtBirth, vaultAbsent, boxAbsent

export const alreadyHeld = (): VaultError => listedRefusal('bad_option', Phrases.AlreadyHeld)

export const dnaHandedToBuild = (): VaultError => listedRefusal('bad_option', Phrases.DnaHandedToBuild)

export const putUnfitForPrior = (): VaultError => listedRefusal('bad_record', Phrases.PutUnfitForPrior)

export const answerOfOtherScope = (): VaultError => listedRefusal('bad_record', Phrases.AnswerOfOtherScope)

export const recordOfOtherScope = (): VaultError => listedRefusal('bad_record', Phrases.RecordOfOtherScope)

export const otherVaultTokAtBirth = (): VaultError => listedRefusal('unexpected_error', Phrases.OtherVaultTokAtBirth)

export const vaultAbsent = (vaultlabel: string): VaultError => listedRefusal('absent_vault', Phrases.vaultAbsent(vaultlabel))

export const boxAbsent = (boxlabel: string): VaultError => listedRefusal('absent_box', Phrases.boxAbsent(boxlabel))
// --

// == [Stores]: damagedVaultRow, damagedBoxRow, scopeOutsideStore, storeRowsMiscounted

export const damagedVaultRow = (): VaultError => new VaultError('damaged_vault', Phrases.VaultRowDamaged)

export const damagedBoxRow = (): VaultError => new VaultError('damaged_box', Phrases.BoxRowDamaged)

export const scopeOutsideStore = (): VaultError => new VaultError('bad_scope', Phrases.ScopeOutsideStore)

export const storeRowsMiscounted = (): VaultError => new VaultError('corrupt_record', Phrases.StoreRowsMiscounted)
// --

// == [Leases]: damagedLease, unopenedWhisper, leaseNotInForce

export const damagedLease = (): VaultError => listedRefusal('damaged_lease', Phrases.DamagedLease)

export const unopenedWhisper = (): VaultError => listedRefusal('damaged_box', Phrases.UnopenedWhisper)

export const leaseNotInForce = (): VaultError => listedRefusal('vault_locked', Phrases.LeaseNotInForce)
// --

// == [Boxes]: undecodedWhisper

export const undecodedWhisper = (): VaultError => listedRefusal('damaged_box', Phrases.UndecodedWhisper)
// --

// == [Vaults]: needVaultUnlocked, lockedWhileUnlocking, leaseOfOtherHolder

export const needVaultUnlocked = (): VaultError => listedRefusal('vault_locked', Phrases.NeedVaultUnlocked)

export const lockedWhileUnlocking = (): VaultError => listedRefusal('vault_locked', Phrases.LockedWhileUnlocking)

export const leaseOfOtherHolder = (): VaultError => listedRefusal('bad_option', Phrases.LeaseOfOtherHolder)
// --

// == [Gates]: passkeyHeldAlready, noPasskeyToRevoke, gateMovedUnderChange

export const passkeyHeldAlready = (): VaultError => listedRefusal('bad_option', Phrases.PasskeyHeldAlready)

export const noPasskeyToRevoke = (): VaultError => listedRefusal('absent_wayin', Phrases.NoPasskeyToRevoke)

/** The 'stale_write' of a gate change proved against a record that moved meanwhile, its `meta` the revisions {@link movedUnderEdit} carries. */
export const gateMovedUnderChange = (meta: RefusalMeta): VaultError => listedRefusal('stale_write', Phrases.GateMovedUnderChange, { meta })
// --

// == [Provings]: notKeyBytes, wayinNotMadeYet, wayinMadeAlready, provingOfOtherVault, leaseOfOtherVault, keyDeriverThrew, wrongPassphrase, wrongPasskey, noPasskeyWayin, otherPasskey, otherPrfSalt, unknownKeyDeriver

export const notKeyBytes = (): VaultError => listedRefusal('bad_option', Phrases.notKeyBytes(PassphraseKeyBytes))

export const wayinNotMadeYet = (): VaultError => listedRefusal('unexpected_error', Phrases.WayinNotMadeYet)

export const wayinMadeAlready = (): VaultError => listedRefusal('unexpected_error', Phrases.WayinMadeAlready)

export const provingOfOtherVault = (): VaultError => listedRefusal('bad_option', Phrases.ProvingOfOtherVault)

export const leaseOfOtherVault = (): VaultError => listedRefusal('bad_option', Phrases.LeaseOfOtherVault)

export const keyDeriverThrew = (): VaultError => listedRefusal('unexpected_error', Phrases.KeyDeriverThrew)

export const wrongPassphrase = (): VaultError => listedRefusal('wrong_passphrase', Phrases.WrongPassphrase)

export const wrongPasskey = (): VaultError => listedRefusal('wrong_passkey', Phrases.WrongPasskey)

export const noPasskeyWayin = (): VaultError => listedRefusal('absent_wayin', Phrases.NoPasskeyWayin)

export const otherPasskey = (): VaultError => listedRefusal('wrong_passkey', Phrases.OtherPasskey)

export const otherPrfSalt = (): VaultError => listedRefusal('wrong_passkey', Phrases.OtherPrfSalt)

export const unknownKeyDeriver = (): VaultError => listedRefusal('unknown_key_deriver', Phrases.UnknownKeyDeriver)
// --

// == [Gatings]: requestCleartextThrew, gatingDeclined, lockedWhileAsking, gatingSettled, passkeyProvesNot, passkeyMovedSinceLaunch, gateMadeElsewhere, strengthCheckerThrew, notAVerdict, weakPassphrase, samePassphrase

export const requestCleartextThrew = (): VaultError => listedRefusal('unexpected_error', Phrases.RequestCleartextThrew)

export const gatingDeclined = (): VaultError => listedRefusal('declined', Phrases.GatingDeclined)

/** The 'declined' of a gating a lock of its vault ended while it asked. */
export const lockedWhileAsking = (): VaultError => listedRefusal('declined', Phrases.LockedWhileAsking)

export const gatingSettled = (): VaultError => listedRefusal('gating_landed', Phrases.GatingSettled)

export const passkeyProvesNot = (): VaultError => listedRefusal('bad_option', Phrases.PasskeyProvesNot)

export const passkeyMovedSinceLaunch = (): VaultError => listedRefusal('gate_moved', Phrases.PasskeyMovedSinceLaunch)

export const gateMadeElsewhere = (): VaultError => listedRefusal('gate_made_elsewhere', Phrases.GateMadeElsewhere)

export const strengthCheckerThrew = (): VaultError => listedRefusal('unexpected_error', Phrases.StrengthCheckerThrew)

export const notAVerdict = (): VaultError => listedRefusal('bad_option', Phrases.NotAVerdict)

/** The 'weak_passphrase' refusal, its message the strength checker's `reason`. */
export const weakPassphrase = (reason: string): VaultError => listedRefusal('weak_passphrase', reason)

export const samePassphrase = (): VaultError => listedRefusal('same_passphrase', Phrases.SamePassphrase)
// --

// == [Banks]: insecureContext

export const insecureContext = (): VaultError => listedRefusal('insecure_context', Phrases.InsecureContext)
// --

// == [Device store]: deviceStoreBlocked, deviceStoreUnavailable

/** The 'storage_blocked' of a device store the browser withholds, as `said` tells the verb that met it, naming `thrownName` alone of what the store threw. */
export const deviceStoreBlocked = (said: Phrases.DeviceStoreSaid, thrownName: string | null): VaultError => new VaultError('storage_blocked', Phrases.deviceStoreBlocked(said, thrownName))

/** The 'storage_unavailable' of a device store that failed otherwise, as `said` tells the verb that met it, naming `thrownName` alone of what the store threw. */
export const deviceStoreUnavailable = (said: Phrases.DeviceStoreSaid, thrownName: string | null): VaultError => new VaultError('storage_unavailable', Phrases.deviceStoreUnavailable(said, thrownName))
// --
