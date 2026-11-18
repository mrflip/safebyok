/** `ThingCar`, what a ThingMinder caches for one scope, and how two cars of one Thing merge. */

import { Validator } from 'safebyok-big/internals'
import type { TombstoneOf } from '../models/sealers'
import * as Phrases from '../phrases'
import {
  type BoxThing, type GateThing, type Sparse, type Thing, type ThingRecord, type ThingScope, type VoidSentinel,
  isVoidSentinel, kindChecksOf, thingCited, thingScope,
} from '../storage/shapes-thing'

// == [The car]: Tombstone, ThingCar, BoxCar, GateCar, DeliverableThing, carLivenessVals

/** A tombstone of a RecordT, sparse or whole. */
export type Tombstone<RecordT extends ThingRecord> = TombstoneOf<RecordT> | (Sparse<RecordT> & Readonly<{ am: 'x' }>)

// The vaultDB holds a newer whole record when liveness is 'behind' or 'bare' (dbHasNewer).
/** A ThingMinder's frozen cache value for a thing: among records we've seen, carries its newest (perhaps sparse), and its fullest (perhaps null, or undefined for "exists, but nothing useful cached").
 * - `newest` is always a record: full, sparse, the void sentinel when void, or a tombstone when gone.
 * - `fullest` is null when gone or void, and undefined when bare. It stands for the *record* `fullest ?? newest`.
 * - Both records have identical scope and lifepath. (This implies a car with a newer lifepath should always replace the other.)
 * - On `full`, the two are *identical* (`newest === fullest`): the same object not just the same content.
 * - When `behind`, `fullest` is of a strictly earlier revision: `newest.revseq > fullest.revseq`.
 */
export type ThingCar<RecordT extends ThingRecord> = Readonly<
  | { liveness: 'full',   newest: RecordT,            fullest: RecordT   } // the same record in both. dbHasNewer: false
  | { liveness: 'behind', newest: Sparse<RecordT>,    fullest: RecordT   } // fullest is strictly older. Newest is strictly Sparse (not full, not gone, not void). dbHasNewer: true
  | { liveness: 'bare',   newest: Sparse<RecordT>,    fullest: undefined } // never fetched a whole record; newest is strictly sparse. dbHasNewer: true
  | { liveness: 'gone',   newest: Tombstone<RecordT>, fullest: null      } // a tombstone: known to be gone. dbHasNewer: false
  | { liveness: 'void',   newest: VoidSentinel,       fullest: null      } // a shell:     known to be void. dbHasNewer: false
>

/** The car of a box. */
export type BoxCar  = ThingCar<BoxThing>
/** The car of a gate. */
export type GateCar = ThingCar<GateThing>

/** A record a car is made from: a Thing, whole or sparse, or the void sentinel. */
export type DeliverableThing = Thing | Sparse<Thing> | VoidSentinel

/** Each `liveness` a car may have. */
export const carLivenessVals = ['full', 'behind', 'bare', 'gone', 'void'] as const
// --

// == [Making cars]: carOf, mergedCarOf, carOfPair, carOfParts, sharedCarOf, newerWholeOf

/** The merge of two cars of one Thing: see {@link mergedCarOf}. On a tie, `prior`'s record is kept.
 * 1. For different lives, return the newer (records in a car share a lifepath; newest is always a record.)
 * 2. identify which is fuller.
 */
export function bestCarOf(prior: ThingCar<Thing>, landed: ThingCar<Thing>): ThingCar<Thing> {
  if (prior === undefined) { return landed } // cold cache: no prior
  CarChecks.thingCar.parse(prior); CarChecks.thingCar.parse(landed)
  if (prior.newest.lifepath !== landed.newest.lifepath) { return (prior.newest.lifepath > landed.newest.lifepath) ? prior : landed }
  const [bestNewest,  newest]  = tagBestNewestSL(prior, landed)
  const [bestFullest, fullest] = tagBestFullestSL(prior, landed)
  if ((bestFullest === 'prior') && (bestNewest === 'prior')) { return prior }
  return carOf(newest, fullest as Thing | null | undefined) // at least one is not from prior
}

// make this handle the sparse case. don't use undefined as a sentinel
/** Which car has the newer `newest` record? On a tie, the fuller; on a tie for fullest, `prior`. */
function tagBestNewestSL(prior: ThingCar<Thing>, landed: ThingCar<Thing>): ['prior' | 'landed', DeliverableThing] {
  const cmp = cmpThings(prior.newest, landed.newest)
  if (cmp < 0) { return ['prior',  prior.newest] }
  if (cmp > 0) { return ['landed', landed.newest] }
  if (landed.liveness !== 'full') { return ['prior', prior.newest] }
  if (prior.liveness  !== 'full') { return ['landed', landed.newest] }
  return ['prior', prior.newest]
}

/** The fullest record of two cars, or undefined where both are absent. On a tie, `prior`. */
function tagBestFullestSL(prior: ThingCar<Thing>, landed: ThingCar<Thing>): ['prior' | 'landed', Sparse<Thing> | Thing | null | undefined] {
  if (landed.liveness === 'bare')   { return ['prior',  prior.fullest] }
  if (prior.liveness  === 'bare')   { return ['landed', landed.fullest] }
  return tagBestNewestRecordSL(prior.fullest ?? prior.newest, landed.fullest ?? landed.newest)
}

/** The newer record of two deliverables. On a tie, `prior`. */
function tagBestNewestRecordSL(prior: DeliverableThing, landed: DeliverableThing): ['prior' | 'landed', DeliverableThing] {
  return (cmpThings(prior, landed) <= 0) ? ['prior', prior] : ['landed', landed]
}

// if future need arises to type-refine this, overload it.
/** The car of `record` alone. A tombstone's car is `gone`, even when the tombstone is sparse. */
export function carOf(newest: DeliverableThing, fullest: Thing | null | undefined = undefined): ThingCar<Thing> {
  CarChecks.deliverableThing.parse(newest)
  if (isVoidSentinel(newest)) { return Object.freeze({ liveness: 'void',   newest, fullest: null }) }
  if (isTombstone(newest))    { return Object.freeze({ liveness: 'gone',   newest, fullest: null }) }
  if (isWholeRecord(newest))  { return Object.freeze({ liveness: 'full',   newest, fullest: newest }) }
  if (fullest === undefined)  { return Object.freeze({ liveness: 'bare',   newest, fullest: undefined }) }
  // replace the check with the correct sparse checker, strict if possible.
  const sparse = ThingChecks.sparseThing.parse(fullest)
  return                               Object.freeze({ liveness: 'behind', newest, fullest: sparse })
}

// --

// == [Reading cars and records]: isThingCar, dbHasNewer, isWholeRecord, isTombstone, cmpThings, haveSameScope

// TanStack also shares an observer's selected and placeholder values, which may be anything, a `liveness` field included.
/** True when `val` is a sound car. */
export function isThingCar(val: unknown): val is ThingCar<Thing> {
  return CarChecks.thingCar.safeParse(val).success
}


/** True when the vaultDB holds a whole record newer than `car`'s fullest. */
export function dbHasNewer(car: Pick<ThingCar<Thing>, 'liveness'>): boolean {
  return (car.liveness === 'behind') || (car.liveness === 'bare')
}

// move these to Thing; find where they're not being used, and use them.

/** True when `record` is whole, with its body, and not sparse. */
export function isWholeRecord(record: Sparse<Thing>): record is Thing {
  return kindChecksOf(record.labelpath).record.safeParse(record).success
}

// Each kind types its `am` as 'a' | 'x', so TypeScript cannot narrow to a tombstone by it.
/** True when `record` is a tombstone. */
export function isTombstone<RecordT extends Thing>(record: unknown): record is Tombstone<RecordT> {
  return ((record as Sparse<RecordT>)?.am === 'x')
}

// export function isVoidSentinel(record: Sparse<Thing>): record is VoidSentinel {
// }

// The lifepath decides first: a Thing born under a new life of its parent starts again at revseq 0.
// Lifeseq strings are lexicographically ordered, since a reset implies a parent with a later lifepath.
/** Compare two revisions: by life, then revision. Returns: positive (`post` newer), negative (`ante` newer), zero (`same`).
 * The output is **not** restricted to -1, 0, 1: it may be any integer.
*/
export function cmpThings(ante: Pick<DeliverableThing, 'lifepath' | 'revseq'>, post: Pick<DeliverableThing, 'lifepath' | 'revseq'>): number {
  if (ante.lifepath !== post.lifepath) { return (post.lifepath > ante.lifepath) ? 1 : -1 }
  return post.revseq - ante.revseq
}

// Thing.haveSameScope
/** True when `ante` and `post` are at one labelpath of one bank. */
function haveSameScope(ante: ThingScope, post: ThingScope): boolean {
  return (ante.labelpath === post.labelpath) && (ante.userid === post.userid) && (ante.banklabel === post.banklabel)
}
// --

// == [Checks]: isSparse, CarChecks, Checks
// Thing.isSparse
/** True when `record` is live, and not whole. */
function isSparse(record: Sparse<Thing>): boolean {
  return (record.am === 'a') && (! isWholeRecord(record))
}

/** ThingCar's type-safe checks. */
// is checkers requiring everyone to use the same refusal code? does it redecorate an
// already-decorated checker? TODO reforming that.
const CarChecks = Validator.Checkers('bad_option', ({ obj, lit, discrim, custom }) => {
  const deliverableThing = obj({ ...thingScope.shape, ...thingCited.shape })
  const citedShape = obj({ ...thingScope.shape, ...thingCited.shape })
  // Its records pass through as they are, so that a refinement can compare them by reference.
  const cited = custom<Sparse<Thing>>((val) => citedShape.safeParse(val).success, Phrases.CarRecordShape)
  const whole = custom<Thing>((val) => citedShape.safeParse(val).success && isWholeRecord(val as Sparse<Thing>), Phrases.CarFullestShape)

  const fullCar =    obj({ liveness: lit('full'), newest: cited, fullest: whole })
    .refine(({ newest, fullest }) => (newest === fullest) && (newest.am === 'a'), Phrases.CarFullSplit),

  const thingCar = discrim('liveness', [
    fullCar,
    // ...
    obj({ liveness: lit('behind'), newest: cited, fullest: whole })
      .refine(({ newest }) => isSparse(newest), Phrases.CarNewestNotSparse)
      .refine(({ newest, fullest }) => haveSameScope(newest, fullest) && (newest.lifepath === fullest.lifepath) && (fullest.revseq < newest.revseq), Phrases.CarBehindOfOtherRevision),
    obj({ liveness: lit('bare'), newest: cited, fullest: lit(undefined) })
      .refine(({ newest }) => isSparse(newest), Phrases.CarNewestNotSparse),
    obj({ liveness: lit('gone'), newest: cited, fullest: lit(null) })
      .refine(({ newest }) => isTombstone(newest), Phrases.CarGoneNotTombstone),
    obj({ liveness: lit('void'), newest: cited, fullest: lit(null) })
      .refine(({ newest }) => isVoidSentinel(newest), Phrases.CarVoidNotShell),
  ])
  return {
    thingCar,
    deliverableThing,
    fullCar,
    behindCar,
    bareCar,
    goneCar,
    voidCar,

  }
})
// --
