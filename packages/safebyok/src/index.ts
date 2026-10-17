/**
 * safebyok's public surface: an end-to-end encrypted vault for API keys and other small secrets.
 * Whispers are encrypted on the user's device under keys that never leave it; the storage layer
 * holds ciphertext only. The IndexedDB device store lives in its own entry point, `safebyok/idb`,
 * the browser's defaults for openVault's options in another, `safebyok/browser` (among them
 * `zxcvbnPassphraseTest`, the passphrase strength test), the checks for
 * names, with their bounds, in `safebyok/validators` as well as here, and the IndexedDB
 * vault store in a package of its own, `safebyok-indexeddb`.
 */
export { Argon2idWebV1, ensureSaltFits, parseKeyDeriverSpec } from './key-deriver-spec'
export type { KeyDeriverSpec } from './key-deriver-spec'
export { argon2idDeriver, argon2idWebV1Deriver } from './key-deriver'
export type { Argon2idKeyDeriver, CustomKeyDeriver, KeyDeriver } from './key-deriver'
export { eraseDamagedVault, openVault } from './vault'
export type { PassphraseStrengthTest, PassphraseVerdict } from './passphrase-strength'
export type { EraseDamagedVaultOpts, OpenVaultOpts, Vault, VaultSnapshot, VaultState } from './vault'
export { DefaultLogger, parseLogger, setDefaultLogger } from './logger'
export type { VaultLogger } from './logger'
export { Lockbox } from './lockbox'
export { EpochMillis, FarFuture, FarPast, ForcePassphraseReentryHours, ForeverMillis, LockboxSummary, MaxLockboxes, MaxReentryHours, MaxUnlocks, MaxWhisperBytes, MinuteMillis, PasskeyEnvelope, PasskeySaltBytes, PassphraseEnvelope, PublicBag, UnlockEnvelope, UnlockMethodVals, VaultBundle, VaultScope, Whisper, wallClock } from './types'
export { AnyTextValidators, DefaultValidators, Label, LabelPattern, MaxLabelChars, MaxUserIdChars, NameFloor, NameFloorBytes, UserId, UserIdPattern } from './validators'
export type { NameValidator, VaultValidators } from './validators'
export { checkValidators } from './names'
export { checkStrengthTest } from './passphrase-strength'
export type { Clock, DamagedLockbox, DeviceMark, DeviceUnlock, PasskeyProof, SeenVault, UnlockMethod, UnlockSummary, WhisperJson } from './types'
export { Ciphered } from './crypto'
export { VaultError, VaultErrorFamilyForKind, VaultErrorFamilyVals, VaultErrorKindVals, isVaultCondition, isVaultError } from './errors'
export type { VaultErrorFamily, VaultErrorKind } from './errors'
export { VaultDB, localVaultDB } from './vault-db'
export type { BundleExpectation, EraseExpectation, LocalVaultDBOpts, LockboxExpectation, StoredLockbox, VaultDBInit, VaultDBOpts, WatchTrouble } from './vault-db'
export * as Ckeys from './ckeys'
export * as Expectations from './expectations'
export * as Refusals from './refusals'
export * as Sanitizer from './sanitizer'
export { memoryDeviceDB } from './device-db'
export type { DeviceDB, UnlockExpectation } from './device-db'
export { domStore, memoryStore } from './string-store'
export type { StringStore } from './string-store'
export { stableJsonify } from './stable-jsonify'
