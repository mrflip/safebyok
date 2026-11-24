/** The agerank rule: how far a Thing has been seen, whether a record seen is news, and the events a record that is news returns. */

import { BaseThing } from '../models/base-thing'
import { type Lifepath, Lifeseq, Revseq } from '../shapes/primitives'
import type { ThingCited, ThingRecord, Tombstone } from '../shapes/shapes-thing'
import type { Agekind, Agerank, ItemSeen, SeenThing, VaultEvent, VaultItemEvent } from '../shapes/shapes-vault-event'
import type { ReadTc } from './vault-db'

// == [Agerank]: TcchunkDigits, NoRevseq, UnseenAgerank, AgerankFields, UnseenLife, tcchunkOf, nextAgerankOf, tcchunkAfter, laterOf, itemSeenOf, eventsOf, agekindOf, fieldsOf, isOfLife

// Eight digits make a span of 65.536 seconds: a record seen again at its revision a minute or two later is news, which
// sits well with TanStack Query's five minutes before it collects a query.
/** How many leading hexadecimal digits of a `read_tc` make its tcchunk: a UUID version 7's first group, its Unix time in units of 65.536 seconds. */
const TcchunkDigits = 8

/** The revseq an agerank spells where no revision has been seen, which sorts below every other. */
const NoRevseq = Revseq.padded(-1)

/** The agerank of a Thing before its first record: the empty string, which sorts below every agerank. */
export const UnseenAgerank: Agerank = ''

/** An agerank's four fields, as it spells them: its lifepath, the newest revseq seen in that life, the newest whole one, and the tcchunk the newest was last read in. */
type AgerankFields = readonly [lifepath: Lifepath, highRevseq: string, itemRevseq: string, tcchunk: string]

/** The fields of a life with no record seen: each sorts below any it could be compared with. */
const UnseenLife: AgerankFields = Object.freeze(['', NoRevseq, NoRevseq, ''] as const)

/** The tcchunk of `read_tc`: its first eight hexadecimal digits, which compare as text. */
export function tcchunkOf(read_tc: ReadTc): string { return read_tc.slice(0, TcchunkDigits) }

// An earlier life, a repeat, an older record and a sighting in no later tcchunk than the last each leave an agerank no greater than the one before.
/** The agerank once `seen` is read at `read_tc`, or undefined where that is no greater than `agerankWas`: the record is not news.
 * Pass `isWhole` false for a sparse live record, which leaves the newest whole revision as it was.
 */
export function nextAgerankOf(agerankWas: Agerank, seen: Pick<ThingCited, 'lifepath' | 'revseq'>, read_tc: ReadTc, isWhole: boolean): Agerank | undefined {
  const revseq    = Revseq.padded(seen.revseq)
  const fieldsWas = isOfLife(agerankWas, seen.lifepath) ? fieldsOf(agerankWas) : UnseenLife
  const [, highWas, itemWas] = fieldsWas
  const agerank   = [
    seen.lifepath,
    laterOf(highWas, revseq),
    isWhole ? laterOf(itemWas, revseq) : itemWas,
    tcchunkAfter(fieldsWas, revseq, tcchunkOf(read_tc)),
  ].join('|')
  return (agerank > agerankWas) ? agerank : undefined
}

// The tcchunk belongs to the newest revision: it is when the newest revision was last read.
/** The tcchunk an agerank of `fieldsWas` gives once `revseq` is read in `tcchunk`: its own above the newest revision, the later of the two at it, and the one before below it */
function tcchunkAfter([, highWas, , tcchunkWas]: AgerankFields, revseq: string, tcchunk: string): string {
  if (revseq > highWas) { return tcchunk }
  if (revseq < highWas) { return tcchunkWas }
  return laterOf(tcchunkWas, tcchunk)
}

/** The greater of two agerank fields, which compare as text */
function laterOf(ante: string, post: string): string { return (post > ante) ? post : ante }

// A sparse tombstone is a tombstone like any other: a dead life has one revision, and its sparse record says all of it.
// The caller's check passed `seen` as live or a tombstone, so what is neither the void sentinel nor live is a tombstone.
/** The liveness of `seen`, with `seen` itself as its `val`: what an `item` event of it carries. */
export function itemSeenOf(seen: SeenThing): ItemSeen {
  if (BaseThing.isVoidSentinel(seen)) { return { liveness: 'void', val: seen } }
  if (BaseThing.isLive(seen)) { return BaseThing.isWhole(seen) ? { liveness: 'full', val: seen } : { liveness: 'soon', val: seen } }
  return { liveness: 'gone', val: seen as Tombstone<ThingRecord> }
}

/** The events of `proposed`, a record that moved its Thing's agerank from `agerankWas` up to `agerank`, each frozen, in a frozen list.
 * `proposed` comes first, with both ageranks. A `life` follows where its lifepath is not `agerankWas`'s, and an `aged` where the newest revision has not been seen whole.
 * Each keeps the `sourcelabel`, `read_tc` and `banktok` of `proposed`. After {@link UnseenAgerank}, each gives `agerankWas`, and an `aged` its `agekindWas`, as undefined.
 */
export function eventsOf<RecordT extends ThingRecord>(proposed: VaultItemEvent<RecordT>, agerankWas: Agerank, agerank: Agerank): readonly VaultEvent<RecordT>[] {
  const { userid, banklabel, labelpath, modelkind, banktok, sourcelabel, read_tc, val: { lifepath } } = proposed
  const isFirst = (agerankWas === UnseenAgerank)
  const shared  = { userid, banklabel, labelpath, modelkind, agerank, agerankWas: isFirst ? undefined : agerankWas, banktok, sourcelabel, read_tc }
  const events: VaultEvent<RecordT>[] = [Object.freeze({ ...proposed, agerank, agerankWas: shared.agerankWas })]
  if (! isOfLife(agerankWas, lifepath)) {
    const lifekind = Lifeseq.isTombstone(Lifeseq.ofLifepath(lifepath)) ? 'died' : 'born'
    events.push(Object.freeze({ eventkind: 'life', ...shared, lifekind }))
  }
  const agekind = agekindOf(agerank)
  if (agekind !== 'here') {
    events.push(Object.freeze({ eventkind: 'aged', ...shared, agekind, agekindWas: isFirst ? undefined : agekindOf(agerankWas) }))
  }
  return Object.freeze(events)
}

/** The agekind of `agerank`: `'here'` where its newest revision has been seen whole, `'cold'` where only an older one of its life has, `'bare'` where none of its life has. */
export function agekindOf(agerank: Agerank): Agekind {
  const [, highRevseq, itemRevseq] = fieldsOf(agerank)
  if (highRevseq === itemRevseq) { return 'here' }
  return (itemRevseq === NoRevseq) ? 'bare' : 'cold'
}

// Every agerank but UnseenAgerank is made by nextAgerankOf, of a checked lifepath, two padded revseqs and the tcchunk of
// a checked read_tc: none of the four has a `|`.
/** The four fields of `agerank` */
function fieldsOf(agerank: Agerank): AgerankFields { return agerank.split('|') as unknown as AgerankFields }

/** True when `agerank` is of the life `lifepath`: never for {@link UnseenAgerank} */
function isOfLife(agerank: Agerank, lifepath: Lifepath): boolean { return agerank.startsWith(`${lifepath}|`) }
// --
