/** The deviceDB in memory. */

import { Helpers } from 'safebyok-big/internals'
import { DeviceDB } from './device-db'
import type { LeaseRecord, LeaseScope } from '../shapes/shapes-stamps'
import type { Devicetok, Userid } from '../shapes/primitives'

/** A device database in this tab's memory, gone when the tab closes. Two Devices given one stand for two tabs of a browser. */
export class MemoryDeviceDB extends DeviceDB {
  // == [Props]: #leases, #listeners, #devicetoks

  /** Each gate's lease record, by the ckey of its scope. */
  readonly #leases  = new Map<string, unknown>()
  readonly #listeners = new Set<(rung: unknown) => void>()
  /** Each user's devicetok, by the ckey of its userid. */
  readonly #devicetoks = new Map<string, unknown>()
  // --

  // == [Cheats and ckeys]: _cheat_leases, _cheat_devicetoks, ckeyOf, devicetokCkeyOf

  /** For tests: each gate's lease record, by {@link MemoryDeviceDB.ckeyOf} its scope, to read or change in place. */
  _cheat_leases(): Map<string, unknown> { return this.#leases } // eslint-disable-line unicorn/prefer-private-class-fields

  /** For tests: each user's devicetok, by {@link MemoryDeviceDB.devicetokCkeyOf} its userid, to read or change in place. */
  _cheat_devicetoks(): Map<string, unknown> { return this.#devicetoks } // eslint-disable-line unicorn/prefer-private-class-fields

  /** The ckey of the lease record at `scope`, in {@link _cheat_leases}. */
  static ckeyOf({ modelkind, userid, banklabel, labelpath }: LeaseScope): string { return Helpers.ckeyOf(modelkind, userid, banklabel, labelpath) }

  /** The ckey of the devicetok of the user `userid`. */
  static devicetokCkeyOf(userid: Userid): string { return Helpers.ckeyOf(userid, 'devicetok') }
  // --

  // == [Protected, the calls of DeviceDB]: doPeekLease, doStowLease, doRing, doListen, doStowDevicetok

  protected doPeekLease(scope: LeaseScope): unknown { return structuredClone(this.#leases.get(MemoryDeviceDB.ckeyOf(scope)) ?? null) }

  protected doStowLease(record: LeaseRecord, isReplaced: (raw: unknown) => boolean): unknown {
    const ckey   = MemoryDeviceDB.ckeyOf(record)
    const prior = structuredClone(this.#leases.get(ckey) ?? null)
    if (isReplaced(prior)) { this.#leases.set(ckey, structuredClone(record)) }
    return prior
  }

  // Each listener is called on a later microtask, so nothing it does runs inside the stow that rang.
  protected doRing({ modelkind, userid, banklabel, labelpath }: LeaseScope): void {
    for (const listener of this.#listeners) { queueMicrotask(() => { listener({ modelkind, userid, banklabel, labelpath }) }) }
  }

  protected doListen(listener: (rung: unknown) => void): () => void {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  protected doStowDevicetok(userid: Userid, devicetok: Devicetok, isReplaced: (raw: unknown) => boolean): unknown {
    const ckey   = MemoryDeviceDB.devicetokCkeyOf(userid)
    const prior = this.#devicetoks.get(ckey) ?? null
    if (isReplaced(prior)) { this.#devicetoks.set(ckey, devicetok) }
    return prior
  }
  // --
}
