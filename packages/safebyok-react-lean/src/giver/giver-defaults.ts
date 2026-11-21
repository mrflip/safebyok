/** What every giver supplies a host's React Query: the defaults of a box's query and of a form verb's mutation, and the keys. */

import { type QueryKey, replaceEqualDeep } from '@tanstack/react-query'
import {
  type GateRecord, type Gating, Labelpath, type LiveOf, type PasskeyWayinHeader, type Sparse, Thing, type ThingCited, ThingChecks, ThingMinder, type ThingRecord, type Tombstone, type Userid, type WayinHeader, type WayinRecord, newerThingOf,
} from 'safebyok'
import type { GateShown, HeaderedGate } from './react-giver'

// == [Query defaults]: recordQueryDefaults, ListingQueryDefaults, newerOrSharedOf, isRecord, liveOf

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

// The bridge copies each listing the minder sets into the host's item, so nothing ages it.
/** The giver's defaults for the query of a listing in the host's React Query. */
export const ListingQueryDefaults = {
  networkMode: 'always',
  staleTime:   Infinity,
} as const

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

// A host's item never holds a sparse record: the minder's get answers whole ones. The case is here for a host's own
// select over a record it found elsewhere, such as a soon.
/** The record a host shows of `thing`: itself while live, null for a tombstone or the shell, undefined for a sparse record.
 * The shell is nothing stored, or deleted; a sparse record's body is not yet known. It is the default `select` of a box's query. Call it from a `select` of your own to start from what the default shows.
 * @example
 *   const title = useQuery({ ...sok.acme.box('openai'), select: (thing) => liveOf(thing)?.sidecar['title'] }).data
 */
export function liveOf<RecordT extends Sparse<ThingRecord>>(thing: RecordT | Tombstone<RecordT>): LiveOf<RecordT> | null | undefined {
  if (Thing.isTombstone(thing)) { return null }
  if (Thing.isSparse(thing))    { return undefined }
  return thing as LiveOf<RecordT>
}
// --

// == [The gate shown]: gateShownOf, liveGateOf, passkeyHeaderOf, wayinHeaderOf

// The bridge and the gate's query both put a gate into the host's React Query through this, so the host's cache never
// holds a wrapped bankKey. A gate is never deleted, so the only tombstone is the shell, which has no wayins.
/** The main gate as the host's React Query holds it: each wayin by its header, without the bankKey it wraps. */
export function gateShownOf(thing: GateRecord | Tombstone<GateRecord>): GateShown {
  if (Thing.isTombstone(thing)) { return Thing.sparseOf(thing) as Tombstone<HeaderedGate> }
  const { main, passkey0 } = thing.wayins
  return { ...thing, wayins: { main: wayinHeaderOf(main), passkey0: (passkey0 === null) ? null : wayinHeaderOf(passkey0) } } as HeaderedGate
}

// A headered gate fails the core's whole-gate check, which wants the wrapped bankKeys, so {@link liveOf} would read
// it as a shell.
/** The gate {@link gateShownOf} shows, or null for the shell of a bank not yet born: the default `select` of `useGate`. */
export function liveGateOf(gate: GateShown): HeaderedGate | null {
  return Thing.isTombstone(gate) ? null : gate
}

/** The header of the bank's passkey, or null while it has none or no bank is stored: a `select` of `useGate`. */
export function passkeyHeaderOf(gate: GateShown): PasskeyWayinHeader | null {
  return liveGateOf(gate)?.wayins.passkey0 ?? null
}

/** `wayin`'s header: its record, without the bankKey it wraps. */
function wayinHeaderOf(wayin: WayinRecord): WayinHeader {
  const { bank_key_wayin_wrapped: _wrapped, ...header } = wayin
  return header
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

// == [Keys]: formMutationKeyOf, boxQueryKeyOf, boxesQueryKeyUnder, boxListQueryKeyOf, gateQueryKeyOf

/** The host's React Query key for the mutation of the form verb `verb` in `userid`'s bank, `userid` null while nobody is signed in. */
export function formMutationKeyOf({ userid, banklabel, verb }: Readonly<{ userid: Userid | null, banklabel: string, verb: string }>): QueryKey {
  return ['sok', userid, banklabel, verb]
}

// While nobody is signed in, a hook still needs a key: one of no user's, `null` where the userid goes, whose fetch is
// skipped. It never matches a key the minder caches under.
/** The host's React Query key for the record of the box at `labelpath`: the key the bank's minder caches its item under, or one of no user's while `userid` is null. */
export function boxQueryKeyOf({ userid, banklabel, labelpath }: Readonly<{ userid: Userid | null, banklabel: string, labelpath: string }>): QueryKey {
  return (userid === null) ? ['sok', null, banklabel, labelpath] : ThingMinder.itemQueryKeyOf({ userid, banklabel, labelpath })
}

// An item's key is its labelpath's labels and then the mark '!', so the key less its mark starts the key of every box
// under it, and of none beside it.
/** The key that starts the host's React Query key of the box at `labelpath` and of every box under it: for `invalidateQueries`. While `userid` is null, the key that starts every one of no user's. */
export function boxesQueryKeyUnder({ userid, banklabel, labelpath }: Readonly<{ userid: Userid | null, banklabel: string, labelpath: string }>): QueryKey {
  return (userid === null) ? ['sok', null, banklabel] : ThingMinder.itemQueryKeyOf({ userid, banklabel, labelpath }).slice(0, -1)
}

// The minder's keys put the kind of entry before the labels, so no key that starts a box's also starts a listing's.
/** The host's React Query key for the listing of the root box's children: the key the bank's minder caches it under, or one of no user's while `userid` is null. */
export function boxListQueryKeyOf({ userid, banklabel }: Readonly<{ userid: Userid | null, banklabel: string }>): QueryKey {
  return (userid === null) ? ['sok', null, banklabel, 'box', '#', 'kids'] : ThingMinder.listQueryKeyOf({ userid, banklabel, labelpath: 'box' })
}

/** The host's React Query key for the bank's main gate: the key the bank's minder caches its item under, or one of no user's while `userid` is null. */
export function gateQueryKeyOf({ userid, banklabel }: Readonly<{ userid: Userid | null, banklabel: string }>): QueryKey {
  return (userid === null) ? ['sok', null, banklabel, Labelpath.MainGate] : ThingMinder.itemQueryKeyOf({ userid, banklabel, labelpath: Labelpath.MainGate })
}
// --
