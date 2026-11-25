/** The deviceDB in memory. */

import { Helpers } from 'safebyok-big/internals'
import { DeviceDB } from './device-db'
import type { BankScope, LeaseRow } from '../shapes/shapes-stamps'

/** A device database in this tab's memory, gone when the tab closes. Two Devices given one stand for two tabs of a browser. */
export class MemoryDeviceDB extends DeviceDB {
  // == [Props]: #rows, #hearers

  /** Each bank's lease row, by the ckey of its scope. */
  readonly #rows    = new Map<string, unknown>()
  readonly #hearers = new Set<(rung: unknown) => void>()
  // --

  // == [Rows]: _cheat_rows, ckeyOf

  /** For tests: each bank's lease row, by {@link MemoryDeviceDB.ckeyOf} its scope, to read or change in place. */
  _cheat_rows(): Map<string, unknown> { return this.#rows } // eslint-disable-line unicorn/prefer-private-class-fields

  /** The ckey of the bank at `scope`, in {@link _cheat_rows}. */
  static ckeyOf({ userid, banklabel }: BankScope): string { return Helpers.ckeyOf(userid, banklabel) }
  // --

  // == [Protected, the calls of DeviceDB]: doPeekLease, doStowLease, doRing, doListen

  protected doPeekLease(scope: BankScope): unknown { return structuredClone(this.#rows.get(MemoryDeviceDB.ckeyOf(scope)) ?? null) }

  protected doStowLease(row: LeaseRow, isReplaced: (raw: unknown) => boolean): unknown {
    const ckey   = MemoryDeviceDB.ckeyOf(row)
    const before = structuredClone(this.#rows.get(ckey) ?? null)
    if (isReplaced(before)) { this.#rows.set(ckey, structuredClone(row)) }
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
