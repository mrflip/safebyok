/** `newerThingOf`: the merge every record a minder caches lands through. */
import * as TSQ from '@tanstack/query-core'
import { type ThingCited, type ThingRecord, type ThingScope, type Tombstone, Shell, ThingChecks } from '../shapes/shapes-thing'
import { Thing } from '../models/thing'

// == [Merging]: newerThingOf, DeadAt

/** Where {@link newerThingOf} finds the tombstone that null stands for at a scope: undefined where none is cached. */
export type DeadAt = (scope: ThingScope) => Tombstone<ThingRecord> | undefined

// TanStack Query runs structural sharing on what a host's `select` returns as well as on the query's own values, and
// types both as unknown.
/** The newer of two values of one Thing's item, soon or tombstone, by life and then revision, with `prior` on a tie and `next` where `prior` is undefined.
 * It serves as structural sharing for a TanStack query of one Thing's records. Null stands for the tombstone `deadAt`
 * finds at the other value's scope, or, where it finds none, for nothing stored, older than every record. Of two nulls, `prior`.
 * Anything that is neither a record nor null gets TanStack's own default.
 */
export function newerThingOf(prior: unknown, next: unknown, deadAt?: DeadAt): unknown {
  if (prior === undefined) { return next }
  if (! (isEntryVal(prior) && isEntryVal(next))) { return TSQ.replaceEqualDeep(prior, next) }
  if (prior === null) { return (next === null) ? prior : newerOfCited(prior, next, citedOf(prior, next, deadAt), next) }
  if (next === null)  { return newerOfCited(prior, next, prior, citedOf(next, prior, deadAt)) }
  return newerOfCited(prior, next, prior, next)
}
// --

// == [Helpers]: EntryRecord, isEntryVal, citedOf, newerOfCited

/** A record a minder's query may hold: a Thing's scope and citation, live or a tombstone, sparse or whole. */
type EntryRecord = ThingScope & ThingCited

/** True for a record, or null. */
function isEntryVal(val: unknown): val is EntryRecord | null {
  return (val === null) || ThingChecks.scopedCited.safeParse(val).success
}

/** The citation `val` compares by: its own, or where it is null, that of the tombstone at `scoped`'s scope, else the shell's. */
function citedOf(val: EntryRecord | null, scoped: ThingScope, deadAt: DeadAt | undefined): Pick<ThingCited, 'lifepath' | 'revseq'> {
  return val ?? deadAt?.(scoped) ?? Shell.Cited
}

/** `next` where `nextCited` is newer than `priorCited`, else `prior`. */
function newerOfCited(prior: unknown, next: unknown, priorCited: Pick<ThingCited, 'lifepath' | 'revseq'>, nextCited: Pick<ThingCited, 'lifepath' | 'revseq'>): unknown {
  return (Thing.cmp(priorCited, nextCited) > 0) ? next : prior
}
// --
