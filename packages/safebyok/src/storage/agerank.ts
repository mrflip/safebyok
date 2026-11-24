/** The agerank rule: how far a Thing has been seen, whether a record raises it, and the events a record that raises it returns. */

import { BaseThing } from '../models/base-thing'
import { type Lifepath, Lifeseq, Revseq } from '../shapes/primitives'
import type { ThingCited, ThingRecord, Tombstone } from '../shapes/shapes-thing'
import type { Agekind, Agerank, ItemSeen, SeenThing, VaultEvent, VaultItemEvent } from '../shapes/shapes-vault-event'
import type { ReadTc } from './vault-db'

// == [Agerank]: AgerankTimeDigits, AgerankParts, UnseenLife, timeOf, raisedOf, timeRaisedOf, itemSeenOf, eventsOf, agerankOf, partsOf, revseqOf, agekindOf

// Eight digits make a span of 65.536 seconds: a record seen again at its revision a minute or two later is news, which
// sits well with TanStack Query's five minutes before it collects a query.
/** How many leading hexadecimal digits of a `read_tc` an agerank keeps as its time: a UUID version 7's first group, its Unix time in units of 65.536 seconds. */
const AgerankTimeDigits = 8

/** An agerank, split: its lifepath, the newest revision seen in that life, the newest whole one (-1 for none), and the time the newest was last seen. */
type AgerankParts = Readonly<{ lifepath: Lifepath, highRevseq: number, itemRevseq: number, time: string }>

/** The revseqs and time of a life with no record seen: its time sorts below every time. */
const UnseenLife = Object.freeze({ highRevseq: -1, itemRevseq: -1, time: '' })

/** The time an agerank keeps of `read_tc`: its first eight hexadecimal digits, which compare as text. */
export function timeOf(read_tc: ReadTc): string { return read_tc.slice(0, AgerankTimeDigits) }

// An earlier life, a repeat, an older record and a sighting no later than the last each leave an agerank no greater than the one before.
/** The agerank once `cited` is seen at its `time`, or undefined if it is no greater than `agerankWas`.
 * Pass `isWhole` false for a sparse live record, which leaves the newest whole revision as it was.
 */
export function raisedOf(agerankWas: Agerank | undefined, cited: Pick<ThingCited, 'lifepath' | 'revseq'> & { time: string }, isWhole: boolean): Agerank | undefined {
  const { lifepath, revseq, time } = cited
  const partsWas = (agerankWas === undefined) ? undefined : partsOf(agerankWas)
  const was      = (partsWas?.lifepath === lifepath) ? partsWas : UnseenLife
  const agerank  = agerankOf({
    lifepath,
    highRevseq: Math.max(was.highRevseq, revseq),
    itemRevseq: isWhole ? Math.max(was.itemRevseq, revseq) : was.itemRevseq,
    time:       timeRaisedOf(was, revseq, time),
  })
  return ((agerankWas === undefined) || (agerank > agerankWas)) ? agerank : undefined
}

// The time belongs to the newest revision: it is when the newest revision was last seen.
/** The time an agerank keeps once a record of `revseq` is seen at `time` in the life `was` stands for: its own above the newest revision, the later of the two at it, and the one before below it */
function timeRaisedOf(was: Omit<AgerankParts, 'lifepath'>, revseq: number, time: string): string {
  if (revseq > was.highRevseq) { return time }
  if (revseq < was.highRevseq) { return was.time }
  return (time > was.time) ? time : was.time
}

// A sparse tombstone is a tombstone like any other: a dead life has one revision, and its sparse record says all of it.
// The caller's check passed `seen` as live or a tombstone, so what is neither the void sentinel nor live is a tombstone.
/** The liveness of `seen`, with `seen` itself as its `val`: what an `item` event of it carries. */
export function itemSeenOf(seen: SeenThing): ItemSeen {
  if (BaseThing.isVoidSentinel(seen)) { return { liveness: 'void', val: seen } }
  if (BaseThing.isLive(seen)) { return BaseThing.isWhole(seen) ? { liveness: 'full', val: seen } : { liveness: 'soon', val: seen } }
  return { liveness: 'gone', val: seen as Tombstone<ThingRecord> }
}

/** The events `proposed` returns once it has raised its Thing's agerank from `agerankWas` to `agerank`, each frozen, in a frozen list.
 * `proposed` comes first, with both ageranks. A `life` follows where its lifepath is not `agerankWas`'s, or there was none,
 * and an `aged` where the newest revision has not been seen whole. Each keeps the `sourcelabel`, `read_tc` and `banktok` of `proposed`.
 */
export function eventsOf<RecordT extends ThingRecord>(proposed: VaultItemEvent<RecordT>, agerankWas: Agerank | undefined, agerank: Agerank): readonly VaultEvent<RecordT>[] {
  const { userid, banklabel, labelpath, modelkind, banktok, sourcelabel, read_tc, val: { lifepath } } = proposed
  const shared = { userid, banklabel, labelpath, modelkind, agerank, agerankWas, banktok, sourcelabel, read_tc }
  const events: VaultEvent<RecordT>[] = [Object.freeze({ ...proposed, agerank, agerankWas })]
  if ((agerankWas === undefined) || (partsOf(agerankWas).lifepath !== lifepath)) {
    const lifekind = Lifeseq.isTombstone(Lifeseq.ofLifepath(lifepath)) ? 'died' : 'born'
    events.push(Object.freeze({ eventkind: 'life', ...shared, lifekind }))
  }
  const agekind = agekindOf(agerank)
  if (agekind !== 'here') {
    events.push(Object.freeze({ eventkind: 'aged', ...shared, agekind, agekindWas: (agerankWas === undefined) ? undefined : agekindOf(agerankWas) }))
  }
  return Object.freeze(events)
}

/** The agerank made of these parts */
function agerankOf({ lifepath, highRevseq, itemRevseq, time }: AgerankParts): Agerank {
  return [lifepath, Revseq.padded(highRevseq), Revseq.padded(itemRevseq), time].join('|')
}

/** The parts of `agerank` */
function partsOf(agerank: Agerank): AgerankParts {
  const timeAt = agerank.lastIndexOf('|')
  const itemAt = agerank.lastIndexOf('|', timeAt - 1)
  const highAt = agerank.lastIndexOf('|', itemAt - 1)
  return {
    lifepath:   agerank.slice(0, highAt),
    highRevseq: revseqOf(agerank.slice(highAt + 1, itemAt)),
    itemRevseq: revseqOf(agerank.slice(itemAt + 1, timeAt)),
    time:       agerank.slice(timeAt + 1),
  }
}

/** The revseq a `Revseq.padded` string stands for */
function revseqOf(padded: string): number { return Number.parseInt(padded, 32) }

/** The agekind of `agerank` */
function agekindOf(agerank: Agerank): Agekind {
  const { highRevseq, itemRevseq } = partsOf(agerank)
  if (highRevseq === itemRevseq) { return 'here' }
  return (itemRevseq === -1) ? 'bare' : 'cold'
}
// --
