/** safebyok's test helpers, behind one door: star-import it as `TH` in this package's tests
 * (`import * as TH from './test-helpers'`), and from `safebyok/testing` in another package's. The
 * helpers live in `tests/test-helpers/`, a part for each family, and this file names what each
 * one publishes. A cheap key deriver, shape-valid records whose ciphertext is fake, a live lease,
 * the package's clock to set by hand, small timing, interception and tampering aids, a logger that keeps what it hears and one that says
 * only warnings and errors, and checks that a call refuses and that what it threw quotes nothing it
 * shouldn't, and a world of banks over one in-memory vaultDB, each device with its own deviceDB, where a dialog types the passphrase a test sets. The battery every VaultDB runs, and the scopes and rows it is built from, and the battery every DeviceDB runs. For tests only, and under vitest: the deriver is worthless against a brute-forcer.
 */
export { _cheat_clock, _cheat_clockReset } from '../src/helpers/clock'
export { _cheat_forgetShelf } from '../src/storage/idb-shelf'
export { testDeriver, anyStrengthChecker, fakeCiphered, scopeOf, wayinOf, passkeyOf, tweakB64 } from './test-helpers/builders'
export type { FakeCiphered } from './test-helpers/builders'
export { wakeupAtNextTick, aWhile, eventually, changeCounter, makeLatch, beforeNextCall,
  pendingNextCall, pendingNextAnswer, readAfresh } from './test-helpers/timing'
export type { AsyncVerbOf } from './test-helpers/timing'
export { spyLogger, quietLogger, loggedText, thrownText, leafTexts, shownOf, jsonOf } from './test-helpers/logging'
export type { LoggedCall } from './test-helpers/logging'
export { expectRefusal, expectSyncRefusal, expectGood, expectingGood, expectBad, good, bad, omitting } from './test-helpers/refusals'
export type { ExpectingGood } from './test-helpers/refusals'
export { describeVaultDBBattery } from './test-helpers/vault-db-battery'
export type { VaultDBBatteryOpts, VaultDBRowCheats } from './test-helpers/vault-db-battery'
export { describeBankDBBattery } from './test-helpers/bank-db-battery'
export type { BankDBBatteryOpts, BankDBRowCheats } from './test-helpers/bank-db-battery'
// The scopes, records and asks the bankDB battery is built from, as one namespace: many share a name with the vaultDB's.
export * as BW from './test-helpers/bankdb-world'
export { describeDeviceDBBattery } from './test-helpers/device-db-battery'
export type { DeviceDBBatteryOpts, DeviceDBRowCheats } from './test-helpers/device-db-battery'
export { bankScope, vaultScope, boxscope, vaultQuery, boxQuery, vaultListAsk, boxListAsk, boxTidyAsk, vaultScopeOf, boxscopeOf, passphraseWayin, passkeyWayin, vaultAt, boxAt, vaultTombstoneOf, boxTombstoneOf, gateMoveOf,
  FlawedVaultRows, FlawedBoxRows, vaultGetAskOf, boxGetAskOf, vaultPutAskOf, boxPutAskOf, vaultDelAskOf, boxDelAskOf } from './test-helpers/storage-world'
export type { FlawRefusal, FlawedRow } from './test-helpers/storage-world'
export { makeBankWorld, makeBankWithVault, useBankWorlds, VaultScopeGiven } from './test-helpers/bank-world'
export type { BankWorld } from './test-helpers/bank-world'
export { Passphrase, byPassphrase } from './test-helpers/vault-world'
