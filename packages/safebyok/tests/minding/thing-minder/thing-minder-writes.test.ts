import { describe, expect, it, vi } from 'vitest'
import { carOf } from '../../../src/minding/thing-car'
import { ThingMinder } from '../../../src/minding/thing-minder'
import { Shell } from '../../../src/shapes/shapes-thing'
import * as TH from '../../test-helpers'
import { QuietVaultDB, LateWriteVaultDB, minderWorldOf, bornOf, storedBoxOf, noticeOf, cheatBox, listenerOf, boxBirthAskOf } from './world'

describe("ThingMinder.tryWrite", () => {
  it("answers as the vaultDB did, once the record written is in its car", async () => {
    const vaultDB = await bornOf(new QuietVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const written = vi.spyOn(vaultDB, 'tryWriteThing')
    const answer  = await minder.tryWrite(boxBirthAskOf())
    expect(answer).to.eq(await written.mock.results[0]?.value)
    expect(answer).to.deep.include({ ok: true, act: 'born', val: TH.boxThingOf() })
    expect(minder.at(TH.BoxScope)).to.deep.equal(carOf(TH.boxThingOf()))
  })

  it("caches the bank and main gate of the answer's world", async () => {
    const vaultDB = await bornOf(new QuietVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    await minder.tryWrite(boxBirthAskOf())
    expect(minder.at(TH.BankScope)).to.deep.equal(carOf(TH.bankThingOf()))
    expect(minder.at(TH.GateScope)).to.deep.equal(carOf(TH.gateThingOf()))
  })

  it("caches a Thing the answer reports stored at another revision than the ask tracks", async () => {
    const vaultDB = await bornOf(new QuietVaultDB())
    const { minder } = minderWorldOf(vaultDB, { isRootHeard: false })
    await minder.tryWrite({ ...boxBirthAskOf(), track: TH.RootStaleTrack })
    expect(minder.at(TH.RootScope)).to.deep.equal(carOf(TH.rootBoxOf()))
  })

  it("leaves the car's newest at the record a stale_write reports stored", async () => {
    const vaultDB = new QuietVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const box1 = TH.nextOf(box0)
    const mine = TH.nextOf(box0, { revtok: TH.revtokOf('mine') })
    cheatBox(vaultDB, box1)
    const answer = await minder.tryWrite(TH.replaceAskOf(box0, mine))
    await TH.expectBad(answer, 'stale_write')
    expect(answer).to.deep.include({ dbhas: box1 })
    expect(minder.at(TH.BoxScope)).to.deep.equal(carOf(box1))
  })

  it("caches nothing of the write while the vaultDB has not answered", async () => {
    const vaultDB = await bornOf(new LateWriteVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    await minder.list('box')
    const heard = listenerOf()
    minder.listen(heard)
    vaultDB.hold()
    const writing = minder.tryWrite(boxBirthAskOf())
    await TH.eventually(() => vaultDB.isHolding)
    expect(minder.at(TH.BoxScope)).to.be.undefined
    expect(minder.at(TH.GateScope)).to.be.undefined
    expect(minder.listingAt(TH.RootScope)).to.deep.equal([])
    expect(heard.mock.calls).to.have.lengthOf(0)
    vaultDB.release()
    await writing
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
  })

  it("tells a listener of the new car before a caller's await of the write returns", async () => {
    const vaultDB = await bornOf(new QuietVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    let isResolved = false
    const told: { isResolved: boolean, car: unknown }[] = []
    minder.listen((event) => {
      if ((event.carkind === 'thing') && (event.labelpath === TH.BoxScope.labelpath)) { told.push({ isResolved, car: event.car }) }
    })
    await minder.tryWrite(boxBirthAskOf())
    isResolved = true
    expect(told).to.deep.equal([{ isResolved: false, car: carOf(TH.boxThingOf()) }])
  })

  it("changes nothing when the watch's notice of the same write arrives after the answer", async () => {
    const vaultDB = await bornOf(new QuietVaultDB())
    const { minder, receive } = minderWorldOf(vaultDB)
    await minder.list('box')
    const answer = await minder.tryWrite(boxBirthAskOf())
    const [car, listing] = [minder.at(TH.BoxScope), minder.listingAt(TH.RootScope)]
    receive(noticeOf(TH.boxThingOf(), answer.world))
    expect(minder.at(TH.BoxScope)).to.eq(car)
    expect(minder.listingAt(TH.RootScope)).to.eq(listing)
    expect(car).to.deep.equal(carOf(TH.boxThingOf()))
    expect(listing).to.deep.equal(['box/openai'])
  })

  it("changes nothing when the answer arrives after the watch's notice of the same write", async () => {
    const vaultDB = await bornOf(new LateWriteVaultDB())
    const { minder, receive } = minderWorldOf(vaultDB)
    await minder.list('box')
    vaultDB.hold()
    const writing = minder.tryWrite(boxBirthAskOf())
    await TH.eventually(() => vaultDB.isHolding)
    receive(noticeOf(TH.boxThingOf()))
    const [car, listing] = [minder.at(TH.BoxScope), minder.listingAt(TH.RootScope)]
    vaultDB.release()
    await writing
    expect(minder.at(TH.BoxScope)).to.eq(car)
    expect(minder.listingAt(TH.RootScope)).to.eq(listing)
    expect(car).to.deep.equal(carOf(TH.boxThingOf()))
    expect(listing).to.deep.equal(['box/openai'])
  })

  it("leaves a deleted box's car gone and its tombstone in the root box's listing", async () => {
    const vaultDB = new QuietVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    await minder.list('box')
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    const answer    = await minder.tryWrite(TH.delAskFor(box, tombstone))
    expect(answer).to.deep.include({ ok: true, act: 'deleted' })
    expect(minder.at(TH.BoxScope)).to.deep.equal(carOf(tombstone))
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
  })

  it("writes a box the bank sealed, then the tombstone it sealed, through the asks it makes", async () => {
    const { bank, device } = await TH.buildBornBank()
    const minder = ThingMinder.make({ vaultDB: device.vaultDB }, bank)
    minder.hello()
    const shell  = Shell.of({ ...bank.scope, labelpath: TH.BoxScope.labelpath }, bank.rootBox)
    const box    = await bank.sealBox(shell, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await TH.expectGood(minder.tryWrite(bank.makePutAsk({ cited: shell, record: box })))
    await minder.list('box')
    const tombstone = await bank.tombstoneBox(box)
    await TH.expectGood(minder.tryWrite(bank.makeDelAsk({ cited: box, record: tombstone })))
    expect(minder.at(TH.BoxScope)).to.deep.equal(carOf(tombstone))
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
  })

  it("answers the refusal, and asks the vaultDB nothing, while not minding", async () => {
    const vaultDB = await bornOf(new QuietVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    minder.goodbye()
    const written = vi.spyOn(vaultDB, 'tryWriteThing')
    await TH.expectBad(minder.tryWrite(boxBirthAskOf()), 'disabled')
    expect(written.mock.calls).to.have.lengthOf(0)
  })

  it("lands nothing of an answer that arrives after goodbye", async () => {
    const vaultDB = await bornOf(new LateWriteVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    vaultDB.hold()
    const writing = minder.tryWrite(boxBirthAskOf())
    await TH.eventually(() => vaultDB.isHolding)
    minder.goodbye()
    vaultDB.release()
    await TH.expectGood(writing)
    expect(minder.at(TH.BoxScope)).to.be.undefined
  })

  const RefusedAsks = [
    [{ ...boxBirthAskOf(), userid: 'u2' }, 'refuses an ask of another bank'],
    ["box/openai",                         'refuses an ask that is not a bag'],
  ] as const
  for (const [ask, blurb] of RefusedAsks) {
    it(blurb, async () => {
      const vaultDB = await bornOf(new QuietVaultDB())
      const { minder } = minderWorldOf(vaultDB)
      const written = vi.spyOn(vaultDB, 'tryWriteThing')
      await TH.expectBad(minder.tryWrite(ask as never), 'bad_record')
      expect(written.mock.calls).to.have.lengthOf(0)
    })
  }
})
