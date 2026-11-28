/** The shape of a bank's storage stats, as a vaultDB's `tryStats` answers them, with its check. */

import type * as Z from 'zod'
import { Validator } from 'safebyok-big/internals'
import type { Labelpath } from './primitives'

// == [Limits]: DatastoreLimitCap, DatastoreLimitLeastBoxes, DatastoreLimitFloor, datastoreLimitsOf

// 1-900-MIX-A-LOT: a finite number past any datastore's limit, and well inside a safe integer.
/** The most a datastore's limit is reported as, and the limit reported where a datastore sets none: never `Infinity`. */
export const DatastoreLimitCap = 19_006_492_568

// The Coach: a store must allow two boxes and DatastoreLimitFloor bytes, or we can't help it; no store may offer less.
/** The fewest boxes a datastore may allow. */
export const DatastoreLimitLeastBoxes = 2

// notes/reference-sizes.md: a medium box 1,087 bytes, a gate with a passphrase and a passkey wayin 1,029, an empty root box 566:
// 2,682 bytes, plus half again is 4,023, rounded up to the next 1000.
/** The fewest bytes a datastore may allow: below this it cannot hold even a bank's first few Things. */
export const DatastoreLimitFloor = 5000

/** The limits a datastore reports: each of `limits` given, capped at {@link DatastoreLimitCap}, and the cap for each left out. */
export function datastoreLimitsOf(limits: Partial<DatastoreLimits> = {}): DatastoreLimits {
  const { count = DatastoreLimitCap, size = DatastoreLimitCap } = limits
  return { count: Math.min(count, DatastoreLimitCap), size: Math.min(size, DatastoreLimitCap) }
}
// --

// == [Stats]: VaultStatsChecks, ThingkindStats, DatastoreLimits, VaultStats, FiledRaw

/** The checks of a bank's storage stats. Each refuses `storage_issue`: a concrete adapter that reports a bad one is broken. */
export const VaultStatsChecks = Validator.Checkers('storage_issue', ({ obj, uint }) => {
  const thingkindStats = obj({ count: uint, live_count: uint, size: uint }).strict()
  const datastoreLimits    = obj({
    count: uint.min(DatastoreLimitLeastBoxes).max(DatastoreLimitCap),
    size:  uint.min(DatastoreLimitFloor).max(DatastoreLimitCap),
  }).strict()
  return {
    thingkindStats,
    datastoreLimits,
    vaultStats: obj({ box: thingkindStats, gate: thingkindStats, max: datastoreLimits }).strict(),
  }
})

/** The Things of one kind stored for a bank:
 * - `count`      -- every one stored, live and tombstones alike, as each takes space
 * - `live_count` -- the live ones
 * - `size`       -- their summed weight in bytes: the UTF-8 length of each one's JSON, or the datastore's own measure of a row
 */
export type ThingkindStats = Readonly<Z.infer<typeof VaultStatsChecks.thingkindStats>>

/** The most a datastore holds, as it reports it: `count`, of Things, and `size`, in bytes. `count` is at least {@link DatastoreLimitLeastBoxes} and `size` at least {@link DatastoreLimitFloor}; each is at most {@link DatastoreLimitCap}, which a datastore with no limit reports. */
export type DatastoreLimits = Readonly<Z.infer<typeof VaultStatsChecks.datastoreLimits>>

/** A bank's storage stats: its boxes and its gates as stored, and the datastore's limits under `max`. Nothing refuses a write for being over a limit. */
export type VaultStats = Readonly<{ box: ThingkindStats, gate: ThingkindStats, max: DatastoreLimits }>

/** A raw row as stored, under its labelpath. */
export type FiledRaw = Readonly<{ labelpath: Labelpath, raw: unknown }>
// --
