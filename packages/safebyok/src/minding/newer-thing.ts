/** `newerThingOf`: the merge every record a minder caches lands through. */
import { Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'
import { ThingChecks } from '../shapes/shapes-thing'
import { Thing } from '../models/thing'
import type { DeliverableThing } from '../shapes/shapes-minder'

// == [Merging]: newerThingOf

// TanStack Query types the values it hands structural sharing as unknown, so both are checked as records.
/** The newer of two records of one Thing, by life and then revision, with `prior` on a tie and `next` where `prior` is undefined.
 * It serves as structural sharing for a TanStack query of one Thing's records. Refuses anything but a record, and two records of different Things.
 */
export function newerThingOf(prior: unknown, next: unknown): DeliverableThing {
  const nextRecord = Checks.record.parse(next)
  if (prior === undefined) { return nextRecord }
  const priorRecord = Checks.record.parse(prior)
  if (! Thing.haveSameScope(priorRecord, nextRecord)) { throw Throwers.recordsOfOtherThings() }
  return (Thing.cmp(priorRecord, nextRecord) > 0) ? nextRecord : priorRecord
}
// --

// == [Checks]: Checks

/** The check of a record handed to {@link newerThingOf}. */
const Checks = Validator.Checkers('bad_record', ({ custom }) => ({
  // A record passes through as it is, so that the record answered is the one given.
  record: custom<DeliverableThing>((val) => ThingChecks.scopedCited.safeParse(val).success, Phrases.NotARecord),
}))
// --
