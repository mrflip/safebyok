import { DeviceMark, LeaseRecord, type VaultScope } from './types'
import * as Ckeys from './ckeys'
import { VaultError } from './errors'
import { type Outcome, isOutcomeShaped, outcomeOf, valOf } from './outcome'
import { isStorageBlocked } from './refusals'

/** Storage on this device for what it keeps of each vault: its lease, which survives a page reload, and its device mark.
 * A {@link LeaseRecord} holds a non-extractable leaseKey, a CryptoKey with no JSON form. So an
 * adapter keeps records by structured clone (IndexedDB: `safebyok/idb`) or in memory. Nothing here
 * ever goes to the backend.
 *
 * Every verb resolves an {@link Outcome} and never rejects: wrap each body in {@link
 * deviceOutcomeOf}. A vault guards a host's DeviceDB all the same, and says a throw as a condition.
 *
 * An adapter may answer a damaged or unreadable record with null rather than refuse. That is the
 * safe failure: a lost lease asks for the passphrase again, and a lost mark checks the vault
 * afresh. The vault checks whatever `getLease` and `getMark` hand back.
 */
export interface DeviceDB {
  /** The lease record for one vault, or null for none. The vault judges whether it still fits. */
  getLease(scope: VaultScope): Promise<Outcome<LeaseRecord | null>>
  /** Keep `record` as the lease of its vault, in place of any before. */
  putLease(record: LeaseRecord): Promise<Outcome<void>>
  /** Erase the lease of one vault: how a lock revokes it, and how a lease that no longer fits is discarded. */
  delLease(scope: VaultScope): Promise<Outcome<void>>
  /** This device's mark for one vault, or null for none. The vault judges what it says. */
  getMark(scope: VaultScope): Promise<Outcome<DeviceMark | null>>
  /** Keep `mark` as this device's mark for its vault, in place of any before. */
  putMark(mark: DeviceMark): Promise<Outcome<void>>
  /** Erase this device's mark for one vault, as `del()` and `delDamagedVault` do.
   * A host accepting storage restored from an older copy on purpose, after `rolled_back`, calls it.
   */
  delMark(scope: VaultScope): Promise<Outcome<void>>
  /** Remove every lease and device mark on this device: the device's part of a full reset. */
  delAll(): Promise<Outcome<void>>
}

/** A verb of {@link DeviceDB}. */
export type DeviceVerb = keyof DeviceDB

/** A DeviceDB over a Map, which remembers nothing past the page: for tests, and wherever IndexedDB is missing or blocked.
 * It files rows under {@link Ckeys}, and refuses alike a name holding `^`. A malformed record reads
 * as null, and is discarded.
 *
 * @example
 *   const deviceDB = memoryDeviceDB()
 *   await deviceDB.getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // { ok: true, val: null }
 * @example
 *   await deviceDB.getMark({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })   // { ok: true, val: null }
 */
export const memoryDeviceDB = (): DeviceDB => {
  const leases = new Map<string, LeaseRecord>()
  const marks = new Map<string, DeviceMark>()
  return {
    getLease: (scope) => deviceOutcomeOf('getLease', () => {
      const kept = leases.get(Ckeys.lease(scope))
      if (kept === undefined) { return null }
      const checked = LeaseRecord.safeParse(kept)
      // A malformed record reads as "no lease": losing the convenience is the safe failure.
      if (! checked.success) {
        leases.delete(Ckeys.lease(scope))
        return null
      }
      return checked.data
    }),

    putLease: (record) => deviceOutcomeOf('putLease', () => { leases.set(Ckeys.lease(record), record) }),

    delLease: (scope) => deviceOutcomeOf('delLease', () => { leases.delete(Ckeys.lease(scope)) }),

    getMark: (scope) => deviceOutcomeOf('getMark', () => {
      const kept = marks.get(Ckeys.mark(scope))
      if (kept === undefined) { return null }
      const checked = DeviceMark.safeParse(kept)
      // A malformed mark reads as none, as on a device that never saw the vault.
      if (! checked.success) {
        marks.delete(Ckeys.mark(scope))
        return null
      }
      return checked.data
    }),

    putMark: (mark) => deviceOutcomeOf('putMark', () => { marks.set(Ckeys.mark(mark), mark) }),

    delMark: (scope) => deviceOutcomeOf('delMark', () => { marks.delete(Ckeys.mark(scope)) }),

    delAll: () => deviceOutcomeOf('delAll', () => {
      leases.clear()
      marks.clear()
    }),
  }
}

// == [Device trouble]: deviceOutcomeOf, deviceTroubleAsConditions, DeviceTroubleSaid, deviceTrouble

/** The outcome of one verb of a device store you write yourself: wrap each verb's body in it, as a {@link DeviceDB} must answer.
 * A VaultError the body throws passes as it came. Anything else it throws becomes a condition,
 * that error its `cause`. It is 'storage_blocked' for an error {@link isStorageBlocked} names,
 * and 'storage_unavailable' for any other. Neither message names a scope or quotes a record.
 *
 * @param verb - The DeviceDB verb answering, which the message names.
 *
 * @example getMark: (scope) => deviceOutcomeOf('getMark', () => myStore.read(markCkeyOf(scope)))   // { ok: true, val: the record, or null }
 * @example await deviceOutcomeOf('putMark', () => myStore.write(ckey, mark))   // site data blocked (a SecurityError): { ok: false, err } of 'storage_blocked', "...will not help until that changes..."
 */
export const deviceOutcomeOf = <ValT>(verb: DeviceVerb, body: () => ValT | Promise<ValT>): Promise<Outcome<ValT>> => (
  outcomeOf(body, (thrown) => deviceTrouble(verb, thrown))
)

/** `deviceDB` guarded, as a vault and `delDamagedVault` call a host's device store: each verb answers one Outcome whatever the store does.
 * A throw, a rejection, or a bad outcome whose `err` is no VaultError, becomes what {@link
 * deviceOutcomeOf} makes of a failure. An answer that is no Outcome refuses 'bad_option'.
 *
 * @example await deviceTroubleAsConditions(deviceDB).getMark(scope)  // a failing IndexedDB: 'storage_unavailable', "...failed reading its mark of this vault..."
 * @example await deviceTroubleAsConditions(deviceDB).getMark(scope)  // site data blocked (a SecurityError): 'storage_blocked', "...will not help until that changes..."
 */
export const deviceTroubleAsConditions = (deviceDB: DeviceDB): DeviceDB => ({
  getLease: (...args) => guarded('getLease', () => deviceDB.getLease(...args)),
  putLease: (...args) => guarded('putLease', () => deviceDB.putLease(...args)),
  delLease: (...args) => guarded('delLease', () => deviceDB.delLease(...args)),
  getMark:  (...args) => guarded('getMark', () => deviceDB.getMark(...args)),
  putMark:  (...args) => guarded('putMark', () => deviceDB.putMark(...args)),
  delMark:  (...args) => guarded('delMark', () => deviceDB.delMark(...args)),
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
  getLease: { failed: "reading the lease it keeps for this vault, so the vault could not take it up", instead: "unlock with a passphrase or passkey" },
  putLease: { failed: "writing the lease it keeps for this vault, so this device may ask for the passphrase again at the next open" },
  delLease: { failed: "erasing the lease it keeps for this vault, so the next vault made on this device, as at the next page load, may still take it up" },
  getMark:  { failed: "reading its mark of this vault (the newest copy of the vault it has seen, and how often it has locked), so the vault could not check storage against it" },
  putMark:  { failed: "writing its mark of this vault (the newest copy of the vault it has seen, and how often it has locked), so it may not be kept" },
  delMark:  { failed: "erasing its mark of this vault, so it still holds the newest copy of the vault it had seen" },
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
