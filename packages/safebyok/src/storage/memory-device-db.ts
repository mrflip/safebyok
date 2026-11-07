/** The deviceDB in memory. */

import { ckeyOf } from '../helpers/helpers'
import { DeviceDB } from './device-db-new'
import type { BankScope, VaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import type { BankRow, LeaseQuery, LeaseRow } from '../shapes/shapes-storage'

const leaseCkeyOf = ({ applabel, user_id, vaultlabel }: VaultScope): string => ckeyOf(applabel, user_id, vaultlabel)
const bankCkeyOf = ({ applabel, user_id }: BankScope): string => ckeyOf(applabel, user_id)

/** A device store that keeps its rows in memory, for the page's life. */
export class MemoryDeviceDB extends DeviceDB {
  // == [Props]: #leaserows, #bankrows

  readonly #leaserows = new Map<string, unknown>()
  readonly #bankrows = new Map<string, unknown>()
  // --

  // == [Rows]: _cheat_leaseRows, _cheat_bankRows

  /** For tests: the map of lease rows, by scope. */
  _cheat_leaseRows(): Map<string, unknown> { return this.#leaserows } // eslint-disable-line unicorn/prefer-private-class-fields
  /** For tests: the map of bank rows, by bank scope. */
  _cheat_bankRows(): Map<string, unknown> { return this.#bankrows } // eslint-disable-line unicorn/prefer-private-class-fields
  // --

  // == [Protected, the generic calls of DeviceDB]: doStow, doPeek, doForget, doListLeases, doDelRawLease, doEnsureBank, doListBanks

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

  protected doDelRawLease(scope: VaultScope): void {
    this.#leaserows.delete(leaseCkeyOf(scope))
  }

  protected doEnsureBank(made: BankRow): unknown {
    const stored = this.#bankrows.get(bankCkeyOf(made))
    if (SX.bankRow.safeParse(stored).success) { return structuredClone(stored) }
    this.#bankrows.set(bankCkeyOf(made), structuredClone(made))
    return structuredClone(made)
  }

  protected doListBanks(): unknown[] {
    return [...this.#bankrows.values()].map((row) => structuredClone(row))
  }
  // --
}
