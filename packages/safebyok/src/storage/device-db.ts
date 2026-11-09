/** The deviceDB: what the models cache on this device, a lease for each vault and a bank row for each bank. A subclass writes the `do*` calls. */

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

/** The base a host's device database extends, writing only the generic `do*` calls, each one atomic step. */
export abstract class DeviceDB {
  // == [Brand]: IsDeviceDB

  // A getter on the class, never an own field, so the brand neither serializes nor rides along in a spread.
  /** True: the brand a model knows a deviceDB by, from whichever copy of safebyok. */
  get [IsDeviceDB](): true { return true }
  // --

  // == [Lease verbs]: stow, tryStow, peek, tryPeek, forget, tryForget, listLeases, tryListLeases, listRawLeases, tryListRawLeases, forgetRawLease, tryForgetRawLease

  /** Stows the lease row of its vault. */
  async stow(row: LeaseRow): Promise<void> {
    try {
      const leaseRow = SX.leaseRow.parse(row)
      await this.doStow(leaseRow)
    } catch (err) { throw refusalOf(err, 'stow') }
  }

  /** Non-throwing form of {@link stow}. */
  tryStow(row: LeaseRow): Promise<Outcome<void>> { return outcomeOf(() => this.stow(row)) }

  /** The row stowed for this vault under this `vault_tok`, or null. */
  async peek(asked: LeaseQuery): Promise<LeaseRow | null> {
    try {
      const leaseQuery = SX.leaseQuery.parse(asked)
      const parsed = SX.leaseRow.safeParse(await this.doPeek(leaseQuery))
      return (parsed.success && parsed.data.vault_tok === leaseQuery.vault_tok) ? parsed.data : null
    } catch (err) { throw refusalOf(err, 'peek') }
  }

  /** Non-throwing form of {@link peek}. */
  tryPeek(asked: LeaseQuery): Promise<Outcome<LeaseRow | null>> { return outcomeOf(() => this.peek(asked)) }

  // `peek` checks the `vault_tok` here in the base; `forget` leaves it to the subclass, whose check must be one atomic step with its delete.
  /** Forgets the row stowed for this vault under this `vault_tok`. */
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

  /** Every lease row on this device beside the scopepath it is filed under, unchecked, damaged rows among them. */
  async listRawLeases(): Promise<RawLease[]> {
    try {
      return await this.doListLeases()
    } catch (err) { throw refusalOf(err, 'listRawLeases') }
  }

  /** Non-throwing form of {@link listRawLeases}. */
  tryListRawLeases(): Promise<Outcome<RawLease[]>> { return outcomeOf(() => this.listRawLeases()) }

  /** Forgets the row filed under a scopepath `listRawLeases` gave, damaged or not, with no `vault_tok` to match. */
  async forgetRawLease(scopepath: LeaseScopepath): Promise<void> {
    try {
      const checked = SX.leaseScopepath.parse(scopepath)
      await this.doForgetRawLease(checked)
    } catch (err) { throw refusalOf(err, 'forgetRawLease') }
  }

  /** Non-throwing form of {@link forgetRawLease}. */
  tryForgetRawLease(scopepath: LeaseScopepath): Promise<Outcome<void>> { return outcomeOf(() => this.forgetRawLease(scopepath)) }
  // --

  // == [Bank verbs]: ensureBank, tryEnsureBank, forgetBank, tryForgetBank, listRawBanks, tryListRawBanks

  /** The bank row of this bank scope, made with a fresh random `device_id` on the first call. */
  async ensureBank(scope: BankScope): Promise<BankRow> {
    try {
      const { applabel, user_id } = CX.bankScope.parse(scope)
      const made = SX.bankRow.parse({ applabel, user_id, device_id: randomId() })
      return SX.bankRow.parse(await this.doEnsureBank(made))
    } catch (err) { throw refusalOf(err, 'ensureBank') }
  }

  /** Non-throwing form of {@link ensureBank}. */
  tryEnsureBank(scope: BankScope): Promise<Outcome<BankRow>> { return outcomeOf(() => this.ensureBank(scope)) }

  /** Forgets the bank row of this bank scope, so that the next `ensureBank` mints a fresh `device_id`. */
  async forgetBank(scope: BankScope): Promise<void> {
    try {
      const { applabel, user_id } = CX.bankScope.parse(scope)
      await this.doForgetBank({ applabel, user_id })
    } catch (err) { throw refusalOf(err, 'forgetBank') }
  }

  /** Non-throwing form of {@link forgetBank}. */
  tryForgetBank(scope: BankScope): Promise<Outcome<void>> { return outcomeOf(() => this.forgetBank(scope)) }

  /** Every bank row stored on this device as a bag, unchecked, damaged rows among them. */
  async listRawBanks(): Promise<Record<string, unknown>[]> {
    try {
      const rows = await this.doListBanks()
      return rows.filter((row) => isPlainBag(row))
    } catch (err) { throw refusalOf(err, 'listRawBanks') }
  }

  /** Non-throwing form of {@link listRawBanks}. */
  tryListRawBanks(): Promise<Outcome<Record<string, unknown>[]>> { return outcomeOf(() => this.listRawBanks()) }
  // --

  // == [Protected, for a subclass to write]: doStow, doPeek, doForget, doListLeases, doForgetRawLease, doEnsureBank, doForgetBank, doListBanks

  // A device database starts each call's work in the order called, or a `forget` made after a `stow` may not forget it.
  /** Stores `row` as the lease of its vault scope, over any row there. */
  protected abstract doStow(row: LeaseRow): Awaitable<void>
  /** The row stored at this vault scope, whatever its `vault_tok`, or null. */
  protected abstract doPeek(scope: VaultScope): Awaitable<unknown>
  /** Removes the row at this vault scope when it holds this `vault_tok`, in one step. */
  protected abstract doForget(asked: LeaseQuery): Awaitable<void>
  /** Every lease row stored, each beside the scopepath it is filed under, in any order and in one step. */
  protected abstract doListLeases(): Awaitable<RawLease[]>
  /** Removes whatever row is filed under `scopepath`, in one step. */
  protected abstract doForgetRawLease(scopepath: LeaseScopepath): Awaitable<void>
  /** The bank row stored at `made`'s bank scope where it passes its check, else `made`, stored over it, in one step. */
  protected abstract doEnsureBank(made: BankRow): Awaitable<unknown>
  /** Removes whatever row is stored at this bank scope, in one step. */
  protected abstract doForgetBank(scope: BankScope): Awaitable<void>
  /** Every bank row stored, in any order. */
  protected abstract doListBanks(): Awaitable<unknown[]>
  // --
}

/** The refusal a verb's throw stands for: a refusal as it came, else `storage_unavailable`. */
const refusalOf = (thrown: unknown, call: string): VaultError => (isVaultError(thrown) ? thrown : Refuse.deviceDBFailed(call, thrown))
