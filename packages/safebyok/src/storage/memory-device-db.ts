/** The deviceDB in memory. */

import { ckeyOf } from '../helpers/helpers'
import { DeviceDB } from './device-db'
import type { BankScope, VaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import type { DeviceRow, LeaseQuery, LeaseRow, LeaseScopepath, RawLease } from '../shapes/shapes-storage'

/** The scopepath of the lease row at `scope`. */
function leaseScopepathOf({ user_id, banklabel, vaultlabel }: VaultScope): LeaseScopepath { return [user_id, banklabel, vaultlabel] }
/** The ckey of the lease row filed under `scopepath`. */
function leaseCkeyOf(scopepath: LeaseScopepath): string { return ckeyOf(...scopepath) }
function deviceRowCkeyOf({ user_id, banklabel }: BankScope): string { return ckeyOf(user_id, banklabel) }

/** A device database that keeps its rows in memory, for the page's life. */
export class MemoryDeviceDB extends DeviceDB {
  // == [Props]: #leaserows, #devicerows

  readonly #leaserows = new Map<string, RawLease>()
  readonly #devicerows = new Map<string, unknown>()
  // --

  // == [Rows]: _cheat_leaseRows, _cheat_deviceRows

  /** For tests: the map of lease rows, each with its scopepath, by scope. */
  _cheat_leaseRows(): Map<string, RawLease> { return this.#leaserows } // eslint-disable-line unicorn/prefer-private-class-fields
  /** For tests: the map of device rows, by bank scope. */
  _cheat_deviceRows(): Map<string, unknown> { return this.#devicerows } // eslint-disable-line unicorn/prefer-private-class-fields
  // --

  // == [Protected, the generic calls of DeviceDB]: doStow, doPeek, doForget, doListLeases, doForgetRawLease, doEnsureCachedDevice, doForgetDevice, doListDevices

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

  protected doEnsureCachedDevice(made: DeviceRow): unknown {
    const stored = this.#devicerows.get(deviceRowCkeyOf(made))
    if (SX.deviceRow.safeParse(stored).success) { return structuredClone(stored) }
    this.#devicerows.set(deviceRowCkeyOf(made), structuredClone(made))
    return structuredClone(made)
  }

  protected doForgetDevice(scope: BankScope): void {
    this.#devicerows.delete(deviceRowCkeyOf(scope))
  }

  protected doListDevices(): unknown[] {
    return [...this.#devicerows.values()].map((row) => structuredClone(row))
  }
  // --
}
