import { DeviceRecord, DeviceRecordFormat, LeaseRecord } from './shapes/device'
import type { VaultScope } from './shapes/scopes'
import * as CX from './shapes/scopes'
import * as Scopepath from './scopepath'
import { sameScope } from './names'
import { VaultError } from './errors'
import { type Outcome, isOutcomeShaped, outcomeOf, valOf } from './outcome'
import { isStorageBlocked } from './refusals'

/** Storage on this device for what it keeps of each vault: its lease, which survives a page reload, and its device record.
 * A {@link LeaseRecord} holds a non-extractable leaseKey, a CryptoKey with no JSON form. So an
 * adapter keeps records by structured clone (IndexedDB: `safebyok/idb`) or in memory. Nothing here
 * ever goes to the backend.
 *
 * Every verb resolves an {@link Outcome} and never rejects: wrap each body in {@link
 * deviceOutcomeOf}. A vault guards a host's DeviceDB all the same, and says a throw as a condition.
 *
 * An adapter may answer a damaged or unreadable record with null rather than refuse. That is the
 * safe failure: a lost lease asks for the passphrase again, and a lost device record checks the
 * vault afresh. The vault checks whatever `getLease` hands back, and the bank and the vault
 * whatever `getDeviceRecord` and `raiseDeviceRecord` do: a record of another scope reads as none.
 *
 * **Calls land in the order they were made.** One scope's calls take effect in the order the
 * vault made them, whether or not it awaited each: a `putLease` followed by a `delLease` leaves no
 * lease, a `delLease` followed by a `putLease` leaves the one written, and a `getLease` that
 * finds a record it cannot read never discards one a later `putLease` has written. A lock's
 * `delLease`, made after a grant's `putLease`, must erase it. `describeDeviceDB` checks it.
 */
export interface DeviceDB {
  /** The lease record for one vault, or null for none. The vault judges whether it still fits. */
  getLease(scope: VaultScope): Promise<Outcome<LeaseRecord | null>>
  /** Keep `record` as the lease of its vault, in place of any before, resolving the record as stored. */
  putLease(record: LeaseRecord): Promise<Outcome<LeaseRecord>>
  /** Erase the lease of one vault: how a lock revokes it, and how a lease that no longer fits is discarded. */
  delLease(scope: VaultScope): Promise<Outcome<void>>
  /** This device's record of one scope, or null for none. The bank judges what it says. */
  getDeviceRecord(scope: VaultScope): Promise<Outcome<DeviceRecord | null>>
  /** Keep `record` as this device's record of its scope, raised and never lowered, resolving the record as stored.
   * In one transaction: where a record stands, it keeps its `device_id` and the higher of the two
   * `highest_vault_epoch`s, so a tab that saw less never lowers what another saw; where none
   * stands, `record` is stored as it came. {@link raisedDeviceRecord} is that rule.
   */
  raiseDeviceRecord(record: DeviceRecord): Promise<Outcome<DeviceRecord>>
  /** Erase this device's record of one scope, as `bank.clearCachedVault` does. */
  delDeviceRecord(scope: VaultScope): Promise<Outcome<void>>
  /** Remove every lease and device record on this device: the device's part of a full reset. */
  delAll(): Promise<Outcome<void>>
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
export const memoryDeviceDB = (): DeviceDB => {
  const leases = new Map<Scopepath.LeaseScopepath, LeaseRecord>()
  const records = new Map<Scopepath.DeviceScopepath, DeviceRecord>()
  return {
    getLease: (scope) => deviceOutcomeOf('getLease', () => {
      const kept = leases.get(Scopepath.lease(scope))
      if (kept === undefined) { return null }
      const checked = LeaseRecord.safeParse(kept)
      // A malformed record reads as "no lease": losing the convenience is the safe failure.
      if (! checked.success) {
        leases.delete(Scopepath.lease(scope))
        return null
      }
      return checked.data
    }),

    putLease: (record) => deviceOutcomeOf('putLease', () => {
      leases.set(Scopepath.lease(record), record)
      return record
    }),

    delLease: (scope) => deviceOutcomeOf('delLease', () => { leases.delete(Scopepath.lease(scope)) }),

    getDeviceRecord: (scope) => deviceOutcomeOf('getDeviceRecord', () => {
      const kept = records.get(Scopepath.device(scope))
      if (kept === undefined) { return null }
      const checked = DeviceRecord.safeParse(kept)
      // A malformed record reads as none, as on a device that never saw the vault.
      if (! checked.success) {
        records.delete(Scopepath.device(scope))
        return null
      }
      return checked.data
    }),

    raiseDeviceRecord: (record) => deviceOutcomeOf('raiseDeviceRecord', () => {
      const deviceScopepath = Scopepath.device(record)
      const raised = raisedDeviceRecord(records.get(deviceScopepath), record)
      records.set(deviceScopepath, raised)
      return raised
    }),

    delDeviceRecord: (scope) => deviceOutcomeOf('delDeviceRecord', () => { records.delete(Scopepath.device(scope)) }),

    delAll: () => deviceOutcomeOf('delAll', () => {
      leases.clear()
      records.clear()
    }),
  }
}

/** The device record a {@link DeviceDB.raiseDeviceRecord} stores, given what stands under its scopepath (`stored`, as read, unchecked) and the `record` handed to it.
 * Where `stored` is a device record of the same scope, it keeps its `device_id`, and the higher
 * `highest_vault_epoch` of the two: a lower one never replaces a higher. Anything else stored --
 * none, or a row that fails its check -- gives way to `record` as it came. A DeviceDB of your own
 * calls it inside the one transaction that reads and writes the row.
 *
 * It builds a raised record afresh, checked, so it throws 'bad_record' when it must raise a stored
 * record to a `record` whose `highest_vault_epoch` fails its check. The core never hands a DeviceDB
 * such a record: only a host's own call can, so let the throw abort that transaction.
 *
 * @example raisedDeviceRecord(undefined, record)                                    // record
 * @example raisedDeviceRecord({ ...record, highest_vault_epoch: 5 }, { ...record, highest_vault_epoch: 3 }).highest_vault_epoch   // 5
 */
export const raisedDeviceRecord = (stored: unknown, record: DeviceRecord): DeviceRecord => {
  const checked = DeviceRecord.safeParse(stored)
  if (! checked.success || Scopepath.device(checked.data) !== Scopepath.device(record)) { return record }
  const standing = checked.data
  if (standing.highest_vault_epoch >= record.highest_vault_epoch) { return standing }
  return deviceRecordOf(standing, standing.device_id, record.highest_vault_epoch)
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

// == [Device trouble]: deviceOutcomeOf, deviceTroubleAsConditions, DeviceTroubleSaid, deviceTrouble

/** The outcome of one verb of a device store you write yourself: wrap each verb's body in it, as a {@link DeviceDB} must answer.
 * A VaultError the body throws passes as it came. Anything else it throws becomes a condition,
 * that error its `cause`. It is 'storage_blocked' for an error {@link isStorageBlocked} names,
 * and 'storage_unavailable' for any other. Neither message names a scope or quotes a record.
 *
 * @param verb - The DeviceDB verb answering, which the message names.
 *
 * @example getDeviceRecord: (scope) => deviceOutcomeOf('getDeviceRecord', () => myStore.read(Scopepath.device(scope)))   // { ok: true, val: the record, or null }
 * @example await deviceOutcomeOf('delDeviceRecord', () => myStore.erase(Scopepath.device(scope)))   // site data blocked (a SecurityError): { ok: false, err } of 'storage_blocked', "...will not help until that changes..."
 */
export const deviceOutcomeOf = <ValT>(verb: DeviceVerb, body: () => ValT | Promise<ValT>): Promise<Outcome<ValT>> => (
  outcomeOf(body, (thrown) => deviceTrouble(verb, thrown))
)

/** `deviceDB` guarded, as a vault and `delDamagedVault` call a host's device store: each verb answers one Outcome whatever the store does.
 * A throw, a rejection, or a bad outcome whose `err` is no VaultError, becomes what {@link
 * deviceOutcomeOf} makes of a failure. An answer that is no Outcome refuses 'bad_option'.
 *
 * @example await deviceTroubleAsConditions(deviceDB).getDeviceRecord(scope)  // a failing IndexedDB: 'storage_unavailable', "...failed reading its record of this vault..."
 * @example await deviceTroubleAsConditions(deviceDB).getDeviceRecord(scope)  // site data blocked (a SecurityError): 'storage_blocked', "...will not help until that changes..."
 */
export const deviceTroubleAsConditions = (deviceDB: DeviceDB): DeviceDB => ({
  getLease: (...args) => guarded('getLease', () => deviceDB.getLease(...args)),
  putLease: (...args) => guarded('putLease', () => deviceDB.putLease(...args)),
  delLease: (...args) => guarded('delLease', () => deviceDB.delLease(...args)),
  getDeviceRecord:   (...args) => guarded('getDeviceRecord', () => deviceDB.getDeviceRecord(...args)),
  raiseDeviceRecord: (...args) => guarded('raiseDeviceRecord', () => deviceDB.raiseDeviceRecord(...args)),
  delDeviceRecord:   (...args) => guarded('delDeviceRecord', () => deviceDB.delDeviceRecord(...args)),
  delAll:   (...args) => guarded('delAll', () => deviceDB.delAll(...args)),
})

/** One guarded call of {@link deviceTroubleAsConditions}: `call`'s outcome, checked to be one. */
const guarded = <ValT>(verb: DeviceVerb, call: () => Promise<Outcome<ValT>>): Promise<Outcome<ValT>> => (
  deviceOutcomeOf(verb, async () => {
    const answer: unknown = await call()
    if (! isOutcomeShaped(answer)) {
      throw new VaultError('bad_option', `deviceDB's ${verb} answered with something that is no Outcome: a DeviceDB's verbs resolve { ok: true, val } or { ok: false, err }, as memoryDeviceDB's and idbDeviceDB's do.`)
    }
    return valOf(answer as Outcome<ValT>)
  })
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

/** The condition a failure of the device store's `verb` becomes, `thrown` its cause, as {@link deviceOutcomeOf} says. */
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
