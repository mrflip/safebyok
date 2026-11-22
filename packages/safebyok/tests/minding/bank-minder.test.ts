import { describe, expect, it, vi } from 'vitest'
import { BankMinder } from '../../src/minding/bank-minder'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { getAskOf } from '../../src/shapes/shapes-asks'
import * as TH from '../test-helpers'
import { DownVaultDB, badnewsOf, bornOf, fakeBankOf, minderOf, storedBoxOf } from './vault-minder/world'

/** A BankMinder of `TH.ThingBank` over `vaultDB`, minding, and the friend it was made with, whose get asks track nothing, as a device's do before its bank is brought up. */
function bankMinderOver(vaultDB: MemoryVaultDB = new MemoryVaultDB()) {
  const bank       = { ...fakeBankOf(), makeGetAsk: (ask: { labelpath: string }) => getAskOf({ ...ask, ...TH.ThingBank }) }
  const bankMinder = BankMinder.make({ vaultDB }, bank)
  bankMinder.hello()
  return { vaultDB, bank, bankMinder }
}

/** A vaultDB with the bank of `TH.ThingBank` born in it, its roots at revision 0, and a BankMinder that has fetched its roots. */
async function fetchedWorldOf() {
  const made = bankMinderOver(await bornOf(new MemoryVaultDB()))
  await made.bankMinder.fetchWorld()
  return made
}

/** The roots of the bank `TH.birthBankAskOf()` births. */
const BornRoots = { bank: TH.bankThingOf(), gate: TH.gateThingOf(), root: TH.rootBoxOf() }

/** The main gate's revision after the born one. */
const Gate1 = TH.nextGateOf(BornRoots.gate)

describe("BankMinder.make(opts, bank)", () => {
  it("has no world, and is frozen", () => {
    const bankMinder = BankMinder.make({ vaultDB: new MemoryVaultDB() }, fakeBankOf())
    expect(bankMinder.worldAt()).to.be.undefined
    expect(Object.isFrozen(bankMinder)).to.be.true
  })

  it("refuses a vaultDB it cannot use", () => {
    TH.expectSyncRefusal(() => BankMinder.make({ vaultDB: {} as never }, fakeBankOf()), 'bad_record')
  })
})

describe("bankMinder.fetchWorld()", () => {
  it("answers the bank's three roots, and has each as an item, read whole by worldAt", async () => {
    const { bankMinder } = bankMinderOver(await bornOf(new MemoryVaultDB()))
    const world = await bankMinder.fetchWorld()
    expect(world).to.deep.equal(BornRoots)
    expect(bankMinder.worldAt()).to.deep.equal(world)
    expect(bankMinder.worldAt()?.gate).to.equal(bankMinder.at(TH.GateScope))
    expect(Object.isFrozen(world?.gate.wayins)).to.be.true
  })

  it("asks the vaultDB for the root box, through its friend's get ask", async () => {
    const { vaultDB, bankMinder } = await fetchedWorldOf()
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await bankMinder.fetchWorld()
    expect(asked.mock.calls).to.deep.equal([[getAskOf({ ...TH.RootScope, ifAbsent: 'nil' })]])
  })

  it("answers null, and has no world, where no bank is stored", async () => {
    const { bankMinder } = bankMinderOver()
    expect(await bankMinder.fetchWorld()).to.be.null
    expect(bankMinder.worldAt()).to.be.undefined
  })

  const BrokenCases = [
    ["bank", 'a root box stored without its bank'],
    ["gate", 'a root box stored without its main gate'],
    ["box",  'a bank and main gate stored without their root box'],
  ] as const

  for (const [labelpath, blurb] of BrokenCases) {
    it(`refuses ${blurb}, and has no world`, async () => {
      const vaultDB = await bornOf(new MemoryVaultDB())
      vaultDB._cheat_things(TH.ThingBank).delete(labelpath)
      const { bankMinder } = bankMinderOver(vaultDB)
      await TH.expectRefusal(bankMinder.fetchWorld(), 'storage_issue')
      expect(bankMinder.worldAt()).to.be.undefined
    })
  }

  it("refuses with the vaultDB's own refusal where the get is refused", async () => {
    await TH.expectRefusal(bankMinderOver(new DownVaultDB()).bankMinder.fetchWorld(), 'storage_unavailable')
  })
})

describe("a BankMinder's watch", () => {
  it("lands a main gate written elsewhere", async () => {
    const { vaultDB, bankMinder } = await fetchedWorldOf()
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(BornRoots.gate, Gate1)))
    await TH.eventually(() => bankMinder.worldAt()?.gate.revtok === Gate1.revtok)
    expect(bankMinder.worldAt()).to.deep.equal({ ...BornRoots, gate: Gate1 })
  })

  it("keeps the main gate's record, the same object, when the watch notifies it again", async () => {
    const { vaultDB, bankMinder } = await fetchedWorldOf()
    const gate = bankMinder.at(TH.GateScope)
    const staleGet = { ...TH.getAskAt('box'), track: TH.GateStaleTrack }
    await TH.expectGood<unknown>(vaultDB.tryGetThing(staleGet))
    await TH.expectGood<unknown>(vaultDB.tryGetThing(staleGet))
    await TH.wakeupAtNextTick()
    expect(bankMinder.at(TH.GateScope)).to.equal(gate)
  })

  it("lands the main gate a VaultMinder's get finds stale, which the VaultMinder has no item of", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(BornRoots.gate, Gate1)))
    const { bankMinder } = bankMinderOver(vaultDB)
    expect(bankMinder.at(TH.GateScope)).to.be.undefined
    const staleBank = { ...fakeBankOf(), makeGetAsk: (ask: { labelpath: string }) => getAskOf({ ...ask, ...TH.ThingBank, track: TH.GateStaleTrack }) }
    const minder    = await minderOf(vaultDB, {}, staleBank, bankMinder)
    minder.hello()
    await minder.get(TH.BoxScope)
    await TH.eventually(() => TH.itemRevtokOf(bankMinder.at(TH.GateScope)) === Gate1.revtok)
    expect(minder.at(TH.GateScope)).to.be.undefined
  })
})

describe("bankMinder.tryWrite(ask)", () => {
  it("has the main gate it wrote in its world once it answers", async () => {
    const { bankMinder } = await fetchedWorldOf()
    await TH.expectGood(bankMinder.tryWrite(TH.replaceAskOf(BornRoots.gate, Gate1)))
    expect(bankMinder.worldAt()?.gate).to.deep.equal(Gate1)
  })

  it("has the main gate stored in its world once it answers a write refused over it", async () => {
    const { vaultDB, bankMinder } = await fetchedWorldOf()
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(BornRoots.gate, Gate1)))
    const answer = await bankMinder.tryWrite(TH.replaceAskOf(BornRoots.gate, TH.nextGateOf(BornRoots.gate)))
    expect(answer.ok).to.be.false
    expect(bankMinder.worldAt()?.gate).to.deep.equal(Gate1)
  })

  it("answers a box's write refused, without asking the vaultDB", async () => {
    const { vaultDB, bankMinder } = await fetchedWorldOf()
    const written = vi.spyOn(vaultDB, 'tryWriteThing')
    const answer  = await bankMinder.tryWrite(TH.birthAskOf(TH.boxThingOf()))
    expect(answer).to.deep.include({ ok: false })
    expect(written).not.toHaveBeenCalled()
  })
})

describe("bankMinder.tryBirthBank(ask)", () => {
  it("has the three roots it births as its world once it answers", async () => {
    const { bankMinder } = bankMinderOver()
    await TH.expectGood(bankMinder.tryBirthBank(TH.birthBankAskOf()))
    expect(bankMinder.worldAt()).to.deep.equal(BornRoots)
  })

  it("lands nothing for a refused birth", async () => {
    const { bankMinder } = bankMinderOver()
    const answer = await bankMinder.tryBirthBank(TH.birthBankAskOf({ root: TH.boxThingOf() }))
    expect(answer.ok).to.be.false
    expect(bankMinder.worldAt()).to.be.undefined
  })
})

describe("bankMinder.subscribe(listener)", () => {
  it("calls the listener as each root lands, until stopped", async () => {
    const { bankMinder } = bankMinderOver()
    const listener = vi.fn()
    const stop = bankMinder.subscribe(listener)
    await TH.expectGood(bankMinder.tryBirthBank(TH.birthBankAskOf()))
    await TH.wakeupAtNextTick()
    const heard = listener.mock.calls.length
    expect(heard).to.be.at.least(3)
    stop()
    await TH.expectGood(bankMinder.tryWrite(TH.replaceAskOf(BornRoots.gate, Gate1)))
    await TH.wakeupAtNextTick()
    expect(listener.mock.calls).to.have.lengthOf(heard)
  })

  it("tells the friend's tellBadNews what the listener throws", async () => {
    const { bank, bankMinder } = bankMinderOver()
    bankMinder.subscribe(() => { throw new Error('listener broke') })
    await TH.expectGood(bankMinder.tryBirthBank(TH.birthBankAskOf()))
    expect(badnewsOf(bank)).to.include('unexpected_error')
  })

  it("refuses a listener that is not a function", () => {
    TH.expectSyncRefusal(() => bankMinderOver().bankMinder.subscribe('listen' as never), 'bad_record')
  })
})
