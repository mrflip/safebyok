/** The deviceDB in memory. */

import { Helpers } from 'safebyok-big/internals'
import { DeviceDB } from './device-db'
import type { BankScope, LeaseRecord } from '../shapes/shapes-stamps'

/** A device database in this tab's memory, gone when the tab closes. Two Devices given one stand for two tabs of a browser. */
export class MemoryDeviceDB extends DeviceDB {
  // == [Props]: #leases, #hearers

  /** Each bank's lease record, by the ckey of its scope. */
  readonly #leases  = new Map<string, unknown>()
  readonly #hearers = new Set<(rung: unknown) => void>()
  // --

  // == [Leases]: _cheat_leases, ckeyOf

  /** For tests: each bank's lease record, by {@link MemoryDeviceDB.ckeyOf} its scope, to read or change in place. */
  _cheat_leases(): Map<string, unknown> { return this.#leases } // eslint-disable-line unicorn/prefer-private-class-fields

  /** The ckey of the bank at `scope`, in {@link _cheat_leases}. */
  static ckeyOf({ userid, banklabel }: BankScope): string { return Helpers.ckeyOf(userid, banklabel) }
  // --

  // == [Protected, the calls of DeviceDB]: doPeekLease, doStowLease, doRing, doListen

  protected doPeekLease(scope: BankScope): unknown { return structuredClone(this.#leases.get(MemoryDeviceDB.ckeyOf(scope)) ?? null) }

  protected doStowLease(record: LeaseRecord, isReplaced: (raw: unknown) => boolean): unknown {
    const ckey   = MemoryDeviceDB.ckeyOf(record)
    const before = structuredClone(this.#leases.get(ckey) ?? null)
    if (isReplaced(before)) { this.#leases.set(ckey, structuredClone(record)) }
    return before
  }

  // Each hearer is called on a later microtask, so nothing it does runs inside the stow that rang.
  protected doRing({ userid, banklabel }: BankScope): void {
    for (const hear of this.#hearers) { queueMicrotask(() => { hear({ userid, banklabel }) }) }
  }

  protected doListen(hear: (rung: unknown) => void): () => void {
    this.#hearers.add(hear)
    return () => { this.#hearers.delete(hear) }
  }
  // --
}
