/** `ThingCar`, what a ThingMinder caches for one scope, and how two cars of one Thing merge. */

import { Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import {
  type BoxThing, type GateThing, type Sparse, type Thing, type ThingRecord, type Tombstone, type VoidSentinel,
  cmpThings, haveSameScope, isGone, isSparse, isTombstone, isVoidSentinel, isWholeRecord, kindChecksOf, thingCited, thingScope,
} from '../storage/shapes-thing'

// == [The car]: Tombstone, ThingCar, BoxCar, GateCar, DeliverableThing, carLivenessVals

export type { Tombstone } from '../storage/shapes-thing'

// The vaultDB has a newer whole record when liveness is 'behind' or 'bare' (dbHasNewer).
/** A ThingMinder's frozen cache value for a Thing: among records we've seen, carries its newest (perhaps sparse), and its fullest (perhaps null, or undefined for "exists, but nothing useful cached").
 * - `newest` is always a record: full, sparse, the void sentinel when void, or a deleted Thing's tombstone when gone.
 * - `fullest` is null when gone or void, and undefined when bare. It stands for the *record* `fullest ?? newest`.
 * - Both records have identical scope and lifepath. (This implies a car with a newer lifepath should always replace the other.)
 * - On `full`, the two are *identical* (`newest === fullest`): the same object, not just the same content.
 * - When `behind`, `fullest` is of a strictly earlier revision: `newest.revseq > fullest.revseq`.
 */
export type ThingCar<RecordT extends ThingRecord> = Readonly<
  | { liveness: 'full',   newest: RecordT,            fullest: RecordT   } // the same record in both. dbHasNewer: false
  | { liveness: 'behind', newest: Sparse<RecordT>,    fullest: RecordT   } // fullest is strictly older. Newest is strictly Sparse (not full, not gone, not void). dbHasNewer: true
  | { liveness: 'bare',   newest: Sparse<RecordT>,    fullest: undefined } // never fetched a whole record; newest is strictly sparse. dbHasNewer: true
  | { liveness: 'gone',   newest: Tombstone<RecordT>, fullest: null      } // a deleted Thing's tombstone: known to be gone. dbHasNewer: false
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

// == [Making cars]: carOf, bestCarOf, tagBestNewestSL, tagBestFullestSL, tagBestNewestRecordSL

/** The car of `newest`, with `fullest` the whole record of its life where `newest` is sparse.
 * A deleted Thing's car is `gone`, even when its tombstone is sparse, and the void sentinel's is `void`. A sparse `newest` with no `fullest` makes a `bare` car.
 */
export function carOf(newest: DeliverableThing, fullest?: Thing): ThingCar<Thing> {
  CarOfChecks.deliverableThing.parse(newest)
  if (isVoidSentinel(newest)) { return Object.freeze({ liveness: 'void',   newest, fullest: null }) }
  if (isTombstone(newest))    { return Object.freeze({ liveness: 'gone',   newest, fullest: null }) }
  if (isWholeRecord(newest))  { return Object.freeze({ liveness: 'full',   newest, fullest: newest }) }
  if (fullest === undefined)  { return Object.freeze({ liveness: 'bare',   newest, fullest: undefined }) }
  kindChecksOf(newest.labelpath).record.parse(fullest)
  return      Object.freeze(CarOfChecks.behindCar.parse({ liveness: 'behind', newest, fullest } as const))
}

// TanStack also calls it on an observer's selected and placeholder values, so it throws for one that is not a car.
/** The car of the newest record of `prior` and `delivered`, and the fullest of its life, from either car, with `prior`'s on a tie.
 * It serves as a minder query's structural sharing: it is `prior` itself where `delivered` adds nothing, and `delivered` where `prior` is undefined or of another scope.
 * Anything but a car refuses `unexpected_error`; `prior` may also be undefined.
 */
export function bestCarOf(prior: unknown, delivered: unknown): ThingCar<Thing> {
  demandCar(delivered, Phrases.NotACar)
  if (prior === undefined) { return delivered }
  demandCar(prior, Phrases.NotACar)
  if (! haveSameScope(prior.newest, delivered.newest))     { return delivered }
  if (prior.newest.lifepath !== delivered.newest.lifepath) { return (cmpThings(prior.newest, delivered.newest) > 0) ? delivered : prior }
  const [newestTag,  newest]  = tagBestNewestSL(prior,  delivered)
  const [fullestTag, fullest] = tagBestFullestSL(prior, delivered)
  if ((newestTag === 'prior') && (fullestTag === 'prior')) { return prior }
  return carOf(newest, fullest as Thing | undefined)
}

/** The newer of the two cars' newest records, tagged with its car. On a tie, `delivered`'s where it alone is full, else `prior`'s. */
function tagBestNewestSL(prior: ThingCar<Thing>, delivered: ThingCar<Thing>): ['prior' | 'delivered', DeliverableThing] {
  const cmp = cmpThings(prior.newest, delivered.newest)
  if (cmp < 0) { return ['prior',     prior.newest] }
  if (cmp > 0) { return ['delivered', delivered.newest] }
  if (delivered.liveness !== 'full') { return ['prior',     prior.newest] }
  if (prior.liveness     !== 'full') { return ['delivered', delivered.newest] }
  return ['prior', prior.newest]
}

/** The newer of the two cars' fullest records, tagged with its car: a bare car offers none, any other its `fullest ?? newest`. On a tie, `prior`'s. */
function tagBestFullestSL(prior: ThingCar<Thing>, delivered: ThingCar<Thing>): ['prior' | 'delivered', DeliverableThing | null | undefined] {
  if (delivered.liveness === 'bare') { return ['prior',     prior.fullest] }
  if (prior.liveness     === 'bare') { return ['delivered', delivered.fullest] }
  return tagBestNewestRecordSL(prior.fullest ?? prior.newest, delivered.fullest ?? delivered.newest)
}

/** The newer of two records, tagged with its car. On a tie, `prior`'s. */
function tagBestNewestRecordSL(prior: DeliverableThing, delivered: DeliverableThing): ['prior' | 'delivered', DeliverableThing] {
  return (cmpThings(prior, delivered) <= 0) ? ['prior', prior] : ['delivered', delivered]
}
// --

// == [Reading cars]: isThingCar, dbHasNewer, demandCar

// TanStack also shares an observer's selected and placeholder values, which may be anything, a `liveness` field included.
/** True when `val` is a sound car. */
export function isThingCar(val: unknown): val is ThingCar<Thing> {
  return CarChecks.thingCar.safeParse(val).success
}

/** True when the vaultDB has a whole record newer than `car`'s fullest. */
export function dbHasNewer(car: Pick<ThingCar<Thing>, 'liveness'>): boolean {
  return (car.liveness === 'behind') || (car.liveness === 'bare')
}

/** Demand that `val` is a sound car, refusing `unexpected_error` with `advice`. */
function demandCar(val: unknown, advice?: string): asserts val is ThingCar<Thing> {
  CarChecks.thingCar.parse(val, { advice })
}
// --

// == [Checks]: CarChecks, CarOfChecks

/** The checks of a car's invariants, as {@link ThingCar} states them, each liveness by name. A car that fails one is a bug in safebyok. */
const CarChecks = Validator.Checkers('unexpected_error', ({ obj, lit, discrim, custom }) => {
  const citedShape = obj({ ...thingScope.shape, ...thingCited.shape })
  // Its records pass through as they are, so that a refinement can compare them by reference.
  const cited = custom<Sparse<Thing>>((val) => citedShape.safeParse(val).success, Phrases.CarRecordShape)
  const whole = custom<Thing>((val) => citedShape.safeParse(val).success && isWholeRecord(val as Sparse<Thing>), Phrases.CarFullestShape)
  const fullCar   = obj({ liveness: lit('full'), newest: cited, fullest: whole })
    .refine(({ newest, fullest }) => (newest === fullest) && (newest.am === 'a'), Phrases.CarFullSplit)
  const behindCar = obj({ liveness: lit('behind'), newest: cited, fullest: whole })
    .refine(({ newest }) => isSparse(newest), Phrases.CarNewestNotSparse)
    .refine(({ newest, fullest }) => haveSameScope(newest, fullest) && (newest.lifepath === fullest.lifepath) && (fullest.revseq < newest.revseq), Phrases.CarBehindOfOtherRevision)
  const bareCar   = obj({ liveness: lit('bare'), newest: cited, fullest: lit(undefined) })
    .refine(({ newest }) => isSparse(newest), Phrases.CarNewestNotSparse)
  const goneCar   = obj({ liveness: lit('gone'), newest: cited, fullest: lit(null) })
    .refine(({ newest }) => isGone(newest), Phrases.CarNewestNotGone)
  const voidCar   = obj({ liveness: lit('void'), newest: cited, fullest: lit(null) })
    .refine(({ newest }) => isVoidSentinel(newest), Phrases.CarVoidNotShell)
  const thingCar  = discrim('liveness', [fullCar, behindCar, bareCar, goneCar, voidCar])
  return { thingCar, fullCar, behindCar, bareCar, goneCar, voidCar }
})

/** The checks of {@link carOf}'s arguments, refusing `bad_record`: a Thing's scope and revision, and the behind car a pair of records makes. */
const CarOfChecks = {
  ...Validator.Checkers('bad_record', ({ obj }) => ({
    deliverableThing: obj({ ...thingScope.shape, ...thingCited.shape }),
  })),
  behindCar: CarChecks.behindCar.refusingAs('bad_record'),
}
// --
