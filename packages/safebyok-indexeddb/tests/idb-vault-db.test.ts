/** IdbVaultDB: the battery every VaultDB runs, and what is its own: options, separate databases and users, and IndexedDB's failures. */

// fake-indexeddb installs IndexedDB's globals before the adapter loads: real transactions and structured clone, with no browser.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as TH from 'safebyok/testing'
import * as SX from 'safebyok/storage'
import { IdbVaultDB, idbVaultDB } from '../src/idb-vault-db'
import type { IdbVaultDBOpts } from '../src/idb-vault-db'
import { boxPlaceOf, boxScopepathOf, filedIn, inOneStep, lifeRangeOf, rowAt, shelfOf, vaultScopepathOf } from '../src/shelf'

// == [World]: makeVaultDB, idbRowsOf, failNextCall

/** The database each store under test was made over, by store. */
const dbNameOf = new WeakMap<IdbVaultDB, string>()

/** A store over a database of its own, which no other test has touched. */
const makeVaultDB = (opts: IdbVaultDBOpts = {}): IdbVaultDB => {
  const dbName = `test-${crypto.randomUUID()}`
  const vaultDB = new IdbVaultDB({ ...opts, dbName })
  dbNameOf.set(vaultDB, dbName)
  return vaultDB
}

/** A second store over the same database, as another tab holds. */
const makeTwin = (vaultDB: IdbVaultDB): IdbVaultDB => new IdbVaultDB({ dbName: dbNameOf.get(vaultDB) })

/** The backdoor to a store's rows, through a connection of its own to the store's database. */
const idbRowsOf = (vaultDB: IdbVaultDB): TH.VaultDBRowCheats => {
  const shelf = shelfOf(dbNameOf.get(vaultDB)!)
  return {
    plantVaultRow: async (scope, row) => { await inOneStep(shelf, 'readwrite', (store) => { store.put(row, vaultScopepathOf(scope)) }) },
    plantBoxRow:   async (scope, vault_tok, row) => { await inOneStep(shelf, 'readwrite', (store) => { store.put(row, boxScopepathOf({ ...scope, vault_tok })) }) },
    vaultRowOf:    async (scope) => await inOneStep(shelf, 'readonly', (store) => rowAt(store, vaultScopepathOf(scope))),
    boxRowsOf:     async (scope, vault_tok) => {
      const filed = await inOneStep(shelf, 'readonly', (store) => filedIn(store, lifeRangeOf({ ...scope, vault_tok })))
      return new Map(filed.map(({ scopepath, row }) => [boxPlaceOf(scopepath).boxlabel, row]))
    },
  }
}

/** Makes the next transaction any store opens fail, as it does when the browser closes the database under the page. */
const failNextCall = (): void => {
  vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(() => {
    throw new DOMException('The database connection is closing.', 'InvalidStateError')
  })
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
  it("takes a dbName and the VaultDB's own options", () => {
    expect(new IdbVaultDB({ dbName: 'mine', maxRecordBytes: 1000 })).to.be.instanceOf(IdbVaultDB)
    expect(idbVaultDB()).to.be.instanceOf(IdbVaultDB)
  })

  it("refuses a dbName, a maxRecordBytes or a field it cannot use", () => {
    for (const opts of [{ dbName: '' }, { dbName: 7 }, { maxRecordBytes: -1 }, { dbname: 'mine' }]) {
      expect(() => new IdbVaultDB(opts as never)).to.throw(SX.VaultError).with.property('refusalkind', 'bad_option')
    }
  })
})

describe("IdbVaultDB's databases", () => {
  it("keeps the rows of each dbName apart", async () => {
    const vaultDB = makeVaultDB()
    const other = makeVaultDB()
    await vaultDB.putVault(TH.vaultAt(), { prior: SX.VoidRevision })
    const { val: otherListed } = await other.listVaults(TH.bankScope)
    const { val: twinListed } = await makeTwin(vaultDB).listVaults(TH.bankScope)
    expect(otherListed.vaults).to.be.empty
    expect(twinListed.vaults).to.have.length(1)
  })

  it("keeps apart the rows of users whose ids share a beginning", async () => {
    const vaultDB = makeVaultDB()
    const longer = { ...TH.bankScope, user_id: `${TH.bankScope.user_id}0` }
    await vaultDB.putVault(TH.vaultAt(), { prior: SX.VoidRevision })
    await vaultDB.putVault(TH.vaultAt(0, 'life1', longer), { prior: SX.VoidRevision })
    await vaultDB.putBox(TH.boxAt(0, 'life1', longer), { prior: SX.VoidRevision })
    const { val: listed } = await vaultDB.listVaults(TH.bankScope)
    const { val: boxesListed } = await vaultDB.listBoxes({ ...TH.vaultScope, vault_tok: 'life1' })
    const { val: tidied } = await vaultDB.tidyGone(TH.bankScope)
    expect(listed.vaults).to.have.length(1)
    expect(boxesListed.boxes).to.be.empty
    expect(tidied.totalCount).to.eq(0)
  })

  it("hears a write from another store over the same database", async () => {
    const vaultDB = makeVaultDB()
    const notices: unknown[] = []
    const unwatch = vaultDB.watch(TH.bankScope, (notice) => { notices.push(notice) })
    await makeTwin(vaultDB).putVault(TH.vaultAt(), { prior: SX.VoidRevision })
    await TH.eventually(() => notices.length > 0)
    expect(notices).to.have.length(1)
    unwatch()
  })
})

describe("IdbVaultDB's refusals", () => {
  const TroubleCases = [
    ['QuotaExceededError', 'vault_full',          /no room left/,     'refuses a write IndexedDB has no room for as vault_full'],
    ['InvalidStateError',  'storage_unavailable', /closed under it/,  'refuses as storage_unavailable, saying the database was closed under it'],
    ['SecurityError',      'storage_unavailable', /withholds/,        'refuses as storage_unavailable, saying the browser withholds IndexedDB'],
    ['UnknownError',       'storage_unavailable', /IndexedDB failed/, 'refuses as storage_unavailable any other failure of IndexedDB'],
  ] as const

  for (const [errname, refusalkind, said, blurb] of TroubleCases) {
    it(blurb, async () => {
      const vaultDB = makeVaultDB()
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('IndexedDB says no.', errname) })
      const refusal = await TH.expectRefusal(vaultDB.putVault(TH.vaultAt(), { prior: SX.VoidRevision }), refusalkind)
      expect(refusal.message).to.match(said)
      expect(refusal.cause).to.have.property('name', errname)
    })
  }

  it("refuses as storage_unavailable a write whose transaction aborted before it committed, and nothing is written", async () => {
    const vaultDB = makeVaultDB()
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore) {
      this.transaction.abort()
      return undefined as never
    })
    await TH.expectRefusal(vaultDB.putVault(TH.vaultAt(), { prior: SX.VoidRevision }), 'storage_unavailable')
    expect(await idbRowsOf(vaultDB).vaultRowOf(TH.vaultScope)).to.be.null
  })

  it("refuses as storage_unavailable, saying so, where there is no IndexedDB", async () => {
    const vaultDB = makeVaultDB()
    vi.stubGlobal('indexedDB', undefined)
    const refusal = await TH.expectRefusal(vaultDB.getVault(TH.vaultScope), 'storage_unavailable')
    expect(refusal.message).to.match(/no IndexedDB/)
  })
})
