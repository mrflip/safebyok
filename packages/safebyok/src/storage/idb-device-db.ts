/** The deviceDB in this browser's IndexedDB: each generic call one transaction, the leaseKey kept as a handle by structured clone. */

import { createStore, promisifyRequest, type UseStore } from 'idb-keyval'
import type * as Z from 'zod'
import { objCheck } from '../helpers/validator'
import type { VaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import type { LeaseQuery, LeaseRow } from '../shapes/shapes-storage'
import { DeviceDB } from './device-db-new'
import { inOneStep, rowAt } from './idb-transaction'

// == [Options]: IdbDeviceDBOpts, idbDeviceDBOpts

/** What an IdbDeviceDB is made with. */
export interface IdbDeviceDBOpts {
  /** The name its database is made under, 'safebyok' if left out. */
  dbName?: string | undefined
}

const idbDeviceDBOpts = objCheck(({ str }) => ({ dbName: str.min(1).optional() }), 'bad_option')
// --

// == [The database]: DeviceDBVersion, LeaseScopepath, leaseScopepathOf, deviceShelfOf, oldDeviceDBNamesOf

// The version in the database's name marks a layout, so an old or unsafe one is known by name alone, and
// deleted unread. Raise it when the stored layout changes; every name below it is deleted.
const DeviceDBVersion = 1

/** Where the shelf files a vault's lease row. */
type LeaseScopepath = [applabel: string, user_id: string, vaultlabel: string]

/** The scopepath of the lease row at `scope`. */
const leaseScopepathOf = ({ applabel, user_id, vaultlabel }: VaultScope): LeaseScopepath => [applabel, user_id, vaultlabel]

// The old databases are deleted on the shelf's first transaction and never awaited: a tab still holding one
// open holds its delete back until it closes (notes/wontfix.md), and the shelf's own database is another.
/** The shelf of the database `dbName`, whose first transaction deletes every older device database of `dbName`. */
const deviceShelfOf = (dbName: string): UseStore => {
  const shelf = createStore(`${dbName}:device-v${String(DeviceDBVersion)}`, 'leases')
  let isWiped = false
  return async (txMode, callback) => {
    if (! isWiped) {
      isWiped = true
      for (const oldname of oldDeviceDBNamesOf(dbName)) { indexedDB.deleteDatabase(oldname) }
    }
    return await shelf(txMode, callback)
  }
}

/** The name of every device database of `dbName` older than this version: the old core's, and each earlier version's. */
const oldDeviceDBNamesOf = (dbName: string): string[] => [
  `${dbName}:device_db`,
  ...Array.from({ length: DeviceDBVersion }, (_slot, ii) => `${dbName}:device-v${String(ii)}`),
]
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

  // == [Protected, the generic calls of DeviceDB]: doStow, doPeek, doForget, doListLeases

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

  protected async doListLeases(): Promise<unknown[]> {
    return await inOneStep(this.#shelf, 'readonly', (store) => promisifyRequest<unknown[]>(store.getAll()))
  }
  // --
}

/** A device store in this browser's IndexedDB, what a browser app hands `Bank.make`. */
export const idbDeviceDB = (opts?: IdbDeviceDBOpts): IdbDeviceDB => new IdbDeviceDB(opts)

true satisfies Z.core.util.AssertEqual<IdbDeviceDBOpts, Z.input<typeof idbDeviceDBOpts>>
