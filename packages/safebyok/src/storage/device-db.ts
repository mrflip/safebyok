/** The deviceDB, which keeps the lease row of each bank on this device, shared by every tab. A subclass writes the `do*` calls. */

import { Errors, type Helpers } from 'safebyok-big/internals'
import { BaseThing } from '../models/base-thing'
import * as Throwers from '../refusals/throwers'
import { type BankScope, type LeaseRow, StampChecks } from '../shapes/shapes-stamps'
import { DeviceDBChecks, type LeaseListener } from '../shapes/shapes-device-db'

// == [The deviceDB]: DeviceDB

/** The base class of a device database: a subclass writes the `do*` calls, each one atomic step.
 * Anything but a refusal that a subclass throws reaches the caller as `storage_unavailable`, keeping only the thrown `name`,
 * since what it threw may quote a lease row (G8).
 */
export abstract class DeviceDB {
  // == [Lease verbs]: peekLease, stowLease, listen

  /** The lease row stored for `scope`'s bank, or null for none. Refuses `damaged_lease` when the row stored fails its checks. */
  async peekLease(scope: BankScope): Promise<LeaseRow | null> {
    try {
      const { userid, banklabel } = StampChecks.bankScope.parse(scope)
      const raw = await this.doPeekLease({ userid, banklabel })
      return (raw === null) ? null : storedRowOf(raw)
    } catch (err) { throw refusalOf(err, 'peekLease') }
  }

  /** Store `row` for its bank if it is newer than the row stored there, and answer the row stored afterward.
   * - Newer means a later life, or a later revision of the same life: a row of the same life and revision is not newer, and is not stored.
   * - A row stored that fails its checks is replaced by any row.
   * - Every listener of this database, in this tab or another, hears of each row stored.
   */
  async stowLease(row: LeaseRow): Promise<LeaseRow> {
    try {
      const leaseRow = StampChecks.leaseRow.parse(row)
      const before   = await this.doStowLease(leaseRow, (raw) => isReplaced(raw, leaseRow))
      if (! isReplaced(before, leaseRow)) { return storedRowOf(before) }
      this.doRing({ userid: leaseRow.userid, banklabel: leaseRow.banklabel })
      return leaseRow
    } catch (err) { throw refusalOf(err, 'stowLease') }
  }

  /** Call `listener` with the bank's scope each time a lease row is stored in this database, by this tab or another; answers a function that stops it.
   * It is called later, never inside the stow. A message on the bell that is not a bank's scope is not passed on.
   */
  listen(listener: LeaseListener): () => void {
    const { listener: heard } = DeviceDBChecks.listenArgs.parse({ listener })
    return this.doListen((rung) => {
      const scopeReport = StampChecks.bankScope.safeParse(rung)
      if (scopeReport.success) { heard(scopeReport.data) }
    })
  }
  // --

  // == [Protected, for a subclass to write]: doPeekLease, doStowLease, doRing, doListen

  // A device database must start each call's work in the order of the calls: otherwise a `peekLease` made after a
  // `stowLease` may miss the row it stored.
  /** The row stored at this bank scope, unchecked, or null. */
  protected abstract doPeekLease(scope: BankScope): Helpers.Awaitable<unknown>
  /** In one step: read the row stored at `row`'s bank scope, and put `row` there when `isReplaced` holds of what was read. Answer what was read, or null. */
  protected abstract doStowLease(row: LeaseRow, isReplaced: (raw: unknown) => boolean): Helpers.Awaitable<unknown>
  /** Ring the bell for `scope`: call every listener of this database, in each tab, with it, each later than now. */
  protected abstract doRing(scope: BankScope): void
  /** Call `hear` with each scope the bell rings for until the function answered is called. */
  protected abstract doListen(hear: (rung: unknown) => void): () => void
  // --
}
// --

// == [Helpers]: storedRowOf, isReplaced, refusalOf

/** The lease row `raw` as checked; refuses `damaged_lease` when it fails its checks. */
function storedRowOf(raw: unknown): LeaseRow {
  const storedReport = StampChecks.leaseRow.safeParse(raw)
  if (! storedReport.success) { throw Throwers.damagedLease() }
  return storedReport.data
}

/** True when `row` replaces `raw`, the row stored: none is stored, it fails its checks, or `row` is newer by life and revision. */
function isReplaced(raw: unknown, row: LeaseRow): boolean {
  if (raw === null) { return true }
  const storedReport = StampChecks.leaseRow.safeParse(raw)
  return (! storedReport.success) || (BaseThing.cmp(storedReport.data, row) > 0)
}

/** The refusal for a verb's throw: a refusal as it is, anything else as `storage_unavailable`, keeping only its `name`. */
function refusalOf(thrown: unknown, oplabel: string): Errors.VaultError {
  return (Errors.isVaultError(thrown) ? thrown : Throwers.deviceDBFailed(oplabel, thrown))
}

// --
