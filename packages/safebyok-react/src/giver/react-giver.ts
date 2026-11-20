/** The giver: React hooks over a Device and its bank. This tab's state comes from the Device; stored records come through the host's React Query. */

import { type Query, type QueryKey, queryOptions, replaceEqualDeep, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'
// eslint-disable-next-line import-x/no-extraneous-dependencies -- the giver is not yet exported, so nothing built reaches safebyok, which stays private until it is published
import { type BankSnapshot, type DeviceSnapshot, type OpenGatingSnapshot, ThingMinder, dbHasNewer } from 'safebyok'
import { bridgeDevice } from './react-bridge'
import { type BoxQueryOpts, type CarFields, type GiverDevice, Checks, ScopeChecks } from './shapes-giver'

// == [Snapshots]: PendingBank, ServerSnapshot

// isLocked is true in the safe state, so it is spelled out: a snapshot left out would read as unlocked.
/** What a bank's hooks report before the Device holds a bank object: signed in, and the bank not yet started. */
export const PendingBank: BankSnapshot = Object.freeze({
  stage: 'starting', isLocked: true, isEnded: false, endCause: null, leaseEndsAt: null, lastErr: null,
})

/** What the hooks report during a server render and while hydrating: no bank object, and no gating open. */
const ServerSnapshot: DeviceSnapshot = Object.freeze({ bank: null, gating: null })
// --

// == [Query defaults]: carQueryDefaults, carStaleTimeOf, newerCarOf, isCar, fullestOf

// A design note, pinned (the Coach, 2026-11-19): a host may override anything the giver supplies here (the keys, each of
// these defaults, and the `select` that picks `fullest`), so nothing in the giver may depend on one staying in place. The
// bridge copies each car into the host's entry whatever that entry's options say.
/** The giver's defaults for the query of a box's car in the host's React Query. */
function carQueryDefaults<CarT extends CarFields>() {
  return {
    // The fetch asks the bank's minder, not the network, and the minder answers from its cache while offline.
    networkMode:       'always',
    staleTime:         carStaleTimeOf<CarT>,
    structuralSharing: newerCarOf,
  } as const
}

/** Fresh until the bridge replaces the car, unless the vaultDB is known to hold a newer revision than the car's fullest record. */
function carStaleTimeOf<CarT extends CarFields>(entry: Query<CarT, Error, CarT>): number {
  const car = entry.state.data
  return ((car !== undefined) && dbHasNewer(car)) ? 0 : Infinity
}

// TanStack shares structure through this both between a query's cars and between what `select` returns from them, so a
// value that is not a car takes TanStack's own default. When a hook's key changes, it shares the last key's selected value
// with the new key's, so cars of two boxes take the default too: their agerank says nothing of which to show. A box's cars
// never go back, so the newer car holds everything the older one does, and nothing needs merging. Without this, a fetch
// that read an older car and resolved after the bridge copied a newer one would put the older car back.
/** Of `prior` and `next`, cars of one box, the car with the greater agerank, `prior` on a tie; anything else, as TanStack's `replaceEqualDeep`. */
function newerCarOf(prior: unknown, next: unknown): unknown {
  if (! (isCar(prior) && isCar(next) && (prior.newest.labelpath === next.newest.labelpath))) { return replaceEqualDeep(prior, next) }
  return (next.agerank > prior.agerank) ? next : prior
}

/** True when `val` carries an agerank and its newest record's labelpath, as every car does. */
function isCar(val: unknown): val is CarFields {
  const car = val as Partial<CarFields> | null
  return (typeof car === 'object') && (car !== null) && (typeof car.agerank === 'string') && (typeof car.newest?.labelpath === 'string')
}

/** The fullest record a car holds */
function fullestOf<CarT extends CarFields>(car: CarT): CarT['fullest'] { return car.fullest }
// --

// == [The giver]: ReactGiver, BankGiver, makeReactGiver, makeBankGiver

/** What {@link makeReactGiver} returns. */
export type ReactGiver<CarT extends CarFields> = ReturnType<typeof makeReactGiver<CarT>>

/** What a giver's `forBank` returns. */
export type BankGiver<CarT extends CarFields> = ReturnType<typeof makeBankGiver<CarT>>

/** React hooks for `device`. Make them once, at module scope, beside the Device.
 * The objects the host's vaultDB answers with are frozen as they land, so a vaultDB must never change an object once it has answered with it.
 * @example export const Giver = makeReactGiver(device)
 */
export function makeReactGiver<CarT extends CarFields>(device: GiverDevice<CarT>) {
  Checks.device.parse(device)

  /** Keeps the host's React Query entries of the bank's boxes current while mounted. Call it once, near the root, inside the host's `QueryClientProvider`. */
  function useBridge(): void {
    const client = useQueryClient()
    useEffect(() => bridgeDevice(client, device), [client])
  }

  /** The gating open on the Device, for a dialog to render, or null for none. Synchronous: it never waits and never suspends. */
  function useGating(): OpenGatingSnapshot | null {
    return useSyncExternalStore(device.subscribe, () => device.getSnapshot().gating, () => ServerSnapshot.gating)
  }

  return Object.freeze({
    useBridge,
    useGating,
    /** The hooks for the Device's bank; any other banklabel is refused. Name the result in PascalCase (`const Acme = Giver.forBank('acme')`), so the rules-of-hooks lint checks `Acme.useBoxRecord()`. */
    forBank: (banklabel: string) => {
      ScopeChecks.bankScoped.parseConsistent({ banklabel }, { banklabel: device.banklabel })
      return makeBankGiver(device)
    },
  })
}

/** The hooks for `device`'s bank. */
function makeBankGiver<CarT extends CarFields>(device: GiverDevice<CarT>) {
  /** This tab's state of the bank: its stage, whether it is locked, and when its lease ends. Synchronous: it never waits and never suspends.
   * Given `select`, it re-renders only when what `select` returns changes, which must be a field of the snapshot or a primitive, never a new object.
   */
  function useBankSnapshot(): BankSnapshot
  function useBankSnapshot<SelT>(select: (snap: BankSnapshot) => SelT): SelT
  function useBankSnapshot<SelT>(select?: (snap: BankSnapshot) => SelT): BankSnapshot | SelT {
    const pick = select ?? ((snap: BankSnapshot) => snap)
    return useSyncExternalStore(device.subscribe, () => pick(device.getSnapshot().bank ?? PendingBank), () => pick(PendingBank))
  }

  /** React Query's options for the box's whole car, for a `useQuery`, `queryClient.query` or route loader of your own: `data` is the car, the newest revision heard of beside the fullest record.
   * Its defaults keep the car fresh until the bridge copies a newer one, stale while the vaultDB holds a newer revision, fetching while offline, and never replaced by an older car. Any may be overridden.
   */
  function boxCarQueryOptions(labelpath: string) {
    const labelpathC = Checks.labelpath.parse(labelpath)
    return queryOptions({
      ...carQueryDefaults<CarT>(),
      queryKey: boxCarQueryKey({ userid: device.userid, banklabel: device.banklabel, labelpath: labelpathC }),
      queryFn:  async () => {
        const bank = await device.ensureBank()
        return bank.getBoxCar(labelpathC)
      },
    })
  }

  /** The box's fullest record as stored, through React Query: `data` is the record to show, its whisper still sealed; null when none is stored or it was deleted; undefined while pending.
   * A record that a newer revision has overtaken shows until the newer one arrives. The giver's `useBridge` must be mounted for it to follow changes.
   * `opts` are React Query's own, over {@link boxCarQueryOptions}'s; a `select` given there is handed the whole car.
   */
  function useBoxRecord<SelT = CarT['fullest']>(labelpath: string, opts: BoxQueryOpts<CarT, SelT> = {}): UseQueryResult<SelT> {
    return useQuery({ ...boxCarQueryOptions(labelpath), select: fullestOf as (car: CarT) => SelT, ...opts })
  }

  return Object.freeze({ useBankSnapshot, useBoxRecord, boxCarQueryOptions })
}
// --

// == [Keys]: boxCarQueryKey, bankQueryKey

/** The host's React Query key for the car of the box at `labelpath`: the key the bank's minder caches it under. */
export function boxCarQueryKey(scope: Readonly<{ userid: string, banklabel: string, labelpath: string }>): QueryKey {
  return ThingMinder.queryKeyOf(scope)
}

/** The key every one of a bank's entries in the host's React Query starts with. */
export function bankQueryKey(scope: Readonly<{ userid: string, banklabel: string }>): QueryKey {
  return ThingMinder.bankQueryKeyOf(scope)
}
// --
