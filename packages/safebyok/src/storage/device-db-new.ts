/** The deviceDB: what the slim models cache on this device, a lease for each vault and one device record for the bank, and every invariant of the verbs. A subclass writes only the generic `do*` calls, each one atomic step. */

import { isVaultError } from '../errors'
import { type Outcome, outcomeOf } from '../outcome'
import * as Refuse from './device-db-refusals'
import * as DS from './device-db-shapes'
import type { VaultScope } from '../shapes/scopes'
import type { DeviceRecord, LeaseQuery, LeaseRow, LeaseSparse } from './device-db-shapes'

export type Awaitable<ValT> = ValT | Promise<ValT>

/** `born` for the first record of a bank scope, `held` for one already cached, which stands, and `rewrote` for a damaged one written over: bad news for the bank. `record` is what the device now holds. */
export type DeviceCached = { act: 'born' | 'held' | 'rewrote', record: DeviceRecord }

/** SLOPDOC: The base of a deviceDB: calls land in the order made, and no verb returns or logs a `lease_key`. */
export abstract class DeviceDB {
  // == [Generic calls]: doCache, doPeek, doVacate, doLeasesProvedBefore, doCacheDeviceRecord

  /** Stores `row` as the lease of its vault scope, over any row there. */
  protected abstract doCache(row: LeaseRow): Awaitable<void>
  /** The row stored at this vault scope, whatever its `vault_tok`, or null. */
  protected abstract doPeek(scope: VaultScope): Awaitable<unknown>
  /** Removes the row at this vault scope when it holds this `vault_tok`, in one step. */
  protected abstract doVacate(asked: LeaseQuery): Awaitable<void>
  /** Every row whose `proved_at` is under `cutoff`, oldest first: an index range scan. */
  protected abstract doLeasesProvedBefore(cutoff: number): Awaitable<unknown[]>
  /** In one step, stores `record` at its bank scope unless `isHeld` accepts the row stored there, and resolves that row, or null for none. */
  protected abstract doCacheDeviceRecord(record: DeviceRecord, isHeld: (stored: unknown) => boolean): Awaitable<unknown>
  // --

  // == [Lease verbs]: cache, peek, vacate, leasesProvedBefore, tryCache, tryPeek, tryVacate, tryLeasesProvedBefore

  /** Caches the lease row for its vault, in place of any before. */
  async cache(row: LeaseRow): Promise<void> {
    const leaseRow = DS.leaseRow.parse(row)
    await adapted('cache', () => this.doCache(leaseRow))
  }

  /** The row cached for this vault under this `vault_tok`, or null: a row of another `vault_tok`, or one failing its check, is no row. */
  async peek(asked: LeaseQuery): Promise<LeaseRow | null> {
    const leaseQuery = DS.leaseQuery.parse(asked)
    const stored = await adapted('peek', () => this.doPeek(leaseQuery))
    const parsed = DS.leaseRow.safeParse(stored)
    return (parsed.success && parsed.data.vault_tok === leaseQuery.vault_tok) ? parsed.data : null
  }

  /** Erases the row cached for this vault under this `vault_tok`; none is a no-op, and a row of another `vault_tok` stays. */
  async vacate(asked: LeaseQuery): Promise<void> {
    const leaseQuery = DS.leaseQuery.parse(asked)
    await adapted('vacate', () => this.doVacate(leaseQuery))
  }

  /** The cached leases, of any vault, proved before `cutoff`, oldest first, as scope, `vault_tok` and `proved_at` only. */
  async leasesProvedBefore(cutoff: number): Promise<LeaseSparse[]> {
    const before = DS.cutoff.parse(cutoff)
    const rows = await adapted('leasesProvedBefore', () => this.doLeasesProvedBefore(before))
    return rows.flatMap((row) => { const parsed = DS.leaseSparse.safeParse(row); return parsed.success ? [parsed.data] : [] })
  }

  tryCache(row: LeaseRow): Promise<Outcome<void>> { return outcomeOf(() => this.cache(row)) }
  tryPeek(asked: LeaseQuery): Promise<Outcome<LeaseRow | null>> { return outcomeOf(() => this.peek(asked)) }
  tryVacate(asked: LeaseQuery): Promise<Outcome<void>> { return outcomeOf(() => this.vacate(asked)) }
  tryLeasesProvedBefore(cutoff: number): Promise<Outcome<LeaseSparse[]>> { return outcomeOf(() => this.leasesProvedBefore(cutoff)) }
  // --

  // == [Device record verbs]: cacheDeviceRecord, tryCacheDeviceRecord

  /** Caches the bank scope's device record unless a good one is there: the first `device_id` cached is the bank's. A damaged record is written over, `rewrote`. */
  async cacheDeviceRecord(record: DeviceRecord): Promise<DeviceCached> {
    const wanted = DS.deviceRecord.parse(record)
    const ante = await adapted('cacheDeviceRecord', () => this.doCacheDeviceRecord(wanted, (stored) => DS.deviceRecord.safeParse(stored).success))
    if (ante === null) { return { act: 'born', record: wanted } }
    const held = DS.deviceRecord.safeParse(ante)
    return held.success ? { act: 'held', record: held.data } : { act: 'rewrote', record: wanted }
  }

  tryCacheDeviceRecord(record: DeviceRecord): Promise<Outcome<DeviceCached>> { return outcomeOf(() => this.cacheDeviceRecord(record)) }
  // --
}

/** A store call: what it throws that is no refusal of its own is `storage_unavailable`, naming the verb. */
const adapted = async <ValT>(call: string, thunk: () => Awaitable<ValT>): Promise<ValT> => {
  try { return await thunk() } catch (err) { throw (isVaultError(err) ? err : Refuse.storeFailed(call, err)) }
}
