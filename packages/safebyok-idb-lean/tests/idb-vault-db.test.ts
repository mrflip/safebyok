/** Tests for IdbVaultDB: the battery every vaultDB must pass, then what is its own (options, databases, other tabs, overwriteThing, IndexedDB's failures). */

// Import fake-indexeddb first: it installs IndexedDB's globals before the adapter loads, with real transactions and structured clone but no browser.
import 'fake-indexeddb/auto'
import { noop } from 'es-toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Absent, Shell, VaultError } from 'safebyok/storage'
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
    expect(gotten).to.deep.equal(Absent)
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
  it("hears a write made by another instance on the same database, as another tab's", async () => {
    const idbVaultDB = TH.makeIdbVaultDB()
    const twin = TH.makeTwin(idbVaultDB)
    const notices: unknown[] = []
    const unwatch = twin.watch(TH.ThingBank, (notice) => { notices.push(notice) }, noop)
    await TH.expectGood(idbVaultDB.tryWriteThing(TH.birthAskOf()))
    await TH.eventually(() => notices.length > 0)
    expect(notices).to.deep.equal([{ ok: true, act: 'gotlive', val: TH.gateThingOf() }])
    unwatch()
  })
})

describe("IdbVaultDB.overwriteThing(record)", () => {
  it("stores a record at a scope where nothing is stored", async () => {
    const idbVaultDB = TH.makeIdbVaultDB()
    const gate = TH.gateThingOf()
    await idbVaultDB.overwriteThing(gate)
    expect(await TH._cheat_idbThingsOf(idbVaultDB).rawAt(TH.GateScope)).to.deep.equal(gate)
  })

  it("stores a newer record over an older one", async () => {
    const idbVaultDB = TH.makeIdbVaultDB()
    const gate = TH.gateThingOf()
    const next = TH.nextGateOf(gate)
    await idbVaultDB.overwriteThing(gate)
    await idbVaultDB.overwriteThing(next)
    expect(await TH._cheat_idbThingsOf(idbVaultDB).rawAt(TH.GateScope)).to.deep.equal(next)
  })

  it("ignores an older record, leaving the stored one", async () => {
    const idbVaultDB = TH.makeIdbVaultDB()
    const gate = TH.gateThingOf()
    const next = TH.nextGateOf(gate)
    await idbVaultDB.overwriteThing(next)
    await idbVaultDB.overwriteThing(gate)
    expect(await TH._cheat_idbThingsOf(idbVaultDB).rawAt(TH.GateScope)).to.deep.equal(next)
  })

  it("ignores a record at the stored revision, leaving the stored one", async () => {
    const idbVaultDB = TH.makeIdbVaultDB()
    const gate = TH.gateThingOf()
    await idbVaultDB.overwriteThing(gate)
    await idbVaultDB.overwriteThing({ ...gate, written_at: gate.written_at + 5 })
    expect(await TH._cheat_idbThingsOf(idbVaultDB).rawAt(TH.GateScope)).to.deep.equal(gate)
  })

  it("stores the tombstone of a later life over the live record", async () => {
    const idbVaultDB = TH.makeIdbVaultDB()
    const box = TH.boxThingOf()
    const tomb = TH.boxTombOf(box)
    await idbVaultDB.overwriteThing(box)
    await idbVaultDB.overwriteThing(tomb)
    expect(await TH._cheat_idbThingsOf(idbVaultDB).rawAt(TH.BoxScope)).to.deep.equal(tomb)
  })

  it("stores a record over a stored row that fails its kind's checks, even at the stored revision", async () => {
    const idbVaultDB = TH.makeIdbVaultDB()
    const gate = TH.gateThingOf()
    await TH._cheat_idbThingsOf(idbVaultDB).plant(TH.GateScope, { ...gate, note: 'damaged' })
    await idbVaultDB.overwriteThing(gate)
    expect(await TH._cheat_idbThingsOf(idbVaultDB).rawAt(TH.GateScope)).to.deep.equal(gate)
  })

  const BadRecordCases = [
    [{ ...TH.gateThingOf(), note: 'hi' },  'refuses a record with a field its kind does not know'],
    [Shell.of(TH.GateScope),               'refuses the shell'],
    [{ labelpath: 'nowhere/aa' },          'refuses a record at no Thing\'s labelpath'],
    ["not a record",                       'refuses something that is not a record'],
  ] as const

  for (const [record, blurb] of BadRecordCases) {
    it(blurb, async () => {
      const idbVaultDB = TH.makeIdbVaultDB()
      await TH.expectRefusal(idbVaultDB.overwriteThing(record as never), 'bad_record')
      expect(await TH._cheat_idbThingsOf(idbVaultDB).rawAt(TH.GateScope)).to.be.null
    })
  }

  it("tells no watch", async () => {
    const idbVaultDB = TH.makeIdbVaultDB()
    const notices: unknown[] = []
    const unwatch = idbVaultDB.watch(TH.ThingBank, (notice) => { notices.push(notice) }, noop)
    await idbVaultDB.overwriteThing(TH.gateThingOf())
    await TH.aWhile()
    expect(notices).to.deep.equal([])
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
