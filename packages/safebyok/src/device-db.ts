import { DeviceMark, Lease, type VaultScope } from './types'
import * as Ckeys from './ckeys'

/**
 * Device-local storage for what a device keeps of each vault: its lease, what lets "enter your
 * passphrase once, keep it for seven days" survive a page reload, and its device mark,
 * the device's own id for the vault and the newest copy of the vault props it has seen. A
 * {@link Lease} record holds this browser's leaseKey -- a non-extractable CryptoKey
 * handle, which has no JSON form -- so an adapter must keep records by structured clone
 * (IndexedDB: see `safebyok/idb`) or in memory; nothing here ever goes to the backend.
 *
 * An adapter may answer a damaged or unreadable record with null rather than an error: losing a
 * lease only means asking for the passphrase again, and losing a device mark only
 * means the device checks the vault from what storage holds now, as on a device that never saw
 * it. Both are the safe failure. The vault checks whatever `getLease` and `getMark` hand back
 * all the same, so an adapter that returns a record exactly as it stored it is never trusted
 * blindly.
 */
export interface DeviceDB {
  /** The lease for one vault, or null when there is none. Expiry is the vault's call. */
  getLease(scope: VaultScope): Promise<Lease | null>
  /** Keep `lease` as the lease of its vault, in place of any before. */
  putLease(lease: Lease): Promise<void>
  delLease(scope: VaultScope): Promise<void>
  /** This device's mark for one vault, or null when there is none. What it says is the vault's to judge. */
  getMark(scope: VaultScope): Promise<DeviceMark | null>
  /** Keep `mark` as this device's mark for its vault, in place of any it kept before. */
  putMark(mark: DeviceMark): Promise<void>
  /**
   * Forget this device's mark for one vault: `del()` calls it, and so does a host accepting
   * storage restored on purpose, and `delDamagedVault`.
   */
  delMark(scope: VaultScope): Promise<void>
  /** Remove every lease and device mark on this device: the device's part of a full reset. */
  delAll(): Promise<void>
}

/**
 * DeviceDB over a Map: what the tests use, and the fallback anywhere without IndexedDB. Leases
 * and device marks last exactly as long as the page -- which is to say, it remembers
 * nothing, safely. Its rows are filed under `Ckeys`, names joined on `^`, and a scope with a name
 * holding one is refused with kind 'bad_label'.
 *
 * @example
 *   const deviceDB = memoryDeviceDB()
 *   await deviceDB.getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
 * @example
 *   await deviceDB.getMark({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })   // null
 */
export const memoryDeviceDB = (): DeviceDB => {
  const leases = new Map<string, Lease>()
  const marks = new Map<string, DeviceMark>()
  return {
    getLease: (scope) => {
      const kept = leases.get(Ckeys.lease(scope))
      if (kept === undefined) { return Promise.resolve(null) }
      const checked = Lease.safeParse(kept)
      // A malformed record reads as "no lease": losing the convenience is the safe failure.
      if (! checked.success) {
        leases.delete(Ckeys.lease(scope))
        return Promise.resolve(null)
      }
      return Promise.resolve(checked.data)
    },

    putLease: (lease) => {
      leases.set(Ckeys.lease(lease), lease)
      return Promise.resolve()
    },

    delLease: (scope) => {
      leases.delete(Ckeys.lease(scope))
      return Promise.resolve()
    },

    getMark: (scope) => {
      const kept = marks.get(Ckeys.mark(scope))
      if (kept === undefined) { return Promise.resolve(null) }
      const checked = DeviceMark.safeParse(kept)
      // A malformed mark reads as none, as on a device that never saw the vault.
      if (! checked.success) {
        marks.delete(Ckeys.mark(scope))
        return Promise.resolve(null)
      }
      return Promise.resolve(checked.data)
    },

    putMark: (mark) => {
      marks.set(Ckeys.mark(mark), mark)
      return Promise.resolve()
    },

    delMark: (scope) => {
      marks.delete(Ckeys.mark(scope))
      return Promise.resolve()
    },

    delAll: () => {
      leases.clear()
      marks.clear()
      return Promise.resolve()
    },
  }
}
