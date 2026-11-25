/** The deviceDB in this browser's IndexedDB. */

import type { UseStore } from 'idb-keyval'
import { dbprefixOf, inOneStep, rowAt, versionedShelfOf } from 'safebyok-big/storage'
import type { BankScope, LeaseRow } from '../shapes/shapes-stamps'
import { type IdbDeviceDBOpts, type LeaseScopepath, idbDeviceDBOpts } from '../shapes/shapes-device-db'
import { DeviceDB } from './device-db'

// == [The database]: LeaseDBVersion, leaseShelfOf, leaseDatabasenameOf, leaseBellnameOf, scopepathOf

// Zero-padded, so that a database name sorts as its version does. Its stem is not safebyok-big's `device`, whose
// databases a shelf of the same stem at a newer version would delete.
/** The layout version of the lease database, in three zero-padded parts. */
export const LeaseDBVersion = '001-001-001'

/** The shelf of the lease database `safebyok-<dbName>:lease-v<version>`, or `safebyok:lease-v<version>` with no `dbName`. */
function leaseShelfOf(dbName: string | undefined): UseStore {
  return versionedShelfOf({ dbprefix: dbprefixOf(dbName), dbstem: 'lease', version: LeaseDBVersion, storename: 'leases', oldnames: [] })
}

/** The name of the IndexedDB database an IdbDeviceDB of `dbName` opens. */
export function leaseDatabasenameOf(dbName?: string): string { return `${dbprefixOf(dbName)}:lease-v${LeaseDBVersion}` }

/** The name of the BroadcastChannel that tells every tab of the lease rows stored in the database of `dbName`. */
export function leaseBellnameOf(dbName?: string): string { return `${dbprefixOf(dbName)}:lease` }

/** Where the lease row of `scope`'s bank is filed. */
export function scopepathOf({ userid, banklabel }: BankScope): LeaseScopepath { return [userid, banklabel] }
// --

/** A device database of each bank's lease row, in this browser's IndexedDB, shared by every tab of its origin.
 * A row's leaseKey is stored as its `CryptoKey` handle, by structured clone, and never as bytes (G4).
 */
export class IdbDeviceDB extends DeviceDB {
  // == [Props]: #shelf, #bellname

  readonly #shelf: UseStore
  readonly #bellname: string
  // --

  // == [Construction]: constructor

  constructor(opts: IdbDeviceDBOpts = {}) {
    const { dbName } = idbDeviceDBOpts.parse(opts, { where: "In IdbDeviceDB's options" })
    super()
    this.#shelf    = leaseShelfOf(dbName)
    this.#bellname = leaseBellnameOf(dbName)
  }
  // --

  // == [Protected, the calls of DeviceDB]: doPeekLease, doStowLease, doRing, doListen

  protected async doPeekLease(scope: BankScope): Promise<unknown> {
    return await inOneStep(this.#shelf, 'readonly', (store) => rowAt(store, scopepathOf(scope)))
  }

  protected async doStowLease(row: LeaseRow, isReplaced: (raw: unknown) => boolean): Promise<unknown> {
    return await inOneStep(this.#shelf, 'readwrite', async (store) => {
      const before = await rowAt(store, scopepathOf(row))
      if (isReplaced(before)) { store.put(row, scopepathOf(row)) }
      return before
    })
  }

  // A channel of its own for each ring, so that every channel listening on the bell, this tab's own among them, hears it.
  protected doRing({ userid, banklabel }: BankScope): void {
    const channel = new BroadcastChannel(this.#bellname)
    channel.postMessage({ userid, banklabel })
    channel.close()
  }

  protected doListen(hear: (rung: unknown) => void): () => void {
    const channel = new BroadcastChannel(this.#bellname)
    channel.addEventListener('message', ({ data }: MessageEvent<unknown>) => { hear(data) })
    return () => { channel.close() }
  }
  // --
}

/** A device database in this browser's IndexedDB, for a browser app to pass to `Device.make`. */
export function idbDeviceDB(opts?: IdbDeviceDBOpts): IdbDeviceDB { return new IdbDeviceDB(opts) }
