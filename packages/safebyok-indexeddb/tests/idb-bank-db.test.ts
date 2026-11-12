/** Tests for IdbBankDB: the battery every bankDB must pass, then what is specific to this adapter (options, separate databases and users, IndexedDB failures). */

// Import fake-indexeddb first: it installs IndexedDB's globals before the adapter loads, with real transactions and structured clone but no browser.
import 'fake-indexeddb/auto'
import { createStore, promisifyRequest } from 'idb-keyval'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as TH from 'safebyok/testing'
import * as DB from 'safebyok/storage'
import { BankDBVersion, bankScopepathOf, boxPlaceOf, boxScopepathOf, filedIn, gateScopepathOf, lifeRangeOf, vaultScopepathOf } from '../src/bank-shelf'
import { IdbBankDB, idbBankDB } from '../src/idb-bank-db'
import type { IdbBankDBOpts } from '../src/idb-bank-db'

const BW = TH.BankDBWorld

// == [World]: databaseNameOf, makeBankDB, idbRowsOf, failNextCall, dbNamesNow, plantClosedDB

/** The database name each BankDB under test was made with. */
const dbNameOf = new WeakMap<IdbBankDB, string>()

/** The `maxBoxes` each BankDB under test was made with, so its twin gets the same cap. */
const maxBoxesOf = new WeakMap<IdbBankDB, number>()

/** The name of the IndexedDB database a BankDB made with `dbName` opens. */
const databaseNameOf = (dbName: string): string => `safebyok-${dbName}:bank-v${BankDBVersion}`

/** Make a BankDB on a fresh database that no other test has touched. */
const makeBankDB = (opts: IdbBankDBOpts = {}): IdbBankDB => {
  const dbName = `test-${crypto.randomUUID()}`
  const bankDB = new IdbBankDB({ ...opts, dbName })
  dbNameOf.set(bankDB, dbName)
  if (opts.maxBoxes !== undefined) { maxBoxesOf.set(bankDB, opts.maxBoxes) }
  return bankDB
}

/** The IndexedDB connection a BankDB runs its transactions on, captured during an `ensureBank` call. */
async function connectionOf(bankDB: IdbBankDB): Promise<unknown> {
  const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction')
  try {
    await bankDB.ensureBank(BW.bankEnsureAsk)
    return transaction.mock.contexts[0]
  } finally {
    transaction.mockRestore()
  }
}

// Compare connections, not shelves: if the forgotten shelf's name were wrong, the twin would quietly share the first connection.
/** Make a second BankDB on the same database with its own connection, as another tab would have. */
const makeTwin = async (bankDB: IdbBankDB): Promise<IdbBankDB> => {
  const dbName = dbNameOf.get(bankDB)!
  TH._cheat_forgetShelf(databaseNameOf(dbName))
  const twin = new IdbBankDB({ dbName, maxBoxes: maxBoxesOf.get(bankDB) })
  const [ours, theirs] = [await connectionOf(bankDB), await connectionOf(twin)]
  expect(theirs, 'the twin on a connection of its own').to.be.instanceOf(IDBDatabase).and.not.eq(ours)
  return twin
}

/** Test backdoors to a BankDB's stored rows, through a separate connection to its database. */
const idbRowsOf = (bankDB: IdbBankDB): TH.BankDBRowCheats => {
  const shelf = createStore(databaseNameOf(dbNameOf.get(bankDB)!), 'rows')
  const plant = async (row: unknown, scopepath: IDBValidKey): Promise<void> => { await DB.inOneStep(shelf, 'readwrite', (store) => { store.put(row, scopepath) }) }
  const rowAt = async (scopepath: IDBValidKey): Promise<unknown> => await DB.inOneStep(shelf, 'readonly', (store) => DB.rowAt(store, scopepath))
  return {
    plantBankRow:  async (scope, row) => { await plant(row, bankScopepathOf(scope)) },
    plantGateRow:  async (scope, row) => { await plant(row, gateScopepathOf(scope)) },
    plantVaultRow: async (scope, row) => { await plant(row, vaultScopepathOf(scope)) },
    plantBoxRow:   async (scope, bank_tok, vault_tok, row) => { await plant(row, boxScopepathOf({ ...scope, bank_tok, vault_tok })) },
    bankRowOf:     async (scope) => await rowAt(bankScopepathOf(scope)),
    gateRowOf:     async (scope) => await rowAt(gateScopepathOf(scope)),
    vaultRowOf:    async (scope) => await rowAt(vaultScopepathOf(scope)),
    boxRowsOf:     async (scope, bank_tok, vault_tok) => {
      const filed = await DB.inOneStep(shelf, 'readonly', (store) => filedIn(store, lifeRangeOf({ ...scope, bank_tok, vault_tok })))
      return new Map(filed.map(({ scopepath, row }) => [boxPlaceOf(scopepath).boxlabel, row]))
    },
  }
}

/** Make the next transaction any BankDB opens fail, as it does when the browser closes the database while the page is using it. */
const failNextCall = (): void => {
  vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(() => {
    throw new DOMException('The database connection is closing.', 'InvalidStateError')
  })
}

/** The names of all databases IndexedDB currently has. */
async function dbNamesNow(): Promise<string[]> {
  const dbs = await indexedDB.databases()
  return dbs.map((db) => db.name).filter((dbname) => dbname !== undefined)
}

// idb-keyval keeps its connection open for the life of the page, like a tab left open. This helper closes its connection, like a closed tab.
/** Create the database `dbname` with one row in an object store, then close it. */
async function plantClosedDB(dbname: string): Promise<void> {
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

TH.describeBankDBBattery("IdbBankDB", {
  makeBankDB,
  makeTwin,
  _cheat_rowsOf:       idbRowsOf,
  makeCappedBankDB:    (maxBoxes) => makeBankDB({ maxBoxes }),
  _cheat_failNextCall: failNextCall,
})

describe("IdbBankDB's options", () => {
  it("takes a dbName and the AdapterBankDB's own options", () => {
    expect(new IdbBankDB({ dbName: 'mine', maxRecordSizeEst: 1000 })).to.be.instanceOf(IdbBankDB)
    expect(idbBankDB()).to.be.instanceOf(IdbBankDB)
  })

  it("refuses a dbName, a maxRecordSizeEst or a field it cannot use", () => {
    for (const opts of [{ dbName: '' }, { dbName: 7 }, { maxRecordSizeEst: -1 }, { dbname: 'mine' }]) {
      expect(() => new IdbBankDB(opts as never)).to.throw(DB.VaultError).with.property('refusalkind', 'bad_option')
    }
  })
})

describe("IdbBankDB's databases", () => {
  it("keeps the rows of each dbName apart", async () => {
    const bankDB = makeBankDB()
    const other = makeBankDB()
    await bankDB.buildBank(BW.bankBuildAskOf())
    const { val: otherEnsured } = await other.ensureBank(BW.bankEnsureAsk)
    const twin = await makeTwin(bankDB)
    const { val: twinEnsured } = await twin.ensureBank(BW.bankEnsureAsk)
    expect(otherEnsured).to.be.null
    expect(twinEnsured).to.not.be.null
  })

  it("keeps apart the rows of users whose ids share a beginning", async () => {
    const bankDB = makeBankDB()
    const longer = { ...TH.bankScope, user_id: `${TH.bankScope.user_id}0` }
    await bankDB.buildBank(BW.bankBuildAskOf())
    await bankDB.putVault(BW.vaultPutAskOf(BW.vaultAt()))
    await bankDB.putBox(BW.boxPutAskOf(BW.boxAt()))
    await bankDB.buildBank(BW.bankBuildAskOf({ ...BW.bankAt(), ...longer }, { ...BW.gateAt(), ...longer }))
    const { val: ensured } = await bankDB.ensureBank({ ...BW.bankEnsureAsk, ...longer })
    const { val: tidied } = await bankDB.tidyGone({ ...TH.boxTidyAsk, ...longer })
    expect(ensured?.vaults).to.be.empty
    expect(tidied.totalCount).to.eq(0)
  })

  it("notifies a watch of a write from another BankDB over the same database", async () => {
    const bankDB = makeBankDB()
    const notices: unknown[] = []
    const unwatch = bankDB.watch(TH.bankScope, (notice) => { notices.push(notice) })
    const twin = await makeTwin(bankDB)
    await twin.buildBank(BW.bankBuildAskOf())
    await TH.eventually(() => notices.length > 0)
    expect(notices.length).to.be.greaterThan(0)
    unwatch()
  })
})

describe("IdbBankDB's database name and wipe", () => {
  it("names its database for this library and its version, whatever the host's dbName", async () => {
    const bankDB = makeBankDB()
    await bankDB.ensureBank(BW.bankEnsureAsk)
    const names = await dbNamesNow()
    expect(names).to.include(databaseNameOf(dbNameOf.get(bankDB)!))
    expect(names.filter((dbname) => dbname.includes(dbNameOf.get(bankDB)!))).to.satisfy((own: string[]) => own.every((dbname) => dbname.startsWith('safebyok-')))
    expect(BankDBVersion).to.match(/^\d{3}-\d{3}-\d{3}$/)
  })

  it("deletes every older version's bank database, without reading them, on its first call", async () => {
    const dbName = `test-${crypto.randomUUID()}`
    const oldnames = [`safebyok-${dbName}:bank-v1`, `safebyok-${dbName}:bank-v001-001-000`, `safebyok-${dbName}:bank-v000-009-009`]
    for (const oldname of oldnames) { await plantClosedDB(oldname) }
    expect(await dbNamesNow()).to.include.members(oldnames)
    await new IdbBankDB({ dbName }).ensureBank(BW.bankEnsureAsk)
    await vi.waitFor(async () => {
      const dbnames = await dbNamesNow()
      expect(dbnames.filter((dbname) => oldnames.includes(dbname))).to.deep.equal([])
    })
  })

  it("leaves untouched a newer version's database, another dbName's, and the vault and device databases", async () => {
    const dbName = `test-${crypto.randomUUID()}`
    const kept = [`safebyok-${dbName}:bank-v001-002-000`, `${dbName}:vaults-v001-001-001`, `${dbName}:device_db`, `${dbName}:device-v001-001-001`, `safebyok-other-${dbName}:bank-v000-000-001`]
    for (const keptname of kept) { await plantClosedDB(keptname) }
    await new IdbBankDB({ dbName }).ensureBank(BW.bankEnsureAsk)
    await TH.aWhile()
    expect(await dbNamesNow()).to.include.members(kept)
  })
})

describe("IdbBankDB's refusals", () => {
  const TroubleCases = [
    ["QuotaExceededError", "vault_full",          /no room left/,     'refuses a write IndexedDB has no room for'],
    ["InvalidStateError",  "storage_unavailable", /closed under it/,  'refuses a call once the database is closed under it'],
    ["SecurityError",      "storage_blocked",     /withholds/,        'refuses a call where the browser withholds IndexedDB'],
    ["UnknownError",       "storage_unavailable", /IndexedDB failed/, 'refuses a call that fails in IndexedDB for any other reason'],
  ] as const

  for (const [errname, refusalkind, said, blurb] of TroubleCases) {
    it(blurb, async () => {
      const bankDB = makeBankDB()
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('IndexedDB says no.', errname) })
      const building = bankDB.buildBank(BW.bankBuildAskOf())
      const refusal = await TH.expectRefusal(building, refusalkind)
      expect(refusal.message).to.match(said)
      expect(refusal.cause).to.have.property('name', errname)
    })
  }

  it("refuses a write whose transaction aborted before it committed", async () => {
    const bankDB = makeBankDB()
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore) {
      this.transaction.abort()
      return undefined as never
    })
    const building = bankDB.buildBank(BW.bankBuildAskOf())
    await TH.expectRefusal(building, 'storage_unavailable')
    expect(await idbRowsOf(bankDB).bankRowOf(TH.bankScope)).to.be.null
  })

  const AbsentCases = [
    [undefined, 'refuses a call where there is no IndexedDB'],
    [null,      'refuses a call where the browser has IndexedDB as null'],
  ] as const

  for (const [absent, blurb] of AbsentCases) {
    it(blurb, async () => {
      const bankDB = makeBankDB()
      vi.stubGlobal('indexedDB', absent)
      const refusal = await TH.expectRefusal(bankDB.ensureBank(BW.bankEnsureAsk), 'storage_blocked')
      expect(refusal.message).to.match(/no IndexedDB/)
    })
  }
})
