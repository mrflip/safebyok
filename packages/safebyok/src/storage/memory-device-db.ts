/** The deviceDB in memory: one JavaScript step is one transaction, so each generic call is atomic by being straight code, and starts its work before its caller can await. */

import { ckeyOf } from '../helpers/helpers'
import { DeviceDB } from './device-db-new'
import type { VaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import type { LeaseQuery, LeaseRow } from '../shapes/shapes-storage'

const leaseCkeyOf = ({ applabel, user_id, vaultlabel }: VaultScope): string => ckeyOf(applabel, user_id, vaultlabel)

/** A device store that keeps its rows in memory, for the page's life. */
export class MemoryDeviceDB extends DeviceDB {
  // == [Props]: #leaserows

  readonly #leaserows = new Map<string, unknown>()
  // --

  // == [Rows]: _cheat_leaseRows

  /** For tests: the map of lease rows, by scope. */
  _cheat_leaseRows(): Map<string, unknown> { return this.#leaserows } // eslint-disable-line unicorn/prefer-private-class-fields
  // --

  // == [Protected, the generic calls of DeviceDB]: doStow, doPeek, doForget, doListLeases

  protected doStow(row: LeaseRow): void {
    this.#leaserows.set(leaseCkeyOf(row), structuredClone(row))
  }

  protected doPeek(scope: VaultScope): unknown {
    return structuredClone(this.#leaserows.get(leaseCkeyOf(scope)) ?? null)
  }

  protected doForget(asked: LeaseQuery): void {
    const stored = SX.leaseRow.safeParse(this.#leaserows.get(leaseCkeyOf(asked)))
    if (stored.success && (stored.data.vault_tok === asked.vault_tok)) { this.#leaserows.delete(leaseCkeyOf(asked)) }
  }

  protected doListLeases(): unknown[] {
    return [...this.#leaserows.values()].map((row) => structuredClone(row))
  }
  // --
}
