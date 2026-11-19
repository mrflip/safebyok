import { describe, expect, it } from 'vitest'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import * as Classifier from '../../src/storage/thing-classifier'
import * as TH from '../test-helpers'

TH.describeVaultDBBattery('MemoryVaultDB', {
  makeVaultDB:   () => new MemoryVaultDB(),
  _cheat_rowsOf: (vaultDB) => ({
    plant:  (scope, raw) => { vaultDB._cheat_things(scope).set(scope.labelpath, structuredClone(raw)) },
    remove: (scope) => { vaultDB._cheat_things(scope).delete(scope.labelpath) },
  }),
})

describe("MemoryVaultDB, what only a store in memory can show", () => {
  it("answers with a copy, which the caller can change without changing the store", async () => {
    const vaultDB = new MemoryVaultDB()
    await TH.expectGood(vaultDB.tryWriteThing(TH.birthAskOf()))
    const val = await TH.expectGood(vaultDB.tryGetThing(TH.getGateAskOf())) as { auth: { planted?: boolean } }
    val.auth.planted = true
    const again = await vaultDB.tryGetThing(TH.getGateAskOf())
    expect(again).to.deep.include({ val: TH.gateThingOf() })
  })

  const StoredCases = [
    ["damaged_row",   { ...TH.gateThingOf(), note: 'hi' },         'refuses a gate with a field this version does not know'],
    ["storage_issue", { ...TH.gateThingOf(), banklabel: 'other' }, 'refuses a gate filed at another scope as a broken store'],
    ["storage_issue", 'not a Thing',                               'refuses a Thing that is not an object as a broken store'],
  ] as const

  for (const [refusalkind, raw, blurb] of StoredCases) {
    it(blurb, async () => {
      const vaultDB = new MemoryVaultDB()
      vaultDB._cheat_things(TH.ThingBank).set('gate', raw)
      await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), refusalkind)
      await TH.expectBad(vaultDB.tryWriteThing(TH.birthAskOf()), refusalkind)
    })
  }

  it("refuses a listed child filed at another scope as a broken store", async () => {
    const vaultDB = new MemoryVaultDB()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    vaultDB._cheat_things(TH.ThingBank).set('box/aa', TH.boxThingOf('zz'))
    await TH.expectBad(vaultDB.tryListThings(TH.listAskAt('box')), 'storage_issue')
  })

  it("writes nothing for a birth whose roots fail their checks", async () => {
    const vaultDB = new MemoryVaultDB()
    const ask = TH.birthBankAskOf({ root: TH.boxThingOf() })
    await TH.expectBad(vaultDB.tryBirthBank(ask), 'bad_record')
    expect(vaultDB._cheat_things(TH.ThingBank).size).to.eq(0)
  })
})

describe("Classifier.classifyListThings(ask, fetched, roots)", () => {
  it("refuses, as a broken store, a child a store fetched from outside the parent", () => {
    const child = { labelpath: 'box/aa/deep', raw: TH.boxThingOf('deep') }
    TH.expectSyncRefusal(() => Classifier.classifyListThings(TH.listAskAt('box'), { parent: TH.rootBoxOf(), children: [child] }, { bank: null, maingate: null }), 'storage_issue')
  })
})

describe("Classifier.worldOf(bankScope, fetched)", () => {
  it("is the bank and its main gate, for sound rows", () => {
    expect(Classifier.worldOf(TH.ThingBank, { bank: TH.bankThingOf(), maingate: TH.gateThingOf() })).to.deep.equal({ ...TH.bankThingOf(), maingate: TH.gateThingOf() })
  })

  it("is null where the bank or main gate fails its checks", () => {
    expect(Classifier.worldOf(TH.ThingBank, { bank: { ...TH.bankThingOf(), note: 'hi' }, maingate: TH.gateThingOf() })).to.be.null
    expect(Classifier.worldOf(TH.ThingBank, { bank: TH.bankThingOf(), maingate: { ...TH.gateThingOf(), note: 'hi' } })).to.be.null
  })

  const BrokenCases = [
    [{ bank: 'not a Thing', maingate: TH.gateThingOf() },                             'refuses, as a broken store, a bank that is not an object'],
    [{ bank: TH.bankThingOf(), maingate: { ...TH.gateThingOf(), banklabel: 'other' } }, 'refuses, as a broken store, a main gate filed at another scope'],
  ] as const

  for (const [fetched, blurb] of BrokenCases) {
    it(blurb, () => {
      TH.expectSyncRefusal(() => Classifier.worldOf(TH.ThingBank, fetched), 'storage_issue')
    })
  }

  it("lets a failure that is not a refusal pass through", () => {
    const fetched = { get bank(): never { throw new TypeError('a bug') }, maingate: null }
    expect(() => Classifier.worldOf(TH.ThingBank, fetched)).to.throw(TypeError, 'a bug')
  })
})

describe("Classifier.watchedThingOf(bankScope, raw)", () => {
  it("refuses damaged_row, naming the field, for a Thing whose labelpath is unsound", () => {
    const err = TH.expectSyncRefusal(() => Classifier.watchedThingOf(TH.ThingBank, { ...TH.gateThingOf(), labelpath: 42 }), 'damaged_row')
    expect(err.message).to.include('labelpath')
  })

  it("refuses, as a broken store, a Thing of another bank", () => {
    TH.expectSyncRefusal(() => Classifier.watchedThingOf(TH.ThingBank, { ...TH.gateThingOf(), banklabel: 'other' }), 'storage_issue')
  })
})
