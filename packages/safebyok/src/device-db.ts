import { DeviceMark, DeviceUnlock, type VaultScope } from './types'
import * as Ckeys from './ckeys'

/**
 * Device-local storage for what a device keeps of each vault: its remembered unlock, what lets
 * "enter your passphrase once, keep it for seven days" survive a page reload, and its device mark,
 * the device's own id for the vault and the newest copy of the vault's bundle it has seen. A
 * {@link DeviceUnlock} record holds this browser's localUnlockKey -- a non-extractable CryptoKey
 * handle, which has no JSON form -- so an adapter must keep records by structured clone
 * (IndexedDB: see `safebyok/idb`) or in memory; nothing here ever goes to the backend.
 *
 * An adapter may answer a damaged or unreadable record with null rather than an error: losing a
 * remembered unlock only means asking for the passphrase again, and losing a device mark only
 * means the device checks the vault from what storage holds now, as on a device that never saw
 * it. Both are the safe failure. The vault checks whatever `readUnlock` and `readMark` hand back
 * all the same, so an adapter that returns a record exactly as it stored it is never trusted
 * blindly.
 */
export interface DeviceDB {
  /** The remembered unlock for one vault, or null when there is none. Expiry is the vault's call. */
  readUnlock(scope: VaultScope): Promise<DeviceUnlock | null>
  writeUnlock(unlock: DeviceUnlock): Promise<void>
  eraseUnlock(scope: VaultScope): Promise<void>
  /** This device's mark for one vault, or null when there is none. What it says is the vault's to judge. */
  readMark(scope: VaultScope): Promise<DeviceMark | null>
  /** Keep `mark` as this device's mark for its vault, in place of any it kept before. */
  writeMark(mark: DeviceMark): Promise<void>
  eraseMark(scope: VaultScope): Promise<void>
  /** Remove every remembered unlock and device mark on this device: the device's part of a full reset. */
  eraseAll(): Promise<void>
}

/**
 * DeviceDB over a Map: what the tests use, and the fallback anywhere without IndexedDB. Remembered
 * unlocks and device marks last exactly as long as the page -- which is to say, it remembers
 * nothing, safely. Its rows are filed under `Ckeys`, names joined on `^`, and a scope with a name
 * holding one is refused with kind 'bad_label'.
 *
 * @example
 *   const deviceDB = memoryDeviceDB()
 *   await deviceDB.readUnlock({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
 * @example
 *   await deviceDB.readMark({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })    // null
 */
export const memoryDeviceDB = (): DeviceDB => {
  const unlocks = new Map<string, DeviceUnlock>()
  const marks = new Map<string, DeviceMark>()
  return {
    readUnlock: (scope) => {
      const kept = unlocks.get(Ckeys.unlock(scope))
      if (kept === undefined) { return Promise.resolve(null) }
      const checked = DeviceUnlock.safeParse(kept)
      // A malformed record reads as "no remembered unlock": losing the convenience is the safe failure.
      if (! checked.success) {
        unlocks.delete(Ckeys.unlock(scope))
        return Promise.resolve(null)
      }
      return Promise.resolve(checked.data)
    },

    writeUnlock: (unlock) => {
      unlocks.set(Ckeys.unlock(unlock), unlock)
      return Promise.resolve()
    },

    eraseUnlock: (scope) => {
      unlocks.delete(Ckeys.unlock(scope))
      return Promise.resolve()
    },

    readMark: (scope) => {
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

    writeMark: (mark) => {
      marks.set(Ckeys.mark(mark), mark)
      return Promise.resolve()
    },

    eraseMark: (scope) => {
      marks.delete(Ckeys.mark(scope))
      return Promise.resolve()
    },

    eraseAll: () => {
      unlocks.clear()
      marks.clear()
      return Promise.resolve()
    },
  }
}
