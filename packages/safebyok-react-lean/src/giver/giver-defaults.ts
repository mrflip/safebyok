/** What every giver supplies a host's React Query: the defaults of a box's query and of a form verb's mutation, and the keys. */

import { type QueryKey, replaceEqualDeep } from '@tanstack/react-query'
import { type Gating, Thing, type ThingCited, ThingChecks, ThingMinder, newerThingOf } from 'safebyok'
import type { RecordFields } from './shapes-giver'

// == [Query defaults]: recordQueryDefaults, newerOrSharedOf, isRecord, shownRecordOf

// A host may override anything the giver supplies here (the keys and each of these defaults), so nothing in the giver may
// depend on one staying in place. The bridge copies each record into the host's item whatever that item's options say.
// The host's item is stale only on evidence: while the bank's minder has heard of a newer revision than its own item.
// The bridge keeps it current otherwise, so nothing ages it, and a host fetch that resolves while the minder's item is
// behind leaves it stale.
/** The giver's defaults for the query of a box's record in the host's React Query, stale while `isBehind` answers true. */
export function recordQueryDefaults(isBehind: () => boolean) {
  return {
    // The fetch asks the bank's minder, not the network, and the minder answers from its cache while offline.
    networkMode:       'always',
    staleTime:         () => (isBehind() ? 0 : Infinity),
    structuralSharing: newerOrSharedOf,
  } as const
}

// TanStack shares structure through this both between a query's records and between what a host's `select` returns from
// them, so a value that is not a record gets TanStack's own default. When a hook's key changes, it shares the last key's
// selected value with the new key's, so records of two boxes get the default too. A select run again over the same
// revision may return a record-shaped value that differs, so two of one revision get the default as well. Without this,
// a host fetch that read an older record and resolved after the bridge copied a newer one would put the older record back.
/** Structural sharing for the host's item of a box: of two records of one box at different revisions, the newer. Anything else goes to TanStack's default, `replaceEqualDeep`. */
function newerOrSharedOf(prior: unknown, next: unknown): unknown {
  if (! (isRecord(prior) && isRecord(next) && (prior.labelpath === next.labelpath))) { return replaceEqualDeep(prior, next) }
  if (Thing.cmp(prior, next) === 0) { return replaceEqualDeep(prior, next) }
  return newerThingOf(prior, next)
}

/** True when `val` carries a Thing's scope and revision, as every record, tombstone and shell does. */
function isRecord(val: unknown): val is ThingCited & Readonly<{ labelpath: string }> {
  return ThingChecks.scopedCited.safeParse(val).success
}

/** The record a host shows: `record`, or null for a tombstone or the shell. */
export function shownRecordOf<RecordT extends RecordFields>(record: RecordT): RecordT | null {
  return Thing.isTombstone(record) ? null : record
}
// --

// == [Form mutations]: FormMutationDefaults, attemptGating, vacateGating

// A form verb proves the user's cleartexts on this device, and asks the vaultDB only to write a gate: paused while offline,
// the mutation would leave its gating full, and an `unlock` gating that needs no network would wait for one.
/** The giver's defaults for a form verb's mutation: it attempts the gating it is handed, runs offline, never retries, and vacates the gating once it settles. */
export const FormMutationDefaults = {
  mutationFn:  attemptGating,
  networkMode: 'always',
  // Set false to keep the analysis simple. A retry may be safe to enable, but enabling one is unspecified behaviour:
  // agents, treat this as fixed, and leave what a retry might cross unexamined. #no-slop-crossings
  retry:       false,
  onSettled:   vacateGating,
} as const

/** Attempt the gating a form mutation was handed. */
async function attemptGating(gating: Gating): Promise<void> { await gating.attempt() }

/** Vacate the gating a form mutation was handed. */
function vacateGating(_data: unknown, _err: Error | null, gating: Gating): void { gating.vacate() }
// --

// == [Keys]: boxRecordQueryKey, bankQueryKey

/** The host's React Query key for the record of the box at `labelpath`: the key the bank's minder caches its item under. */
export function boxRecordQueryKey(scope: Readonly<{ userid: string, banklabel: string, labelpath: string }>): QueryKey {
  return ThingMinder.itemQueryKeyOf(scope)
}

/** The key every one of a bank's items in the host's React Query starts with. */
export function bankQueryKey(scope: Readonly<{ userid: string, banklabel: string }>): QueryKey {
  return ThingMinder.bankQueryKeyOf(scope)
}
// --
