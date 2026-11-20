/** The giver's types and checks: what it asks of a Device and of a started bank object, and the cars and events it reads. */

import type { QueryKey, UseQueryOptions } from '@tanstack/react-query'
// eslint-disable-next-line import-x/no-extraneous-dependencies -- the giver is not yet exported, so nothing built reaches safebyok, which stays private until it is published
import { type Banklabel, type DeviceSnapshot, type Userid, type carLivenessVals, Checkers } from 'safebyok'

// == [Types]: CarFields, GiverEvent, GiverBank, GiverDevice, BoxQueryOpts

/** The fields of a minder's car that the giver reads: how current the car is, its age, the box it is of, and the fullest record known. */
export type CarFields = Readonly<{
  liveness: (typeof carLivenessVals)[number]
  /** Of two cars of one box, the newer has the greater agerank, compared as strings. */
  agerank:  string
  newest:   Readonly<{ labelpath: string }>
  fullest:  unknown
}>

/** The fields the giver reads of a minder's event about a box's car. A minder's `ThingEvent` of a box has them all. */
export type GiverEvent<CarT extends CarFields> = Readonly<{
  type:     'updated' | 'removed'
  /** The key the minder caches the car under, and the host's key for it too. */
  queryKey: QueryKey
  state:    Readonly<{ data: CarT | undefined, dataUpdatedAt: number }>
}>

/** The calls the giver makes of a started bank object. */
export interface GiverBank<CarT extends CarFields> {
  /** The car for the box at `labelpath`: at once from a car the bank's minder holds timely, else asked of the vaultDB. An unborn bank answers the void car without asking. */
  getBoxCar(labelpath: string): Promise<CarT>
  /** Call `listener` with each event of the bank's minder about a box's car. Returns the function that stops it. */
  listenBoxCars(listener: (event: GiverEvent<CarT>) => void): () => void
}

/** The members the giver needs of a Device: its scope, its snapshot and subscribe, and its bank object. */
export interface GiverDevice<CarT extends CarFields> {
  readonly userid:      Userid
  readonly banklabel:   Banklabel
  /** Returns the same snapshot until something in it changes. Safe to pass unbound. */
  readonly getSnapshot: () => DeviceSnapshot
  /** Subscribes a listener to the snapshot, and returns its unsubscribe. Safe to pass unbound. */
  readonly subscribe:   (listener: () => void) => () => void
  /** The bank object, started once. */
  ensureBank(): Promise<GiverBank<CarT>>
  /** Call `starter` with each bank object started now or later, and the function `starter` returns when that bank object ends. Returns the function that stops it. */
  onBankStart(starter: (bank: GiverBank<CarT>) => () => void): () => void
}

/** React Query's options for a box's query, less the key and the fetch. Each one given replaces the giver's default. */
export type BoxQueryOpts<CarT extends CarFields, SelT> = Omit<UseQueryOptions<CarT, Error, SelT>, 'queryKey' | 'queryFn'>
// --

// == [Checks]: Checks, ScopeChecks

/** The checks of what a host hands the giver. */
export const Checks = Checkers('bad_record', ({ obj, fn, str, user_id, label }) => ({
  device:    obj({
    userid:      user_id,
    banklabel:   label,
    getSnapshot: fn(),
    subscribe:   fn(),
    ensureBank:  fn(),
    onBankStart: fn(),
  }),
  labelpath: str.min(1),
}))

/** The check that a banklabel names the Device's bank. */
export const ScopeChecks = Checkers('bad_scope', ({ obj, label }) => ({
  bankScoped: obj({ banklabel: label }),
}))
// --
