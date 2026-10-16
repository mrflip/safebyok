import { DeviceMark, DeviceUnlock, type VaultScope } from './types'
import * as Ckeys from './ckeys'
import { VaultError } from './errors'

/**
 * What a remembered unlock's write expects of the device: that no lock has forgotten the vault's
 * remembered unlock since the unlock began, its device mark still at the `lock_generation` it
 * read then (0 for a scope with no mark).
 */
export type UnlockExpectation = { lock_generation: number }

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
  /**
   * Keep `unlock` as the remembered unlock of its vault, in place of any before, only while the
   * device mark of its scope stands at `expected.lock_generation` (a scope with no mark, or one
   * that does not read, stands at 0); otherwise write nothing and refuse with kind 'stale_write'.
   * The compare and the write are one step, as a VaultDB's are: an IndexedDB adapter makes them
   * in one transaction. This is how a lock in one tab stops an unlock under way in another.
   */
  writeUnlock(unlock: DeviceUnlock, expected: UnlockExpectation): Promise<void>
  eraseUnlock(scope: VaultScope): Promise<void>
  /** This device's mark for one vault, or null when there is none. What it says is the vault's to judge. */
  readMark(scope: VaultScope): Promise<DeviceMark | null>
  /**
   * Keep `mark` as this device's mark for its vault, in place of any it kept before -- but never
   * at a lower `lock_generation` than the mark it replaces: the higher of the two is kept, in the
   * same step as the write, so a mark written from an older read never undoes a lock.
   */
  writeMark(mark: DeviceMark): Promise<void>
  /**
   * Forget this device's mark for one vault, its lock generation with it. The vault never calls
   * this on its own (`destroy()` writes a mark with nothing `seen`, keeping the generation): it is
   * for a host accepting storage restored on purpose, and for `eraseDamagedVault`.
   */
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

    writeUnlock: (unlock, expected) => {
      if (lockGenerationOf(marks.get(Ckeys.mark(unlock))) !== expected.lock_generation) {
        return Promise.reject(lockedMeanwhile())
      }
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
      const ckey = Ckeys.mark(mark)
      marks.set(ckey, keepingLocks(mark, marks.get(ckey)))
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

/**
 * The lock generation `kept`, a stored mark, stands at: its own when it reads as a mark, and 0
 * when there is none, or it does not read.
 */
export const lockGenerationOf = (kept: unknown): number => {
  const checked = DeviceMark.safeParse(kept)
  return checked.success ? checked.data.lock_generation : 0
}

/** `mark`, to be written over `kept`, at the higher of the two lock generations. */
export const keepingLocks = (mark: DeviceMark, kept: unknown): DeviceMark => (
  { ...mark, lock_generation: Math.max(mark.lock_generation, lockGenerationOf(kept)) }
)

/** A remembered unlock's write refused, a lock having forgotten the vault's since its unlock began. */
export const lockedMeanwhile = () => new VaultError('stale_write', 'A lock on this device forgot the remembered unlock while this unlock was under way, so nothing was remembered: the lock wins.')
