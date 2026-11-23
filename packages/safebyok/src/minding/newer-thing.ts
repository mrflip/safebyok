/** `newerThingOf`: the merge every record a minder caches lands through. */
import * as TSQ from '@tanstack/query-core'
import * as Throwers from '../refusals/throwers'
import { type Absent, type ThingCited, type ThingRecord, type ThingScope, type Tombstone, Shell, ThingChecks, isAbsent } from '../shapes/shapes-thing'
import { Thing } from '../models/thing'

// == [Merging]: newerThingOf, DeadAt

/** Where {@link newerThingOf} finds the tombstone that {@link Absent} stands for at a scope: undefined where none is cached. */
export type DeadAt = (scope: ThingScope) => Tombstone<ThingRecord> | undefined

// TanStack Query runs structural sharing on what a host's `select` returns as well as on the entry's own values, and
// types both as unknown.
/** The newer of two values of one Thing's item, soon or tombstone, by life and then revision, with `prior` on a tie and `next` where `prior` is undefined.
 * It serves as structural sharing for a TanStack query of one Thing's records. {@link Absent} stands for the tombstone `deadAt`
 * finds at the other value's scope, or, where it finds none, for nothing stored, older than every record. Of two Absents, `prior`.
 * Anything that is neither a record nor Absent gets TanStack's own default. Refuses two records of different Things.
 */
export function newerThingOf(prior: unknown, next: unknown, deadAt?: DeadAt): unknown {
  if (prior === undefined) { return next }
  if (! (isEntryVal(prior) && isEntryVal(next))) { return TSQ.replaceEqualDeep(prior, next) }
  if (isAbsent(prior)) { return isAbsent(next) ? prior : newerOfCited(prior, next, citedOf(prior, next, deadAt), next) }
  if (isAbsent(next))  { return newerOfCited(prior, next, prior, citedOf(next, prior, deadAt)) }
  if (! Thing.haveSameScope(prior, next)) { throw Throwers.recordsOfOtherThings() }
  return newerOfCited(prior, next, prior, next)
}
// --

// == [Helpers]: EntryRecord, isEntryVal, citedOf, newerOfCited

/** A record a minder's entry may have: a Thing's scope and citation, live or a tombstone, sparse or whole. */
type EntryRecord = ThingScope & ThingCited

/** True for a record, or {@link Absent}. */
function isEntryVal(val: unknown): val is EntryRecord | Absent {
  return isAbsent(val) || ThingChecks.scopedCited.safeParse(val).success
}

/** The citation `val` compares by: its own, or where it is Absent, that of the tombstone at `scoped`'s scope, else the shell's. */
function citedOf(val: EntryRecord | Absent, scoped: ThingScope, deadAt: DeadAt | undefined): Pick<ThingCited, 'lifepath' | 'revseq'> {
  return isAbsent(val) ? (deadAt?.(scoped) ?? Shell.Cited) : val
}

/** `next` where `nextCited` is newer than `priorCited`, else `prior`. */
function newerOfCited(prior: unknown, next: unknown, priorCited: Pick<ThingCited, 'lifepath' | 'revseq'>, nextCited: Pick<ThingCited, 'lifepath' | 'revseq'>): unknown {
  return (Thing.cmp(priorCited, nextCited) > 0) ? next : prior
}
// --
