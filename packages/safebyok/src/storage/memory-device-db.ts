/** The deviceDB in memory: one JavaScript step is one transaction, so each generic call is atomic by being straight code, and starts its work before its caller can await. */

import { ckeyOf } from '../helpers/helpers'
import { DeviceDB } from './device-db-new'
import type { VaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import type { DeviceRecord, LeaseQuery, LeaseRow } from '../shapes/shapes-storage'

const leaseCkeyOf = ({ applabel, user_id, vaultlabel }: VaultScope): string => ckeyOf(applabel, user_id, vaultlabel)

export class MemoryDeviceDB extends DeviceDB {
  // == [Props]: #leaserows, #devicerows

  readonly #leaserows = new Map<string, unknown>()
  readonly #devicerows = new Map<string, unknown>()
  // --

  // == [Rows]: _cheat_leaseRows, _cheat_deviceRows

  /** For tests: the map of lease rows, by scope. */
  _cheat_leaseRows(): Map<string, unknown> { return this.#leaserows } // eslint-disable-line unicorn/prefer-private-class-fields

  /** For tests: the map of device records, by bank scope. */
  _cheat_deviceRows(): Map<string, unknown> { return this.#devicerows } // eslint-disable-line unicorn/prefer-private-class-fields
  // --

  // == [Protected, the generic calls of DeviceDB]: doCache, doPeek, doVacate, doLeasesProvedBefore, doCacheDeviceRecord

  protected doCache(row: LeaseRow): void {
    this.#leaserows.set(leaseCkeyOf(row), structuredClone(row))
  }

  protected doPeek(scope: VaultScope): unknown {
    return structuredClone(this.#leaserows.get(leaseCkeyOf(scope)) ?? null)
  }

  protected doVacate(asked: LeaseQuery): void {
    const stored = SX.leaseRow.safeParse(this.#leaserows.get(leaseCkeyOf(asked)))
    if (stored.success && (stored.data.vault_tok === asked.vault_tok)) { this.#leaserows.delete(leaseCkeyOf(asked)) }
  }

  protected doLeasesProvedBefore(cutoff: number): unknown[] {
    const rows = [...this.#leaserows.values()].flatMap((row) => { const parsed = SX.leaseRow.safeParse(row); return (parsed.success && parsed.data.proved_at < cutoff) ? [parsed.data] : [] })
    return rows.toSorted((one, other) => one.proved_at - other.proved_at)
  }

  protected doCacheDeviceRecord(record: DeviceRecord, isHeld: (stored: unknown) => boolean): unknown {
    const ckey = ckeyOf(record.applabel, record.user_id)
    const stored = this.#devicerows.get(ckey) ?? null
    if (! isHeld(stored)) { this.#devicerows.set(ckey, structuredClone(record)) }
    return structuredClone(stored)
  }
  // --
}
