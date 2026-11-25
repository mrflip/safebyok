/** The deviceDB in memory. */

import { Helpers } from 'safebyok-big/internals'
import { DeviceDB } from './device-db'
import type { BankScope, LeaseRecord, LeaseScope } from '../shapes/shapes-stamps'
import type { Devicetok } from '../shapes/primitives'

/** A device database in this tab's memory, gone when the tab closes. Two Devices given one stand for two tabs of a browser. */
export class MemoryDeviceDB extends DeviceDB {
  // == [Props]: #leases, #hearers, #devicetoks

  /** Each gate's lease record, by the ckey of its scope. */
  readonly #leases  = new Map<string, unknown>()
  readonly #hearers = new Set<(rung: unknown) => void>()
  /** Each bank's devicetok, by the ckey of its scope. */
  readonly #devicetoks = new Map<string, unknown>()
  // --

  // == [Cheats and ckeys]: _cheat_leases, _cheat_devicetoks, ckeyOf, devicetokCkeyOf

  /** For tests: each gate's lease record, by {@link MemoryDeviceDB.ckeyOf} its scope, to read or change in place. */
  _cheat_leases(): Map<string, unknown> { return this.#leases } // eslint-disable-line unicorn/prefer-private-class-fields

  /** For tests: each bank's devicetok, by {@link MemoryDeviceDB.devicetokCkeyOf} its scope, to read or change in place. */
  _cheat_devicetoks(): Map<string, unknown> { return this.#devicetoks } // eslint-disable-line unicorn/prefer-private-class-fields

  /** The ckey of the lease record at `scope`, in {@link _cheat_leases}. */
  static ckeyOf({ userid, banklabel, labelpath }: LeaseScope): string { return Helpers.ckeyOf(userid, banklabel, labelpath) }

  /** The ckey of the devicetok of the bank at `scope`. */
  static devicetokCkeyOf({ userid, banklabel }: BankScope): string { return Helpers.ckeyOf(userid, banklabel, 'devicetok') }
  // --

  // == [Protected, the calls of DeviceDB]: doPeekLease, doStowLease, doRing, doListen, doStowDevicetok

  protected doPeekLease(scope: LeaseScope): unknown { return structuredClone(this.#leases.get(MemoryDeviceDB.ckeyOf(scope)) ?? null) }

  protected doStowLease(record: LeaseRecord, isReplaced: (raw: unknown) => boolean): unknown {
    const ckey   = MemoryDeviceDB.ckeyOf(record)
    const before = structuredClone(this.#leases.get(ckey) ?? null)
    if (isReplaced(before)) { this.#leases.set(ckey, structuredClone(record)) }
    return before
  }

  // Each hearer is called on a later microtask, so nothing it does runs inside the stow that rang.
  protected doRing({ userid, banklabel, labelpath }: LeaseScope): void {
    for (const hear of this.#hearers) { queueMicrotask(() => { hear({ userid, banklabel, labelpath }) }) }
  }

  protected doListen(hear: (rung: unknown) => void): () => void {
    this.#hearers.add(hear)
    return () => { this.#hearers.delete(hear) }
  }

  protected doStowDevicetok(scope: BankScope, devicetok: Devicetok, isReplaced: (raw: unknown) => boolean): unknown {
    const ckey   = MemoryDeviceDB.devicetokCkeyOf(scope)
    const before = this.#devicetoks.get(ckey) ?? null
    if (isReplaced(before)) { this.#devicetoks.set(ckey, devicetok) }
    return before
  }
  // --
}
