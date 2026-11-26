/** The checks of each kind of Thing, one bundle a kind: its record's, its stamp's, and those of the asks that are its alone. */

import type { EX } from 'safebyok-big/internals'
import { Labelpath } from './primitives'
import { AskChecks } from './shapes-asks'
import { SealerChecks } from './shapes-sealers'
import { StampChecks } from './shapes-stamps'
import { type Thingkind, PerKindChecks, policiesByModelkind } from './shapes-thing'

// == [Kinds]: BankChecks, GateChecks, BoxChecks, ThingkindChecks
// A bundle makes no check of its own: each is made in shapes-thing, shapes-stamps, shapes-sealers or shapes-asks, which
// sit below this module and read their checks where they are made.

/** The checks of the bank's Thing: its record, its citation, what is stored of it and what a listing is handed of it (`listed`), the storage policies it may name (none), and its labelpath.
 * Also its `shell`, its `stamp`, and `birthAsk`, the ask that writes a new bank's first Things: it leaves its three records unchecked, for `BankChecks.record`, `GateChecks.record` and `BoxChecks.record`.
 */
export const BankChecks = Object.freeze({
  record:        PerKindChecks.bankThing,
  shell:         PerKindChecks.bankShell,
  cited:         PerKindChecks.bankCited,
  stored:        PerKindChecks.bankThing.refusingAs('incompatible_row'),
  listed:        PerKindChecks.bankThing.refusingAs('incompatible_row'),
  policies:      policiesByModelkind.bank,
  labelpath:     PerKindChecks.bankLabelpath,
  stamp:         StampChecks.bankStamp,
  birthAsk:      AskChecks.birthBankAsk,
})

/** The checks of a gate's Thing: its record, its citation, what is stored of it and what a listing is handed of it (`listed`), the storage policies it may name, and its labelpath.
 * Also its `shell`, its wayins, its `stamp`, and its `stampedGate`.
 */
export const GateChecks = Object.freeze({
  record:        PerKindChecks.gateThing,
  shell:         PerKindChecks.gateShell,
  cited:         PerKindChecks.gateCited,
  stored:        PerKindChecks.gateThing.refusingAs('incompatible_row'),
  listed:        PerKindChecks.gateThing.refusingAs('incompatible_row'),
  policies:      policiesByModelkind.gate,
  labelpath:     PerKindChecks.gateLabelpath,
  wayins:        PerKindChecks.wayins,
  stamp:         StampChecks.gateStamp,
  stampedGate:   StampChecks.stampedGate,
})

/** The checks of a box's Thing: its record, its citation, what is stored of it and what a listing is handed of it (`listed`: whole, or live and sparse), the storage policies it may name (none), and its labelpath.
 * Also its `shell`, its `live` record, its `liveOrShell` record, which a bank has of its root box, its `sparse` form, a live box without its body, and its `stamp`.
 * And what its seal is given: its sealable, a live one for a tombstone (`liveSealable`), the public props of a revision and of a tombstone, and the cleartexts.
 */
export const BoxChecks = Object.freeze({
  record:               PerKindChecks.boxThing,
  shell:                PerKindChecks.boxShell,
  cited:                PerKindChecks.boxCited,
  stored:               PerKindChecks.boxThing.refusingAs('incompatible_row'),
  listed:               PerKindChecks.boxListed.refusingAs('incompatible_row'),
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
const byModelkind = Object.freeze({ bank: BankChecks, gate: GateChecks, box: BoxChecks } as const satisfies Record<Thingkind, { record: unknown, cited: unknown, stored: unknown, listed: unknown, policies: readonly EX.StoragePolicy[] }>)

/** The bundle for the kind of Thing at `labelpath`, which must be sound. */
function ofLabelpath(labelpath: Labelpath): typeof byModelkind[Thingkind] { return byModelkind[Labelpath.modelkindOf(labelpath)] }

/** Each kind's bundle, for a caller with a Thing of any kind: `byModelkind` gives it by modelkind, and `ofLabelpath` by labelpath. */
export const ThingkindChecks = Object.freeze({ byModelkind, ofLabelpath })
// --
