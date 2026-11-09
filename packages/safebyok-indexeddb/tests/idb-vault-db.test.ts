/** IdbVaultDB: the battery every VaultDB runs, and what is its own: options, separate databases and users, and IndexedDB's failures. */

// fake-indexeddb installs IndexedDB's globals before the adapter loads: real transactions and structured clone, with no browser.
import 'fake-indexeddb/auto'
import { createStore, promisifyRequest } from 'idb-keyval'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as TH from 'safebyok/testing'
import * as DB from 'safebyok/storage'
import { IdbVaultDB, idbVaultDB } from '../src/idb-vault-db'
import type { IdbVaultDBOpts } from '../src/idb-vault-db'
import { boxPlaceOf, boxScopepathOf, filedIn, lifeRangeOf, vaultScopepathOf } from '../src/shelf'

// == [World]: makeVaultDB, idbRowsOf, failNextCall, dbNamesNow, plantClosedDB

/** The database each VaultDB under test was made over, by VaultDB. */
const dbNameOf = new WeakMap<IdbVaultDB, string>()

/** A VaultDB over a database of its own, which no other test has touched. */
const makeVaultDB = (opts: IdbVaultDBOpts = {}): IdbVaultDB => {
  const dbName = `test-${crypto.randomUUID()}`
  const vaultDB = new IdbVaultDB({ ...opts, dbName })
  dbNameOf.set(vaultDB, dbName)
  return vaultDB
}

/** The connection a VaultDB makes its transactions on, caught as it lists a bank. */
const connectionOf = async (vaultDB: IdbVaultDB): Promise<unknown> => {
  const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction')
  try {
    await vaultDB.listVaults(TH.bankScope)
    return transaction.mock.contexts[0]
  } finally {
    transaction.mockRestore()
  }
}

// The twin's connection is compared, not its shelf: a forgotten shelf whose name drifted would share the page's connection unseen.
/** A second VaultDB over the same database, on a connection of its own, as another tab holds. */
const makeTwin = async (vaultDB: IdbVaultDB): Promise<IdbVaultDB> => {
  const dbName = dbNameOf.get(vaultDB)!
  TH._cheat_forgetShelf(`${dbName}:vaults-v${DB.VaultsDBVersion}`)
  const twin = new IdbVaultDB({ dbName })
  const [ours, theirs] = [await connectionOf(vaultDB), await connectionOf(twin)]
  expect(theirs, 'the twin on a connection of its own').to.be.instanceOf(IDBDatabase).and.not.eq(ours)
  return twin
}

/** The backdoor to a VaultDB's rows, through a connection of its own to the VaultDB's database. */
const idbRowsOf = (vaultDB: IdbVaultDB): TH.VaultDBRowCheats => {
  const shelf = createStore(`${dbNameOf.get(vaultDB)!}:vaults-v${DB.VaultsDBVersion}`, 'rows')
  return {
    plantVaultRow: async (scope, row) => { await DB.inOneStep(shelf, 'readwrite', (store) => { store.put(row, vaultScopepathOf(scope)) }) },
    plantBoxRow:   async (scope, vault_tok, row) => { await DB.inOneStep(shelf, 'readwrite', (store) => { store.put(row, boxScopepathOf({ ...scope, vault_tok })) }) },
    vaultRowOf:    async (scope) => await DB.inOneStep(shelf, 'readonly', (store) => DB.rowAt(store, vaultScopepathOf(scope))),
    boxRowsOf:     async (scope, vault_tok) => {
      const filed = await DB.inOneStep(shelf, 'readonly', (store) => filedIn(store, lifeRangeOf({ ...scope, vault_tok })))
      return new Map(filed.map(({ scopepath, row }) => [boxPlaceOf(scopepath).boxlabel, row]))
    },
  }
}

/** Makes the next transaction any VaultDB opens fail, as it does when the browser closes the database under the page. */
const failNextCall = (): void => {
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
/** Makes the database `dbname` holding one row in an object store, and closes it. */
const plantClosedDB = async (dbname: string): Promise<void> => {
  const storename = 'rows'
  const opening = indexedDB.open(dbname)
  opening.addEventListener('upgradeneeded', () => { opening.result.createObjectStore(storename) })
  const db = await promisifyRequest(opening)
  const tx = db.transaction(storename, 'readwrite')
  tx.objectStore(storename).put({ wrapped: 'old' }, 'row')
  await promisifyRequest(tx)
  db.close()
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
// --

TH.describeVaultDBBattery("IdbVaultDB", {
  makeVaultDB,
  makeTwin,
  _cheat_rowsOf:       idbRowsOf,
  _cheat_failNextCall: failNextCall,
})

describe("IdbVaultDB's options", () => {
  it("takes a dbName and the AdapterVaultDB's own options", () => {
    expect(new IdbVaultDB({ dbName: 'mine', maxRecordBytes: 1000 })).to.be.instanceOf(IdbVaultDB)
    expect(idbVaultDB()).to.be.instanceOf(IdbVaultDB)
  })

  it("refuses a dbName, a maxRecordBytes or a field it cannot use", () => {
    for (const opts of [{ dbName: '' }, { dbName: 7 }, { maxRecordBytes: -1 }, { dbname: 'mine' }]) {
      expect(() => new IdbVaultDB(opts as never)).to.throw(DB.VaultError).with.property('refusalkind', 'bad_option')
    }
  })
})

describe("IdbVaultDB's databases", () => {
  it("keeps the rows of each dbName apart", async () => {
    const vaultDB = makeVaultDB()
    const other = makeVaultDB()
    await vaultDB.putVault(TH.vaultAt(), { prior: DB.VoidRevision })
    const { val: otherListed } = await other.listVaults(TH.bankScope)
    const twin = await makeTwin(vaultDB)
    const { val: twinListed } = await twin.listVaults(TH.bankScope)
    expect(otherListed.vaults).to.be.empty
    expect(twinListed.vaults).to.have.lengthOf(1)
  })

  it("keeps apart the rows of users whose ids share a beginning", async () => {
    const vaultDB = makeVaultDB()
    const longer = { ...TH.bankScope, user_id: `${TH.bankScope.user_id}0` }
    await vaultDB.putVault(TH.vaultAt(), { prior: DB.VoidRevision })
    await vaultDB.putVault(TH.vaultAt(0, 'life1', longer), { prior: DB.VoidRevision })
    await vaultDB.putBox(TH.boxAt(0, 'life1', longer), { prior: DB.VoidRevision })
    const { val: listed } = await vaultDB.listVaults(TH.bankScope)
    const { val: boxesListed } = await vaultDB.listBoxes({ ...TH.vaultScope, vault_tok: 'life1' })
    const { val: tidied } = await vaultDB.tidyGone(TH.bankScope)
    expect(listed.vaults).to.have.lengthOf(1)
    expect(boxesListed.boxes).to.be.empty
    expect(tidied.totalCount).to.eq(0)
  })

  it("hears a write from another VaultDB over the same database", async () => {
    const vaultDB = makeVaultDB()
    const notices: unknown[] = []
    const unwatch = vaultDB.watch(TH.bankScope, (notice) => { notices.push(notice) })
    const twin = await makeTwin(vaultDB)
    await twin.putVault(TH.vaultAt(), { prior: DB.VoidRevision })
    await TH.eventually(() => notices.length > 0)
    expect(notices).to.have.lengthOf(1)
    unwatch()
  })
})

describe("IdbVaultDB's database name and wipe", () => {
  it("names its database with its version", async () => {
    const vaultDB = makeVaultDB()
    await vaultDB.listVaults(TH.bankScope)
    expect(await dbNamesNow()).to.include(`${dbNameOf.get(vaultDB)!}:vaults-v${DB.VaultsDBVersion}`)
    expect(DB.VaultsDBVersion).to.match(/^\d{3}-\d{3}-\d{3}$/)
  })

  it("deletes the unversioned vault database and each older version's, unread, on its first call", async () => {
    const dbName = `test-${crypto.randomUUID()}`
    const oldnames = [`${dbName}:vaults`, `${dbName}:vaults-v1`, `${dbName}:vaults-v001-001-000`, `${dbName}:vaults-v000-009-009`]
    for (const oldname of oldnames) { await plantClosedDB(oldname) }
    expect(await dbNamesNow()).to.include.members(oldnames)
    await new IdbVaultDB({ dbName }).listVaults(TH.bankScope)
    await vi.waitFor(async () => {
      const dbnames = await dbNamesNow()
      expect(dbnames.filter((dbname) => oldnames.includes(dbname))).to.deep.equal([])
    })
  })

  it("leaves a newer version's database, another dbName's, and the device database's where they stand", async () => {
    const dbName = `test-${crypto.randomUUID()}`
    const kept = [`${dbName}:vaults-v001-002-000`, `${dbName}:device_db`, `${dbName}:device-v001-001-001`, `other-${dbName}:vaults`]
    for (const keptname of kept) { await plantClosedDB(keptname) }
    await new IdbVaultDB({ dbName }).listVaults(TH.bankScope)
    await TH.aWhile()
    expect(await dbNamesNow()).to.include.members(kept)
  })
})

describe("IdbVaultDB's refusals", () => {
  const TroubleCases = [
    ["QuotaExceededError", "vault_full",          /no room left/,     'refuses a write IndexedDB has no room for'],
    ["InvalidStateError",  "storage_unavailable", /closed under it/,  'refuses a call once the database is closed under it'],
    ["SecurityError",      "storage_unavailable", /withholds/,        'refuses a call where the browser withholds IndexedDB'],
    ["UnknownError",       "storage_unavailable", /IndexedDB failed/, 'refuses a call that fails in IndexedDB for any other reason'],
  ] as const

  for (const [errname, refusalkind, said, blurb] of TroubleCases) {
    it(blurb, async () => {
      const vaultDB = makeVaultDB()
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('IndexedDB says no.', errname) })
      const refusal = await TH.expectRefusal(vaultDB.putVault(TH.vaultAt(), { prior: DB.VoidRevision }), refusalkind)
      expect(refusal.message).to.match(said)
      expect(refusal.cause).to.have.property('name', errname)
    })
  }

  it("refuses a write whose transaction aborted before it committed", async () => {
    const vaultDB = makeVaultDB()
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore) {
      this.transaction.abort()
      return undefined as never
    })
    await TH.expectRefusal(vaultDB.putVault(TH.vaultAt(), { prior: DB.VoidRevision }), 'storage_unavailable')
    expect(await idbRowsOf(vaultDB).vaultRowOf(TH.vaultScope)).to.be.null
  })

  const AbsentCases = [
    [undefined, 'refuses a call where there is no IndexedDB'],
    [null,      'refuses a call where the browser holds IndexedDB as null'],
  ] as const

  for (const [absent, blurb] of AbsentCases) {
    it(blurb, async () => {
      const vaultDB = makeVaultDB()
      vi.stubGlobal('indexedDB', absent)
      const refusal = await TH.expectRefusal(vaultDB.getVault(TH.vaultScope), 'storage_unavailable')
      expect(refusal.message).to.match(/no IndexedDB/)
    })
  }
})
