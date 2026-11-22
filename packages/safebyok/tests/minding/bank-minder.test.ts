import { describe, expect, it, vi } from 'vitest'
import { BankMinder } from '../../src/minding/bank-minder'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { Thing } from '../../src/models/thing'
import { Shell } from '../../src/shapes/shapes-thing'
import { getAskOf } from '../../src/shapes/shapes-asks'
import * as TH from '../test-helpers'

/** A vaultDB with the bank of `TH.ThingBank` born in it, its roots at revision 0, and a BankMinder that has fetched its world. */
async function fetchedWorldOf() {
  const vaultDB    = new MemoryVaultDB()
  await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
  const bankMinder = BankMinder.make()
  await bankMinder.fetchWorld(vaultDB, TH.ThingBank)
  return { vaultDB, bankMinder }
}

/** The roots of the bank `TH.birthBankAskOf()` births. */
const BornRoots = { bank: TH.bankThingOf(), gate: TH.gateThingOf(), root: TH.rootBoxOf() }

/** The main gate's revision after the born one. */
const Gate1 = TH.nextGateOf(BornRoots.gate)

/** A vaultDB whose store cannot be reached. */
class DownVaultDB extends MemoryVaultDB {
  protected override doGetThing(): never { throw new Error('connection refused') }
}

describe("BankMinder.make()", () => {
  it("holds no world of any bank", () => {
    const bankMinder = BankMinder.make()
    expect(bankMinder.worldAt(TH.ThingBank)).to.be.undefined
    expect(Object.isFrozen(bankMinder)).to.be.true
  })
})

describe("bankMinder.fetchWorld(vaultDB, scope)", () => {
  it("answers the bank's three roots, and has them as its world", async () => {
    const vaultDB = new MemoryVaultDB()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const bankMinder = BankMinder.make()
    const world = await bankMinder.fetchWorld(vaultDB, TH.ThingBank)
    expect(world).to.deep.equal(BornRoots)
    expect(bankMinder.worldAt(TH.ThingBank)).to.equal(world)
    expect(Object.isFrozen(world?.gate.wayins)).to.be.true
  })

  it("asks the vaultDB for the root box, tracking nothing", async () => {
    const { vaultDB, bankMinder } = await fetchedWorldOf()
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await bankMinder.fetchWorld(vaultDB, TH.ThingBank)
    expect(asked.mock.calls).to.deep.equal([[getAskOf({ ...TH.RootScope, ifAbsent: 'nil' })]])
  })

  it("answers null, and holds nothing, where no bank is stored", async () => {
    const bankMinder = BankMinder.make()
    expect(await bankMinder.fetchWorld(new MemoryVaultDB(), TH.ThingBank)).to.be.null
    expect(bankMinder.worldAt(TH.ThingBank)).to.be.undefined
  })

  const BrokenCases = [
    ['bank',                'a root box stored without its bank'],
    ['gate',                'a root box stored without its main gate'],
    ['box',                 'a bank and main gate stored without their root box'],
  ] as const

  for (const [labelpath, blurb] of BrokenCases) {
    it(`refuses ${blurb}, holding nothing`, async () => {
      const vaultDB = new MemoryVaultDB()
      await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
      vaultDB._cheat_things(TH.ThingBank).delete(labelpath)
      const bankMinder = BankMinder.make()
      await TH.expectRefusal(bankMinder.fetchWorld(vaultDB, TH.ThingBank), 'storage_issue')
      expect(bankMinder.worldAt(TH.ThingBank)).to.be.undefined
    })
  }

  it("refuses with the vaultDB's own refusal where the get is refused", async () => {
    await TH.expectRefusal(BankMinder.make().fetchWorld(new DownVaultDB(), TH.ThingBank), 'storage_unavailable')
  })

  it("refuses a vaultDB or a scope it cannot use", async () => {
    const bankMinder = BankMinder.make()
    await TH.expectRefusal(bankMinder.fetchWorld({} as never, TH.ThingBank), 'bad_record')
    await TH.expectRefusal(bankMinder.fetchWorld(new MemoryVaultDB(), { userid: 'u1' } as never), 'bad_record')
  })

  it("holds the worlds of many users' banks, each found by its own scope", async () => {
    const vaultDB = new MemoryVaultDB()
    const otherBank = { userid: 'u2', banklabel: 'acme' }
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const otherRoots = { bank: TH.bankThingOf(otherBank), gate: TH.gateThingOf(otherBank), root: TH.rootBoxOf(otherBank) }
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf({ ...otherBank, ...otherRoots })))
    const bankMinder = BankMinder.make()
    await bankMinder.fetchWorld(vaultDB, TH.ThingBank)
    await bankMinder.fetchWorld(vaultDB, otherBank)
    expect(bankMinder.worldAt(TH.ThingBank)?.bank.userid).to.eq('u1')
    expect(bankMinder.worldAt(otherBank)?.bank.userid).to.eq('u2')
  })
})

describe("a world of another life of the bank", () => {
  it("replaces the world of the earlier life whole", async () => {
    const { vaultDB, bankMinder } = await fetchedWorldOf()
    const reborn = { ...TH.bankThingOf(), lifetok: TH.OtherLifetok }
    vaultDB._cheat_things(TH.ThingBank).set('bank', reborn)
    const world = await bankMinder.fetchWorld(vaultDB, TH.ThingBank)
    expect(world?.bank).to.deep.equal(reborn)
    expect(bankMinder.worldAt(TH.ThingBank)).to.equal(world)
  })

  it("lands nowhere from a record of the bank alone", async () => {
    const { bankMinder } = await fetchedWorldOf()
    const prior = bankMinder.worldAt(TH.ThingBank)
    bankMinder.sendToTSQ(TH.nextOf(BornRoots.bank, { lifetok: TH.OtherLifetok }))
    expect(bankMinder.worldAt(TH.ThingBank)).to.equal(prior)
  })
})

describe("bankMinder.sendToTSQ(record)", () => {
  it("lands a newer main gate, root box or bank of the life cached in its world", async () => {
    const { bankMinder } = await fetchedWorldOf()
    const roots = { bank: TH.nextOf(BornRoots.bank), gate: Gate1, root: TH.nextOf(BornRoots.root) }
    for (const record of [roots.gate, roots.root, roots.bank]) { bankMinder.sendToTSQ(record) }
    expect(bankMinder.worldAt(TH.ThingBank)).to.deep.equal(roots)
  })

  it("keeps its world, the same object, for a root no newer than the one it has", async () => {
    const { bankMinder } = await fetchedWorldOf()
    bankMinder.sendToTSQ(Gate1)
    const prior = bankMinder.worldAt(TH.ThingBank)
    for (const record of [BornRoots.gate, Gate1, BornRoots.root]) { bankMinder.sendToTSQ(record) }
    expect(bankMinder.worldAt(TH.ThingBank)).to.equal(prior)
  })

  it("lands no sparse root, shell, or box under the root box", async () => {
    const { bankMinder } = await fetchedWorldOf()
    const prior = bankMinder.worldAt(TH.ThingBank)
    bankMinder.sendToTSQ(Thing.sparseOf(Gate1))
    bankMinder.sendToTSQ(Shell.of(TH.GateScope))
    bankMinder.sendToTSQ(TH.boxThingOf())
    expect(bankMinder.worldAt(TH.ThingBank)).to.equal(prior)
  })

  it("lands nothing for a bank whose world it does not hold", () => {
    const bankMinder = BankMinder.make()
    for (const record of Object.values(BornRoots)) { bankMinder.sendToTSQ(record) }
    expect(bankMinder.worldAt(TH.ThingBank)).to.be.undefined
  })

  it("refuses what is not a record", () => {
    TH.expectSyncRefusal(() => { BankMinder.make().sendToTSQ({ labelpath: 'gate' } as never) }, 'bad_record')
  })
})

describe("bankMinder.tryWrite(vaultDB, ask)", () => {
  it("has the main gate it wrote in its world once it answers", async () => {
    const { vaultDB, bankMinder } = await fetchedWorldOf()
    await TH.expectGood(bankMinder.tryWrite(vaultDB, TH.replaceAskOf(BornRoots.gate, Gate1)))
    expect(bankMinder.worldAt(TH.ThingBank)?.gate).to.deep.equal(Gate1)
  })

  it("has the main gate stored in its world when the write is refused over a newer one", async () => {
    const { vaultDB, bankMinder } = await fetchedWorldOf()
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(BornRoots.gate, Gate1)))
    const answer = await bankMinder.tryWrite(vaultDB, TH.replaceAskOf(BornRoots.gate, TH.nextGateOf(BornRoots.gate)))
    expect(answer.ok).to.be.false
    expect(bankMinder.worldAt(TH.ThingBank)?.gate).to.deep.equal(Gate1)
  })

  it("lands nothing where it holds no world of the bank", async () => {
    const vaultDB = new MemoryVaultDB()
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
    const bankMinder = BankMinder.make()
    await TH.expectGood(bankMinder.tryWrite(vaultDB, TH.replaceAskOf(BornRoots.gate, Gate1)))
    expect(bankMinder.worldAt(TH.ThingBank)).to.be.undefined
  })
})

describe("bankMinder.tryBirthBank(vaultDB, ask)", () => {
  it("has the three roots it births as the bank's world once it answers", async () => {
    const bankMinder = BankMinder.make()
    await TH.expectGood(bankMinder.tryBirthBank(new MemoryVaultDB(), TH.birthBankAskOf()))
    expect(bankMinder.worldAt(TH.ThingBank)).to.deep.equal(BornRoots)
  })

  it("lands nothing for a refused birth", async () => {
    const bankMinder = BankMinder.make()
    const answer = await bankMinder.tryBirthBank(new MemoryVaultDB(), TH.birthBankAskOf({ root: TH.boxThingOf() }))
    expect(answer.ok).to.be.false
    expect(bankMinder.worldAt(TH.ThingBank)).to.be.undefined
  })
})

describe("bankMinder.subscribe(listener)", () => {
  it("calls the listener as a world lands, until stopped", async () => {
    const bankMinder = BankMinder.make()
    const listener = vi.fn()
    const stop = bankMinder.subscribe(listener)
    await TH.expectGood(bankMinder.tryBirthBank(new MemoryVaultDB(), TH.birthBankAskOf()))
    expect(listener.mock.calls).to.have.lengthOf(1)
    stop()
    bankMinder.sendToTSQ(Gate1)
    expect(listener.mock.calls).to.have.lengthOf(1)
  })

  it("refuses a listener that is not a function", () => {
    TH.expectSyncRefusal(() => BankMinder.make().subscribe('listen' as never), 'bad_record')
  })
})

describe("BankMinder.worldQueryKeyOf(bank)", () => {
  it("keys a world by its bank's scope, lifeseq and lifetok", () => {
    const bank = TH.bankThingOf()
    expect(BankMinder.worldQueryKeyOf(bank)).to.deep.equal(['sok', 'u1', 'acme', 'world', bank.lifeseq, bank.lifetok])
  })

  it("refuses a bank with no lifetok", () => {
    const bank = TH.omitting(TH.bankThingOf(), 'lifetok')
    TH.expectSyncRefusal(() => BankMinder.worldQueryKeyOf(bank), 'bad_record')
  })
})
