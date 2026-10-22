/**
 * safebyok's test helpers, behind one door: star-import it as `TH` in this package's tests
 * (`import * as TH from './test-helpers'`), and from `safebyok/testing` in another package's. The
 * helpers live in `tests/test-helpers/`, a part for each family, and this file names what each
 * one publishes. A cheap key deriver, a vault's options over stores in memory, shape-valid records
 * whose ciphertext is fake, a live lease, small timing, interception and tampering aids, a
 * logger that keeps what it hears, checks that a call refuses and that what it threw quotes
 * nothing it shouldn't, and the suites every VaultDB and DeviceDB adapter owes (the VaultDB suite
 * runnable over an adapter made per signed-in user). For tests only, and under vitest: the
 * deriver is worthless against a brute-forcer.
 */
export { testDeriver, vaultSliceOf, SliceNow, anyStrengthChecker, memoryVaultOpts, settledVault, freshDbName, fakeCiphered, scopeOf,
  wayinOf, passkeyWayinOf, passkeyOf, vaultPropsOf, gatelessOf, ensureGated, propsOf, boxesOf, boxOf, OddLabels,
  summaryOf, noBoxYet, thisVault, deleting, markOf, leaseOf, tweakB64 } from './test-helpers/builders'
export type { MarkOverrides, VaultSlice } from './test-helpers/builders'
export { wakeupAtNextTick, aWhile, eventually, changeCounter, liveWatch, makeGate, beforeNextCall,
  holdNextCall, holdNextAnswer, readAfresh, tallyWatches } from './test-helpers/timing'
export type { AsyncVerbOf } from './test-helpers/timing'
export { throughTurnstile, raceEveryWay } from './test-helpers/racing'
export type { Turnstile, RaceOutcome, MakeDevices, Race } from './test-helpers/racing'
export { spyLogger, loggedText, thrownText, leafTexts, shownOf, jsonOf } from './test-helpers/logging'
export type { LoggedCall } from './test-helpers/logging'
export { VaultDBContract, describeVaultDB, vaultDBTimingChecks, expectRoundTripsThroughTurnstile, perUser } from './test-helpers/vault-db-conformance'
export type { VaultDBContractLine, VaultDBVerbs, MakeVaultDB, DescribeVaultDBOpts, VaultDBDeviceOpts,
  MakeVaultDBDevices, VaultDBTimingCheck } from './test-helpers/vault-db-conformance'
export { describeDeviceDB } from './test-helpers/device-db-conformance'
export { expectRefusal, expectSyncRefusal, expectGood, expectingGood, expectBad, good, bad, omitting } from './test-helpers/refusals'
export type { ExpectingGood } from './test-helpers/refusals'
