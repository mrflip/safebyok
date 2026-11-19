import { describe, expect, it } from 'vitest'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import type { ThingNotice } from '../../src/storage/vault-db'
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

describe("AdapterVaultDB's opts, on a MemoryVaultDB", () => {
  it("answers tracked but tells its watches nothing of it, made with doNotifyTracked: false", async () => {
    const vaultDB = new MemoryVaultDB({ doNotifyTracked: false })
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const notices: unknown[] = []
    vaultDB.watch(TH.ThingBank, (notice) => { notices.push(notice) }, () => undefined)
    const track = TH.trackOf(TH.bankThingOf({ revseq: 3 }), TH.gateThingOf())
    expect(await vaultDB.tryGetThing({ ...TH.getAskAt('box'), track })).to.deep.include({ tracked: { bank: TH.bankThingOf(), gate: 'same', box: 'same' } })
    await TH.aWhile()
    expect(notices).to.deep.equal([])
  })

  it("still tells its watches a stale_write's dbhas, made with doNotifyTracked: false", async () => {
    const vaultDB = new MemoryVaultDB({ doNotifyTracked: false })
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const [root0, rootNext] = [TH.rootBoxOf(), TH.nextOf(TH.rootBoxOf())]
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(root0, rootNext)))
    await TH.aWhile()
    const notices: ThingNotice[] = []
    vaultDB.watch(TH.ThingBank, (notice) => { notices.push(notice) }, () => undefined)
    const answer = await vaultDB.tryWriteThing({ ...TH.replaceAskOf(root0, rootNext), track: TH.BankStaleTrack })
    await TH.expectBad(Promise.resolve(answer), 'stale_write')
    expect(answer).to.deep.include({ dbhas: rootNext, tracked: { bank: TH.bankThingOf(), gate: 'same', box: rootNext } })
    await TH.aWhile()
    expect(notices.map(({ val }) => val)).to.deep.equal([rootNext])
  })

  it("refuses an opt it does not know, or one of the wrong type", () => {
    TH.expectSyncRefusal(() => new MemoryVaultDB({ doNotifyTracked: 'no' } as never), 'bad_record')
    TH.expectSyncRefusal(() => new MemoryVaultDB({ doNotifyTrack: false } as never), 'bad_record')
  })
})

describe("Classifier.classifyListThings(ask, fetched, roots)", () => {
  it("refuses, as a broken store, a child a store fetched from outside the parent", () => {
    const child = { labelpath: 'box/aa/deep', raw: TH.boxThingOf('deep') }
    TH.expectSyncRefusal(() => Classifier.classifyListThings(TH.listAskAt('box'), { parent: TH.rootBoxOf(), children: [child] }, { bank: null, maingate: null }), 'storage_issue')
  })
})
