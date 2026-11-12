/** The deviceDB in this browser's IndexedDB. */

import { promisifyRequest, type UseStore } from 'idb-keyval'
import type * as Z from 'zod'
import { objCheck } from '../helpers/validator'
import type { BankScope, VaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import type { BankRow, LeaseQuery, LeaseRow, LeaseScopepath, RawLease } from '../shapes/shapes-storage'
import { BankDBVersion, DeviceDBVersion } from '../helpers/consts'
import { DeviceDB } from './device-db'
import { versionedShelfOf } from './idb-shelf'
import { inOneStep, rowAt } from './idb-transaction'

// == [Options]: IdbDeviceDBOpts, idbDeviceDBOpts

/** What an IdbDeviceDB is made with. */
export interface IdbDeviceDBOpts {
  /** The name its database is made under, 'safebyok' if left out. */
  dbName?: string | undefined
}

/** Validator of an IdbDeviceDB's options, which `browserOpts` takes too. */
export const idbDeviceDBOpts = objCheck(({ str }) => ({ dbName: str.min(1).optional() }), 'bad_option')
// --

// == [The databases]: BankScopepath, leaseScopepathOf, bankScopepathOf, leaseShelfOf, bankShelfOf

/** Where the bank shelf files a bank's row. */
type BankScopepath = [user_id: string, banklabel: string]

/** The scopepath of the lease row at `scope`. */
function leaseScopepathOf({ user_id, banklabel, vaultlabel }: VaultScope): LeaseScopepath { return [user_id, banklabel, vaultlabel] }
/** The scopepath of the bank row at `scope`. */
function bankScopepathOf({ user_id, banklabel }: BankScope): BankScopepath { return [user_id, banklabel] }

/** The lease shelf: the device database of `dbName`, which has the leases. */
function leaseShelfOf(dbName: string): UseStore {
  return versionedShelfOf({
    dbName, dbstem: 'device', version: DeviceDBVersion, storename: 'leases', oldnames: [`${dbName}:device_db`, `${dbName}:device-v1`],
  })
}

// A separate database, because a versioned shelf has a single object store: adding a second object store to the device
// database would change its version, and every device would forget its leases.
/** The bank shelf: the bank database of `dbName`, which has the bank rows. */
function bankShelfOf(dbName: string): UseStore {
  return versionedShelfOf({
    dbName, dbstem: 'bank', version: BankDBVersion, storename: 'bank', oldnames: [],
  })
}
// --

/** A device database that keeps this device's leases and bank rows in its browser's IndexedDB. */
export class IdbDeviceDB extends DeviceDB {
  // == [Props]: #leaseShelf, #bankShelf

  readonly #leaseShelf: UseStore
  readonly #bankShelf: UseStore
  // --

  // == [Construction]: constructor

  constructor(opts: IdbDeviceDBOpts = {}) {
    const { dbName = 'safebyok' } = idbDeviceDBOpts.parse(opts, { where: "In IdbDeviceDB's options" })
    super()
    this.#leaseShelf = leaseShelfOf(dbName)
    this.#bankShelf = bankShelfOf(dbName)
  }
  // --

  // == [Protected, the generic calls of DeviceDB]: doStow, doPeek, doForget, doListLeases, doForgetRawLease, doEnsureCachedBank, doForgetBank, doListBanks

  protected async doStow(row: LeaseRow): Promise<void> {
    await inOneStep(this.#leaseShelf, 'readwrite', (store) => { store.put(row, leaseScopepathOf(row)) })
  }

  protected async doPeek(scope: VaultScope): Promise<unknown> {
    return await inOneStep(this.#leaseShelf, 'readonly', (store) => rowAt(store, leaseScopepathOf(scope)))
  }

  protected async doForget(asked: LeaseQuery): Promise<void> {
    await inOneStep(this.#leaseShelf, 'readwrite', async (store) => {
      const stored = SX.leaseRow.safeParse(await rowAt(store, leaseScopepathOf(asked)))
      if (stored.success && (stored.data.vault_tok === asked.vault_tok)) { store.delete(leaseScopepathOf(asked)) }
    })
  }

  // The keys and the rows come in one transaction, in the same key order, so each row is paired with the key it is filed under.
  protected async doListLeases(): Promise<RawLease[]> {
    const [scopepaths, rows] = await inOneStep(this.#leaseShelf, 'readonly', (store) => Promise.all([
      promisifyRequest<IDBValidKey[]>(store.getAllKeys()), promisifyRequest<unknown[]>(store.getAll()),
    ]))
    return scopepaths.map((scopepath, ii) => ({ scopepath: scopepath as LeaseScopepath, row: rows[ii] }))
  }

  protected async doForgetRawLease(scopepath: LeaseScopepath): Promise<void> {
    await inOneStep(this.#leaseShelf, 'readwrite', (store) => { store.delete(scopepath) })
  }

  protected async doEnsureCachedBank(made: BankRow): Promise<unknown> {
    return await inOneStep(this.#bankShelf, 'readwrite', async (store) => {
      const stored = await rowAt(store, bankScopepathOf(made))
      if (SX.bankRow.safeParse(stored).success) { return stored }
      store.put(made, bankScopepathOf(made))
      return made
    })
  }

  protected async doForgetBank(scope: BankScope): Promise<void> {
    await inOneStep(this.#bankShelf, 'readwrite', (store) => { store.delete(bankScopepathOf(scope)) })
  }

  protected async doListBanks(): Promise<unknown[]> {
    return await inOneStep(this.#bankShelf, 'readonly', (store) => promisifyRequest<unknown[]>(store.getAll()))
  }
  // --
}

/** A device database in this browser's IndexedDB, for a browser app to pass to `Bank.make`. */
export function idbDeviceDB(opts?: IdbDeviceDBOpts): IdbDeviceDB { return new IdbDeviceDB(opts) }

true satisfies Z.core.util.AssertEqual<IdbDeviceDBOpts, Z.input<typeof idbDeviceDBOpts>>
