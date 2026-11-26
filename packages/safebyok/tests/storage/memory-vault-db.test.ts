import { describe, expect, it } from 'vitest'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { readTcNow } from '../../src/storage/agerank'
import * as Classifier from '../../src/storage/thing-classifier'
import { Shell } from '../../src/shapes/shapes-thing'
import { StoreLimitCap, type VaultStats } from '../../src/shapes/shapes-vault-stats'
import { rowWeightOf } from '../../src/storage/vault-stats'
import * as TH from '../test-helpers'

TH.describeVaultDBBattery('MemoryVaultDB', {
  makeVaultDB:   () => new MemoryVaultDB(),
  _cheat_rowsOf: (vaultDB) => ({
    plant:  (scope, raw) => { vaultDB._cheat_things(scope).set(scope.labelpath, structuredClone(raw)) },
    remove: (scope) => { vaultDB._cheat_things(scope).delete(scope.labelpath) },
  }),
})

describe("MemoryVaultDB, what only a store in memory can show", () => {
  it("answers with a copy of what it stores, deeply frozen, and stores a copy of what it is handed", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate = TH.gateThingOf()
    await TH.expectGood(vaultDB.tryWriteThing(TH.birthAskOf(gate)))
    const val = await TH.expectGood<unknown>(vaultDB.tryGetThing(TH.getGateAskOf())) as { auth: object }
    expect(Object.isFrozen(val.auth)).to.be.true
    expect(val).to.not.equal(vaultDB._cheat_things(TH.ThingBank).get('gate'))
    ;(gate as { label: string }).label = 'changed'
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
    const fetched = { parent: TH.rootBoxOf(), children: [child] }
    TH.expectSyncRefusal(() => Classifier.classifyListThings(TH.listAskAt('box'), fetched, { bank: null, tracked: { bank: null, gate: null, box: null }, read_tc: readTcNow() }), 'storage_issue')
  })
})

describe("MemoryVaultDB, a row planted above a scope where nothing is stored", () => {
  const AboveCases = [
    ['storage_issue', TH.boxThingOf('open'),              'refuses, as a broken store, a row above the scope that names a labelpath not above it'],
    ['storage_issue', 'not a Thing',                      'refuses, as a broken store, a row above the scope that is not an object'],
    ['damaged_row',   { ...TH.rootBoxOf(), revseq: -2 },  'refuses, as a damaged row, a row above the scope whose revision fails its checks'],
  ] as const
  const voidPut = { ...TH.birthAskOf(TH.boxThingOf(), Shell.childCited(TH.Life0)), ifAbsent: 'fail' } as const

  for (const [refusalkind, ancestor, blurb] of AboveCases) {
    it(blurb, async () => {
      const vaultDB = new MemoryVaultDB()
      vaultDB._cheat_things(TH.ThingBank).set('box', ancestor)
      await TH.expectBad(vaultDB.tryGetThing(TH.getAskAt('box/openai')), refusalkind)
      await TH.expectBad(vaultDB.tryWriteThing(voidPut), refusalkind)
    })
  }
})

describe("MemoryVaultDB.tryStats(ask), a store in memory", () => {
  it("weighs each box and gate stored at the UTF-8 length of its JSON, and reports the cap for each limit", async () => {
    const vaultDB = new MemoryVaultDB()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const stats = await TH.expectGood<VaultStats>(vaultDB.tryStats(TH.statsAskOf()))
    expect(stats).to.deep.equal({
      box:  { count: 1, live_count: 1, size: rowWeightOf(TH.rootBoxOf()) },
      gate: { count: 1, live_count: 1, size: rowWeightOf(TH.gateThingOf()) },
      max:  { count: StoreLimitCap, size: StoreLimitCap },
    })
  })
})
