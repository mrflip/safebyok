/** `ThingCar`: carries the newest record seen; since that might be sparse, it also carries the most recent useful revision seen. */
import * as TSQ from '@tanstack/query-core'
import { deepFreeze } from 'es-toolkit'
import { Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'
import { type Sparse, type ThingRecord, ThingChecks } from '../shapes/shapes-thing'
import { ThingkindChecks } from '../shapes/shapes-thingkinds'
import { Thing } from '../models/thing'
import { Revseq } from '../shapes/primitives'
import type { DeliverableThing, ThingCar } from '../shapes/shapes-minder'

// == [Making cars]: carOf, frozenCarOf, bestCarOf, tagBestNewestSL, tagBestFullestSL, tagBestNewestRecordSL

/** The car of `newest`, with `fullest` the whole record of its life where `newest` is sparse.
 * It deep-freezes both records in place. A deleted Thing's car is `gone`, even when its tombstone is sparse, and the void
 * sentinel's is `void`. A sparse `newest` with no `fullest` makes a `bare` car.
 */
export function carOf(newest: DeliverableThing, fullest?: ThingRecord): ThingCar<ThingRecord> {
  ThingChecks.scopedCited.parse(newest)
  if (Thing.isVoidSentinel(newest)) { return frozenCarOf('void', newest, null) }
  if (Thing.isTombstone(newest))    { return frozenCarOf('gone', newest, null) }
  if (Thing.isWhole(newest))        { return frozenCarOf('full', newest, newest) }
  if (fullest === undefined)        { return frozenCarOf('bare', newest, undefined) }
  ThingkindChecks.ofLabelpath(newest.labelpath).record.parse(fullest)
  const car = frozenCarOf('bhnd', newest, fullest)
  CarOfChecks.bhndCar.parse(car)
  return car
}

// A listener, or a host's select, handed the car must not reach into the cache through it: its records are frozen too.
/** The car of `liveness`, `newest` and `fullest`, with its agerank, deeply frozen. */
function frozenCarOf(liveness: ThingCar<ThingRecord>['liveness'], newest: DeliverableThing, fullest: ThingRecord | null | undefined): ThingCar<ThingRecord> {
  deepFreeze(newest)
  deepFreeze(fullest)
  return Object.freeze({ liveness, newest, fullest, agerank: agerankOf({ liveness, newest, fullest }) }) as ThingCar<ThingRecord>
}

// TanStack Query types the values it hands structural sharing as unknown, so both are checked as cars.
/** The car of the newest record of `prior` and `delivered`, and the fullest of its life, from either car, with `prior`'s on a tie.
 * It serves as a minder query's structural sharing: it is `prior` itself where `delivered` adds nothing, and `delivered` where `prior` is undefined.
 * Refuses anything but a car, and two cars of different Things; `prior` may also be undefined.
 */
export function bestCarOf(prior: unknown, delivered: unknown): ThingCar<ThingRecord> {
  demandCar(delivered, Phrases.NotACar)
  if (prior === undefined) { return delivered }
  demandCar(prior, Phrases.NotACar)
  if (! Thing.haveSameScope(prior.newest, delivered.newest))     { throw Throwers.carsOfOtherThings() }
  if (prior.newest.lifepath !== delivered.newest.lifepath) { return (Thing.cmp(prior.newest, delivered.newest) > 0) ? delivered : prior }
  const [newestTag,  newest]  = tagBestNewestSL(prior,  delivered)
  const [fullestTag, fullest] = tagBestFullestSL(prior, delivered)
  if ((newestTag === 'prior') && (fullestTag === 'prior')) { return prior }
  // Only a whole record has parts worth sharing, and a newer one can come only from `delivered`. A full car's newest is its fullest, so it takes the shared record too.
  const shared = (((fullestTag === 'delivered') && prior.fullest) ? TSQ.replaceEqualDeep(prior.fullest, fullest) : fullest) as ThingRecord | undefined
  return carOf((newest === fullest) ? shared! : newest, shared)
}

/** The newer of the two cars' newest records, tagged with its car. On a tie, `delivered`'s where it alone is full, else `prior`'s. */
function tagBestNewestSL(prior: ThingCar<ThingRecord>, delivered: ThingCar<ThingRecord>): ['prior' | 'delivered', DeliverableThing] {
  const cmp = Thing.cmp(prior.newest, delivered.newest)
  if (cmp < 0) { return ['prior',     prior.newest] }
  if (cmp > 0) { return ['delivered', delivered.newest] }
  if (delivered.liveness !== 'full') { return ['prior',     prior.newest] }
  if (prior.liveness     !== 'full') { return ['delivered', delivered.newest] }
  return ['prior', prior.newest]
}

/** The newer of the two cars' fullest records, tagged with its car: a bare car offers none, any other its `fullest ?? newest`. On a tie, `prior`'s. */
function tagBestFullestSL(prior: ThingCar<ThingRecord>, delivered: ThingCar<ThingRecord>): ['prior' | 'delivered', DeliverableThing | null | undefined] {
  if (delivered.liveness === 'bare') { return ['prior',     prior.fullest] }
  if (prior.liveness     === 'bare') { return ['delivered', delivered.fullest] }
  return tagBestNewestRecordSL(prior.fullest ?? prior.newest, delivered.fullest ?? delivered.newest)
}

/** The newer of two records, tagged with its car. On a tie, `prior`'s. */
function tagBestNewestRecordSL(prior: DeliverableThing, delivered: DeliverableThing): ['prior' | 'delivered', DeliverableThing] {
  return (Thing.cmp(prior, delivered) <= 0) ? ['prior', prior] : ['delivered', delivered]
}
// --

// == [Reading cars]: isThingCar, dbHasNewer, agerankOf, demandCar

/** True when `val` is a sound car. */
export function isThingCar(val: unknown): val is ThingCar<ThingRecord> {
  return CarChecks.thingCar.safeParse(val).success
}

/** True when the vaultDB has a whole record newer than `car`'s fullest. */
export function dbHasNewer(car: Pick<ThingCar<ThingRecord>, 'liveness'>): boolean {
  return (car.liveness === 'bhnd') || (car.liveness === 'bare')
}

// It joins with `~` the newest's lifepath and revseq, the liveness, and the revseq of `fullest ?? newest`. Each field is of
// fixed width for one Thing, so two ageranks are settled before either reaches a '~'. The liveness tags, all four letters,
// sort void > gone > full > bhnd > bare. A bare car has no fullest, and takes NoFullestRevseq, below every revseq. The
// fullest's revseq settles two bhnd cars with the same newest.
/** The agerank of a sound car of a Thing: a string that compares above the agerank of each older car of that Thing. */
export function agerankOf(car: Pick<ThingCar<ThingRecord>, 'liveness' | 'newest' | 'fullest'>): string {
  const { liveness, newest, fullest } = car
  const fullestRevseq = (liveness === 'bare') ? NoFullestRevseq : Revseq.padded((fullest ?? newest).revseq)
  return [newest.lifepath, Revseq.padded(newest.revseq), liveness, fullestRevseq].join('~')
}

/** The place of a bare car's fullest revseq in its agerank: as wide as a padded revseq, and below every one. */
const NoFullestRevseq = '----------'

/** Demand that `val` is a sound car, refusing `unexpected_error` with `advice`. */
function demandCar(val: unknown, advice?: string): asserts val is ThingCar<ThingRecord> {
  CarChecks.thingCar.parse(val, { advice })
}
// --

// == [Checks]: CarChecks, CarOfChecks

/** The checks of a car's invariants, as {@link ThingCar} states them, each liveness by name. A car that fails one is a bug in safebyok. */
const CarChecks = Validator.Checkers('unexpected_error', ({ obj, lit, discrim, custom, str }) => {
  // Its records pass through as they are, so that a refinement can compare them by reference.
  const cited = custom<Sparse<ThingRecord>>((val) => ThingChecks.scopedCited.safeParse(val).success, Phrases.CarRecordShape)
  const whole = custom<ThingRecord>((val) => ThingChecks.scopedCited.safeParse(val).success && Thing.isWhole(val as Sparse<ThingRecord>), Phrases.CarFullestShape)
  const agerank = str
  const fullCar  = obj({ liveness: lit('full'), newest: cited, fullest: whole, agerank })
    .refine(({ newest, fullest }) => (newest === fullest) && (newest.am === 'a'), Phrases.CarFullSplit)
  const bhndCar  = obj({ liveness: lit('bhnd'), newest: cited, fullest: whole, agerank })
    .refine(({ newest }) => Thing.isSparse(newest), Phrases.CarNewestNotSparse)
    .refine(({ newest, fullest }) => Thing.haveSameScope(newest, fullest) && (newest.lifepath === fullest.lifepath) && (fullest.revseq < newest.revseq), Phrases.CarBhndOfOtherRevision)
  const bareCar  = obj({ liveness: lit('bare'), newest: cited, fullest: lit(undefined), agerank })
    .refine(({ newest }) => Thing.isSparse(newest), Phrases.CarNewestNotSparse)
  const goneCar  = obj({ liveness: lit('gone'), newest: cited, fullest: lit(null), agerank })
    .refine(({ newest }) => Thing.isGone(newest), Phrases.CarNewestNotGone)
  const voidCar  = obj({ liveness: lit('void'), newest: cited, fullest: lit(null), agerank })
    .refine(({ newest }) => Thing.isVoidSentinel(newest), Phrases.CarVoidNotShell)
  const thingCar = discrim('liveness', [fullCar, bhndCar, bareCar, goneCar, voidCar])
    .refine((car) => car.agerank === agerankOf(car), Phrases.CarAgerankNotOwn)
  return { thingCar, fullCar, bhndCar, bareCar, goneCar, voidCar }
})

/** The check of the bhnd car {@link carOf} makes of a pair of records, refusing `bad_record`. */
const CarOfChecks = {
  bhndCar: CarChecks.bhndCar.refusingAs('bad_record'),
}
// --
