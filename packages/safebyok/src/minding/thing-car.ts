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

// The vaultDB holds a newer whole record when liveness is 'behind' or 'bare' (isVaultDBNewer).
/** Cache value for a ThingRecord: the newest revision heard of (which might be sparse), and the fullest record seen.
 * `fullest` is null when gone or void, and undefined when bare.
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

/** A record on its way into a car: a Thing, whole or sparse, or the void sentinel for a scope where storage holds nothing. */
export type DeliverableThing = Thing | Sparse<Thing> | VoidSentinel

/** Each `liveness` a car may have. */
export const carLivenessVals = ['full', 'behind', 'bare', 'gone', 'void'] as const
// --

// == [Making and merging]: carOf, mergedCarOf, isThingCar, isVaultDBNewer, isWholeRecord, cmpRecords

/** The car of `record` alone: `full` for a whole live record, `bare` for a sparse one, `gone` for a tombstone and `void` for the void sentinel. */
export function carOf(record: DeliverableThing): ThingCar<Thing> {
  if (isVoidSentinel(record)) { return Object.freeze({ liveness: 'void', newest: record, fullest: null }) }
  // Each kind types its `am` as 'a' | 'x', so TypeScript cannot narrow to a tombstone by it.
  if (record.am === 'x')      { return Object.freeze({ liveness: 'gone', newest: record as Tombstone<Thing>, fullest: null }) }
  if (isWholeRecord(record))  { return Object.freeze({ liveness: 'full', newest: record, fullest: record }) }
  return Object.freeze({ liveness: 'bare', newest: record, fullest: undefined })
}

/** The car the cache keeps when `landed` lands over `prior`, or over nothing: the newer revision of their newests, and the newer whole record of their fullests.
 * A tombstone newest leaves no fullest record, since a tombstone is whole. A whole record of an earlier life is not kept.
 * The prior car stays where `landed` adds nothing to it, and a car of another Thing replaces it.
 */
export function mergedCarOf(prior: ThingCar<Thing> | undefined, landed: ThingCar<Thing>): ThingCar<Thing> {
  const merged = ((prior === undefined) || (! isSameScope(prior.newest, landed.newest))) ? landed : carOfPair(prior, landed)
  Checks.thingCar.parse(merged)
  return merged
}

/** True when `val` has a car's `liveness`. TanStack also shares an observer's selected and placeholder values, which may be anything. */
export function isThingCar(val: unknown): val is ThingCar<Thing> {
  return (typeof val === 'object') && (val !== null) && (carLivenessVals as readonly unknown[]).includes((val as { liveness?: unknown }).liveness)
}

/** True when the vaultDB holds a whole record newer than `car`'s fullest: its liveness is `behind` or `bare`. */
export function isVaultDBNewer(car: ThingCar<Thing>): boolean {
  return (car.liveness === 'behind') || (car.liveness === 'bare')
}

/** True when `record` passes its kind's record check, so it has its body. A sparse record does not. */
export function isWholeRecord(record: Sparse<Thing>): record is Thing {
  return kindChecksOf(record.labelpath).record.safeParse(record).success
}

// The lifepath decides first: a Thing born under a new life of its parent starts again at revseq 0. Lifeseqs are
// fixed-width base-32 digits, 0-9 then a-v, so lifepaths compare as strings; the shell's '-' sorts below them all.
/** Positive when `post` is later than `ante` (a later life, or a later revision of the same life), negative when earlier, zero for the same revision. */
export function cmpRecords(ante: Pick<DeliverableThing, 'lifepath' | 'revseq'>, post: Pick<DeliverableThing, 'lifepath' | 'revseq'>): number {
  if (ante.lifepath !== post.lifepath) { return (post.lifepath > ante.lifepath) ? 1 : -1 }
  return post.revseq - ante.revseq
}
// --

// == [Helpers]: carOfPair, carOfParts, sharedCarOf, newerWholeOf, isSameScope

/** The merge of two cars of one Thing: see {@link mergedCarOf}. On a tie, `prior`'s record is kept. */
function carOfPair(prior: ThingCar<Thing>, landed: ThingCar<Thing>): ThingCar<Thing> {
  const newer = (cmpRecords(prior.newest, landed.newest) > 0) ? landed : prior
  if (newer.fullest === null) { return newer }
  const fullest = newerWholeOf(prior.fullest, landed.fullest)
  const ofLife  = (fullest?.lifepath === newer.newest.lifepath) ? fullest : undefined
  return sharedCarOf(prior, carOfParts(newer.newest, ofLife))
}

/** The car of `newest`, a live revision, and `fullest`, the newest whole record of its life, or undefined for none. */
function carOfParts(newest: Sparse<Thing>, fullest: Thing | undefined): ThingCar<Thing> {
  if (fullest === undefined)               { return Object.freeze({ liveness: 'bare',   newest, fullest }) }
  if (cmpRecords(fullest, newest) === 0)   { return Object.freeze({ liveness: 'full',   newest: fullest, fullest }) }
  return                                            Object.freeze({ liveness: 'behind', newest, fullest })
}

// TanStack's own default sharing, applied to the car: `prior` itself where nothing differs.
/** `car`, keeping each part that is unchanged from `prior` as it was. */
function sharedCarOf(prior: ThingCar<Thing>, car: ThingCar<Thing>): ThingCar<Thing> {
  const shared = TSQ.replaceEqualDeep(prior, car)
  if (shared === prior)            { return prior }
  // A full car has one record in both fields: the one shared with prior's fullest keeps the most of its body.
  if (shared.liveness === 'full')  { return Object.freeze({ ...shared, newest: shared.fullest }) }
  return Object.freeze(shared)
}

/** The newer of two whole records, either of which may be absent, or undefined where both are. On a tie, `ante`. */
function newerWholeOf(ante: Thing | null | undefined, post: Thing | null | undefined): Thing | undefined {
  if (! ante) { return post ?? undefined }
  if (! post) { return ante }
  return (cmpRecords(ante, post) > 0) ? post : ante
}

/** True when `ante` and `post` are at one labelpath of one bank. */
function isSameScope(ante: ThingScope, post: ThingScope): boolean {
  return (ante.labelpath === post.labelpath) && (ante.userid === post.userid) && (ante.banklabel === post.banklabel)
}
// --

// == [Checks]: Checks

/** True when `record` is live, and not whole. */
function isLiveSparse(record: Sparse<Thing>): boolean { return (record.am === 'a') && (! isWholeRecord(record)) }

/** The check of a car's invariants, on the way out of {@link mergedCarOf}. A car that fails it is a bug in the minder. */
const Checks = Validator.Checkers('unexpected_error', ({ obj, lit, discrim, custom }) => {
  const citedShape = obj({ ...thingScope.shape, ...thingCited.shape })
  // Its records pass through as they are, so that a refinement can compare them by reference.
  const cited = custom<Sparse<Thing>>((val) => citedShape.safeParse(val).success, Phrases.CarRecordShape)
  const whole = custom<Thing>((val) => citedShape.safeParse(val).success && isWholeRecord(val as Sparse<Thing>), Phrases.CarFullestShape)
  const thingCar = discrim('liveness', [
    obj({ liveness: lit('full'), newest: whole, fullest: whole })
      .refine(({ newest, fullest }) => (newest === fullest) && (newest.am === 'a'), Phrases.CarFullSplit),
    obj({ liveness: lit('behind'), newest: cited, fullest: whole })
      .refine(({ newest }) => isLiveSparse(newest), Phrases.CarNewestNotSparse)
      .refine(({ newest, fullest }) => isSameScope(newest, fullest) && (newest.lifepath === fullest.lifepath) && (fullest.revseq < newest.revseq), Phrases.CarBehindOfOtherRevision),
    obj({ liveness: lit('bare'), newest: cited, fullest: lit(undefined) })
      .refine(({ newest }) => isLiveSparse(newest), Phrases.CarNewestNotSparse),
    obj({ liveness: lit('gone'), newest: cited, fullest: lit(null) })
      .refine(({ newest }) => (newest.am === 'x') && (! isVoidSentinel(newest)), Phrases.CarGoneNotTombstone),
    obj({ liveness: lit('void'), newest: cited, fullest: lit(null) })
      .refine(({ newest }) => isVoidSentinel(newest), Phrases.CarVoidNotShell),
  ])
  return { thingCar }
})
// --
