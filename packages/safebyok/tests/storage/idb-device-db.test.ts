/** IdbDeviceDB: the battery every DeviceDB runs, and what is its own: options, separate databases, and the old databases it deletes. */

// fake-indexeddb installs IndexedDB's globals before the store loads: real transactions and structured clone, with no browser.
import 'fake-indexeddb/auto'
import { createStore, promisifyRequest, set } from 'idb-keyval'
import { describe, expect, it, vi } from 'vitest'
import { makeLeaseKey } from '../../src/helpers/crypto'
import { VaultError } from '../../src/refusals/errors'
import { IdbDeviceDB, idbDeviceDB } from '../../src/storage/idb-device-db'
import { inOneStep } from '../../src/storage/idb-transaction'
import * as TH from '../test-helpers'

// == [World]: makeDeviceDB, idbRowsOf, failNextCall, dbNamesNow, plantClosedDB

/** The database each store under test was made over, by store. */
const dbNameOf = new WeakMap<IdbDeviceDB, string>()

/** A fresh dbName, which no other test has touched. */
const freshDbName = (): string => `test-${crypto.randomUUID()}`

/** A store over a database of its own. */
const makeDeviceDB = (dbName = freshDbName()): IdbDeviceDB => {
  const deviceDB = new IdbDeviceDB({ dbName })
  dbNameOf.set(deviceDB, dbName)
  return deviceDB
}

/** The backdoor to a store's lease rows, through a connection of its own to the store's database. */
const idbRowsOf = (deviceDB: IdbDeviceDB): TH.DeviceDBRowCheats => {
  const shelf = createStore(`${dbNameOf.get(deviceDB)!}:device-v1`, 'leases')
  return {
    plantLeaseRow: async ({ applabel, user_id, vaultlabel }, row) => { await inOneStep(shelf, 'readwrite', (store) => { store.put(row, [applabel, user_id, vaultlabel]) }) },
    leaseRowsOf:   async () => await inOneStep(shelf, 'readonly', (store) => promisifyRequest<unknown[]>(store.getAll())),
  }
}

// The store's database is opened first, so its upgrade transaction is not the one to fail.
/** Makes the next transaction any store opens fail, as it does when the browser closes the database under the page. */
const failNextCall = async (deviceDB: IdbDeviceDB): Promise<void> => {
  await deviceDB.listLeases()
  vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(() => {
    throw new DOMException('The database connection is closing.', 'InvalidStateError')
  })
}

/** The name of every database IndexedDB holds now. */
const dbNamesNow = async (): Promise<string[]> => {
  const dbs = await indexedDB.databases()
  return dbs.map((db) => db.name).filter((dbname) => dbname !== undefined)
}

// idb-keyval holds its connection open for the page's life, as an old tab would; this one closes, as a closed tab has.
/** Makes the database `dbname` holding one row in `storename`, and closes it. */
const plantClosedDB = async (dbname: string, storename: string): Promise<void> => {
  const opening = indexedDB.open(dbname)
  opening.addEventListener('upgradeneeded', () => { opening.result.createObjectStore(storename) })
  const db = await promisifyRequest(opening)
  const tx = db.transaction(storename, 'readwrite')
  tx.objectStore(storename).put({ wrapped: 'old' }, 'lease')
  await promisifyRequest(tx)
  db.close()
}
// --

TH.describeDeviceDBBattery("IdbDeviceDB", {
  makeDeviceDB:        () => makeDeviceDB(),
  _cheat_rowsOf:       idbRowsOf,
  _cheat_failNextCall: failNextCall,
})

describe("IdbDeviceDB's options", () => {
  it("takes a dbName, or none", () => {
    expect(new IdbDeviceDB({ dbName: 'mine' })).to.be.instanceOf(IdbDeviceDB)
    expect(idbDeviceDB()).to.be.instanceOf(IdbDeviceDB)
  })

  it("refuses a dbName or a field it cannot use", () => {
    for (const opts of [{ dbName: '' }, { dbName: 7 }, { dbname: 'mine' }]) {
      expect(() => new IdbDeviceDB(opts as never)).to.throw(VaultError).with.property('refusalkind', 'bad_option')
    }
  })
})

describe("IdbDeviceDB's database", () => {
  it("keeps the leases of each dbName apart, and shares them between stores of one", async () => {
    const deviceDB = makeDeviceDB()
    await deviceDB.stow({ ...TH.vaultScope, vault_tok: 'tok_one', proved_at: Date.now(), lease_key: await makeLeaseKey() })
    expect(await makeDeviceDB().listLeases()).to.deep.equal([])
    expect(await makeDeviceDB(dbNameOf.get(deviceDB)).listLeases()).to.have.lengthOf(1)
  })

  it("names its database with its version", async () => {
    const dbName = freshDbName()
    await makeDeviceDB(dbName).listLeases()
    expect(await dbNamesNow()).to.include(`${dbName}:device-v1`)
  })

  it("refuses each call where there is no IndexedDB", async () => {
    const deviceDB = makeDeviceDB()
    vi.stubGlobal('indexedDB', undefined)
    try {
      const refusal = await TH.expectRefusal(deviceDB.listLeases(), 'storage_unavailable')
      expect(refusal.message).to.match(/no IndexedDB/)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("IdbDeviceDB's wipe of the old databases", () => {
  it("deletes the old core's device database and each earlier version's, unread, on its first call", async () => {
    const dbName = freshDbName()
    const oldnames = [`${dbName}:device_db`, `${dbName}:device-v0`]
    await plantClosedDB(oldnames[0]!, 'records')
    await plantClosedDB(oldnames[1]!, 'leases')
    expect(await dbNamesNow()).to.include.members(oldnames)
    await makeDeviceDB(dbName).listLeases()
    await vi.waitFor(async () => {
      const dbnames = await dbNamesNow()
      expect(dbnames.filter((dbname) => oldnames.includes(dbname))).to.deep.equal([])
    })
    expect(await dbNamesNow()).to.include(`${dbName}:device-v1`)
  })

  it("answers its calls while another tab holds an old database open", async () => {
    const dbName = freshDbName()
    await set('lease', { wrapped: 'old' }, createStore(`${dbName}:device_db`, 'records'))
    const deviceDB = makeDeviceDB(dbName)
    expect(await deviceDB.listLeases()).to.deep.equal([])
    await TH.aWhile()
    expect(await dbNamesNow()).to.include(`${dbName}:device_db`)
  })

  it("leaves another dbName's databases, and the vault's, where they stand", async () => {
    const dbName = freshDbName()
    const otherName = freshDbName()
    await plantClosedDB(`${otherName}:device_db`, 'records')
    await plantClosedDB(`${dbName}:vaults`, 'rows')
    await makeDeviceDB(dbName).listLeases()
    await TH.aWhile()
    expect(await dbNamesNow()).to.include.members([`${otherName}:device_db`, `${dbName}:vaults`])
  })
})
