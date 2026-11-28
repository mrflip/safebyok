/** The checks of each kind of Thing, one bundle a kind: its record's, its stamp's, and those of the asks that are its alone. */

import type { EX } from 'safebyok-big/internals'
import { AskChecks } from './shapes-asks'
import { SealerChecks } from './shapes-sealers'
import { StampChecks } from './shapes-stamps'
import { type Thingkind, PerKindChecks, policiesByModelkind } from './shapes-thing'

// == [Kinds]: BankChecks, GateChecks, BoxChecks, ThingkindChecks
// A bundle makes no check of its own: each is made in shapes-thing, shapes-stamps, shapes-sealers or shapes-asks, which
// sit below this module and read their checks where they are made.

/** The checks of what a bank has that is no Thing's own: its `life`, its gate's, and `birthAsk`, the ask that writes a new bank's first Things.
 * The birth ask leaves its two records unchecked, for `GateChecks.record` and `BoxChecks.record`.
 */
export const BankChecks = Object.freeze({
  life:          StampChecks.bankLife,
  birthAsk:      AskChecks.birthBankAsk,
})

/** The checks of a gate's Thing: its record, its citation, what is stored of it, the storage policies it may name, and its labelpath.
 * Also its `live` record, its `shell`, a live gate's `wayins`, its bank's `banktok`, its `life`, its `stamp`, and its `provable` form (its life and wayins).
 * The `labelpath` check takes one label alone; the record, shell and ask checks also require it to equal the banklabel.
 */
export const GateChecks = Object.freeze({
  record:        PerKindChecks.gateThing,
  live:          PerKindChecks.gateRecord,
  shell:         PerKindChecks.gateShell,
  cited:         PerKindChecks.gateCited,
  stored:        PerKindChecks.gateThing.refusingAs('incompatible_row'),
  policies:      policiesByModelkind.gate,
  labelpath:     PerKindChecks.gateLabelpath,
  wayins:        PerKindChecks.wayins,
  banktok:       PerKindChecks.banktok,
  life:          StampChecks.gateLife,
  stamp:         StampChecks.gateStamp,
  provable:      StampChecks.provableGate,
})

/** The checks of a box's Thing: its record, its citation and what is stored of it, the storage policies it may name (none), and its labelpath.
 * Also its `shell`, its `live` record, the `liveOrShell` record a bank has of its root box, its `sparse` form (a live box without its body), and its `stamp`.
 * And what its seal is given: its sealable, a live one for a tombstone (`liveSealable`), the public props of a revision and of a tombstone, and the cleartexts.
 */
export const BoxChecks = Object.freeze({
  record:               PerKindChecks.boxThing,
  shell:                PerKindChecks.boxShell,
  cited:                PerKindChecks.boxCited,
  stored:               PerKindChecks.boxThing.refusingAs('incompatible_row'),
  policies:             policiesByModelkind.box,
  labelpath:            PerKindChecks.boxLabelpath,
  live:                 PerKindChecks.boxRecord,
  liveOrShell:          PerKindChecks.boxRecordOrShell,
  sparse:               PerKindChecks.boxSparse,
  stamp:                StampChecks.boxStamp,
  sealable:             PerKindChecks.boxSealable,
  liveSealable:         PerKindChecks.boxLiveSealable,
  publicProps:          SealerChecks.boxPublicProps,
  tombstonePublicProps: SealerChecks.boxTombstonePublicProps,
  cleartexts:           SealerChecks.boxCleartexts,
})

/** The bundle of each kind of Thing, by its modelkind. */
const byModelkind = Object.freeze({ gate: GateChecks, box: BoxChecks } as const satisfies Record<Thingkind, { record: unknown, cited: unknown, stored: unknown, policies: readonly EX.StoragePolicy[] }>)

/** Each kind's bundle, for a caller with a Thing of any kind: `byModelkind` gives it by its stated modelkind. */
export const ThingkindChecks = Object.freeze({ byModelkind })
// --
