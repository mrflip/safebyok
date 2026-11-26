/** A bank's storage stats, measured from its raw rows, for a concrete adapter that measures in TypeScript. */

import { CX } from 'safebyok-big/internals'
import { Labelpath } from '../shapes/primitives'
import { type FiledRaw, type StoreLimits, type VaultStats, storeLimitsOf } from '../shapes/shapes-vault-stats'

// == [Measuring]: vaultStatsOf, rowWeightOf

// A row is measured as stored, unchecked: an incompatible row takes space too, and counts as no live Thing.
/** The stats of a bank's boxes and gates from each of its raw rows, with `limits` capped ({@link storeLimitsOf}). The bank's own row is not counted. */
export function vaultStatsOf(filed: Iterable<FiledRaw>, limits: Partial<StoreLimits> = {}): VaultStats {
  const box  = { count: 0, live_count: 0, size: 0 }
  const gate = { count: 0, live_count: 0, size: 0 }
  for (const { labelpath, raw } of filed) {
    const modelkind = Labelpath.modelkindOf(labelpath)
    if (modelkind === 'bank') { continue }
    const stats = (modelkind === 'box') ? box : gate
    stats.count      += 1
    stats.live_count += (CX.isPlainBag(raw) && (raw['am'] === 'a')) ? 1 : 0
    stats.size       += rowWeightOf(raw)
  }
  return { box, gate, max: storeLimitsOf(limits) }
}

/** The weight of a raw row in bytes: the UTF-8 length of its JSON. */
export function rowWeightOf(raw: unknown): number {
  return new TextEncoder().encode(JSON.stringify(raw)).length
}
// --
