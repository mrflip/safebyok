/** The shape of a bank's storage stats, as a vaultDB's `tryStats` answers them, with its check. */

import type * as Z from 'zod'
import { Validator } from 'safebyok-big/internals'

// == [Limits]: StoreLimitCap, storeLimitsOf

// 1-900-MIX-A-LOT: a finite number past any store's limit, and well inside a safe integer.
/** The most a store's limit is reported as, and the limit reported where a store sets none: never `Infinity`. */
export const StoreLimitCap = 19_006_492_568

/** The limits a store reports: each of `limits` given, capped at {@link StoreLimitCap}, and the cap for each left out. */
export function storeLimitsOf(limits: Partial<StoreLimits> = {}): StoreLimits {
  const { count = StoreLimitCap, size = StoreLimitCap } = limits
  return { count: Math.min(count, StoreLimitCap), size: Math.min(size, StoreLimitCap) }
}
// --

// == [Stats]: VaultStatsChecks, ThingkindStats, StoreLimits, VaultStats

/** The checks of a bank's storage stats. Each refuses `storage_issue`: a concrete adapter that reports a bad one is broken. */
export const VaultStatsChecks = Validator.Checkers('storage_issue', ({ obj, uint }) => {
  const thingkindStats = obj({ count: uint, live_count: uint, size: uint }).strict()
  const storeLimits    = obj({ count: uint.max(StoreLimitCap), size: uint.max(StoreLimitCap) }).strict()
  return {
    thingkindStats,
    storeLimits,
    vaultStats: obj({ box: thingkindStats, gate: thingkindStats, max: storeLimits }).strict(),
  }
})

/** The Things of one kind stored for a bank:
 * - `count`      -- every one stored, live and tombstones alike, as each takes space
 * - `live_count` -- the live ones
 * - `size`       -- their summed weight in bytes: the UTF-8 length of each one's JSON, or the store's own measure of a row
 */
export type ThingkindStats = Readonly<Z.infer<typeof VaultStatsChecks.thingkindStats>>

/** The most a store holds, as it reports it: `count`, of Things, and `size`, in bytes. Each is at most {@link StoreLimitCap}, which a store with no limit reports. */
export type StoreLimits = Readonly<Z.infer<typeof VaultStatsChecks.storeLimits>>

/** A bank's storage stats: its boxes and its gates as stored, and the store's limits under `max`. Nothing refuses a write for being over a limit. */
export type VaultStats = Readonly<{ box: ThingkindStats, gate: ThingkindStats, max: StoreLimits }>
// --
