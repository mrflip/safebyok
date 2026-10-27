import type * as Z from 'zod'
import { DeviceRecord, DeviceRecordFormat, LeaseRecord, type VaultScope } from './types/types'
import * as CX from './checks/core-checks'
import * as Scopepath from './scopepath'
import { sameScope } from './names'
import { VaultError } from './errors'
import { type Outcome, outcomeOf } from './outcome'
import { isStorageBlocked } from './refusals'

/** Storage on this device for what it keeps of each vault: its lease, which survives a page reload, and its device record. Extend it, and implement its `do*` methods against your store.
 * A {@link LeaseRecord} holds a non-extractable leaseKey, a CryptoKey with no JSON form. So a
 * store keeps records by structured clone (IndexedDB: `safebyok/idb`) or in memory. Nothing here
 * ever goes to the backend. `memoryDeviceDB` and `idbDeviceDB` are the two supplied.
 *
 * The public verbs are the base class's; never override them. For each:
 *
 *  * It resolves an {@link Outcome} and never rejects. A VaultError your `do*` method throws passes
 *    as it came. Anything else it throws is a condition, that error its `cause`: 'storage_blocked'
 *    for one {@link isStorageBlocked} names (a browser's `SecurityError`, `QuotaExceededError` or
 *    `NotSupportedError`), and 'storage_unavailable' for any other. Neither message names a scope
 *    or quotes a record.
 *  * It files each row under its {@link Scopepath}, refusing 'bad_scope' for a scope whose names
 *    fail their checks before your code sees it. Your `do*` methods are handed scopepaths, and
 *    never build one.
 *  * A record read back that fails its check reads as null, and is discarded through
 *    {@link DeviceDB.doDelUnreadable}: a lost lease asks for the passphrase again, and a lost
 *    device record checks the vault afresh. The vault checks whatever `getLease` hands back, and
 *    the bank and the vault whatever `getDeviceRecord` and `raiseDeviceRecord` do: a record of
 *    another scope reads as none.
 *
 * **Calls land in the order they were made.** One scope's calls take effect in the order the
 * vault made them, whether or not it awaited each: a `putLease` followed by a `delLease` leaves no
 * lease, and a `delLease` followed by a `putLease` leaves the one written. A lock's `delLease`,
 * made after a grant's `putLease`, must erase it. Each verb calls its `do*` method at once, before
 * it awaits anything, so a store that starts each call's work in the order it is called keeps
 * this. `describeDeviceDB` (from `safebyok/testing`) checks it.
 *
 * @example
 *   class SecureStoreDeviceDB extends DeviceDB {
 *     protected async doGetLease(leaseScopepath: Scopepath.LeaseScopepath): Promise<unknown> { return await shelf.get(leaseScopepath) }
 *     // ...and the rest of the `do*` methods alike
 *   }
 */
export abstract class DeviceDB {
  // == [Lease verbs]: getLease, putLease, delLease

  /** The lease record for one vault, or null for none, or for one that fails its check, which is discarded. The vault judges whether it still fits.
   *
   * @example await deviceDB.getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // { ok: true, val: null }
   */
  getLease(scope: VaultScope): Promise<Outcome<LeaseRecord | null>> {
    return deviceOutcomeOf('getLease', async () => {
      const leaseScopepath = Scopepath.lease(scope)
      const raw = await this.doGetLease(leaseScopepath)
      return await this.#readableOf(LeaseRecord, leaseScopepath, raw)
    })
  }

  /** Keep `record` as the lease of its vault, in place of any before, resolving the record as stored. */
  putLease(record: LeaseRecord): Promise<Outcome<LeaseRecord>> {
    return deviceOutcomeOf('putLease', async () => {
      await this.doPutLease(Scopepath.lease(record), record)
      return record
    })
  }

  /** Erase the lease of one vault: how a lock revokes it, and how a lease that no longer fits is discarded. */
  delLease(scope: VaultScope): Promise<Outcome<void>> {
    return deviceOutcomeOf('delLease', async () => { await this.doDelLease(Scopepath.lease(scope)) })
  }
  // --

  // == [Device record verbs]: getDeviceRecord, raiseDeviceRecord, delDeviceRecord, delAll

  /** This device's record of one scope, or null for none, or for one that fails its check, which is discarded. The bank judges what it says.
   *
   * @example await deviceDB.getDeviceRecord({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })   // { ok: true, val: null }
   */
  getDeviceRecord(scope: VaultScope): Promise<Outcome<DeviceRecord | null>> {
    return deviceOutcomeOf('getDeviceRecord', async () => {
      const deviceScopepath = Scopepath.device(scope)
      const raw = await this.doGetDeviceRecord(deviceScopepath)
      return await this.#readableOf(DeviceRecord, deviceScopepath, raw)
    })
  }

  /** Keep `record` as this device's record of its scope, raised and never lowered, resolving the record as stored.
   * In one transaction of the store's: where a record of the scope is stored, it keeps its
   * `device_id` and the higher of the two `highest_vault_epoch`s, so a tab that saw less never
   * lowers what another saw; where none is, or one that fails its check, `record` is stored as it
   * came.
   */
  raiseDeviceRecord(record: DeviceRecord): Promise<Outcome<DeviceRecord>> {
    return deviceOutcomeOf('raiseDeviceRecord', async () => {
      let raised = record
      await this.doRaiseDeviceRecord(Scopepath.device(record), (stored) => {
        raised = raisedDeviceRecord(stored, record)
        return raised
      })
      return raised
    })
  }

  /** Erase this device's record of one scope, as `bank.clearCachedVault` does. */
  delDeviceRecord(scope: VaultScope): Promise<Outcome<void>> {
    return deviceOutcomeOf('delDeviceRecord', async () => { await this.doDelDeviceRecord(Scopepath.device(scope)) })
  }

  /** Remove every lease and device record on this device: the device's part of a full reset. */
  delAll(): Promise<Outcome<void>> {
    return deviceOutcomeOf('delAll', async () => { await this.doDelAll() })
  }

  /** `raw`, a row `do*` read under `scopepath`, through `recordSchema`: the record, or null for none, or for one that fails, discarded only while it still fails. */
  async #readableOf<RecordT>(recordSchema: Z.ZodType<RecordT>, scopepath: string, raw: unknown): Promise<RecordT | null> {
    if (raw === undefined || raw === null) { return null }
    const checked = recordSchema.safeParse(raw)
    if (checked.success) { return checked.data }
    // A record written since the read is newer than what was found, and stays: the store checks
    // the row again in the step that deletes it.
    await this.doDelUnreadable(scopepath, (row) => recordSchema.safeParse(row).success)
    return null
  }
  // --

  // == [The half you write]: doGetLease, doPutLease, doDelLease, doGetDeviceRecord, doRaiseDeviceRecord, doDelDeviceRecord, doDelAll, doDelUnreadable

  // --------------------------------------------------------------------------- the half you write

  /** The row under `leaseScopepath` exactly as stored, or undefined or null for none. The base class checks it. */
  protected abstract doGetLease(leaseScopepath: Scopepath.LeaseScopepath): Promise<unknown>
  /** Store `record` under `leaseScopepath`, in place of any row there. */
  protected abstract doPutLease(leaseScopepath: Scopepath.LeaseScopepath, record: LeaseRecord): Promise<void>
  /** Delete the row under `leaseScopepath`, if any. */
  protected abstract doDelLease(leaseScopepath: Scopepath.LeaseScopepath): Promise<void>
  /** The row under `deviceScopepath` exactly as stored, or undefined or null for none. The base class checks it. */
  protected abstract doGetDeviceRecord(deviceScopepath: Scopepath.DeviceScopepath): Promise<unknown>
  /** Read the row under `deviceScopepath` (undefined for none), hand it to `raisedFrom`, and store what that returns, all in one transaction.
   * Two tabs raising at once must never lower each other's record, so no write may land between
   * the read and the write. A store that runs the transaction again on a conflict calls
   * `raisedFrom` again, with the row it then reads. Let a throw from `raisedFrom` abort the
   * transaction.
   */
  protected abstract doRaiseDeviceRecord(deviceScopepath: Scopepath.DeviceScopepath, raisedFrom: (stored: unknown) => DeviceRecord): Promise<void>
  /** Delete the row under `deviceScopepath`, if any. */
  protected abstract doDelDeviceRecord(deviceScopepath: Scopepath.DeviceScopepath): Promise<void>
  /** Delete every row this store keeps: every lease and device record. */
  protected abstract doDelAll(): Promise<void>
  /** Delete the row under `scopepath` if, and only if, `isReadable` is false of it as read in the same transaction that deletes it.
   * A read found the row unreadable some moments ago, and a write made after the read may have
   * stored a good record since: that record is never discarded. Hand `isReadable` the row exactly
   * as stored, undefined for none.
   */
  protected abstract doDelUnreadable(scopepath: string, isReadable: (row: unknown) => boolean): Promise<void>
  // --
}

/** A verb of {@link DeviceDB}. */
export type DeviceVerb = keyof DeviceDB

/** A DeviceDB over a Map, which remembers nothing past the page: for tests, and wherever IndexedDB is missing or blocked.
 * It files rows under their {@link Scopepath}, and refuses 'bad_scope' alike for a scope whose names
 * fail their checks. A malformed record reads as null, and is discarded.
 *
 * @example
 *   const deviceDB = memoryDeviceDB()
 *   await deviceDB.getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // { ok: true, val: null }
 * @example
 *   await deviceDB.getDeviceRecord({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })   // { ok: true, val: null }
 */
export const memoryDeviceDB = (): DeviceDB => new MemoryDeviceDB()

/** The DeviceDB {@link memoryDeviceDB} makes: each `do*` method does its whole work in one synchronous step, which is its transaction. */
class MemoryDeviceDB extends DeviceDB {
  /** Every row, a lease or a device record, under its scopepath. */
  readonly #rows = new Map<string, unknown>()

  protected doGetLease(leaseScopepath: Scopepath.LeaseScopepath): Promise<unknown> {
    return Promise.resolve(this.#rows.get(leaseScopepath))
  }

  protected doPutLease(leaseScopepath: Scopepath.LeaseScopepath, record: LeaseRecord): Promise<void> {
    this.#rows.set(leaseScopepath, record)
    return Promise.resolve()
  }

  protected doDelLease(leaseScopepath: Scopepath.LeaseScopepath): Promise<void> {
    this.#rows.delete(leaseScopepath)
    return Promise.resolve()
  }

  protected doGetDeviceRecord(deviceScopepath: Scopepath.DeviceScopepath): Promise<unknown> {
    return Promise.resolve(this.#rows.get(deviceScopepath))
  }

  protected doRaiseDeviceRecord(deviceScopepath: Scopepath.DeviceScopepath, raisedFrom: (stored: unknown) => DeviceRecord): Promise<void> {
    this.#rows.set(deviceScopepath, raisedFrom(this.#rows.get(deviceScopepath)))
    return Promise.resolve()
  }

  protected doDelDeviceRecord(deviceScopepath: Scopepath.DeviceScopepath): Promise<void> {
    this.#rows.delete(deviceScopepath)
    return Promise.resolve()
  }

  protected doDelAll(): Promise<void> {
    this.#rows.clear()
    return Promise.resolve()
  }

  protected doDelUnreadable(scopepath: string, isReadable: (row: unknown) => boolean): Promise<void> {
    if (! isReadable(this.#rows.get(scopepath))) { this.#rows.delete(scopepath) }
    return Promise.resolve()
  }
}

/** The device record a {@link DeviceDB.raiseDeviceRecord} stores, given what is stored under its scopepath (`stored`, as read, unchecked) and the `record` handed to it.
 * Where `stored` is a device record of the same scope, it keeps its `device_id`, and the higher
 * `highest_vault_epoch` of the two: a lower one never replaces a higher. Anything else stored --
 * none, or a row that fails its check -- gives way to `record` as it came. The base class hands
 * it to the store's `doRaiseDeviceRecord`, which calls it inside the one transaction that reads
 * and writes the row.
 *
 * It builds a raised record afresh, checked, so it throws 'bad_record' when it must raise a stored
 * record to a `record` whose `highest_vault_epoch` fails its check. The core never hands a DeviceDB
 * such a record: only a host's own call can, and the throw aborts that transaction.
 *
 * @example raisedDeviceRecord(undefined, record)                                    // record
 * @example raisedDeviceRecord({ ...record, highest_vault_epoch: 5 }, { ...record, highest_vault_epoch: 3 }).highest_vault_epoch   // 5
 */
export const raisedDeviceRecord = (stored: unknown, record: DeviceRecord): DeviceRecord => {
  const checked = DeviceRecord.safeParse(stored)
  if (! checked.success || Scopepath.device(checked.data) !== Scopepath.device(record)) { return record }
  const kept = checked.data
  if (kept.highest_vault_epoch >= record.highest_vault_epoch) { return kept }
  return deviceRecordOf(kept, kept.device_id, record.highest_vault_epoch)
}

/** The device record of `scope` holding `device_id` and `highest_vault_epoch`, frozen: built from the scope's parsed names, so nothing else `scope` carries is stored.
 * Throws 'bad_scope' for a scope that fails its check, and 'bad_record' for a `device_id` or an
 * epoch that does.
 *
 * @example deviceDB.raiseDeviceRecord(deviceRecordOf(vault, deviceId, vaultEpoch))   // a Vault object passes as its scope
 */
export const deviceRecordOf = (scope: VaultScope, device_id: string, highest_vault_epoch: number): DeviceRecord => {
  const { applabel, user_id, vaultlabel } = CX.vaultScope.parse(scope)
  return DeviceRecord.parse({ format: DeviceRecordFormat, applabel, user_id, vaultlabel, device_id, highest_vault_epoch })
}

/** `answer`, a device record a DeviceDB handed back for `scope`, checked: the record, or null for one that fails its check or names another scope, as for none.
 * The bank and the vault read every device record through it, as they read a lease through
 * `Lease.make`: a record misfiled under another scope, or malformed, never reaches a way in, and
 * the raise that follows starts the record again under its own scope.
 *
 * @example deviceRecordFor(scope, valOf(await deviceDB.getDeviceRecord(scope)))   // the record, or null
 * @example deviceRecordFor(scope, { ...record, user_id: 'someone-else' })             // null
 */
export const deviceRecordFor = (scope: VaultScope, answer: unknown): DeviceRecord | null => {
  const checked = DeviceRecord.safeParse(answer)
  if (! checked.success || ! sameScope(checked.data, scope)) { return null }
  return checked.data
}

// == [Device trouble]: deviceOutcomeOf, DeviceTroubleSaid, deviceTrouble

/** The outcome of `body`, one verb of the device store: a VaultError it throws passes as it came, and anything else becomes the condition {@link deviceTrouble} makes of it. */
const deviceOutcomeOf = <ValT>(verb: DeviceVerb, body: () => Promise<ValT>): Promise<Outcome<ValT>> => (
  outcomeOf(body, (thrown) => deviceTrouble(verb, thrown))
)

/** What failed, for each device-store verb, and what it leaves undone; and what the user may do instead of trying again, if anything. */
const DeviceTroubleSaid: Record<DeviceVerb, { failed: string, instead?: string }> = {
  getLease: { failed: "reading the lease it keeps for this vault, so the vault could not take it up", instead: "unlock with a vault unlocker (the passphrase or passkey)" },
  putLease: { failed: "writing the lease it keeps for this vault, so this device may ask for the passphrase again at the next open" },
  delLease: { failed: "erasing the lease it keeps for this vault, so the next vault made on this device, as at the next page load, may still take it up" },
  getDeviceRecord:   { failed: "reading its record of this vault (the newest copy of the vault it has seen), so the vault could not check storage against it" },
  raiseDeviceRecord: { failed: "writing its record of this vault (the newest copy of the vault it has seen), so it may not be kept" },
  delDeviceRecord:   { failed: "erasing its record of this vault, so it still holds the newest copy of the vault it had seen" },
  delAll:   { failed: "erasing everything it keeps for safebyok, so some of it may remain" },
}

/** The condition a failure of the device store's `verb` becomes, `thrown` its cause: 'storage_blocked' for what {@link isStorageBlocked} names, else 'storage_unavailable', naming no scope and quoting no record. */
const deviceTrouble = (verb: DeviceVerb, thrown: unknown): VaultError => {
  const { failed, instead } = DeviceTroubleSaid[verb]
  if (isStorageBlocked(thrown)) {
    const meanwhile = instead === undefined ? '' : `: ${instead} instead`
    return new VaultError('storage_blocked', `This browser does not let the app keep anything on this device -- storage blocked for this site, a private window or frame that withholds it, or no room left -- so it failed ${failed}. Trying again will not help until that changes${meanwhile}. The device store's error is this error's cause.`, { cause: thrown })
  }
  const retry = instead === undefined ? 'try again' : `try again, or ${instead}`
  return new VaultError('storage_unavailable', `This device's own storage failed ${failed}: ${retry}. If it fails every time, this device may not let the app keep anything: storage blocked or full, or a private window. The device store's error is this error's cause.`, { cause: thrown })
}
// --
