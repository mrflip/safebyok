/** The deviceDB in this browser's IndexedDB. */

import { promisifyRequest, type UseStore } from 'idb-keyval'
import type * as Z from 'zod'
import { objCheck } from '../helpers/validator'
import type { VaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import type { LeaseQuery, LeaseRow, LeaseScopepath, RawLease } from '../shapes/shapes-storage'
import { DeviceDBVersion } from '../helpers/consts'
import { DeviceDB } from './device-db-new'
import { versionedShelfOf } from './idb-shelf'
import { inOneStep, rowAt } from './idb-transaction'

// == [Options]: IdbDeviceDBOpts, idbDeviceDBOpts

/** What an IdbDeviceDB is made with. */
export interface IdbDeviceDBOpts {
  /** The name its database is made under, 'safebyok' if left out. */
  dbName?: string | undefined
}

const idbDeviceDBOpts = objCheck(({ str }) => ({ dbName: str.min(1).optional() }), 'bad_option')
// --

// == [The database]: leaseScopepathOf, deviceShelfOf

/** The scopepath of the lease row at `scope`. */
const leaseScopepathOf = ({ applabel, user_id, vaultlabel }: VaultScope): LeaseScopepath => [applabel, user_id, vaultlabel]

/** The shelf of the device database of `dbName`. */
const deviceShelfOf = (dbName: string): UseStore => versionedShelfOf({
  dbName, dbstem: 'device', version: DeviceDBVersion, storename: 'leases', oldnames: [`${dbName}:device_db`, `${dbName}:device-v1`],
})
// --

/** A device store that keeps this device's leases in its browser's IndexedDB. */
export class IdbDeviceDB extends DeviceDB {
  // == [Props]: #shelf

  readonly #shelf: UseStore
  // --

  // == [Construction]: constructor

  constructor(opts: IdbDeviceDBOpts = {}) {
    const { dbName = 'safebyok' } = idbDeviceDBOpts.parse(opts, { where: "In IdbDeviceDB's options" })
    super()
    this.#shelf = deviceShelfOf(dbName)
  }
  // --

  // == [Protected, the generic calls of DeviceDB]: doStow, doPeek, doForget, doListLeases, doDelRawLease

  protected async doStow(row: LeaseRow): Promise<void> {
    await inOneStep(this.#shelf, 'readwrite', (store) => { store.put(row, leaseScopepathOf(row)) })
  }

  protected async doPeek(scope: VaultScope): Promise<unknown> {
    return await inOneStep(this.#shelf, 'readonly', (store) => rowAt(store, leaseScopepathOf(scope)))
  }

  protected async doForget(asked: LeaseQuery): Promise<void> {
    await inOneStep(this.#shelf, 'readwrite', async (store) => {
      const stored = SX.leaseRow.safeParse(await rowAt(store, leaseScopepathOf(asked)))
      if (stored.success && (stored.data.vault_tok === asked.vault_tok)) { store.delete(leaseScopepathOf(asked)) }
    })
  }

  // The keys and the rows come in one transaction, in the same key order, so each row is paired with the key it is filed under.
  protected async doListLeases(): Promise<RawLease[]> {
    const [scopepaths, rows] = await inOneStep(this.#shelf, 'readonly', (store) => Promise.all([
      promisifyRequest<IDBValidKey[]>(store.getAllKeys()), promisifyRequest<unknown[]>(store.getAll()),
    ]))
    return scopepaths.map((scopepath, idx) => ({ scopepath: scopepath as LeaseScopepath, row: rows[idx] }))
  }

  protected async doDelRawLease(scopepath: LeaseScopepath): Promise<void> {
    await inOneStep(this.#shelf, 'readwrite', (store) => { store.delete(scopepath) })
  }
  // --
}

/** A device store in this browser's IndexedDB, what a browser app hands `Bank.make`. */
export const idbDeviceDB = (opts?: IdbDeviceDBOpts): IdbDeviceDB => new IdbDeviceDB(opts)

true satisfies Z.core.util.AssertEqual<IdbDeviceDBOpts, Z.input<typeof idbDeviceDBOpts>>
