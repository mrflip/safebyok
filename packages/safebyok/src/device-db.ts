import type * as Z from 'zod'
import { DeviceRecord, DeviceRecordFormat, LeaseRecord } from './shapes/device'
import type { VaultScope } from './shapes/scopes'
import * as CX from './shapes/scopes'
import * as Scopepath from './scopepath'
import { VaultError, isVaultError } from './errors'
import { type Outcome, outcomeOf } from './outcome'
import { isStorageBlocked } from './refusals'
import { consistent } from './checks/validator'

/** Storage on this device for what it keeps of each vault: its lease, which survives a page reload, and its device record. Extend it, and implement its `do*` methods against your store.
 * Nothing here ever goes to the backend. A {@link LeaseRecord} holds a non-extractable leaseKey, a
 * CryptoKey with no JSON form, so a store keeps records by structured clone or in memory, never as
 * JSON. `memoryDeviceDB` and `idbDeviceDB` (from `safebyok/idb`) are the two supplied; the README's
 * *Your own storage adapter* shows a third, and `describeDeviceDB` (from `safebyok/testing`) checks
 * one.
 *
 * The public verbs are the base class's; never override them. Each is a try pair: `getLease`
 * resolves its answer or throws, and `tryGetLease` resolves the same as an {@link Outcome} and
 * never rejects. Each but `delAll` refuses 'bad_scope' for a scope whose names fail their checks
 * before your code sees it, and hands your `do*` method the row's {@link Scopepath}. A record read
 * back that fails its check reads as null, and is discarded through `doDelUnreadable`.
 *
 * A VaultError your code throws passes as it came, from either form; anything else it throws
 * becomes 'storage_blocked' where {@link isStorageBlocked} names it, else 'storage_unavailable',
 * that throw its `cause`, naming no scope and quoting no record. A throw from the base class's own
 * code that is no VaultError is a bug, which a `try` form resolves as 'unexpected_error' and a
 * throwing form throws as it came.
 *
 * **Calls land in the order they were made.** Each verb calls its `do*` method before it awaits
 * anything, so a store that starts each call's work in the order it is called keeps one scope's
 * calls in the order the vault made them, awaited or not: a lock's `tryDelLease`, made after a
 * grant's `tryPutLease`, must erase it. `doRaiseDeviceRecord` and `doDelUnreadable` each say what
 * else they owe.
 *
 * @example
 *   class SecureStoreDeviceDB extends DeviceDB {
 *     protected async doGetLease(leaseScopepath: Scopepath.LeaseScopepath): Promise<unknown> { return await shelf.get(leaseScopepath) }
 *     // ...and the rest of the `do*` methods alike
 *   }
 */
export abstract class DeviceDB {
  // == [Lease verbs]: getLease, putLease, delLease, their try forms

  /** Read the lease of one vault, or null for none. The core reads it through `KeptLease.tryGet`, which checks it and holds it closed; the vault judges whether it still fits.
   *
   * @example await deviceDB.getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
   */
  async getLease(scope: VaultScope): Promise<LeaseRecord | null> {
    const leaseScopepath = Scopepath.lease(scope)
    const raw = await storeAnswer('getLease', () => this.doGetLease(leaseScopepath))
    return await this.#parsedOrDel('getLease', LeaseRecord, leaseScopepath, raw)
  }

  /** The lease of one vault, or null, as an {@link Outcome}: the non-throwing form of {@link DeviceDB.getLease}.
   *
   * @example await deviceDB.tryGetLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // { ok: true, val: null }
   */
  tryGetLease(scope: VaultScope): Promise<Outcome<LeaseRecord | null>> {
    return outcomeOf(() => this.getLease(scope))
  }

  /** Store `record` as the lease of its vault, in place of any before, resolving the record as stored. */
  async putLease(record: LeaseRecord): Promise<LeaseRecord> {
    const leaseScopepath = Scopepath.lease(record)
    await storeAnswer('putLease', () => this.doPutLease(leaseScopepath, record))
    return record
  }

  /** The lease as stored, as an {@link Outcome}: the non-throwing form of {@link DeviceDB.putLease}. */
  tryPutLease(record: LeaseRecord): Promise<Outcome<LeaseRecord>> {
    return outcomeOf(() => this.putLease(record))
  }

  /** Erase the lease of one vault. */
  async delLease(scope: VaultScope): Promise<void> {
    const leaseScopepath = Scopepath.lease(scope)
    await storeAnswer('delLease', () => this.doDelLease(leaseScopepath))
  }

  /** The erase, as an {@link Outcome}: the non-throwing form of {@link DeviceDB.delLease}. */
  tryDelLease(scope: VaultScope): Promise<Outcome<void>> {
    return outcomeOf(() => this.delLease(scope))
  }
  // --

  // == [Device record verbs]: getDeviceRecord, raiseDeviceRecord, delDeviceRecord, delAll, their try forms

  /** Read this device's record of one scope, or null for none. The bank judges what it says.
   *
   * @example await deviceDB.getDeviceRecord({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })   // null
   */
  async getDeviceRecord(scope: VaultScope): Promise<DeviceRecord | null> {
    const deviceScopepath = Scopepath.device(scope)
    const raw = await storeAnswer('getDeviceRecord', () => this.doGetDeviceRecord(deviceScopepath))
    return await this.#parsedOrDel('getDeviceRecord', DeviceRecord, deviceScopepath, raw)
  }

  /** This device's record of one scope, or null, as an {@link Outcome}: the non-throwing form of {@link DeviceDB.getDeviceRecord}.
   *
   * @example await deviceDB.tryGetDeviceRecord({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })   // { ok: true, val: null }
   */
  tryGetDeviceRecord(scope: VaultScope): Promise<Outcome<DeviceRecord | null>> {
    return outcomeOf(() => this.getDeviceRecord(scope))
  }

  /** Store `record` as this device's record of its scope, never lowering what is stored, resolving the record as stored.
   * The store keeps what {@link raisedDeviceRecord} makes of the stored record and `record`, in one
   * transaction, so a tab that saw less never lowers what another saw.
   */
  async raiseDeviceRecord(record: DeviceRecord): Promise<DeviceRecord> {
    let raised = record
    const deviceScopepath = Scopepath.device(record)
    await storeAnswer('raiseDeviceRecord', () => this.doRaiseDeviceRecord(deviceScopepath, (stored) => {
      raised = raisedDeviceRecord(stored, record)
      return raised
    }))
    return raised
  }

  /** The device record as stored, as an {@link Outcome}: the non-throwing form of {@link DeviceDB.raiseDeviceRecord}. */
  tryRaiseDeviceRecord(record: DeviceRecord): Promise<Outcome<DeviceRecord>> {
    return outcomeOf(() => this.raiseDeviceRecord(record))
  }

  /** Erase this device's record of one scope. */
  async delDeviceRecord(scope: VaultScope): Promise<void> {
    const deviceScopepath = Scopepath.device(scope)
    await storeAnswer('delDeviceRecord', () => this.doDelDeviceRecord(deviceScopepath))
  }

  /** The erase, as an {@link Outcome}: the non-throwing form of {@link DeviceDB.delDeviceRecord}. */
  tryDelDeviceRecord(scope: VaultScope): Promise<Outcome<void>> {
    return outcomeOf(() => this.delDeviceRecord(scope))
  }

  /** Erase every lease and device record this store keeps. */
  async delAll(): Promise<void> {
    await storeAnswer('delAll', () => this.doDelAll())
  }

  /** The erase, as an {@link Outcome}: the non-throwing form of {@link DeviceDB.delAll}. */
  tryDelAll(): Promise<Outcome<void>> {
    return outcomeOf(() => this.delAll())
  }

  /** `raw`, the row `verb` fetched under `scopepath`, parsed by `recordSchema`: the record, or null for none, or for one that does not parse, which it deletes through `doDelUnreadable`. */
  async #parsedOrDel<RecordT>(verb: DeviceVerb, recordSchema: Z.ZodType<RecordT>, scopepath: string, raw: unknown): Promise<RecordT | null> {
    if (raw === undefined || raw === null) { return null }
    const checked = recordSchema.safeParse(raw)
    if (checked.success) { return checked.data }
    // A record written since the read is newer than what was found, and stays: the store checks
    // the row again in the step that deletes it.
    await storeAnswer(verb, () => this.doDelUnreadable(scopepath, (row) => recordSchema.safeParse(row).success))
    return null
  }
  // --

  // == [The half you write]: doGetLease, doPutLease, doDelLease, doGetDeviceRecord, doRaiseDeviceRecord, doDelDeviceRecord, doDelAll, doDelUnreadable

  // --------------------------------------------------------------------------- the half you write

  /** Read the row under `leaseScopepath` exactly as stored, undefined or null for none. */
  protected abstract doGetLease(leaseScopepath: Scopepath.LeaseScopepath): Promise<unknown>
  /** Store `record` under `leaseScopepath`, in place of any row there. */
  protected abstract doPutLease(leaseScopepath: Scopepath.LeaseScopepath, record: LeaseRecord): Promise<void>
  /** Delete the row under `leaseScopepath`, if any. */
  protected abstract doDelLease(leaseScopepath: Scopepath.LeaseScopepath): Promise<void>
  /** Read the row under `deviceScopepath` exactly as stored, undefined or null for none. */
  protected abstract doGetDeviceRecord(deviceScopepath: Scopepath.DeviceScopepath): Promise<unknown>
  /** Read the row under `deviceScopepath` (undefined for none), hand it to `raisedFrom`, and store what that returns, as one read-modify-write.
   * No write may land between the read and the write, or two tabs raising at once could lower each
   * other's record. A store that runs the transaction again on a conflict calls `raisedFrom` again,
   * with the row it then reads. Let a throw from `raisedFrom` abort the transaction.
   */
  protected abstract doRaiseDeviceRecord(deviceScopepath: Scopepath.DeviceScopepath, raisedFrom: (stored: unknown) => DeviceRecord): Promise<void>
  /** Delete the row under `deviceScopepath`, if any. */
  protected abstract doDelDeviceRecord(deviceScopepath: Scopepath.DeviceScopepath): Promise<void>
  /** Delete every lease and device record this store keeps. */
  protected abstract doDelAll(): Promise<void>
  /** Delete the row under `scopepath` if, and only if, `isReadable` is false of it as read in the same transaction that deletes it.
   * A write made since the base class found the row unreadable may have stored a good record, and
   * that record is never discarded. Hand `isReadable` the row exactly as stored, undefined for none.
   */
  protected abstract doDelUnreadable(scopepath: string, isReadable: (row: unknown) => boolean): Promise<void>
  // --
}

/** A verb of {@link DeviceDB}, by its throwing form's name: `getLease`, whose `try` form is `tryGetLease`. */
export type DeviceVerb = Exclude<keyof DeviceDB, `try${string}`>

/** A DeviceDB over a Map, which remembers nothing past the page: for tests, and wherever IndexedDB is missing or blocked.
 *
 * @example
 *   const deviceDB = memoryDeviceDB()
 *   await deviceDB.getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
 * @example
 *   await deviceDB.getDeviceRecord({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })   // null
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
 * none, or a row that fails its check -- gives way to `record` as it came.
 *
 * It builds a raised record afresh, checked, so it throws 'bad_record' when it must raise a stored
 * record to a `record` whose `highest_vault_epoch` fails its check. The core never hands a DeviceDB
 * such a record: only a host's own call can, and the throw aborts the raise's transaction.
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
 * Read every device record through it, so a record misfiled under another scope, or malformed,
 * never reaches a way in.
 *
 * @example deviceRecordFor(scope, await deviceDB.getDeviceRecord(scope))          // the record, or null
 * @example deviceRecordFor(scope, { ...record, user_id: 'someone-else' })             // null
 */
export const deviceRecordFor = (scope: VaultScope, answer: unknown): DeviceRecord | null => {
  const checked = DeviceRecord.safeParse(answer)
  if (! checked.success || ! consistent(checked.data, scope)) { return null }
  return checked.data
}

// == [Device trouble]: storeAnswer, DeviceTroubleSaid, deviceTrouble

/** Call the store's `hook`, one `do*` method of `verb`, resolving its answer: a VaultError it throws passes as it came, and anything else becomes the condition {@link deviceTrouble} makes of it. */
const storeAnswer = async <AnswerT>(verb: DeviceVerb, hook: () => Promise<AnswerT>): Promise<AnswerT> => {
  try {
    return await hook()
  } catch (err) {
    throw isVaultError(err) ? err : deviceTrouble(verb, err)
  }
}

/** For each device-store verb, what failed and what it leaves undone, and what the user may do instead of trying again, if anything. */
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
