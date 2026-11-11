/** The deviceDB in memory. */

import { ckeyOf } from '../helpers/helpers'
import { DeviceDB } from './device-db'
import type { BankScope, VaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import type { BankRow, LeaseQuery, LeaseRow, LeaseScopepath, RawLease } from '../shapes/shapes-storage'

/** The scopepath of the lease row at `scope`. */
function leaseScopepathOf({ applabel, user_id, vaultlabel }: VaultScope): LeaseScopepath { return [applabel, user_id, vaultlabel] }
/** The ckey of the lease row filed under `scopepath`. */
function leaseCkeyOf(scopepath: LeaseScopepath): string { return ckeyOf(...scopepath) }
function bankCkeyOf({ applabel, user_id }: BankScope): string { return ckeyOf(applabel, user_id) }

/** A device database that keeps its rows in memory, for the page's life. */
export class MemoryDeviceDB extends DeviceDB {
  // == [Props]: #leaserows, #bankrows

  readonly #leaserows = new Map<string, RawLease>()
  readonly #bankrows = new Map<string, unknown>()
  // --

  // == [Rows]: _cheat_leaseRows, _cheat_bankRows

  /** For tests: the map of lease rows, each with its scopepath, by scope. */
  _cheat_leaseRows(): Map<string, RawLease> { return this.#leaserows } // eslint-disable-line unicorn/prefer-private-class-fields
  /** For tests: the map of bank rows, by bank scope. */
  _cheat_bankRows(): Map<string, unknown> { return this.#bankrows } // eslint-disable-line unicorn/prefer-private-class-fields
  // --

  // == [Protected, the generic calls of DeviceDB]: doStow, doPeek, doForget, doListLeases, doForgetRawLease, doEnsureCachedBank, doForgetBank, doListBanks

  protected doStow(row: LeaseRow): void {
    const scopepath = leaseScopepathOf(row)
    this.#leaserows.set(leaseCkeyOf(scopepath), { scopepath, row: structuredClone(row) })
  }

  protected doPeek(scope: VaultScope): unknown {
    const filed = this.#leaserows.get(leaseCkeyOf(leaseScopepathOf(scope)))
    return structuredClone(filed?.row ?? null)
  }

  protected doForget(asked: LeaseQuery): void {
    const ckey = leaseCkeyOf(leaseScopepathOf(asked))
    const stored = SX.leaseRow.safeParse(this.#leaserows.get(ckey)?.row)
    if (stored.success && (stored.data.vault_tok === asked.vault_tok)) { this.#leaserows.delete(ckey) }
  }

  protected doListLeases(): RawLease[] {
    return [...this.#leaserows.values()].map((filed) => structuredClone(filed))
  }

  protected doForgetRawLease(scopepath: LeaseScopepath): void {
    this.#leaserows.delete(leaseCkeyOf(scopepath))
  }

  protected doEnsureCachedBank(made: BankRow): unknown {
    const stored = this.#bankrows.get(bankCkeyOf(made))
    if (SX.bankRow.safeParse(stored).success) { return structuredClone(stored) }
    this.#bankrows.set(bankCkeyOf(made), structuredClone(made))
    return structuredClone(made)
  }

  protected doForgetBank(scope: BankScope): void {
    this.#bankrows.delete(bankCkeyOf(scope))
  }

  protected doListBanks(): unknown[] {
    return [...this.#bankrows.values()].map((row) => structuredClone(row))
  }
  // --
}
