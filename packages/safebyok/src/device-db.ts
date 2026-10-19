import { DeviceMark, LeaseRecord, type VaultScope } from './types'
import * as Ckeys from './ckeys'
import { VaultError } from './errors'
import { type Outcome, isOutcomeShaped, outcomeOf, valOf } from './outcome'
import { isStorageBlocked } from './refusals'

/**
 * Device-local storage for what a device keeps of each vault: its lease, what lets "enter your
 * passphrase once, keep it for seven days" survive a page reload, and its device mark,
 * the device's own id for the vault and the newest copy of the vault props it has seen. A
 * {@link LeaseRecord} holds this browser's leaseKey -- a non-extractable CryptoKey
 * handle, which has no JSON form -- so an adapter must keep records by structured clone
 * (IndexedDB: see `safebyok/idb`) or in memory; nothing here ever goes to the backend.
 *
 * Every verb resolves an {@link Outcome}, as a VaultDB's do, and never rejects: a failure is a
 * bad outcome holding a VaultError, which {@link deviceOutcomeOf} makes of whatever the store
 * threw. A vault calls a host's own DeviceDB through a guard all the same, so one that throws, or
 * answers with something that is no Outcome, is said as a condition rather than trusted.
 *
 * An adapter may answer a damaged or unreadable record with null rather than a refusal: losing a
 * lease only means asking for the passphrase again, and losing a device mark only
 * means the device checks the vault from what storage holds now, as on a device that never saw
 * it. Both are the safe failure. The vault checks whatever `getLease` and `getMark` hand back
 * all the same, so an adapter that returns a record exactly as it stored it is never trusted
 * blindly.
 */
export interface DeviceDB {
  /** The lease record for one vault, or null when there is none. Whether it still fits is the vault's call. */
  getLease(scope: VaultScope): Promise<Outcome<LeaseRecord | null>>
  /** Keep `record` as the lease of its vault, in place of any before. */
  putLease(record: LeaseRecord): Promise<Outcome<void>>
  /** Forget the lease of one vault: a lock revokes it, and a lease that no longer fits is discarded. */
  delLease(scope: VaultScope): Promise<Outcome<void>>
  /** This device's mark for one vault, or null when there is none. What it says is the vault's to judge. */
  getMark(scope: VaultScope): Promise<Outcome<DeviceMark | null>>
  /** Keep `mark` as this device's mark for its vault, in place of any it kept before. */
  putMark(mark: DeviceMark): Promise<Outcome<void>>
  /**
   * Forget this device's mark for one vault: `del()` calls it, and so does a host accepting
   * storage restored on purpose, and `delDamagedVault`.
   */
  delMark(scope: VaultScope): Promise<Outcome<void>>
  /** Remove every lease and device mark on this device: the device's part of a full reset. */
  delAll(): Promise<Outcome<void>>
}

/** A verb of {@link DeviceDB}. */
export type DeviceVerb = keyof DeviceDB

/**
 * DeviceDB over a Map: what the tests use, and the fallback anywhere without IndexedDB. Leases
 * and device marks last exactly as long as the page -- which is to say, it remembers
 * nothing, safely. Its rows are filed under `Ckeys`, names joined on `^`, and a scope with a name
 * holding one is refused with kind 'bad_label'.
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

/**
 * The outcome of `body`, one device-store verb's work, for an adapter to answer with: what it
 * returns as a good outcome; a VaultError it throws as it came; and any other failure -- an
 * IndexedDB error, say -- said as a condition, with the store's own error as its cause and a
 * message naming what failed: 'storage_blocked' for a refusal the browser gives for a reason that
 * holds until something outside the app changes (`Refusals.isStorageBlocked`), which a host shows
 * without offering a retry, and 'storage_unavailable' for any other, which it shows in place and
 * offers to retry. Never rejects. Neither message names a scope or quotes a record.
 *
 * @param verb - The DeviceDB verb answering, which the message names.
 * @param body - Its work, sync or async.
 * @returns Its outcome.
 *
 * @example getMark: (scope) => deviceOutcomeOf('getMark', () => get(Ckeys.mark(scope), shelf()))
 * @example await deviceOutcomeOf('getMark', failingRead)   // site data blocked (a SecurityError): 'storage_blocked', "...will not help until that changes..."
 */
export const deviceOutcomeOf = <ValT>(verb: DeviceVerb, body: () => ValT | Promise<ValT>): Promise<Outcome<ValT>> => (
  outcomeOf(body, (thrown) => deviceTrouble(verb, thrown))
)

/**
 * `deviceDB`, each verb guarded: the outcome it resolves passed on as it came, and anything else
 * -- a throw, a rejection, a bad outcome whose `err` is no VaultError -- said as
 * {@link deviceOutcomeOf} says a failure; an answer that is no Outcome at all is refused
 * 'bad_option'. What a vault and `delDamagedVault` call a host's device store through; not
 * exported from the package.
 *
 * @param deviceDB - The device store a host handed in.
 * @returns The same verbs, each answering one Outcome whatever the store does.
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

/**
 * What failed, for each device-store verb, and what it leaves undone: the heart of the message a
 * failure of that verb is said with; and, where there is one, what the user may do instead of
 * trying again, which holds whether a retry may mend it or not. None names a scope or quotes a
 * record.
 */
const DeviceTroubleSaid: Record<DeviceVerb, { failed: string, instead?: string }> = {
  getLease: { failed: "reading the lease it keeps for this vault, so the vault could not take it up", instead: "unlock with a passphrase or passkey" },
  putLease: { failed: "writing the lease it keeps for this vault, so this device may ask for the passphrase again at the next open" },
  delLease: { failed: "erasing the lease it keeps for this vault, so the next vault made on this device, as at the next page load, may still take it up" },
  getMark:  { failed: "reading its mark of this vault (the newest copy of the vault it has seen, and how often it has locked), so the vault could not check storage against it" },
  putMark:  { failed: "writing its mark of this vault (the newest copy of the vault it has seen, and how often it has locked), so it may not be kept" },
  delMark:  { failed: "erasing its mark of this vault, so it still holds the newest copy of the vault it had seen" },
  delAll:   { failed: "erasing everything it keeps for safebyok, so some of it may remain" },
}

/** The condition a failure of the device store's `verb` is said as, `thrown` its cause: see {@link deviceOutcomeOf}. */
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
