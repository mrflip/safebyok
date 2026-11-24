/** The sorter of a feed of one bank's records: which records raise what it has seen of each Thing, and the events each tells. */

import { Validator } from 'safebyok-big/internals'
import { Thing } from '../models/thing'
import * as Phrases from '../phrases'
import { type Banklabel, type Lifepath, type Userid, Labelpath, Lifeseq, Revseq } from '../shapes/primitives'
import type { BankScope } from '../shapes/shapes-stamps'
import { type ThingCited, type ThingScope, ThingChecks, isLifepathDeep, isParityRight } from '../shapes/shapes-thing'
import type { Agekind, Agerank, Recordkind, SeenThing, VaultEvent } from '../shapes/shapes-vault-event'

// == [FeedSorter]: FeedSorter

/** The events a feed of one bank's records tells, keeping an agerank for each Thing it has seen and nothing else.
 * A record is taken where it raises its Thing's agerank, and tells nothing otherwise: a repeat, an older revision, or a record of an earlier life.
 */
export class FeedSorter implements BankScope {
  readonly userid:    Userid
  readonly banklabel: Banklabel
  /** Each Thing's agerank, by labelpath. */
  readonly #ageranks = new Map<Labelpath, Agerank>()

  /** A sorter of the records of the bank `scope` names, which has seen none. */
  constructor(scope: BankScope) {
    const { userid, banklabel } = ThingChecks.bankScope.parse(scope)
    this.userid    = userid
    this.banklabel = banklabel
    Object.freeze(this)
  }

  /** Take `seen` where it raises its Thing's agerank, and answer the events it tells, frozen.
   * The sorter remembers the agerank `seen` leaves, so the same record given again tells nothing.
   * Give a void sentinel for nothing stored, at its parent's lifepath (`Shell.of`), so that it orders after the records of a parent's earlier life.
   * Refuses a record of another bank.
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

  /** The agerank of the Thing at `scoped`, or undefined for one this sorter has taken no record of. */
  agerankAt(scoped: ThingScope): Agerank | undefined {
    const { labelpath } = ThingChecks.thingScope.parseConsistent(scoped, this)
    return this.#ageranks.get(labelpath)
  }
}
// --

// == [Agerank]: UnseenLife, raisedOf, recordkindOf, agerankOf, partsOf, agekindOf, AgerankParts

/** The parts of an agerank: its lifepath, the highest revision known of in that life, and the highest whole one seen, -1 for none. */
type AgerankParts = Readonly<{ lifepath: Lifepath, highRevseq: number, itemRevseq: number }>

/** The revseqs of a life nothing has been seen of */
const UnseenLife = Object.freeze({ highRevseq: -1, itemRevseq: -1 })

// An earlier life, a repeat and an older record each leave an agerank no greater than the one before.
/** The agerank `cited` raises `agerankWas` to, or undefined where it raises nothing */
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

/** The agerank of these parts */
function agerankOf(lifepath: Lifepath, highRevseq: number, itemRevseq: number): Agerank {
  return [lifepath, Revseq.padded(highRevseq), Revseq.padded(itemRevseq)].join('|')
}

/** The parts of `agerank` */
function partsOf(agerank: Agerank): AgerankParts {
  const itemAt = agerank.lastIndexOf('|')
  const highAt = agerank.lastIndexOf('|', itemAt - 1)
  return { lifepath: agerank.slice(0, highAt), highRevseq: revseqOf(agerank.slice(highAt + 1, itemAt)), itemRevseq: revseqOf(agerank.slice(itemAt + 1)) }
}

/** The revseq a `Revseq.padded` spells */
function revseqOf(padded: string): number { return Number.parseInt(padded, 32) }

/** How `agerank` stands: here where its highest revision is its item's, bare where it has no item, cold otherwise */
function agekindOf(agerank: Agerank): Agekind {
  const { highRevseq, itemRevseq } = partsOf(agerank)
  if (highRevseq === itemRevseq) { return 'here' }
  return (itemRevseq === -1) ? 'bare' : 'cold'
}
// --

// == [Checks]: SeenChecks

// A lifepath as deep as its labelpath is what lets two ageranks of one Thing compare as strings: each lifeseq and revseq
// is ten characters, so each `/` and `|` falls at one place.
/** The checks of what a feed is given. */
const SeenChecks = Validator.Checkers('bad_record', () => ({
  /** The scope and citation of a record or a void sentinel. */
  seenCited: ThingChecks.scopedCited
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight, Phrases.LifeseqParity),
}))
// --
