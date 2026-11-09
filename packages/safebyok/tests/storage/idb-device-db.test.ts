/** IdbDeviceDB: the battery every DeviceDB runs, and what is its own: options, separate databases, and the old databases it deletes. */

// fake-indexeddb installs IndexedDB's globals before the DeviceDB loads: real transactions and structured clone, with no browser.
import 'fake-indexeddb/auto'
import { createStore, promisifyRequest, set } from 'idb-keyval'
import { describe, expect, it, vi } from 'vitest'
import { makeLeaseKey } from '../../src/helpers/crypto'
import { VaultError } from '../../src/refusals/errors'
import { IdbDeviceDB, idbDeviceDB } from '../../src/storage/idb-device-db'
import { inOneStep } from '../../src/storage/idb-transaction'
import * as TH from '../test-helpers'

// == [World]: makeDeviceDB, idbRowsOf, failNextCall, dbNamesNow, plantClosedDB

/** The database each DeviceDB under test was made over, by DeviceDB. */
const dbNameOf = new WeakMap<IdbDeviceDB, string>()

/** A fresh dbName, which no other test has touched. */
const freshDbName = (): string => `test-${crypto.randomUUID()}`

/** A DeviceDB over a database of its own. */
const makeDeviceDB = (dbName = freshDbName()): IdbDeviceDB => {
  const deviceDB = new IdbDeviceDB({ dbName })
  dbNameOf.set(deviceDB, dbName)
  return deviceDB
}

/** The backdoor to a DeviceDB's lease and bank rows, through connections of its own to the DeviceDB's databases. */
const idbRowsOf = (deviceDB: IdbDeviceDB): TH.DeviceDBRowCheats => {
  const leaseShelf = createStore(`${dbNameOf.get(deviceDB)!}:device-v001-001-001`, 'leases')
  const bankShelf = createStore(`${dbNameOf.get(deviceDB)!}:bank-v001-001-001`, 'bank')
  return {
    plantLeaseRow: async ({ applabel, user_id, vaultlabel }, row) => { await inOneStep(leaseShelf, 'readwrite', (store) => { store.put(row, [applabel, user_id, vaultlabel]) }) },
    leaseRowsOf:   async () => await inOneStep(leaseShelf, 'readonly', (store) => promisifyRequest<unknown[]>(store.getAll())),
    plantBankRow:  async ({ applabel, user_id }, row) => { await inOneStep(bankShelf, 'readwrite', (store) => { store.put(row, [applabel, user_id]) }) },
    bankRowsOf:    async () => await inOneStep(bankShelf, 'readonly', (store) => promisifyRequest<unknown[]>(store.getAll())),
  }
}

// The DeviceDB's databases are opened first, so neither upgrade transaction is the one to fail.
/** Makes the next transaction any DeviceDB opens fail, as it does when the browser closes the database under the page. */
const failNextCall = async (deviceDB: IdbDeviceDB): Promise<void> => {
  await deviceDB.listLeases()
  await deviceDB.listRawBanks()
  vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(() => {
    throw new DOMException("The database connection is closing.", 'InvalidStateError')
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
  it("keeps the leases of each dbName apart, and shares them between DeviceDBs of one", async () => {
    const deviceDB = makeDeviceDB()
    await deviceDB.stow({ ...TH.vaultScope, vault_tok: 'tok_one', proved_at: Date.now(), lease_key: await makeLeaseKey() })
    expect(await makeDeviceDB().listLeases()).to.deep.equal([])
    expect(await makeDeviceDB(dbNameOf.get(deviceDB)).listLeases()).to.have.lengthOf(1)
  })

  it("names its database with its version", async () => {
    const dbName = freshDbName()
    await makeDeviceDB(dbName).listLeases()
    expect(await dbNamesNow()).to.include(`${dbName}:device-v001-001-001`)
  })

  it("keeps its bank rows in a database of their own, named with its version", async () => {
    const dbName = freshDbName()
    const deviceDB = makeDeviceDB(dbName)
    await deviceDB.stow({ ...TH.vaultScope, vault_tok: 'tok_one', proved_at: Date.now(), lease_key: await makeLeaseKey() })
    await deviceDB.ensureCachedBank(TH.bankScope)
    expect(await dbNamesNow()).to.include.members([`${dbName}:device-v001-001-001`, `${dbName}:bank-v001-001-001`])
  })

  it("keeps the bank rows of each dbName apart", async () => {
    const dbName = freshDbName()
    const made = await makeDeviceDB(dbName).ensureCachedBank(TH.bankScope)
    expect(await makeDeviceDB(dbName).ensureCachedBank(TH.bankScope)).to.deep.equal(made)
    expect(await makeDeviceDB().ensureCachedBank(TH.bankScope)).to.not.deep.equal(made)
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
    const oldnames = [`${dbName}:device_db`, `${dbName}:device-v0`, `${dbName}:device-v1`, `${dbName}:device-v001-001-000`, `${dbName}:device-v000-009-009`]
    await plantClosedDB(oldnames[0]!, 'records')
    for (const oldname of oldnames.slice(1)) { await plantClosedDB(oldname, 'leases') }
    expect(await dbNamesNow()).to.include.members(oldnames)
    await makeDeviceDB(dbName).listLeases()
    await vi.waitFor(async () => {
      const dbnames = await dbNamesNow()
      expect(dbnames.filter((dbname) => oldnames.includes(dbname))).to.deep.equal([])
    })
    expect(await dbNamesNow()).to.include(`${dbName}:device-v001-001-001`)
  })

  it("deletes the old core's device database and the first version's by name, in a browser that cannot list its databases", async () => {
    const dbName = freshDbName()
    const oldnames = [`${dbName}:device_db`, `${dbName}:device-v1`]
    await plantClosedDB(oldnames[0]!, 'records')
    await plantClosedDB(oldnames[1]!, 'leases')
    vi.spyOn(indexedDB, 'databases').mockImplementationOnce(() => { throw new TypeError("indexedDB.databases is not a function") })
    await makeDeviceDB(dbName).listLeases()
    await vi.waitFor(async () => {
      const dbnames = await dbNamesNow()
      expect(dbnames.filter((dbname) => oldnames.includes(dbname))).to.deep.equal([])
    })
  })

  it("leaves a newer version's database, as an updated tab of the page made it", async () => {
    const dbName = freshDbName()
    const newername = `${dbName}:device-v001-002-000`
    await plantClosedDB(newername, 'leases')
    await makeDeviceDB(dbName).listLeases()
    await TH.aWhile()
    expect(await dbNamesNow()).to.include(newername)
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
