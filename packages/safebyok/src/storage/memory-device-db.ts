/** The deviceDB in memory. */

import { ckeyOf } from '../helpers/helpers'
import { DeviceDB } from './device-db-new'
import type { VaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import type { LeaseQuery, LeaseRow, LeaseScopepath, RawLease } from '../shapes/shapes-storage'

const leaseScopepathOf = ({ applabel, user_id, vaultlabel }: VaultScope): LeaseScopepath => [applabel, user_id, vaultlabel]
const leaseCkeyOf = (scopepath: LeaseScopepath): string => ckeyOf(...scopepath)

/** A device store that keeps its rows in memory, for the page's life. */
export class MemoryDeviceDB extends DeviceDB {
  // == [Props]: #leaserows

  readonly #leaserows = new Map<string, RawLease>()
  // --

  // == [Rows]: _cheat_leaseRows

  /** For tests: the map of lease rows, each beside its scopepath, by scope. */
  _cheat_leaseRows(): Map<string, RawLease> { return this.#leaserows } // eslint-disable-line unicorn/prefer-private-class-fields
  // --

  // == [Protected, the generic calls of DeviceDB]: doStow, doPeek, doForget, doListLeases, doDelRawLease

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

  protected doDelRawLease(scopepath: LeaseScopepath): void {
    this.#leaserows.delete(leaseCkeyOf(scopepath))
  }
  // --
}
