import { PassphraseKeyBytes } from '../consts'
import { type RefusalMeta, VaultError } from '../errors'
import * as Phrases from '../phrases'

// Every refusal the models throw, each made fresh by its factory: `throw RefusalFuncs.vaultLocked()`.
// A factory is named for what was observed, never for a guess at its cause or remedy.

// == [Opening a vault]: vaultGoneWhileOpening, otherStoresThanHeld, vaultBehindWhileOpening

export const vaultGoneWhileOpening = (): VaultError => new VaultError('vault_gone', Phrases.VaultGoneWhileOpening)

export const otherStoresThanHeld = (): VaultError => new VaultError('bad_option', Phrases.OtherStoresThanHeld)

export const vaultBehindWhileOpening = (): VaultError => new VaultError('vault_behind', Phrases.VaultBehindWhileOpening)
// --

// == [Storables]: vaultLocked, partialLoad, movedUnderEdit, oneRevisionTwoToks, oneRevisionTwoLives, oneRevisionTwoFates, otherVaultTok, shapeUnreconciled

export const vaultLocked = (): VaultError => new VaultError('vault_locked', Phrases.VaultLocked)

export const partialLoad = (): VaultError => new VaultError('bad_option', Phrases.PartialLoad)

/** The 'stale_write' of an edit laid over a central that moved meanwhile, its `meta` carrying both revisions. */
export const movedUnderEdit = (meta: RefusalMeta): VaultError => new VaultError('stale_write', Phrases.MovedUnderEdit, { meta })

export const oneRevisionTwoToks = (): VaultError => new VaultError('record_conflict', Phrases.OneRevisionTwoToks)

export const oneRevisionTwoLives = (): VaultError => new VaultError('record_conflict', Phrases.OneRevisionTwoLives)

export const oneRevisionTwoFates = (): VaultError => new VaultError('record_conflict', Phrases.OneRevisionTwoFates)

export const otherVaultTok = (): VaultError => new VaultError('unexpected_error', Phrases.OtherVaultTok)

export const shapeUnreconciled = (): VaultError => new VaultError('unexpected_error', Phrases.ShapeUnreconciled)
// --

// == [Listings]: alreadyHeld, putUnfitForPrior, answerOfOtherScope, recordOfOtherScope, otherVaultTokAtBirth, vaultAbsent, boxAbsent, closureWithRecord

export const alreadyHeld = (): VaultError => new VaultError('bad_option', Phrases.AlreadyHeld)

export const putUnfitForPrior = (): VaultError => new VaultError('bad_record', Phrases.PutUnfitForPrior)

export const answerOfOtherScope = (): VaultError => new VaultError('bad_record', Phrases.AnswerOfOtherScope)

export const recordOfOtherScope = (): VaultError => new VaultError('bad_record', Phrases.RecordOfOtherScope)

export const otherVaultTokAtBirth = (): VaultError => new VaultError('unexpected_error', Phrases.OtherVaultTokAtBirth)

export const vaultAbsent = (vaultlabel: string): VaultError => new VaultError('absent_vault', Phrases.vaultAbsent(vaultlabel))

export const boxAbsent = (boxlabel: string): VaultError => new VaultError('absent_box', Phrases.boxAbsent(boxlabel))

export const closureWithRecord = (): VaultError => new VaultError('bad_option', Phrases.ClosureWithRecord)
// --

// == [Stores]: damagedVaultRow, damagedBoxRow, scopeOutsideStore, storeRowsMiscounted

export const damagedVaultRow = (): VaultError => new VaultError('damaged_vault', Phrases.VaultRowDamaged)

export const damagedBoxRow = (): VaultError => new VaultError('damaged_box', Phrases.BoxRowDamaged)

export const scopeOutsideStore = (): VaultError => new VaultError('bad_scope', Phrases.ScopeOutsideStore)

export const storeRowsMiscounted = (): VaultError => new VaultError('corrupt_record', Phrases.StoreRowsMiscounted)
// --

// == [Leases]: damagedLease, unopenedWhisper, leaseNotInForce

export const damagedLease = (): VaultError => new VaultError('damaged_lease', Phrases.DamagedLease)

export const unopenedWhisper = (): VaultError => new VaultError('damaged_box', Phrases.UnopenedWhisper)

export const leaseNotInForce = (): VaultError => new VaultError('vault_locked', Phrases.LeaseNotInForce)
// --

// == [Boxes]: undecodedWhisper

export const undecodedWhisper = (): VaultError => new VaultError('damaged_box', Phrases.UndecodedWhisper)
// --

// == [Vaults]: needVaultUnlocked, noProofToUnlock, leaseOfOtherHolder

export const needVaultUnlocked = (): VaultError => new VaultError('vault_locked', Phrases.NeedVaultUnlocked)

export const noProofToUnlock = (): VaultError => new VaultError('vault_locked', Phrases.NoProofToUnlock)

export const leaseOfOtherHolder = (): VaultError => new VaultError('bad_option', Phrases.LeaseOfOtherHolder)
// --

// == [Gates]: changeNeedsPassphrase, passkeyHeldAlready, noPasskeyToRevoke, gateMovedUnderChange

export const changeNeedsPassphrase = (): VaultError => new VaultError('bad_option', Phrases.GateChangeNeedsPassphrase)

export const passkeyHeldAlready = (): VaultError => new VaultError('bad_option', Phrases.PasskeyHeldAlready)

export const noPasskeyToRevoke = (): VaultError => new VaultError('absent_wayin', Phrases.NoPasskeyToRevoke)

/** The 'stale_write' of a gate change proved against a record that moved meanwhile, its `meta` the revisions {@link movedUnderEdit} carries. */
export const gateMovedUnderChange = (meta: RefusalMeta): VaultError => new VaultError('stale_write', Phrases.GateMovedUnderChange, { meta })
// --

// == [Provings]: notKeyBytes, wayinNotMadeYet, wayinMadeAlready, provingOfOtherVault, leaseOfOtherVault, proofClosureThrew, keyDeriverThrew, wrongPassphrase, wrongPasskey, noPasskeyWayin, otherPasskey, otherPrfSalt, unknownKeyDeriver

export const notKeyBytes = (): VaultError => new VaultError('bad_option', Phrases.notKeyBytes(PassphraseKeyBytes))

export const wayinNotMadeYet = (): VaultError => new VaultError('unexpected_error', Phrases.WayinNotMadeYet)

export const wayinMadeAlready = (): VaultError => new VaultError('unexpected_error', Phrases.WayinMadeAlready)

export const provingOfOtherVault = (): VaultError => new VaultError('bad_option', Phrases.ProvingOfOtherVault)

export const leaseOfOtherVault = (): VaultError => new VaultError('bad_option', Phrases.LeaseOfOtherVault)

export const proofClosureThrew = (): VaultError => new VaultError('unexpected_error', Phrases.ProofClosureThrew)

export const keyDeriverThrew = (): VaultError => new VaultError('unexpected_error', Phrases.KeyDeriverThrew)

export const wrongPassphrase = (): VaultError => new VaultError('wrong_passphrase', Phrases.WrongPassphrase)

export const wrongPasskey = (): VaultError => new VaultError('wrong_passkey', Phrases.WrongPasskey)

export const noPasskeyWayin = (): VaultError => new VaultError('wrong_passkey', Phrases.NoPasskeyWayin)

export const otherPasskey = (): VaultError => new VaultError('wrong_passkey', Phrases.OtherPasskey)

export const otherPrfSalt = (): VaultError => new VaultError('wrong_passkey', Phrases.OtherPrfSalt)

export const unknownKeyDeriver = (): VaultError => new VaultError('unknown_key_deriver', Phrases.UnknownKeyDeriver)
// --

// == [Gatings]: noRequestCleartext, requestCleartextThrew, gatingDeclined, gatingSettled, strengthCheckerThrew, notAVerdict, weakPassphrase, samePassphrase

export const noRequestCleartext = (): VaultError => new VaultError('bad_option', Phrases.NoRequestCleartext)

export const requestCleartextThrew = (): VaultError => new VaultError('unexpected_error', Phrases.RequestCleartextThrew)

export const gatingDeclined = (): VaultError => new VaultError('vault_locked', Phrases.GatingDeclined)

export const gatingSettled = (): VaultError => new VaultError('gating_landed', Phrases.GatingSettled)

export const strengthCheckerThrew = (): VaultError => new VaultError('unexpected_error', Phrases.StrengthCheckerThrew)

export const notAVerdict = (): VaultError => new VaultError('bad_option', Phrases.NotAVerdict)

/** The 'weak_passphrase' refusal, its message the strength checker's `reason`. */
export const weakPassphrase = (reason: string): VaultError => new VaultError('weak_passphrase', reason)

export const samePassphrase = (): VaultError => new VaultError('same_passphrase', Phrases.SamePassphrase)
// --

// == [Banks]: insecureContext

export const insecureContext = (): VaultError => new VaultError('insecure_context', Phrases.InsecureContext)
// --
