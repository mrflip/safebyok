/** `FeedSorter`, which sorts one bank's records into events. */

import { Validator } from 'safebyok-big/internals'
import { Thing } from '../models/thing'
import * as Phrases from '../phrases'
import { type Banklabel, type Lifepath, type Userid, Labelpath, Lifeseq, Revseq } from '../shapes/primitives'
import type { BankScope } from '../shapes/shapes-stamps'
import { type ThingCited, type ThingRecord, type ThingScope, type Tombstone, ThingChecks, isLifepathDeep, isParityRight } from '../shapes/shapes-thing'
import type { Agekind, Agerank, ItemSeen, SeenThing, VaultEvent } from '../shapes/shapes-vault-event'
import { ReadTcPattern } from './thing-classifier'
import type { ReadTc } from './vault-db'

// == [FeedSorter]: FeedSorter

/** Sorts one bank's records into events, keeping how far it has seen each Thing (its {@link Agerank}) and nothing else.
 * A record gives events only when it is news: from a later life, newer than any revision seen, a whole record newer than
 * any whole one seen, or the newest revision seen again in a later span of 65.536 seconds than it was last seen in.
 * It refuses a record of another bank.
 */
export class FeedSorter implements BankScope {
  readonly userid:    Userid
  readonly banklabel: Banklabel
  /** Each Thing's agerank, by labelpath. */
  readonly #ageranks = new Map<Labelpath, Agerank>()

  /** A sorter for the bank at `scope`, with nothing seen yet. */
  constructor(scope: BankScope) {
    const { userid, banklabel } = ThingChecks.bankScope.parse(scope)
    this.userid    = userid
    this.banklabel = banklabel
    Object.freeze(this)
  }

  /** Return the events for `seen`, read at `read_tc`, frozen, and remember the agerank it raises. A record that is not news returns none.
   * The `item` event comes first, then any `life`, then any `aged`. Each carries `read_tc`.
   * For nothing stored, pass the void sentinel `Shell.of` makes: it carries its parent's life, so it outranks the records of the parent's earlier lives.
   */
  eventify(seen: SeenThing, read_tc: ReadTc): readonly VaultEvent[] {
    const cited      = SeenChecks.seenCited.parseConsistent(seen, this)
    SeenChecks.readTc.parse(read_tc)
    const itemSeen   = itemSeenOf(seen)
    const agerankWas = this.#ageranks.get(cited.labelpath)
    const agerank    = raisedOf(agerankWas, { ...cited, time: timeOf(read_tc) }, itemSeen.liveness !== 'soon')
    if (agerank === undefined) { return Object.freeze([]) }
    this.#ageranks.set(cited.labelpath, agerank)
    const shared = { userid: this.userid, banklabel: this.banklabel, labelpath: cited.labelpath, modelkind: Labelpath.modelkindOf(cited.labelpath), agerank, agerankWas, bank_lifetok: undefined, sourcelabel: undefined, read_tc }
    const events: VaultEvent[] = [Object.freeze({ eventkind: 'item', ...shared, ...itemSeen })]
    if ((agerankWas === undefined) || (partsOf(agerankWas).lifepath !== cited.lifepath)) {
      const lifekind = Lifeseq.isTombstone(Lifeseq.ofLifepath(cited.lifepath)) ? 'died' : 'born'
      events.push(Object.freeze({ eventkind: 'life', ...shared, lifekind }))
    }
    const agekind = agekindOf(agerank)
    if (agekind !== 'here') {
      events.push(Object.freeze({ eventkind: 'aged', ...shared, agekind, agekindWas: (agerankWas === undefined) ? undefined : agekindOf(agerankWas) }))
    }
    return Object.freeze(events)
  }

  /** The agerank of the Thing at `scoped`, or undefined if no record of it has been seen. */
  agerankAt(scoped: ThingScope): Agerank | undefined {
    const { labelpath } = ThingChecks.thingScope.parseConsistent(scoped, this)
    return this.#ageranks.get(labelpath)
  }
}
// --

// == [Agerank]: AgerankTimeDigits, UnseenLife, timeOf, raisedOf, timeRaisedOf, itemSeenOf, agerankOf, partsOf, agekindOf, AgerankParts

// Eight digits make a span of 65.536 seconds: a record seen again at its revision a minute or two later is news, which
// sits well with TanStack Query's five minutes before it collects a query.
/** How many leading hexadecimal digits of a `read_tc` an agerank keeps as its time: a UUID version 7's first group, its Unix time in units of 65.536 seconds. */
const AgerankTimeDigits = 8

/** An agerank, split: its lifepath, the newest revision seen in that life, the newest whole one (-1 for none), and the time the newest was last seen. */
type AgerankParts = Readonly<{ lifepath: Lifepath, highRevseq: number, itemRevseq: number, time: string }>

/** The revseqs and time of a life with no record seen: its time sorts below every time. */
const UnseenLife = Object.freeze({ highRevseq: -1, itemRevseq: -1, time: '' })

/** The time an agerank keeps of `read_tc`: its first {@link AgerankTimeDigits} digits, which compare as text */
function timeOf(read_tc: ReadTc): string { return read_tc.slice(0, AgerankTimeDigits) }

// An earlier life, a repeat, an older record and a sighting no later than the last each leave an agerank no greater than the one before.
/** The agerank once `cited` is seen at its `time`, or undefined if it is no greater than `agerankWas` */
function raisedOf(agerankWas: Agerank | undefined, cited: Pick<ThingCited, 'lifepath' | 'revseq'> & { time: string }, isWhole: boolean): Agerank | undefined {
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
// The sorter's check passed `seen` as live or a tombstone, so what is neither the void sentinel nor live is a tombstone.
/** The liveness of `seen`, with `seen` itself as its `val`: what an `item` event of it carries. */
export function itemSeenOf(seen: SeenThing): ItemSeen {
  if (Thing.isVoidSentinel(seen)) { return { liveness: 'void', val: seen } }
  if (Thing.isLive(seen)) { return Thing.isWhole(seen) ? { liveness: 'full', val: seen } : { liveness: 'soon', val: seen } }
  return { liveness: 'gone', val: seen as Tombstone<ThingRecord> }
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

// == [Checks]: SeenChecks

// A lifepath as deep as its labelpath is what lets two ageranks of one Thing compare as strings: each lifeseq and revseq
// is ten characters and the time eight, so each `/` and `|` falls at one place.
/** The checks of a record a sorter is given, and of when it was read. */
const SeenChecks = Validator.Checkers('bad_record', ({ str }) => ({
  /** Check the scope and citation of a record or a void sentinel: a lifeseq for each label, its own odd exactly for a tombstone. */
  seenCited: ThingChecks.scopedCited
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight, Phrases.LifeseqParity),
  /** Check a `read_tc`: a UUID version 7. */
  readTc:    str.regex(ReadTcPattern, Phrases.ReadTcShape),
}))
// --
