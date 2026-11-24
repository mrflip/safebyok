/** `FeedSorter`, which sorts one bank's records into events. */

import { Validator } from 'safebyok-big/internals'
import { Thing } from '../models/thing'
import * as Phrases from '../phrases'
import { type Banklabel, type Lifepath, type Userid, Labelpath, Lifeseq, Revseq } from '../shapes/primitives'
import type { BankScope } from '../shapes/shapes-stamps'
import { type ThingCited, type ThingScope, ThingChecks, isLifepathDeep, isParityRight } from '../shapes/shapes-thing'
import type { Agekind, Agerank, Recordkind, SeenThing, VaultEvent } from '../shapes/shapes-vault-event'

// == [FeedSorter]: FeedSorter

/** Sorts one bank's records into events, keeping how far it has seen each Thing (its {@link Agerank}) and nothing else.
 * A record gives events only when it is news: from a later life, newer than any revision seen, or a whole record newer than any whole one seen.
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

  /** Return the events for `seen`, frozen, and remember the agerank it raises. A record that is not news returns none.
   * The `item` event comes first, then any `life`, then any `aged`.
   * For nothing stored, pass the void sentinel `Shell.of` makes: it carries its parent's life, so it outranks the records of the parent's earlier lives.
   */
  eventify(seen: SeenThing): readonly VaultEvent[] {
    const cited      = SeenChecks.seenCited.parseConsistent(seen, this)
    const recordkind = recordkindOf(seen)
    const agerankWas = this.#ageranks.get(cited.labelpath)
    const agerank    = raisedOf(agerankWas, cited, recordkind !== 'soon')
    if (agerank === undefined) { return Object.freeze([]) }
    this.#ageranks.set(cited.labelpath, agerank)
    const told = { userid: this.userid, banklabel: this.banklabel, labelpath: cited.labelpath, modelkind: Labelpath.modelkindOf(cited.labelpath), agerank, agerankWas }
    const record = (recordkind === 'void') ? null : seen
    const events: VaultEvent[] = [Object.freeze({ eventkind: 'item', ...told, recordkind, record })]
    if ((agerankWas === undefined) || (partsOf(agerankWas).lifepath !== cited.lifepath)) {
      const lifekind = Lifeseq.isTombstone(Lifeseq.ofLifepath(cited.lifepath)) ? 'died' : 'born'
      events.push(Object.freeze({ eventkind: 'life', ...told, lifekind }))
    }
    const agekind = agekindOf(agerank)
    if (agekind !== 'here') {
      events.push(Object.freeze({ eventkind: 'aged', ...told, agekind, agekindWas: (agerankWas === undefined) ? undefined : agekindOf(agerankWas) }))
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

// == [Agerank]: UnseenLife, raisedOf, recordkindOf, agerankOf, partsOf, agekindOf, AgerankParts

/** An agerank, split: its lifepath, the newest revision seen in that life, and the newest whole one (-1 for none). */
type AgerankParts = Readonly<{ lifepath: Lifepath, highRevseq: number, itemRevseq: number }>

/** The revseqs of a life with no record seen */
const UnseenLife = Object.freeze({ highRevseq: -1, itemRevseq: -1 })

// An earlier life, a repeat and an older record each leave an agerank no greater than the one before.
/** The agerank once `cited` is seen, or undefined if it is no greater than `agerankWas` */
function raisedOf(agerankWas: Agerank | undefined, cited: Pick<ThingCited, 'lifepath' | 'revseq'>, isWhole: boolean): Agerank | undefined {
  const { lifepath, revseq } = cited
  const partsWas = (agerankWas === undefined) ? undefined : partsOf(agerankWas)
  const { highRevseq, itemRevseq } = (partsWas?.lifepath === lifepath) ? partsWas : UnseenLife
  const agerank = agerankOf(lifepath, Math.max(highRevseq, revseq), isWhole ? Math.max(itemRevseq, revseq) : itemRevseq)
  return ((agerankWas === undefined) || (agerank > agerankWas)) ? agerank : undefined
}

// A sparse tombstone is a tombstone like any other: a dead life has one revision, and its sparse record says all of it.
/** The recordkind of `seen` */
function recordkindOf(seen: SeenThing): Recordkind {
  if (Thing.isVoidSentinel(seen)) { return 'void' }
  if (Thing.isTombstone(seen)) { return 'gone' }
  return Thing.isWhole(seen) ? 'full' : 'soon'
}

/** The agerank made of these parts */
function agerankOf(lifepath: Lifepath, highRevseq: number, itemRevseq: number): Agerank {
  return [lifepath, Revseq.padded(highRevseq), Revseq.padded(itemRevseq)].join('|')
}

/** The parts of `agerank` */
function partsOf(agerank: Agerank): AgerankParts {
  const itemAt = agerank.lastIndexOf('|')
  const highAt = agerank.lastIndexOf('|', itemAt - 1)
  return { lifepath: agerank.slice(0, highAt), highRevseq: revseqOf(agerank.slice(highAt + 1, itemAt)), itemRevseq: revseqOf(agerank.slice(itemAt + 1)) }
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
// is ten characters, so each `/` and `|` falls at one place.
/** The checks of a record a sorter is given. */
const SeenChecks = Validator.Checkers('bad_record', () => ({
  /** Check the scope and citation of a record or a void sentinel: a lifeseq for each label, its own odd exactly for a tombstone. */
  seenCited: ThingChecks.scopedCited
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight, Phrases.LifeseqParity),
}))
// --
