/** Tests for IdbDeviceDB: the battery every deviceDB must pass, then what is its own (options, its database, its bell). */

// Import fake-indexeddb first: it installs IndexedDB's globals before the store loads, with real transactions and structured clone but no browser.
import 'fake-indexeddb/auto'
import { createStore } from 'idb-keyval'
import { describe, expect, it } from 'vitest'
import { inOneStep } from 'safebyok-big/storage'
import { IdbDeviceDB, idbDeviceDB, leaseBellnameOf, leaseDatabasenameOf, scopepathOf } from '../../src/storage/idb-device-db'
import * as TH from '../test-helpers'

/** The `dbName` each IdbDeviceDB under test was made with. */
const DbNameForDeviceDB = new WeakMap<IdbDeviceDB, string>()

/** An IdbDeviceDB on a fresh database that no other test has touched. */
function makeIdbDeviceDB(dbName = `test-${crypto.randomUUID()}`): IdbDeviceDB {
  const deviceDB = new IdbDeviceDB({ dbName })
  DbNameForDeviceDB.set(deviceDB, dbName)
  return deviceDB
}

/** A second IdbDeviceDB on `deviceDB`'s database, on a connection of its own, as another tab would have. */
function makeTwin(deviceDB: IdbDeviceDB): IdbDeviceDB {
  const dbName = DbNameForDeviceDB.get(deviceDB)!
  TH._cheat_forgetShelf(leaseDatabasenameOf(dbName))
  return makeIdbDeviceDB(dbName)
}

TH.describeDeviceDBLeaseBattery('IdbDeviceDB', {
  makeDeviceDB: () => makeIdbDeviceDB(),
  makeTwin,
  plant:        async (deviceDB, scope, raw) => {
    const shelf = createStore(leaseDatabasenameOf(DbNameForDeviceDB.get(deviceDB)), 'leases')
    await inOneStep(shelf, 'readwrite', (store) => { store.put(raw, scopepathOf(scope)) })
  },
})

describe("IdbDeviceDB's options", () => {
  it("accepts a dbName, or none", () => {
    expect(new IdbDeviceDB({ dbName: 'mine' })).to.be.instanceOf(IdbDeviceDB)
    expect(idbDeviceDB()).to.be.instanceOf(IdbDeviceDB)
  })

  const BadOptsCases = [
    [{ dbName: '' },      'refuses an empty dbName'],
    [{ dbName: 7 },       'refuses a dbName that is not a string'],
    [{ dbname: 'mine' },  'refuses a misspelt field'],
  ] as const
  for (const [opts, blurb] of BadOptsCases) {
    it(blurb, () => { TH.expectSyncRefusal(() => new IdbDeviceDB(opts as never), 'bad_record') })
  }
})

describe("IdbDeviceDB's database and bell", () => {
  it("keeps a row across connections, as a reload does", async () => {
    const deviceDB = makeIdbDeviceDB()
    const row      = await TH.liveLeaseRowOf()
    await deviceDB.stowLease(row)
    expect(await makeTwin(deviceDB).peekLease(TH.WorldScope)).to.have.property('revtok', row.revtok)
  })

  it("keeps each dbName's rows and bell apart", async () => {
    const deviceDB = makeIdbDeviceDB()
    const other    = makeIdbDeviceDB()
    const heard: string[] = []
    other.listen(({ banklabel }) => { heard.push(`other:${banklabel}`) })
    deviceDB.listen(({ banklabel }) => { heard.push(banklabel) })
    await deviceDB.stowLease(await TH.liveLeaseRowOf())
    await TH.eventually(() => heard.length > 0)
    await TH.aWhile()
    expect(heard).to.deep.equal([TH.WorldScope.banklabel])
    expect(await other.peekLease(TH.WorldScope)).to.be.null
  })

  it("passes on no message on its bell that is not a bank's scope", async () => {
    const deviceDB = makeIdbDeviceDB()
    const heard: unknown[] = []
    deviceDB.listen((scope) => { heard.push(scope) })
    const channel  = new BroadcastChannel(leaseBellnameOf(DbNameForDeviceDB.get(deviceDB)))
    channel.postMessage({ userid: 'u1' })
    channel.postMessage({ ...TH.WorldScope, extra: 'dropped' })
    channel.close()
    await TH.eventually(() => heard.length > 0)
    await TH.aWhile()
    expect(heard).to.deep.equal([TH.WorldScope])
  })
})
