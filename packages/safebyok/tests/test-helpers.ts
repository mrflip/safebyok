/** The lean core's test helpers, behind one door: star-import it as `TH` (`import * as TH from '../test-helpers'`).
 * Everything `safebyok-big/testing` publishes comes through it: a cheap key deriver, a strength checker that passes
 * everything, loggers, and the checks that a call refuses and quotes nothing it shouldn't. Beside them, the world of
 * the lean core's models, from `tests/test-helpers/`: fixed stamps, a fake clock, a device, a bank born unlocked, a spy
 * on births, a box's shell, and the cheats a test unwraps a wayin or a lease with; a plain Thing of any kind; and the vaultDB's world: a bank's
 * two roots and its boxes as Things, and the asks that get, list and write them; and the battery every vaultDB runs; and the deviceDB's lease records and its battery; and a fake Web Locks manager.
 * For tests only, and under vitest.
 */
export * from 'safebyok-big/testing'
export * from './test-helpers/models-world'
export * from './test-helpers/plain-thing'
export * from './test-helpers/vaultdb-world'
export * from './test-helpers/vaultdb-battery'
export * from './test-helpers/devicedb-world'
export * from './test-helpers/devicedb-battery'
export * from './test-helpers/web-locks'
