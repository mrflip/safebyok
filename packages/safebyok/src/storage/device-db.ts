/** The deviceDB, which has each user's devicetok on this device and the lease record of each gate on it, shared by every tab. A subclass writes the `do*` calls. */

import { Crypto, Errors, type Helpers } from 'safebyok-big/internals'
import { BaseThing } from '../models/base-thing'
import * as Throwers from '../refusals/throwers'
import { type LeaseRecord, type LeaseScope, StampChecks } from '../shapes/shapes-stamps'
import { DeviceDBChecks, type LeaseListener } from '../shapes/shapes-device-db'
import { BankishChecks } from '../shapes/shapes-bankish'
import type { Devicetok, Userid } from '../shapes/primitives'

// == [The deviceDB]: DeviceDB

/** The base class of a device database: a subclass writes the `do*` calls, each one atomic step.
 * Anything but a refusal that a subclass throws reaches the caller as `storage_unavailable`, with nothing of the throw but its `name`,
 * since what it threw may quote a lease record (G8).
 */
export abstract class DeviceDB {
  // == [Lease verbs]: peekLease, stowLease, listen

  /** The lease record stored at `scope`, a lease's own, or null for none. Refuses `damaged_lease` when that record fails its checks. */
  async peekLease(scope: LeaseScope): Promise<LeaseRecord | null> {
    try {
      const { userid, banklabel, labelpath } = StampChecks.leaseScope.parse(scope)
      const raw = await this.doPeekLease({ userid, banklabel, labelpath })
      return (raw === null) ? null : checkedLeaseOf(raw)
    } catch (err) { throw refusalOf(err, 'peekLease') }
  }

  /** Stow `record` at its scope, its gate's, if it is newer than the ante lease record there, and answer the actual one.
   * - Newer means a later life, or a later revision of the same life: a record of the same life and revision is not newer, and is not stowed.
   * - An ante record that fails its checks is replaced by any record.
   * - Every listener of this database, in this tab or another, hears of each record stowed.
   */
  async stowLease(record: LeaseRecord): Promise<LeaseRecord> {
    try {
      const leaseRecord = StampChecks.leaseRecord.parse(record)
      const before      = await this.doStowLease(leaseRecord, (raw) => isReplaced(raw, leaseRecord))
      if (! isReplaced(before, leaseRecord)) { return checkedLeaseOf(before) }
      this.doRing({ userid: leaseRecord.userid, banklabel: leaseRecord.banklabel, labelpath: leaseRecord.labelpath })
      return leaseRecord
    } catch (err) { throw refusalOf(err, 'stowLease') }
  }

  /** Call `listener` with the lease record's scope each time one is stowed in this database, by this tab or another; answers a function that stops it.
   * It is called later, never inside the stow. A message on the bell that is not a lease record's scope is not passed on.
   */
  listen(listener: LeaseListener): () => void {
    const { listener: heard } = DeviceDBChecks.listenArgs.parse({ listener })
    try {
      return this.doListen((rung) => {
        const scopeReport = StampChecks.leaseScope.safeParse(rung)
        if (scopeReport.success) { heard(scopeReport.data) }
      })
    } catch (err) { throw refusalOf(err, 'listen') }
  }
  // --

  // == [Devicetok verbs]: ensureDevicetok

  /** The devicetok of the user `userid` on this device, the same for every tab given this database and every bank of the user, and another for each user.
   * It answers the actual one, or a fresh one, stowed now, where none is or the ante one fails its check.
   */
  async ensureDevicetok(userid: Userid): Promise<Devicetok> {
    try {
      const useridChecked = BankishChecks.userid.parse(userid)
      const made          = Crypto.randomId()
      const before        = await this.doStowDevicetok(useridChecked, made, isDevicetokReplaced)
      return isDevicetokReplaced(before) ? made : BankishChecks.devicetok.parse(before)
    } catch (err) { throw refusalOf(err, 'ensureDevicetok') }
  }
  // --

  // == [Protected, for a subclass to write]: doPeekLease, doStowLease, doRing, doListen, doStowDevicetok

  // A device database must start each call's work in the order of the calls: otherwise a `peekLease` made after a
  // `stowLease` may miss the record it stowed.
  /** The lease record stored at this scope, unchecked, or null. */
  protected abstract doPeekLease(scope: LeaseScope): Helpers.Awaitable<unknown>
  /** In one step: read the lease record stored at `record`'s scope, and put `record` there when `isReplaced` holds of what was read. Answer what was read, or null. */
  protected abstract doStowLease(record: LeaseRecord, isReplaced: (raw: unknown) => boolean): Helpers.Awaitable<unknown>
  /** Ring the bell for `scope`: call every listener of this database, in each tab, with it, each later than now. */
  protected abstract doRing(scope: LeaseScope): void
  /** Call `hear` with each scope the bell rings for until the function answered is called. */
  protected abstract doListen(hear: (rung: unknown) => void): () => void
  /** In one step: read the devicetok stored for the user `userid`, and put `devicetok` in its place when `isReplaced` holds of what was read. Answer what was read, or null. */
  protected abstract doStowDevicetok(userid: Userid, devicetok: Devicetok, isReplaced: (raw: unknown) => boolean): Helpers.Awaitable<unknown>
  // --
}
// --

// == [Helpers]: checkedLeaseOf, isReplaced, isDevicetokReplaced, refusalOf

/** The lease record `raw` as checked; refuses `damaged_lease` when it fails its checks. */
function checkedLeaseOf(raw: unknown): LeaseRecord {
  const leaseReport = StampChecks.leaseRecord.safeParse(raw)
  if (! leaseReport.success) { throw Throwers.damagedLease() }
  return leaseReport.data
}

/** True when `record` replaces `raw`, the ante lease record: none is stored, it fails its checks, or `record` is newer by life and revision. */
function isReplaced(raw: unknown, record: LeaseRecord): boolean {
  if (raw === null) { return true }
  const leaseReport = StampChecks.leaseRecord.safeParse(raw)
  return (! leaseReport.success) || (BaseThing.cmp(leaseReport.data, record) > 0)
}

/** True when `raw`, the ante devicetok, is replaced by a fresh one: none is stored, or it fails its check. */
function isDevicetokReplaced(raw: unknown): boolean { return ! BankishChecks.devicetok.safeParse(raw).success }

/** The refusal for a verb's throw: a refusal as it is, anything else as `storage_unavailable`, with nothing of it but its `name`. */
function refusalOf(thrown: unknown, oplabel: string): Errors.VaultError {
  return (Errors.isVaultError(thrown) ? thrown : Throwers.deviceDBFailed(oplabel, thrown))
}
// --
