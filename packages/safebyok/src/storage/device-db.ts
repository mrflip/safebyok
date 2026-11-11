/** The deviceDB, which caches on this device a lease for each vault and a bank row for each bank. A subclass writes the `do*` calls. */

import { IsDeviceDB } from '../helpers/consts'
import { randomId } from '../helpers/crypto'
import type { Awaitable } from '../helpers/helpers'
import { type VaultError, isVaultError } from '../refusals/errors'
import { type Outcome, outcomeOf } from '../refusals/outcome'
import * as Refuse from '../refusals/throwers'
import * as CX from '../shapes/shapes-core'
import { type BankScope, type VaultScope, isPlainBag } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import type { BankRow, LeaseDated, LeaseQuery, LeaseRow, LeaseScopepath, RawLease } from '../shapes/shapes-storage'

/** The base class of a device database. A subclass writes only the generic `do*` calls, and each must be one atomic step. */
export abstract class DeviceDB {
  // == [Brand]: IsDeviceDB

  // A getter ensures the brand is neither serialized nor copied by a spread.
  /** Always true: marks a deviceDB for safe branding. */
  get [IsDeviceDB](): true { return true }
  // --

  // == [Lease verbs]: stow, tryStow, peek, tryPeek, forget, tryForget, listLeases, tryListLeases, listRawLeases, tryListRawLeases, forgetRawLease, tryForgetRawLease

  /** Stow the lease row of its vault. */
  async stow(row: LeaseRow): Promise<void> {
    try {
      const leaseRow = SX.leaseRow.parse(row)
      await this.doStow(leaseRow)
    } catch (err) { throw refusalOf(err, 'stow') }
  }

  /** Non-throwing form of {@link stow}. */
  tryStow(row: LeaseRow): Promise<Outcome<void>> { return outcomeOf(() => this.stow(row)) }

  /** The lease row stowed for this vault under this `vault_tok`, or null.
   * Refuses `damaged_lease` when the stowed row fails its checks.
   */
  async peek(asked: LeaseQuery): Promise<LeaseRow | null> {
    try {
      const leaseQuery = SX.leaseQuery.parse(asked)
      const stored = await this.doPeek(leaseQuery)
      if (stored === null) { return null }
      const parsed = SX.leaseRow.safeParse(stored)
      if (! parsed.success) { throw Refuse.damagedLease() }
      return (parsed.data.vault_tok === leaseQuery.vault_tok) ? parsed.data : null
    } catch (err) { throw refusalOf(err, 'peek') }
  }

  /** Non-throwing form of {@link peek}. */
  tryPeek(asked: LeaseQuery): Promise<Outcome<LeaseRow | null>> { return outcomeOf(() => this.peek(asked)) }

  // `peek` checks the `vault_tok` here in the base. `forget` leaves that check to the subclass, which must make it in one atomic
  // step with the delete.
  /** Forget the lease row stowed for this vault under this `vault_tok`. */
  async forget(asked: LeaseQuery): Promise<void> {
    try {
      const leaseQuery = SX.leaseQuery.parse(asked)
      await this.doForget(leaseQuery)
    } catch (err) { throw refusalOf(err, 'forget') }
  }

  /** Non-throwing form of {@link forget}. */
  tryForget(asked: LeaseQuery): Promise<Outcome<void>> { return outcomeOf(() => this.forget(asked)) }

  /** Every lease stowed on this device, oldest first. */
  async listLeases(): Promise<LeaseDated[]> {
    try {
      const filed = await this.doListLeases()
      const leases = filed.flatMap(({ row }) => { const parsed = SX.leaseDated.safeParse(row); return parsed.success ? [parsed.data] : [] })
      return leases.toSorted((one, other) => one.proved_at - other.proved_at)
    } catch (err) { throw refusalOf(err, 'listLeases') }
  }

  /** Non-throwing form of {@link listLeases}. */
  tryListLeases(): Promise<Outcome<LeaseDated[]>> { return outcomeOf(() => this.listLeases()) }

  /** Every lease row on this device, unchecked and damaged ones included, each with the scopepath it is filed under. */
  async listRawLeases(): Promise<RawLease[]> {
    try {
      return await this.doListLeases()
    } catch (err) { throw refusalOf(err, 'listRawLeases') }
  }

  /** Non-throwing form of {@link listRawLeases}. */
  tryListRawLeases(): Promise<Outcome<RawLease[]>> { return outcomeOf(() => this.listRawLeases()) }

  /** Forget the row filed under a scopepath from `listRawLeases`, damaged or not, without matching a `vault_tok`. */
  async forgetRawLease(scopepath: LeaseScopepath): Promise<void> {
    try {
      const checked = SX.leaseScopepath.parse(scopepath)
      await this.doForgetRawLease(checked)
    } catch (err) { throw refusalOf(err, 'forgetRawLease') }
  }

  /** Non-throwing form of {@link forgetRawLease}. */
  tryForgetRawLease(scopepath: LeaseScopepath): Promise<Outcome<void>> { return outcomeOf(() => this.forgetRawLease(scopepath)) }
  // --

  // == [Bank verbs]: ensureCachedBank, tryEnsureCachedBank, forgetBank, tryForgetBank, listRawBanks, tryListRawBanks

  /** The bank row of this bank scope, made with a fresh random `device_id` on the first call. */
  async ensureCachedBank(scope: BankScope): Promise<BankRow> {
    try {
      const { applabel, user_id } = CX.bankScope.parse(scope)
      const made = SX.bankRow.parse({ applabel, user_id, device_id: randomId() })
      return SX.bankRow.parse(await this.doEnsureCachedBank(made))
    } catch (err) { throw refusalOf(err, 'ensureCachedBank') }
  }

  /** Non-throwing form of {@link ensureCachedBank}. */
  tryEnsureCachedBank(scope: BankScope): Promise<Outcome<BankRow>> { return outcomeOf(() => this.ensureCachedBank(scope)) }

  /** Forget the bank row of this bank scope, so the next `ensureCachedBank` mints a fresh `device_id`. */
  async forgetBank(scope: BankScope): Promise<void> {
    try {
      const { applabel, user_id } = CX.bankScope.parse(scope)
      await this.doForgetBank({ applabel, user_id })
    } catch (err) { throw refusalOf(err, 'forgetBank') }
  }

  /** Non-throwing form of {@link forgetBank}. */
  tryForgetBank(scope: BankScope): Promise<Outcome<void>> { return outcomeOf(() => this.forgetBank(scope)) }

  /** Every bank row stored on this device, as an unchecked bag, damaged ones included. */
  async listRawBanks(): Promise<Record<string, unknown>[]> {
    try {
      const rows = await this.doListBanks()
      return rows.filter((row) => isPlainBag(row))
    } catch (err) { throw refusalOf(err, 'listRawBanks') }
  }

  /** Non-throwing form of {@link listRawBanks}. */
  tryListRawBanks(): Promise<Outcome<Record<string, unknown>[]>> { return outcomeOf(() => this.listRawBanks()) }
  // --

  // == [Protected, for a subclass to write]: doStow, doPeek, doForget, doListLeases, doForgetRawLease, doEnsureCachedBank, doForgetBank, doListBanks

  // A device database must start each call's work in the order of the calls. Otherwise a `forget` made after a `stow` may
  // miss the row it stowed.
  /** Stow `row` as the lease of its vault scope, replacing any row there. */
  protected abstract doStow(row: LeaseRow): Awaitable<void>
  /** The row stored at this vault scope, whatever its `vault_tok`, or null. */
  protected abstract doPeek(scope: VaultScope): Awaitable<unknown>
  /** Delete the row at this vault scope if it has this `vault_tok`, in one step. */
  protected abstract doForget(asked: LeaseQuery): Awaitable<void>
  /** Every lease row stored, each beside the scopepath it is filed under, in any order and in one step. */
  protected abstract doListLeases(): Awaitable<RawLease[]>
  /** Delete whatever row is filed under `scopepath`, in one step. */
  protected abstract doForgetRawLease(scopepath: LeaseScopepath): Awaitable<void>
  /** Return the bank row stored at `made`'s bank scope if it passes its check, else put `made` over it and return that, in one step. */
  protected abstract doEnsureCachedBank(made: BankRow): Awaitable<unknown>
  /** Delete whatever row is stored at this bank scope, in one step. */
  protected abstract doForgetBank(scope: BankScope): Awaitable<void>
  /** Every bank row stored, in any order. */
  protected abstract doListBanks(): Awaitable<unknown[]>
  // --
}

/** The refusal for a verb's throw. A throw that is not a refusal becomes `storage_unavailable`. */
const refusalOf = (thrown: unknown, call: string): VaultError => (isVaultError(thrown) ? thrown : Refuse.deviceDBFailed(call, thrown))
