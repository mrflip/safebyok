/** The deviceDB: what the slim models cache on this device, a lease for each vault, and every invariant of the verbs. A subclass writes only the generic `do*` calls, each one atomic step. */

import type { Awaitable } from '../helpers/helpers'
import { isVaultError } from '../refusals/errors'
import { type Outcome, outcomeOf } from '../refusals/outcome'
import * as Refuse from '../refusals/throwers'
import type { VaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import type { LeaseDated, LeaseQuery, LeaseRow } from '../shapes/shapes-storage'

/** SLOPDOC: A deviceDB's base: calls reach the store in order, only `peek` answers a `lease_key`, no verb logs one. */
export abstract class DeviceDB {
  // == [Lease verbs]: cache, tryCache, peek, tryPeek, vacate, tryVacate, leasesProvedBefore, tryLeasesProvedBefore

  /** Caches the lease row for its vault, in place of any before. */
  async cache(row: LeaseRow): Promise<void> {
    const leaseRow = SX.leaseRow.parse(row)
    await adapted('cache', () => this.doCache(leaseRow))
  }

  tryCache(row: LeaseRow): Promise<Outcome<void>> { return outcomeOf(() => this.cache(row)) }

  /** The row cached for this vault under this `vault_tok`, or null: a row of another `vault_tok`, or one failing its check, is no row. */
  async peek(asked: LeaseQuery): Promise<LeaseRow | null> {
    const leaseQuery = SX.leaseQuery.parse(asked)
    const stored = await adapted('peek', () => this.doPeek(leaseQuery))
    const parsed = SX.leaseRow.safeParse(stored)
    return (parsed.success && parsed.data.vault_tok === leaseQuery.vault_tok) ? parsed.data : null
  }

  tryPeek(asked: LeaseQuery): Promise<Outcome<LeaseRow | null>> { return outcomeOf(() => this.peek(asked)) }

  /** Erases the row cached for this vault under this `vault_tok`; none is a no-op, and a row of another `vault_tok` stays. */
  async vacate(asked: LeaseQuery): Promise<void> {
    const leaseQuery = SX.leaseQuery.parse(asked)
    await adapted('vacate', () => this.doVacate(leaseQuery))
  }

  tryVacate(asked: LeaseQuery): Promise<Outcome<void>> { return outcomeOf(() => this.vacate(asked)) }

  /** The cached leases, of any vault, proved before `cutoff`, oldest first, as scope, `vault_tok` and `proved_at` only. */
  async leasesProvedBefore(cutoff: number): Promise<LeaseDated[]> {
    const before = SX.cutoff.parse(cutoff)
    const rows = await adapted('leasesProvedBefore', () => this.doLeasesProvedBefore(before))
    return rows.flatMap((row) => { const parsed = SX.leaseDated.safeParse(row); return parsed.success ? [parsed.data] : [] })
  }

  tryLeasesProvedBefore(cutoff: number): Promise<Outcome<LeaseDated[]>> { return outcomeOf(() => this.leasesProvedBefore(cutoff)) }
  // --

  // == [Protected, for a subclass to write]: doCache, doPeek, doVacate, doLeasesProvedBefore

  // A store starts each call's work in the order called, or a `vacate` made after a `cache` may not erase it.
  /** Stores `row` as the lease of its vault scope, over any row there. */
  protected abstract doCache(row: LeaseRow): Awaitable<void>
  /** The row stored at this vault scope, whatever its `vault_tok`, or null. */
  protected abstract doPeek(scope: VaultScope): Awaitable<unknown>
  /** Removes the row at this vault scope when it holds this `vault_tok`, in one step. */
  protected abstract doVacate(asked: LeaseQuery): Awaitable<void>
  /** Every row whose `proved_at` is under `cutoff`, oldest first: an index range scan. */
  protected abstract doLeasesProvedBefore(cutoff: number): Awaitable<unknown[]>
  // --
}

/** A store call: what it throws that is no refusal of its own is `storage_unavailable`, naming the verb. */
const adapted = async <ValT>(call: string, thunk: () => Awaitable<ValT>): Promise<ValT> => {
  try { return await thunk() } catch (err) { throw (isVaultError(err) ? err : Refuse.storeFailed(call, err)) }
}
