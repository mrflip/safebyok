/** `ThingCar`, what a ThingMinder caches for one scope, and how two cars of one Thing merge. */

import * as TSQ from '@tanstack/query-core'
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

// The vaultDB has a newer whole record when liveness is 'behind' or 'bare' (isVaultDBNewer).
/** A ThingMinder's frozen cache value for one scope: the newest revision heard of, perhaps sparse, and the fullest record seen.
 * Show `fullest ?? newest`, the fullest record the car has, and write against `newest`.
 * - `newest` is always a record: the void sentinel when none is stored.
 * - `fullest` is null when gone or void, and undefined when bare.
 * - Both records are of one scope and one life: they share a lifepath.
 * - When `full`, they are one record: `newest === fullest`.
 * - When `behind`, `fullest` is of an earlier revision: `newest.revseq > fullest.revseq`, never equal.
 */
export type ThingCar<RecordT extends ThingRecord> = Readonly<
  | { liveness: 'full',   newest: RecordT,            fullest: RecordT   } // the same record in both
  | { liveness: 'behind', newest: Sparse<RecordT>,    fullest: RecordT   } // fullest is older
  | { liveness: 'bare',   newest: Sparse<RecordT>,    fullest: undefined } // never fetched whole
  | { liveness: 'gone',   newest: Tombstone<RecordT>, fullest: null      } // a tombstone, sparse or whole
  | { liveness: 'void',   newest: VoidSentinel,       fullest: null      } // none stored
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

/** The car of `record` alone. A tombstone's car is `gone`, even when the tombstone is sparse. */
export function carOf(record: DeliverableThing): ThingCar<Thing> {
  ArgChecks.deliverableThing.parse(record)
  if (isVoidSentinel(record)) { return Object.freeze({ liveness: 'void', newest: record, fullest: null }) }
  if (isTombstone(record))    { return Object.freeze({ liveness: 'gone', newest: record, fullest: null }) }
  if (isWholeRecord(record))  { return Object.freeze({ liveness: 'full', newest: record, fullest: record }) }
  return                               Object.freeze({ liveness: 'bare', newest: record, fullest: undefined })
}

/** The merge of `delivered` over `prior`: the newer newest, with the newer fullest of the same life.
 * It is `prior` itself where `delivered` adds nothing, and `delivered` where `prior` is undefined or of another Thing.
 */
export function mergedCarOf(prior: ThingCar<Thing> | undefined, delivered: ThingCar<Thing>): ThingCar<Thing> {
  const merged = ((prior === undefined) || (! isSameScope(prior.newest, delivered.newest))) ? delivered : carOfPair(prior, delivered)
  Checks.thingCar.parse(merged)
  return merged
}

/** The merge of two cars of one Thing: see {@link mergedCarOf}. On a tie, the result is `prior`'s record. */
function carOfPair(prior: ThingCar<Thing>, delivered: ThingCar<Thing>): ThingCar<Thing> {
  const newer = (cmpRecords(prior.newest, delivered.newest) > 0) ? delivered : prior
  if (newer.fullest === null) { return newer }
  const fullest = newerWholeOf(prior.fullest, delivered.fullest)
  const ofLife  = (fullest?.lifepath === newer.newest.lifepath) ? fullest : undefined
  return sharedCarOf(prior, carOfParts(newer.newest, ofLife))
}

/** The car of live `newest`, with `fullest` the newest whole record of its life, or undefined for none. */
function carOfParts(newest: Sparse<Thing>, fullest: Thing | undefined): ThingCar<Thing> {
  if (fullest === undefined)               { return Object.freeze({ liveness: 'bare',   newest, fullest }) }
  if (cmpRecords(fullest, newest) === 0)   { return Object.freeze({ liveness: 'full',   newest: fullest, fullest }) }
  return                                            Object.freeze({ liveness: 'behind', newest, fullest })
}

// TanStack's own default sharing, applied to the car: `prior` itself where nothing differs.
/** `car`, with each part that is unchanged from `prior` left as it was. */
function sharedCarOf(prior: ThingCar<Thing>, car: ThingCar<Thing>): ThingCar<Thing> {
  const shared = TSQ.replaceEqualDeep(prior, car)
  if (shared === prior)            { return prior }
  // A full car has one record in both fields: the one shared with prior's fullest has the most of its body.
  if (shared.liveness === 'full')  { return Object.freeze({ ...shared, newest: shared.fullest }) }
  return Object.freeze(shared)
}

/** The newer of two whole records, or undefined where both are absent. On a tie, `ante`. */
function newerWholeOf(ante: Thing | null | undefined, post: Thing | null | undefined): Thing | undefined {
  if (! ante) { return post ?? undefined }
  if (! post) { return ante }
  return (cmpRecords(ante, post) > 0) ? post : ante
}
// --

// == [Reading cars and records]: isThingCar, isVaultDBNewer, isWholeRecord, isTombstone, cmpRecords, isSameScope

// TanStack also shares an observer's selected and placeholder values, which may be anything, a `liveness` field included.
/** True when `val` is a sound car. */
export function isThingCar(val: unknown): val is ThingCar<Thing> {
  return Checks.thingCar.safeParse(val).success
}

/** True when the vaultDB has a whole record newer than `car`'s fullest. */
export function isVaultDBNewer(car: Pick<ThingCar<Thing>, 'liveness'>): boolean {
  return (car.liveness === 'behind') || (car.liveness === 'bare')
}

/** True when `record` is whole, with its body, and not sparse. */
export function isWholeRecord(record: Sparse<Thing>): record is Thing {
  return kindChecksOf(record.labelpath).record.safeParse(record).success
}

// Each kind types its `am` as 'a' | 'x', so TypeScript cannot narrow to a tombstone by it.
/** True when `record` is a tombstone, sparse or whole. The void sentinel is not one. */
export function isTombstone<RecordT extends Thing>(record: Sparse<RecordT>): record is Tombstone<RecordT> {
  return (record.am === 'x') && (! isVoidSentinel(record))
}

// The lifepath decides first: a Thing born under a new life of its parent starts again at revseq 0. Lifeseqs are
// fixed-width base-32 digits, 0-9 then a-v, so lifepaths compare as strings; the shell's '-' sorts below them all.
/** Compare two revisions, life first: positive when `post` is later than `ante`, negative when earlier, zero when the same. */
export function cmpRecords(ante: Pick<DeliverableThing, 'lifepath' | 'revseq'>, post: Pick<DeliverableThing, 'lifepath' | 'revseq'>): number {
  if (ante.lifepath !== post.lifepath) { return (post.lifepath > ante.lifepath) ? 1 : -1 }
  return post.revseq - ante.revseq
}

/** True when `ante` and `post` are at one labelpath of one bank. */
function isSameScope(ante: ThingScope, post: ThingScope): boolean {
  return (ante.labelpath === post.labelpath) && (ante.userid === post.userid) && (ante.banklabel === post.banklabel)
}
// --

// == [Checks]: isLiveSparse, ArgChecks, Checks

/** True when `record` is live, and not whole. */
function isLiveSparse(record: Sparse<Thing>): boolean { return (record.am === 'a') && (! isWholeRecord(record)) }

/** The check of {@link carOf}'s record: a Thing's scope and revision. */
const ArgChecks = Validator.Checkers('bad_option', ({ obj }) => ({
  deliverableThing: obj({ ...thingScope.shape, ...thingCited.shape }),
}))

/** The check of a car's invariants, as {@link ThingCar} states them. A car that fails it is a bug in the minder. */
const Checks = Validator.Checkers('unexpected_error', ({ obj, lit, discrim, custom }) => {
  const recordShape = obj({ ...thingScope.shape, ...thingCited.shape })
  // Its records pass through as they are, so that a refinement can compare them by reference.
  const record = custom<Sparse<Thing>>((val) => recordShape.safeParse(val).success, Phrases.CarRecordShape)
  const whole = custom<Thing>((val) => recordShape.safeParse(val).success && isWholeRecord(val as Sparse<Thing>), Phrases.CarFullestShape)
  const thingCar = discrim('liveness', [
    obj({ liveness: lit('full'), newest: record, fullest: whole })
      .refine(({ newest, fullest }) => (newest === fullest) && (newest.am === 'a'), Phrases.CarFullSplit),
    obj({ liveness: lit('behind'), newest: record, fullest: whole })
      .refine(({ newest }) => isLiveSparse(newest), Phrases.CarNewestNotSparse)
      .refine(({ newest, fullest }) => isSameScope(newest, fullest) && (newest.lifepath === fullest.lifepath) && (fullest.revseq < newest.revseq), Phrases.CarBehindOfOtherRevision),
    obj({ liveness: lit('bare'), newest: record, fullest: lit(undefined) })
      .refine(({ newest }) => isLiveSparse(newest), Phrases.CarNewestNotSparse),
    obj({ liveness: lit('gone'), newest: record, fullest: lit(null) })
      .refine(({ newest }) => isTombstone(newest), Phrases.CarGoneNotTombstone),
    obj({ liveness: lit('void'), newest: record, fullest: lit(null) })
      .refine(({ newest }) => isVoidSentinel(newest), Phrases.CarVoidNotShell),
  ])
  return { thingCar }
})
// --
