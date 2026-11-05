/**
 * safebyok's test helpers, behind one door: star-import it as `TH` in this package's tests
 * (`import * as TH from './test-helpers'`), and from `safebyok/testing` in another package's. The
 * helpers live in `tests/test-helpers/`, a part for each family, and this file names what each
 * one publishes. A cheap key deriver, shape-valid records whose ciphertext is fake, a live lease,
 * small timing, interception and tampering aids, a logger that keeps what it hears and one that says
 * only warnings and errors, and checks that a call refuses and that what it threw quotes nothing it
 * shouldn't. For tests only, and under vitest: the deriver is worthless against a brute-forcer.
 */
export { testDeriver, anyStrengthChecker, fakeCiphered, scopeOf, wayinOf, passkeyOf, tweakB64 } from './test-helpers/builders'
export type { FakeCiphered } from './test-helpers/builders'
export { wakeupAtNextTick, aWhile, eventually, changeCounter, makeLatch, beforeNextCall,
  holdNextCall, holdNextAnswer, readAfresh } from './test-helpers/timing'
export type { AsyncVerbOf } from './test-helpers/timing'
export { spyLogger, quietLogger, loggedText, thrownText, leafTexts, shownOf, jsonOf } from './test-helpers/logging'
export type { LoggedCall } from './test-helpers/logging'
export { expectRefusal, expectSyncRefusal, expectGood, expectingGood, expectBad, good, bad, omitting } from './test-helpers/refusals'
export type { ExpectingGood } from './test-helpers/refusals'
