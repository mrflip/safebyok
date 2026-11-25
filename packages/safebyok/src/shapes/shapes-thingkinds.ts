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

/** The checks of the bank's Thing: its record, its citation and what is stored of it, the storage policies it may name (none), and its labelpath.
 * Also its `recordOrShell`, which a Bank begins from, its lifetok, as a write over the bank stored reads it (`storedLifetok`), its `stamp`, and `birthAsk`, the ask that writes a new bank's first Things: it leaves its three records unchecked, for `BankChecks.record`, `GateChecks.record` and `BoxChecks.record`.
 */
export const BankChecks = Object.freeze({
  record:        PerKindChecks.bankThing,
  recordOrShell: PerKindChecks.bankThingOrShell,
  cited:         PerKindChecks.bankCited,
  stored:        PerKindChecks.bankThing.refusingAs('damaged_row'),
  storedLifetok: PerKindChecks.storedLifetok,
  policies:      policiesByModelkind.bank,
  labelpath:     PerKindChecks.bankLabelpath,
  stamp:         StampChecks.bankStamp,
  birthAsk:      AskChecks.birthBankAsk,
})

/** The checks of a gate's Thing: its record, its citation and what is stored of it, the storage policies it may name, and its labelpath.
 * Also its `recordOrShell`, which a Gate begins from, its wayins, the wayins as a write under a storage policy reads them of the gate stored, its `stamp`, and its `stampedGate`.
 */
export const GateChecks = Object.freeze({
  record:        PerKindChecks.gateThing,
  recordOrShell: PerKindChecks.gateThingOrShell,
  cited:         PerKindChecks.gateCited,
  stored:        PerKindChecks.gateThing.refusingAs('damaged_row'),
  policies:      policiesByModelkind.gate,
  labelpath:     PerKindChecks.gateLabelpath,
  wayins:        PerKindChecks.wayins,
  storedWayins:  PerKindChecks.storedWayins,
  stamp:         StampChecks.gateStamp,
  stampedGate:   StampChecks.stampedGate,
})

/** The checks of a box's Thing: its record, its citation and what is stored of it, the storage policies it may name (none), and its labelpath.
 * Also its `recordOrShell`, which a Box begins from, its `live` record, its `liveOrShell` record, which a bank has of its root box, and its `stamp`.
 * And what its seal is given: its sealable, a live one for a tombstone (`liveSealable`), the public props of a revision and of a tombstone, and the cleartexts.
 */
export const BoxChecks = Object.freeze({
  record:               PerKindChecks.boxThing,
  recordOrShell:        PerKindChecks.boxThingOrShell,
  cited:                PerKindChecks.boxCited,
  stored:               PerKindChecks.boxThing.refusingAs('damaged_row'),
  policies:             policiesByModelkind.box,
  labelpath:            PerKindChecks.boxLabelpath,
  live:                 PerKindChecks.boxRecord,
  liveOrShell:          PerKindChecks.boxRecordOrShell,
  stamp:                StampChecks.boxStamp,
  sealable:             PerKindChecks.boxSealable,
  liveSealable:         PerKindChecks.boxLiveSealable,
  publicProps:          SealerChecks.boxPublicProps,
  tombstonePublicProps: SealerChecks.boxTombstonePublicProps,
  cleartexts:           SealerChecks.boxCleartexts,
})

/** The bundle of each kind of Thing, by its modelkind. */
const byModelkind = Object.freeze({ bank: BankChecks, gate: GateChecks, box: BoxChecks } as const satisfies Record<Thingkind, { record: unknown, cited: unknown, stored: unknown, policies: readonly EX.StoragePolicy[] }>)

/** The bundle for the kind of Thing at `labelpath`, which must be sound. */
function ofLabelpath(labelpath: Labelpath): typeof byModelkind[Thingkind] { return byModelkind[Labelpath.modelkindOf(labelpath)] }

/** Each kind's bundle, for a caller with a Thing of any kind: `byModelkind` gives it by modelkind, and `ofLabelpath` by labelpath. */
export const ThingkindChecks = Object.freeze({ byModelkind, ofLabelpath })
// --
