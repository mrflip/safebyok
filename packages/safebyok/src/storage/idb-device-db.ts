/** The deviceDB in this browser's IndexedDB. */

import type { UseStore } from 'idb-keyval'
import { dbprefixOf, inOneStep, rowAt, versionedShelfOf } from 'safebyok-big/storage'
import type { LeaseRecord, LeaseScope } from '../shapes/shapes-stamps'
import type { Devicetok, Userid } from '../shapes/primitives'
import { type DevicetokScopepath, type IdbDeviceDBOpts, type LeaseScopepath, idbDeviceDBOpts } from '../shapes/shapes-device-db'
import { DeviceDB } from './device-db'

// == [The database]: LeaseDBVersion, leaseShelfOf, leaseDatabasenameOf, leaseBellnameOf, scopepathOf, devicetokScopepathOf

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

/** The name of the BroadcastChannel that tells every tab of the lease records stowed in the database of `dbName`. */
export function leaseBellnameOf(dbName?: string): string { return `${dbprefixOf(dbName)}:lease` }

/** Where the lease record at `scope` is filed: one for each gate. */
export function scopepathOf({ userid, banklabel, labelpath }: LeaseScope): LeaseScopepath { return [userid, banklabel, labelpath] }

// It never meets a lease record's scopepath, which has three parts.
/** Where the devicetok of the user `userid` is filed, in the same object store as the lease records: one for each user. */
export function devicetokScopepathOf(userid: Userid): DevicetokScopepath { return [userid, 'devicetok'] }
// --

/** A device database of each user's devicetok and each gate's lease record, in this browser's IndexedDB, shared by every tab of its origin.
 * A live record's leaseKey is stored as its `CryptoKey` handle, by structured clone, and never as bytes (G4).
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

  // == [Protected, the calls of DeviceDB]: doPeekLease, doStowLease, doRing, doListen, doStowDevicetok

  protected async doPeekLease(scope: LeaseScope): Promise<unknown> {
    return await inOneStep(this.#shelf, 'readonly', (store) => rowAt(store, scopepathOf(scope)))
  }

  protected async doStowLease(record: LeaseRecord, isReplaced: (raw: unknown) => boolean): Promise<unknown> {
    return await inOneStep(this.#shelf, 'readwrite', async (store) => {
      const before = await rowAt(store, scopepathOf(record))
      if (isReplaced(before)) { store.put(record, scopepathOf(record)) }
      return before
    })
  }

  // A channel of its own for each ring, so that every channel listening on the bell, this tab's own among them, hears it.
  protected doRing({ userid, banklabel, labelpath }: LeaseScope): void {
    const channel = new BroadcastChannel(this.#bellname)
    channel.postMessage({ userid, banklabel, labelpath })
    channel.close()
  }

  protected doListen(hear: (rung: unknown) => void): () => void {
    const channel = new BroadcastChannel(this.#bellname)
    channel.addEventListener('message', ({ data }: MessageEvent<unknown>) => { hear(data) })
    return () => { channel.close() }
  }

  protected async doStowDevicetok(userid: Userid, devicetok: Devicetok, isReplaced: (raw: unknown) => boolean): Promise<unknown> {
    return await inOneStep(this.#shelf, 'readwrite', async (store) => {
      const before = await rowAt(store, devicetokScopepathOf(userid))
      if (isReplaced(before)) { store.put(devicetok, devicetokScopepathOf(userid)) }
      return before
    })
  }
  // --
}

/** A device database in this browser's IndexedDB, for a browser app to pass to `Device.make`. */
export function idbDeviceDB(opts?: IdbDeviceDBOpts): IdbDeviceDB { return new IdbDeviceDB(opts) }
