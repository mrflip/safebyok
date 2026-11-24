/** Tests for IdbVaultDB: the battery every vaultDB must pass, then what is its own (options, databases, other tabs, IndexedDB's failures). */

// Import fake-indexeddb first: it installs IndexedDB's globals before the adapter loads, with real transactions and structured clone but no browser.
import 'fake-indexeddb/auto'
import { noop } from 'es-toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Shell, VaultError } from 'safebyok/storage'
import { IdbVaultDB } from '../src/idb-vault-db'
import { VaultDBVersion } from '../src/vault-shelf'
import * as TH from './test-helpers'

afterEach(() => { vi.restoreAllMocks() })

TH.describeVaultDBBattery('IdbVaultDB', {
  makeVaultDB:   () => TH.makeIdbVaultDB(),
  _cheat_rowsOf: (idbVaultDB) => TH._cheat_idbThingsOf(idbVaultDB),
})

/** The names of every database IndexedDB now has. */
async function dbNamesNow(): Promise<string[]> {
  const dbs = await indexedDB.databases()
  return dbs.map((db) => db.name).filter((dbname) => dbname !== undefined)
}

describe("IdbVaultDB's options", () => {
  it("accepts a dbName, or none", () => {
    expect(new IdbVaultDB({ dbName: 'mine' })).to.be.instanceOf(IdbVaultDB)
    expect(new IdbVaultDB()).to.be.instanceOf(IdbVaultDB)
  })

  it("refuses a dbName it cannot use, or a field it does not know", () => {
    for (const opts of [{ dbName: '' }, { dbName: 7 }, { dbname: 'mine' }]) {
      expect(() => new IdbVaultDB(opts as never)).to.throw(VaultError).with.property('refusalkind', 'bad_record')
    }
  })
})

describe("IdbVaultDB's databases", () => {
  it("names its database for this library, its dbName and its version", async () => {
    const idbVaultDB = TH.makeIdbVaultDB()
    await TH.expectGood<unknown>(idbVaultDB.tryGetThing(TH.getGateAskOf()))
    expect(await dbNamesNow()).to.include(`safebyok-${TH.dbNameIn(idbVaultDB)}:vault-v${VaultDBVersion}`)
    expect(VaultDBVersion).to.match(/^\d{3}-\d{3}-\d{3}$/)
  })

  it("keeps the Things of each dbName apart", async () => {
    const idbVaultDB = TH.makeIdbVaultDB()
    const other = TH.makeIdbVaultDB()
    await TH.expectGood(idbVaultDB.tryBirthBank(TH.birthBankAskOf()))
    const gotten = await TH.expectGood<unknown>(other.tryGetThing(TH.getGateAskOf()))
    expect(gotten).to.be.null
  })

  it("keeps its Things for a new instance on the same database", async () => {
    const idbVaultDB = TH.makeIdbVaultDB()
    await TH.expectGood(idbVaultDB.tryBirthBank(TH.birthBankAskOf()))
    const twin = TH.makeTwin(idbVaultDB)
    const gotten = await TH.expectGood<unknown>(twin.tryGetThing(TH.getGateAskOf()))
    expect(gotten).to.deep.equal(TH.gateThingOf())
  })

  it("lists the children of a Thing in its own bank alone, one label under it", async () => {
    const idbVaultDB = TH.makeIdbVaultDB()
    await TH.expectGood(idbVaultDB.tryBirthBank(TH.birthBankAskOf()))
    const box = TH.boxThingOf()
    const ask = TH.birthAskOf(box, Shell.childCited(TH.Life0))
    await TH.expectGood(idbVaultDB.tryWriteThing(ask))
    const rows = TH._cheat_idbThingsOf(idbVaultDB)
    const otherBankBox = { ...TH.boxThingOf('other'), banklabel: 'acme2' }
    const grandchild = { ...TH.boxThingOf('deep'), labelpath: 'box/openai/deep' }
    await rows.plant(otherBankBox, otherBankBox)
    await rows.plant(grandchild, grandchild)
    const answer = await idbVaultDB.tryListThings(TH.listAskAt('box'))
    await TH.expectGood(answer)
    expect(answer.deltas.map(({ labelpath }) => labelpath)).to.deep.equal([box.labelpath])
  })
})

describe("IdbVaultDB's watch", () => {
  it("notifies of a write made by another instance on the same database, as another tab's", async () => {
    const idbVaultDB = TH.makeIdbVaultDB()
    const twin = TH.makeTwin(idbVaultDB)
    const events: unknown[] = []
    const unwatch = twin.watch(TH.ThingBank, (event) => { events.push(event) }, noop)
    await TH.expectGood(idbVaultDB.tryWriteThing(TH.birthAskOf()))
    await TH.eventually(() => events.length > 0)
    expect(events).to.deep.equal([TH.itemEventOf(TH.gateThingOf())])
    unwatch()
  })
})

describe("IdbVaultDB's refusals", () => {
  const TroubleCases = [
    ["QuotaExceededError", "vault_full",          'refuses a write IndexedDB has no room for'],
    ["InvalidStateError",  "storage_unavailable", 'refuses a write once the database is closed under it'],
  ] as const

  for (const [errname, refusalkind, blurb] of TroubleCases) {
    it(blurb, async () => {
      const idbVaultDB = TH.makeIdbVaultDB()
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('IndexedDB says no.', errname) })
      const refusal = await TH.expectBad(idbVaultDB.tryWriteThing(TH.birthAskOf()), refusalkind)
      expect(refusal.cause).to.have.property('name', errname)
      expect(await TH._cheat_idbThingsOf(idbVaultDB).rawAt(TH.GateScope)).to.be.null
    })
  }
})
