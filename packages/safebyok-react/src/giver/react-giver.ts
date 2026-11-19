/** The giver: React hooks over one Device's banks. This tab's state comes from the Device; stored records come through the host's React Query. */

import { queryOptions, skipToken, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'
// eslint-disable-next-line import-x/no-extraneous-dependencies -- the giver is not yet exported, so nothing built reaches safebyok, which stays private until it is published
import { type Banklabel, type UserID, type carLivenessVals, Checkers } from 'safebyok'
import { bridgeDevice } from './react-bridge'

// == [What a giver asks of the Device]: BankStage, BankSnapshot, DeviceSnapshot, CarFields, GiverBank, GiverDevice

/** Where a bank stands in this tab: nobody signed in, starting, known to be not yet stored, ready, or failed to start. */
export type BankStage = 'signed_out' | 'starting' | 'unborn' | 'ready' | 'failed'

/** This tab's state of one bank: never stored, so no cache knows it. */
export type BankSnapshot = Readonly<{
  stage:       BankStage
  isLocked:    boolean
  /** When the lease ends and the bank locks itself, in epoch milliseconds; null while locked. */
  leaseEndsAt: number | null
  lastErr:     Error | null
}>

/** This tab's state of the Device: who is signed in, and each of their banks by banklabel. */
export type DeviceSnapshot = Readonly<{ userid: string | null, banks: Readonly<Record<string, BankSnapshot>> }>

/** The fields of a minder's car that the giver reads: how current the car is, and the fullest record known. */
export type CarFields = Readonly<{ liveness: (typeof carLivenessVals)[number], fullest: unknown }>

/** What the giver asks of a started bank object. */
export interface GiverBank<CarT extends CarFields> {
  readonly userid:    UserID
  readonly banklabel: Banklabel
  /** The car for the box at `labelpath`, asked of the vaultDB, never only the cache. An unborn bank answers the void car without asking. */
  getBoxCar(labelpath: string): Promise<CarT>
  /** Call `listener` with each box car the bank's minders cache, as merged. Returns the function that stops it. */
  listenBoxCars(listener: (labelpath: string, car: CarT) => void): () => void
}

/** What the giver asks of a Device. */
export interface GiverDevice<CarT extends CarFields> {
  readonly subscribe:         (listener: () => void) => () => void
  readonly getSnapshot:       () => DeviceSnapshot
  readonly getServerSnapshot: () => DeviceSnapshot
  /** The bank object for `banklabel`, started once. Refuses once `userid` is no longer the one signed in. */
  ensureBank(scope: Readonly<{ userid: string, banklabel: string }>): Promise<GiverBank<CarT>>
  /** Call `starter` with each bank object started now or later, and the function `starter` returns when that bank object ends. Returns the function that stops it. */
  onBankStart(starter: (bank: GiverBank<CarT>) => () => void): () => void
}
// --

// == [Checks]: Checks, isGiverDevice

const Checks = Checkers('bad_record', ({ custom, str }) => ({
  device:    custom<GiverDevice<CarFields>>(isGiverDevice, 'Expected a Device'),
  banklabel: str.min(1),
  labelpath: str.min(1),
}))

/** True when `val` has each call the giver makes of a Device. */
function isGiverDevice(val: unknown): boolean {
  if ((typeof val !== 'object') || (val === null)) { return false }
  const calls = ['subscribe', 'getSnapshot', 'getServerSnapshot', 'ensureBank', 'onBankStart'] as const
  return calls.every((callname) => typeof (val as Record<string, unknown>)[callname] === 'function')
}
// --

// == [The giver]: PendingBank, BoxRecordOpts, ReactGiver, BankGiver, makeReactGiver, makeBankGiver, boxCarQueryKey, bankQueryKey

// The bridge keeps each entry current, so none goes stale with time.
/** How long the host's entry of a car stays fresh: until the bridge replaces it. */
const CarStaleTime = Infinity

// isLocked is true in the safe state, so it is spelled out: a snapshot left out would read as unlocked.
/** What a bank's hooks report before the Device has heard of the bank. */
export const PendingBank: BankSnapshot = Object.freeze({ stage: 'signed_out', isLocked: true, leaseEndsAt: null, lastErr: null })

/** React Query's own options for `useBoxRecord`, less the key, the fetch and the `select` that picks the record. */
export type BoxRecordOpts<CarT extends CarFields> = Omit<UseQueryOptions<CarT, Error, CarT['fullest']>, 'queryKey' | 'queryFn' | 'select'>

/** What {@link makeReactGiver} returns. */
export type ReactGiver<CarT extends CarFields> = ReturnType<typeof makeReactGiver<CarT>>

/** What a giver's `forBank` returns. */
export type BankGiver<CarT extends CarFields> = ReturnType<typeof makeBankGiver<CarT>>

/** Make the React hooks for `device`. Make them once, at module scope, beside the Device: `export const Giver = makeReactGiver(device)`. */
export function makeReactGiver<CarT extends CarFields>(device: GiverDevice<CarT>) {
  Checks.device.parse(device)

  /** Keep the host's React Query entries of every bank's boxes current while mounted. Call it once, near the root, inside the host's `QueryClientProvider`. */
  function useBridge(): void {
    const client = useQueryClient()
    useEffect(() => bridgeDevice(client, device), [client])
  }

  return Object.freeze({
    useBridge,
    /** The hooks for one of the Device's banks. Name the result in PascalCase (`const Acme = Giver.forBank('acme')`), so the rules-of-hooks lint checks `Acme.useBoxRecord()`. */
    forBank: (banklabel: string) => makeBankGiver(device, Checks.banklabel.parse(banklabel)),
  })
}

/** The hooks for the bank at `banklabel`. */
function makeBankGiver<CarT extends CarFields>(device: GiverDevice<CarT>, banklabel: string) {
  /** This bank's slice of the Device's snapshot */
  function snapshotOf(): BankSnapshot { return device.getSnapshot().banks[banklabel] ?? PendingBank }

  /** This bank's slice of the Device's snapshot during a server render */
  function serverSnapshotOf(): BankSnapshot { return device.getServerSnapshot().banks[banklabel] ?? PendingBank }

  /** The signed-in user's id, re-rendering when it changes */
  function useUserid(): string | null {
    return useSyncExternalStore(device.subscribe, () => device.getSnapshot().userid, () => device.getServerSnapshot().userid)
  }

  /** The fetch of the car of the box at `labelpath`, for `userid`: none while nobody is signed in */
  function carQueryFnOf(userid: string | null, labelpath: string): typeof skipToken | (() => Promise<CarT>) {
    if (userid === null) { return skipToken }
    return async () => {
      const bank = await device.ensureBank({ userid, banklabel })
      return bank.getBoxCar(labelpath)
    }
  }

  /** This tab's state of the bank: its stage, whether it is locked, and when its lease ends. Synchronous: it never waits and never suspends.
   * Given `select`, it re-renders only when what `select` returns changes, which must be a field of the snapshot or a primitive, never a new object.
   */
  function useBankSnapshot(): BankSnapshot
  function useBankSnapshot<SelT>(select: (snap: BankSnapshot) => SelT): SelT
  function useBankSnapshot<SelT>(select?: (snap: BankSnapshot) => SelT): BankSnapshot | SelT {
    const pick = select ?? ((snap: BankSnapshot) => snap)
    return useSyncExternalStore(device.subscribe, () => pick(snapshotOf()), () => pick(serverSnapshotOf()))
  }

  /** The box's fullest record as stored, through React Query: `data` is the record to show, its whisper still sealed; null when none is stored or it was deleted; undefined while pending.
   * A record that a newer revision has overtaken shows until the newer one arrives. The giver's `useBridge` must be mounted for it to follow changes.
   */
  function useBoxRecord(labelpath: string, opts: BoxRecordOpts<CarT> = {}): UseQueryResult<CarT['fullest']> {
    const userid  = useUserid()
    const labelpathC = Checks.labelpath.parse(labelpath)
    return useQuery({
      staleTime: CarStaleTime,
      ...opts,
      queryKey:  boxCarQueryKey({ userid, banklabel, labelpath: labelpathC }),
      queryFn:   carQueryFnOf(userid, labelpathC),
      select:    fullestOf,
    })
  }

  /** React Query's options for the box's whole car, for a `useQuery`, `queryClient.query` or route loader of your own: `data` is the car, with the newest revision heard of beside the fullest record.
   * Built for whoever is signed in when it is called.
   */
  function boxCarQueryOptions(labelpath: string) {
    const { userid } = device.getSnapshot()
    const labelpathC = Checks.labelpath.parse(labelpath)
    return queryOptions({ queryKey: boxCarQueryKey({ userid, banklabel, labelpath: labelpathC }), queryFn: carQueryFnOf(userid, labelpathC), staleTime: CarStaleTime })
  }

  return Object.freeze({ useBankSnapshot, useBoxRecord, boxCarQueryOptions })
}

/** The fullest record a car holds */
function fullestOf<CarT extends CarFields>(car: CarT): CarT['fullest'] { return car.fullest }

/** The host's React Query key for the car of the box at `labelpath`. */
export function boxCarQueryKey({ userid, banklabel, labelpath }: Readonly<{ userid: string | null, banklabel: string, labelpath: string }>) {
  return ['safebyok', userid, banklabel, labelpath] as const
}

/** The key every one of a bank's entries in the host's React Query starts with. */
export function bankQueryKey({ userid, banklabel }: Readonly<{ userid: string | null, banklabel: string }>) {
  return ['safebyok', userid, banklabel] as const
}
// --
