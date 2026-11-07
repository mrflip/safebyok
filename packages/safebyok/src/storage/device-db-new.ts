/** The deviceDB: what the models cache on this device, a lease for each vault. */

import { IsDeviceDB } from '../helpers/consts'
import type { Awaitable } from '../helpers/helpers'
import { type VaultError, isVaultError } from '../refusals/errors'
import { type Outcome, outcomeOf } from '../refusals/outcome'
import * as Refuse from '../refusals/throwers'
import type { VaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import type { LeaseDated, LeaseQuery, LeaseRow, LeaseScopepath, RawLease } from '../shapes/shapes-storage'

/** The base a host's device store extends, writing only the generic `do*` calls, each one atomic step. */
export abstract class DeviceDB {
  // == [Brand]: IsDeviceDB

  // A getter on the class, never an own field, so the brand neither serializes nor rides along in a spread.
  /** True: the brand a model knows a deviceDB by, from whichever copy of safebyok. */
  get [IsDeviceDB](): true { return true } // eslint-disable-line @typescript-eslint/class-literal-property-style
  // --

  // == [Lease verbs]: stow, tryStow, peek, tryPeek, forget, tryForget, listLeases, tryListLeases, listRawLeases, tryListRawLeases, delRawLease, tryDelRawLease

  /** Stows the lease row of its vault. */
  async stow(row: LeaseRow): Promise<void> {
    try {
      const leaseRow = SX.leaseRow.parse(row)
      await this.doStow(leaseRow)
    } catch (err) { throw refusalOf(err, 'stow') }
  }

  tryStow(row: LeaseRow): Promise<Outcome<void>> { return outcomeOf(() => this.stow(row)) }

  /** The row stowed for this vault under this `vault_tok`, or null. */
  async peek(asked: LeaseQuery): Promise<LeaseRow | null> {
    try {
      const leaseQuery = SX.leaseQuery.parse(asked)
      const parsed = SX.leaseRow.safeParse(await this.doPeek(leaseQuery))
      return (parsed.success && parsed.data.vault_tok === leaseQuery.vault_tok) ? parsed.data : null
    } catch (err) { throw refusalOf(err, 'peek') }
  }

  tryPeek(asked: LeaseQuery): Promise<Outcome<LeaseRow | null>> { return outcomeOf(() => this.peek(asked)) }

  // `peek` checks the `vault_tok` here in the base; `forget` leaves it to the store, whose check must be one atomic step with its delete.
  /** Erases the row stowed for this vault under this `vault_tok`. */
  async forget(asked: LeaseQuery): Promise<void> {
    try {
      const leaseQuery = SX.leaseQuery.parse(asked)
      await this.doForget(leaseQuery)
    } catch (err) { throw refusalOf(err, 'forget') }
  }

  tryForget(asked: LeaseQuery): Promise<Outcome<void>> { return outcomeOf(() => this.forget(asked)) }

  /** Every lease stowed on this device, oldest first. */
  async listLeases(): Promise<LeaseDated[]> {
    try {
      const filed = await this.doListLeases()
      const leases = filed.flatMap(({ row }) => { const parsed = SX.leaseDated.safeParse(row); return parsed.success ? [parsed.data] : [] })
      return leases.toSorted((one, other) => one.proved_at - other.proved_at)
    } catch (err) { throw refusalOf(err, 'listLeases') }
  }

  tryListLeases(): Promise<Outcome<LeaseDated[]>> { return outcomeOf(() => this.listLeases()) }

  /** Every lease row on this device beside the scopepath it is filed under, unchecked, damaged rows among them. */
  async listRawLeases(): Promise<RawLease[]> {
    try {
      return await this.doListLeases()
    } catch (err) { throw refusalOf(err, 'listRawLeases') }
  }

  tryListRawLeases(): Promise<Outcome<RawLease[]>> { return outcomeOf(() => this.listRawLeases()) }

  /** Deletes the row filed under a scopepath `listRawLeases` gave, damaged or not, with no `vault_tok` to match. */
  async delRawLease(scopepath: LeaseScopepath): Promise<void> {
    try {
      const checked = SX.leaseScopepath.parse(scopepath)
      await this.doDelRawLease(checked)
    } catch (err) { throw refusalOf(err, 'delRawLease') }
  }

  tryDelRawLease(scopepath: LeaseScopepath): Promise<Outcome<void>> { return outcomeOf(() => this.delRawLease(scopepath)) }
  // --

  // == [Protected, for a subclass to write]: doStow, doPeek, doForget, doListLeases, doDelRawLease

  // A store starts each call's work in the order called, or a `forget` made after a `stow` may not erase it.
  /** Stores `row` as the lease of its vault scope, over any row there. */
  protected abstract doStow(row: LeaseRow): Awaitable<void>
  /** The row stored at this vault scope, whatever its `vault_tok`, or null. */
  protected abstract doPeek(scope: VaultScope): Awaitable<unknown>
  /** Removes the row at this vault scope when it holds this `vault_tok`, in one step. */
  protected abstract doForget(asked: LeaseQuery): Awaitable<void>
  /** Every lease row stored, each beside the scopepath it is filed under, in any order and in one step. */
  protected abstract doListLeases(): Awaitable<RawLease[]>
  /** Removes whatever row is filed under `scopepath`, in one step. */
  protected abstract doDelRawLease(scopepath: LeaseScopepath): Awaitable<void>
  // --
}

/** The refusal a verb's throw stands for: a refusal as it came, else `storage_unavailable`. */
const refusalOf = (thrown: unknown, call: string): VaultError => (isVaultError(thrown) ? thrown : Refuse.storeFailed(call, thrown))
