/** The deviceDB in memory. */

import { ckeyOf } from '../helpers/helpers'
import { DeviceDB } from './device-db'
import type { BankScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import type { DeviceRow, LeaseQuery, LeaseRow, LeaseScopepath, RawLease } from '../shapes/shapes-storage'

/** The scopepath of the lease row at `scope`. */
function leaseScopepathOf({ user_id, banklabel }: BankScope): LeaseScopepath { return [user_id, banklabel] }
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

  protected doPeek(scope: BankScope): unknown {
    const filed = this.#leaserows.get(leaseCkeyOf(leaseScopepathOf(scope)))
    return structuredClone(filed?.row ?? null)
  }

  protected doForget(asked: LeaseQuery): void {
    const ckey = leaseCkeyOf(leaseScopepathOf(asked))
    const storedReport = SX.leaseRow.safeParse(this.#leaserows.get(ckey)?.row)
    if (storedReport.success && (storedReport.data.bank_tok === asked.bank_tok)) { this.#leaserows.delete(ckey) }
  }

  protected doListLeases(): RawLease[] {
    return [...this.#leaserows.values()].map((filed) => structuredClone(filed))
  }

  protected doForgetRawLease(scopepath: LeaseScopepath): void {
    this.#leaserows.delete(leaseCkeyOf(scopepath))
  }

  protected doEnsureCachedDevice(made: DeviceRow): unknown {
    const raw = this.#devicerows.get(deviceRowCkeyOf(made))
    const storedReport = SX.deviceRow.safeParse(raw)
    const row = storedReport.success ? { ...storedReport.data, package_version: made.package_version } : made
    this.#devicerows.set(deviceRowCkeyOf(made), structuredClone(row))
    return structuredClone(row)
  }

  protected doForgetDevice(scope: BankScope): void {
    this.#devicerows.delete(deviceRowCkeyOf(scope))
  }

  protected doListDevices(): unknown[] {
    return [...this.#devicerows.values()].map((row) => structuredClone(row))
  }
  // --
}
