/** A bank's storage stats, measured from its raw rows, for a concrete adapter that measures in TypeScript. */

import { CX } from 'safebyok-big/internals'
import type { Thingkind } from '../shapes/shapes-thing'
import { type DatastoreLimits, type FiledRaw, type ThingkindStats, type VaultStats, datastoreLimitsOf } from '../shapes/shapes-vault-stats'

// == [Measuring]: vaultStatsOf, kindStatsOf, rowWeightOf

// A row is measured as stored, unchecked: an incompatible row takes space too, and counts as no live Thing.
/** The stats of a bank's boxes and gates from each of its raw rows, by the kind of the table each was read from, with `limits` capped ({@link datastoreLimitsOf}). */
export function vaultStatsOf(filed: Readonly<Record<Thingkind, Iterable<FiledRaw>>>, limits: Partial<DatastoreLimits> = {}): VaultStats {
  return { box: kindStatsOf(filed.box), gate: kindStatsOf(filed.gate), max: datastoreLimitsOf(limits) }
}

/** The stats of one kind's raw rows. */
function kindStatsOf(filed: Iterable<FiledRaw>): ThingkindStats {
  const stats = { count: 0, live_count: 0, size: 0 }
  for (const { raw } of filed) {
    stats.count      += 1
    stats.live_count += (CX.isPlainBag(raw) && (raw['am'] === 'a')) ? 1 : 0
    stats.size       += rowWeightOf(raw)
  }
  return stats
}

/** The weight of a raw row in bytes: the UTF-8 length of its JSON. */
export function rowWeightOf(raw: unknown): number {
  return new TextEncoder().encode(JSON.stringify(raw)).length
}
// --
