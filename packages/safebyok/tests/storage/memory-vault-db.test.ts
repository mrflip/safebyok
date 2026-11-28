import { describe, expect, it } from 'vitest'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { getAskOf } from '../../src/shapes/shapes-asks'
import { Shell } from '../../src/shapes/shapes-thing'
import { DatastoreLimitCap, type VaultStats } from '../../src/shapes/shapes-vault-stats'
import { rowWeightOf } from '../../src/storage/vault-stats'
import * as TH from '../test-helpers'

TH.describeVaultDBBattery('MemoryVaultDB', {
  makeVaultDB:   () => new MemoryVaultDB(),
  _cheat_rowsOf: (vaultDB) => ({
    plant:  (scope, raw) => { vaultDB._cheat_things(scope)[scope.modelkind].set(scope.labelpath, structuredClone(raw)) },
    remove: (scope) => { vaultDB._cheat_things(scope)[scope.modelkind].delete(scope.labelpath) },
  }),
})

describe("MemoryVaultDB, what only a datastore in memory can show", () => {
  it("answers with a copy of what it has, deeply frozen, and writes a copy of what it is handed", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate = TH.gateThingOf()
    await TH.expectGood(vaultDB.tryWriteThing(TH.birthAskOf(gate)))
    const val = await TH.expectGood<unknown>(vaultDB.tryGetThing(TH.getGateAskOf())) as { auth: object }
    expect(Object.isFrozen(val.auth)).to.be.true
    expect(val).to.not.equal(vaultDB._cheat_things(TH.ThingBank).gate.get(TH.GateScope.labelpath))
    ;(gate as { label: string }).label = 'changed'
    const again = await vaultDB.tryGetThing(TH.getGateAskOf())
    expect(again).to.deep.include({ val: TH.gateThingOf() })
  })

  it("keeps the gate and the root box of a bank labelled box in their own tables, both at box", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate = TH.gateThingOf({ banklabel: 'box', labelpath: 'box', label: 'box' })
    const root = TH.rootBoxOf({ banklabel: 'box' })
    const bank = { ...TH.ThingBank, banklabel: 'box' }
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf({ banklabel: 'box', gate, root })))
    expect(vaultDB._cheat_things(bank).gate.get('box')).to.deep.equal(gate)
    expect(vaultDB._cheat_things(bank).box.get('box')).to.deep.equal(root)
    const asked = { ...bank, labelpath: 'box', ...TH.SenderKnows }
    expect(await vaultDB.tryGetThing(getAskOf({ ...asked, modelkind: 'gate' }))).to.deep.include({ ok: true, act: 'gotlive', val: gate })
    expect(await vaultDB.tryGetThing(getAskOf({ ...asked, modelkind: 'box' }))).to.deep.include({ ok: true, act: 'gotlive', val: root })
  })

  it("keeps a bank's gate in the table of gates, and its root box in the table of boxes", async () => {
    const vaultDB = new MemoryVaultDB()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const { gate, box } = vaultDB._cheat_things(TH.ThingBank)
    expect([[...gate.keys()], [...box.keys()]]).to.deep.equal([[TH.GateScope.labelpath], [TH.RootScope.labelpath]])
  })

  const PlantedCases = [
    ["incompatible_row", { ...TH.gateThingOf(), note: 'hi' },         'refuses a gate with a field this version does not know'],
    ["storage_issue",    TH.gateThingOf({ banklabel: 'other', labelpath: 'other', label: 'other' }), 'refuses a gate filed at another scope as a broken datastore'],
    ["storage_issue",    'not a Thing',                               'refuses a Thing that is not an object as a broken datastore'],
  ] as const

  for (const [refusalkind, raw, blurb] of PlantedCases) {
    it(blurb, async () => {
      const vaultDB = new MemoryVaultDB()
      vaultDB._cheat_things(TH.ThingBank).gate.set(TH.GateScope.labelpath, raw)
      await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), refusalkind)
      await TH.expectBad(vaultDB.tryWriteThing(TH.birthAskOf()), refusalkind)
    })
  }

  const UnwrittenCases = [
    [{ ...TH.gateThingOf(), fmt: 'other' },            'writes nothing over a gate of another format, cited exactly, and refuses it as an incompatible row'],
    [{ ...TH.gateThingOf(), lifeseq: '0000000002' },  'writes nothing over a gate whose lifeseq is not the last of its lifepath, cited exactly, and refuses it as an incompatible row'],
  ] as const

  for (const [raw, blurb] of UnwrittenCases) {
    it(blurb, async () => {
      const vaultDB = new MemoryVaultDB()
      const gate    = TH.gateThingOf()
      const ask     = TH.replaceAskOf(gate, TH.nextOf(gate))
      vaultDB._cheat_things(TH.ThingBank).gate.set(TH.GateScope.labelpath, raw)
      await TH.expectBad(vaultDB.tryWriteThing(ask), 'incompatible_row')
      expect(vaultDB._cheat_things(TH.ThingBank).gate.get(TH.GateScope.labelpath)).to.deep.equal(raw)
    })
  }

  it("adds a passkey wayin under an ask that names its storage policy twice", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = TH.gateThingOf()
    const added   = TH.nextGateOf(gate, { wayins: TH.WithPasskey })
    vaultDB._cheat_things(TH.ThingBank).gate.set(TH.GateScope.labelpath, gate)
    expect(await vaultDB.tryWriteThing(TH.replaceAskOf(gate, added, { policies: ["add_passkey", "add_passkey"] }))).to.deep.include({ ok: true, act: 'replaced' })
  })

  it("refuses a listed child filed at another scope as a broken datastore", async () => {
    const vaultDB = new MemoryVaultDB()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    vaultDB._cheat_things(TH.ThingBank).box.set('box/aa', TH.boxThingOf('zz'))
    await TH.expectBad(vaultDB.tryListThings(TH.listAskAt('box', 'box')), 'storage_issue')
  })

  it("writes nothing for a birth whose roots fail their checks", async () => {
    const vaultDB = new MemoryVaultDB()
    const ask = TH.birthBankAskOf({ root: TH.boxThingOf() })
    await TH.expectBad(vaultDB.tryBirthBank(ask), 'bad_record')
    expect(Object.values(vaultDB._cheat_things(TH.ThingBank)).map((rows) => rows.size)).to.deep.equal([0, 0])
  })
})

describe("MemoryVaultDB, a row planted above a scope where nothing is stored", () => {
  const AboveCases = [
    ["storage_issue",    TH.boxThingOf('open'),               'refuses, as a broken datastore, a row above the scope that names a labelpath not above it'],
    ["storage_issue",    "not a Thing",                       'refuses, as a broken datastore, a row above the scope that is not an object'],
    ["incompatible_row", { ...TH.rootBoxOf(), revseq: -2 },   'refuses, as an incompatible row, a row above the scope whose revision fails its checks'],
  ] as const
  const voidPut = { ...TH.birthAskOf(TH.boxThingOf(), Shell.childCited(TH.Life0)), ifAbsent: 'fail' } as const

  for (const [refusalkind, ancestor, blurb] of AboveCases) {
    it(blurb, async () => {
      const vaultDB = new MemoryVaultDB()
      vaultDB._cheat_things(TH.ThingBank).box.set('box', ancestor)
      await TH.expectBad(vaultDB.tryGetThing(TH.getAskAt('box', 'box/openai')), refusalkind)
      await TH.expectBad(vaultDB.tryWriteThing(voidPut), refusalkind)
    })
  }
})

describe("MemoryVaultDB.tryStats(ask), a datastore in memory", () => {
  it("weighs each box and gate stored at the UTF-8 length of its JSON, and reports the cap for each limit", async () => {
    const vaultDB = new MemoryVaultDB()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const stats = await TH.expectGood<VaultStats>(vaultDB.tryStats(TH.statsAskOf()))
    expect(stats).to.deep.equal({
      box:  { count: 1, live_count: 1, size: rowWeightOf(TH.rootBoxOf()) },
      gate: { count: 1, live_count: 1, size: rowWeightOf(TH.gateThingOf()) },
      max:  { count: DatastoreLimitCap, size: DatastoreLimitCap },
    })
  })
})
