/** The lean core's test helpers, behind one door: star-import it as `TH` (`import * as TH from '../test-helpers'`).
 * Everything `safebyok-big/testing` publishes comes through it: a cheap key deriver, a strength checker that passes
 * everything, loggers, and the checks that a call refuses and quotes nothing it shouldn't. Beside them, the world of
 * the lean core's models, from `tests/test-helpers/`: fixed stamps, a fake clock, a device, a bank born unlocked, a stub
 * of `bank.put`, box antes, and the backdoors a test opens a wayin or a lease with. For tests only, and under vitest.
 */
export * from 'safebyok-big/testing'
export * from './test-helpers/models-world'
