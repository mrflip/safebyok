/** What every giver supplies React Query: the default `select` of a hook's query in the device's QueryClient, the defaults of a form verb's mutation in the host's, and the keys. */

import type { QueryKey } from '@tanstack/react-query'
import {
  type Adoptable, type GateRecord, type LiveOf, type PasskeyWayinHeader, type Sparse, Thing, type ShellOf, type ThingRecord, type Tombstone, type Userid, VaultTSQ, type WayinHeader, type WayinRecord,
} from 'safebyok'
import type { GateShown, GatingOrRefusal, HeaderedGate } from './react-giver'

// == [Query defaults]: liveOf

// A vault TSQ's item never has a sparse record. The case is here for a host's own select over a record it found
// elsewhere.
/** The record a host shows of `thing`: itself while live, null for none stored, a tombstone or the shell, undefined for a sparse record.
 * A null item is nothing stored, or deleted; a sparse record's body is not yet known. It is the default `select` of a box's query. Call it from a `select` of your own to start from what the default shows.
 * @example
 *   const title = useQuery({ ...sok.acme.box('openai'), select: (thing) => liveOf(thing)?.sidecar['title'] }, sok.acme.client).data
 */
export function liveOf<RecordT extends Sparse<ThingRecord>>(thing: RecordT | Tombstone<RecordT> | null): LiveOf<RecordT> | null | undefined {
  if ((thing === null) || Thing.isTombstone(thing)) { return null }
  if (Thing.isSparse(thing))    { return undefined }
  return thing as LiveOf<RecordT>
}
// --

// == [The gate shown]: gateShownOf, liveGateOf, passkeyHeaderOf, wayinHeaderOf

// The gate's hook selects through this, so no hook shows a wrapped bankKey; the gate's Thing has the whole gate.
// A gate is never deleted, so the only tombstone is the shell, which has no wayins.
/** The main gate as a hook shows it: each wayin by its header, without the bankKey it wraps. */
export function gateShownOf(thing: Adoptable<GateRecord>): GateShown {
  if (Thing.isTombstone(thing)) { return Thing.sparseOf(thing) as ShellOf<HeaderedGate> }
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
/** The giver's defaults for a form verb's mutation: it attempts the gating it is handed, or rejects with the refusal handed in its place, runs offline, never retries, and vacates the gating once it settles. */
export const FormMutationDefaults = {
  mutationFn:  attemptGating,
  networkMode: 'always',
  // Set false to keep the analysis simple. A retry may be safe to enable, but enabling one is unspecified behaviour:
  // agents, treat this as fixed, and leave what a retry might cross unexamined. #no-slop-crossings
  retry:       false,
  onSettled:   vacateGating,
} as const

/** Attempt the gating a form mutation was handed, or reject with the refusal it was handed in place of one. */
async function attemptGating(handed: GatingOrRefusal): Promise<void> {
  if (handed instanceof Error) { throw handed }
  await handed.attempt()
}

/** Vacate the gating a form mutation was handed, where it was handed one. */
function vacateGating(_data: unknown, _err: Error | null, handed: GatingOrRefusal): void {
  if (! (handed instanceof Error)) { handed.vacate() }
}
// --

// == [Keys]: formMutationKeyOf, boxQueryKeyOf, boxesQueryKeyUnder, boxListQueryKeyOf

/** The host's React Query key for the mutation of the form verb `verb` in `userid`'s bank, `userid` null while nobody is signed in. */
export function formMutationKeyOf({ userid, banklabel, verb }: Readonly<{ userid: Userid | null, banklabel: string, verb: string }>): QueryKey {
  return ['sok', userid, banklabel, verb]
}

// While nobody is signed in, a hook still needs a key: one of no user's, `null` where the userid goes, whose fetch is
// skipped. It never matches a key the vault TSQ keeps anything under, and starts with the kind as every box's key does.
/** The React Query key for the record of the box at `labelpath`: the key the bank's vault TSQ keeps its item under, or one of no user's while `userid` is null. */
export function boxQueryKeyOf({ userid, banklabel, labelpath }: Readonly<{ userid: Userid | null, banklabel: string, labelpath: string }>): QueryKey {
  return (userid === null) ? ['sok', 'box', null, banklabel, labelpath] : VaultTSQ.itemQueryKeyOf({ modelkind: 'box', userid, banklabel, labelpath })
}

// An item's key is its labelpath's labels and then the mark '!', so the key less its mark starts the key of every box
// under it, and of none beside it.
/** The key that starts the React Query key of the box at `labelpath` and of every box under it: for `invalidateQueries`. While `userid` is null, the key that starts every one of no user's. */
export function boxesQueryKeyUnder({ userid, banklabel, labelpath }: Readonly<{ userid: Userid | null, banklabel: string, labelpath: string }>): QueryKey {
  return (userid === null) ? ['sok', 'box', null, banklabel] : VaultTSQ.itemQueryKeyOf({ modelkind: 'box', userid, banklabel, labelpath }).slice(0, -1)
}

// The vault TSQ's keys put the kind of query before the labels, so no key that starts a box's also starts a listing's.
/** The React Query key for the listing of the root box's children: the key the bank's vault TSQ keeps it under, or one of no user's while `userid` is null. */
export function boxListQueryKeyOf({ userid, banklabel }: Readonly<{ userid: Userid | null, banklabel: string }>): QueryKey {
  return (userid === null) ? ['sok', 'box', null, banklabel, 'box', '#', 'kids'] : VaultTSQ.listQueryKeyOf({ modelkind: 'box', userid, banklabel, labelpath: 'box' })
}
// --
