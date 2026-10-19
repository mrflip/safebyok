/**
 * safebyok's public surface: an end-to-end encrypted vault for API keys and other small secrets.
 * Whispers are encrypted on the user's device under keys that never leave it; the storage layer
 * holds ciphertext only. The IndexedDB device store lives in its own entry point, `safebyok/idb`,
 * the browser's defaults for Vault.make's options in another, `safebyok/browser` (among them
 * `zxcvbnPassphraseTest`, the passphrase strength test), the checks for
 * names, with their bounds, in `safebyok/validators` as well as here, and the IndexedDB
 * vault store in a package of its own, `safebyok-indexeddb`.
 */
export { Argon2idWebV1, ensureSaltFits, parseKeyDeriverSpec } from './key-deriver-spec'
export type { KeyDeriverSpec } from './key-deriver-spec'
export { argon2idDeriver, argon2idWebV1Deriver } from './key-deriver'
export type { Argon2idKeyDeriver, CustomKeyDeriver, KeyDeriver } from './key-deriver'
export { Vault } from './vault'
export { retireDamagedVault } from './retire-damaged-vault'
export type { PassphraseStrengthTest, PassphraseVerdict } from './passphrase-strength'
export type { VaultSnapshot, VaultState } from './vault'
export type { MakeVaultOpts } from './vault-opts'
export type { RetireDamagedVaultOpts } from './retire-damaged-vault'
export { DefaultLogger, parseLogger, setDefaultLogger } from './logger'
export type { VaultLogger } from './logger'
export { Lockbox } from './lockbox'
export { EpochMillis, FarFuture, FarPast, ForeverMillis, LeaseHours, LockboxSummary, MaxLeaseHours, MaxLockboxes, MaxUnlocks, MaxWhisperBytes, MinuteMillis, PasskeySaltBytes, PasskeyWayin, PassphraseWayin, Sidecar, VaultProps, VaultScope, Wayin, WayinKindVals, Whisper, wallClock } from './types'
export { AnyTextValidators, DefaultValidators, Label, LabelPattern, MaxLabelChars, MaxUserIdChars, NameFloor, NameFloorBytes, UserId, UserIdPattern } from './validators'
export type { NameValidator, VaultValidators } from './validators'
export { checkValidators } from './names'
export { checkStrengthTest } from './passphrase-strength'
export type { Clock, DamagedLockbox, DeviceMark, Lease, PasskeyProof, SeenVault, WayinKind, WayinSummary, WhisperJson } from './types'
export { Ciphered } from './crypto'
export { VaultError, VaultErrorFamilyForKind, VaultErrorFamilyVals, VaultErrorKindVals, isVaultCondition, isVaultError } from './errors'
export type { VaultErrorFamily, VaultErrorKind } from './errors'
export { VaultDB, localVaultDB } from './vault-db'
export type { LocalVaultDBOpts, LockboxExpectation, LockboxRetireExpectation, LockboxRetirement, RetireExpectation, StoredLockbox, VaultDBOpts, VaultPropsExpectation, WatchTrouble } from './vault-db'
export * as Ckeys from './ckeys'
export * as Expectations from './expectations'
export * as Refusals from './refusals'
export * as Sanitizer from './sanitizer'
export { memoryDeviceDB } from './device-db'
export type { DeviceDB, LeaseExpectation } from './device-db'
export { domStore, memoryStore } from './string-store'
export type { StringStore } from './string-store'
export { stableJsonify } from './stable-jsonify'
