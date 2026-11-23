import { describe, expect, it, vi } from 'vitest'
import { VaultMinder } from '../../../src/minding/vault-minder'
import { type BoxRecord, Shell } from '../../../src/shapes/shapes-thing'
import { Thing } from '../../../src/models/thing'
import { MinderEventFormat } from '../../../src/shapes/shapes-minder'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import * as TH from '../../test-helpers'
import { QuietVaultDB, LateWriteVaultDB, minderWorldOf, bornOf, storedBoxOf, noticeOf, cheatBox, listenerOf, boxBirthAskOf } from './world'

describe("VaultMinder.tryWrite", () => {
  it("answers as the vaultDB did, once the record written is in its item", async () => {
    const vaultDB = await bornOf(new QuietVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    const written = vi.spyOn(vaultDB, 'tryWriteThing')
    const answer  = await minder.tryWrite(boxBirthAskOf())
    expect(answer).to.eq(await written.mock.results[0]?.value)
    expect(answer).to.deep.include({ ok: true, act: 'born', val: TH.boxThingOf() })
    expect(minder.at(TH.BoxScope)).to.deep.equal(TH.boxThingOf())
  })

  it("gives no other minder the bank, the main gate or a tracked root box the answer reports stored", async () => {
    const vaultDB = await bornOf(new QuietVaultDB())
    const { minder, bankMinder } = await minderWorldOf(vaultDB, { isWorldHeard: false })
    const answer = await minder.tryWrite({ ...boxBirthAskOf(), track: TH.RootStaleTrack })
    expect(answer.world).to.not.be.null
    expect(Object.values(answer.tracked ?? {})).to.deep.include(TH.rootBoxOf())
    expect(bankMinder.worldAt()).to.be.undefined
  })

  it("has cached the record a stale_write reports stored before the write answers", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const box1 = TH.nextOf(box0)
    cheatBox(vaultDB, box1)
    let isResolved = false
    const told: { isResolved: boolean, record: unknown }[] = []
    minder.listen((event) => {
      if ((event.eventkind === 'item') && (event.action?.type === 'success') && (event.labelpath === TH.BoxScope.labelpath)) { told.push({ isResolved, record: event.state.data }) }
    }, MinderEventFormat)
    const mine = TH.nextOf(box0, { revtok: TH.revtokOf('mine') })
    const answer = await minder.tryWrite(TH.replaceAskOf(box0, mine))
    isResolved = true
    await TH.expectBad(answer, 'stale_write')
    expect(answer).to.deep.include({ dbhas: box1 })
    expect(minder.at(TH.BoxScope)).to.deep.equal(box1)
    expect(told).to.deep.equal([{ isResolved: false, record: box1 }])
  })

  it("changes no item itself for a refused write: a stale_write's record lands only through the watch", async () => {
    const vaultDB = new QuietVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const record = minder.at(TH.BoxScope)
    cheatBox(vaultDB, TH.nextOf(box0))
    const mine = TH.nextOf(box0, { revtok: TH.revtokOf('mine') })
    const answer = await minder.tryWrite(TH.replaceAskOf(box0, mine))
    await TH.expectBad(answer, 'stale_write')
    expect(minder.at(TH.BoxScope)).to.eq(record)
    expect(minder.isStaleAt(TH.BoxScope)).to.be.false
  })

  it("caches nothing of the write while the vaultDB has not answered", async () => {
    const vaultDB = await bornOf(new LateWriteVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    await minder.list('box')
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    vaultDB.hold()
    const writing = minder.tryWrite(boxBirthAskOf())
    await TH.eventually(() => vaultDB.isHolding)
    expect(minder.at(TH.BoxScope)).to.be.undefined
    expect(minder.listingAt(TH.RootScope)).to.deep.equal([])
    expect(heard.mock.calls).to.have.lengthOf(0)
    vaultDB.release()
    await writing
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
  })

  it("tells a listener of the new record before a caller's await of the write returns", async () => {
    const vaultDB = await bornOf(new QuietVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    let isResolved = false
    const told: { isResolved: boolean, record: unknown }[] = []
    minder.listen((event) => {
      if ((event.eventkind === 'item') && (event.action?.type === 'success') && (event.labelpath === TH.BoxScope.labelpath)) { told.push({ isResolved, record: event.state.data }) }
    }, MinderEventFormat)
    await minder.tryWrite(boxBirthAskOf())
    isResolved = true
    expect(told).to.deep.equal([{ isResolved: false, record: TH.boxThingOf() }])
  })

  it("changes nothing when the watch's notice of the same write arrives after the answer", async () => {
    const vaultDB = await bornOf(new QuietVaultDB())
    const { minder, receive } = await minderWorldOf(vaultDB)
    await minder.list('box')
    await minder.tryWrite(boxBirthAskOf())
    const [record, listing] = [minder.at(TH.BoxScope), minder.listingAt(TH.RootScope)]
    receive(noticeOf(TH.boxThingOf()))
    expect(minder.at(TH.BoxScope)).to.eq(record)
    expect(minder.listingAt(TH.RootScope)).to.eq(listing)
    expect(record).to.deep.equal(TH.boxThingOf())
    expect(listing).to.deep.equal(['box/openai'])
  })

  it("changes nothing when the answer arrives after the watch's notice of the same write", async () => {
    const vaultDB = await bornOf(new LateWriteVaultDB())
    const { minder, receive } = await minderWorldOf(vaultDB)
    await minder.list('box')
    vaultDB.hold()
    const writing = minder.tryWrite(boxBirthAskOf())
    await TH.eventually(() => vaultDB.isHolding)
    receive(noticeOf(TH.boxThingOf()))
    const [record, listing] = [minder.at(TH.BoxScope), minder.listingAt(TH.RootScope)]
    vaultDB.release()
    await writing
    expect(minder.at(TH.BoxScope)).to.eq(record)
    expect(minder.listingAt(TH.RootScope)).to.eq(listing)
    expect(record).to.deep.equal(TH.boxThingOf())
    expect(listing).to.deep.equal(['box/openai'])
  })

  it("leaves a deleted box's tombstone in its item and its labelpath in the root box's listing", async () => {
    const vaultDB = new QuietVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.list('box')
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    const answer    = await minder.tryWrite(TH.delAskFor(box, tombstone))
    expect(answer).to.deep.include({ ok: true, act: 'deleted' })
    expect(minder.at(TH.BoxScope)).to.deep.equal(tombstone)
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
  })

  it("writes a box the bank sealed, then the tombstone it sealed, through the put and del asks the bank makes", async () => {
    const { bank, device } = await TH.buildBornBank()
    const minder = VaultMinder.make({ vaultDB: device.vaultDB, bankMinder: device.bankMinder }, bank)
    minder.hello()
    const shell  = Shell.of({ ...bank.scope, labelpath: TH.BoxScope.labelpath }, bank.rootBox)
    const box    = await bank.sealBox(shell, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const putAsk = bank.makePutAsk<BoxRecord>({ cited: Thing.sparseOf(shell), record: box })
    await TH.expectGood(minder.tryWrite(putAsk))
    await minder.list('box')
    const tombstone = await bank.sealBox(box, { am: 'x' })
    const delAsk    = bank.makeDelAsk<BoxRecord>({ cited: Thing.sparseOf(box), record: tombstone })
    await TH.expectGood(minder.tryWrite(delAsk))
    expect(minder.at(TH.BoxScope)).to.deep.equal(tombstone)
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
  })

  it("answers the refusal, and asks the vaultDB nothing, while not minding", async () => {
    const vaultDB = await bornOf(new QuietVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    minder.goodbye()
    const written = vi.spyOn(vaultDB, 'tryWriteThing')
    await TH.expectBad(minder.tryWrite(boxBirthAskOf()), 'disabled')
    expect(written.mock.calls).to.have.lengthOf(0)
  })

  it("lands nothing of an answer that arrives after goodbye", async () => {
    const vaultDB = await bornOf(new LateWriteVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    vaultDB.hold()
    const writing = minder.tryWrite(boxBirthAskOf())
    await TH.eventually(() => vaultDB.isHolding)
    minder.goodbye()
    vaultDB.release()
    await TH.expectGood(writing)
    expect(minder.at(TH.BoxScope)).to.be.undefined
  })

  it("rejects an answer that carries a record of another bank, and caches that record nowhere", async () => {
    const vaultDB = await bornOf(new QuietVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    const theirs  = { ...TH.boxThingOf(), userid: 'u2' }
    vi.spyOn(vaultDB, 'tryWriteThing').mockImplementation((ask) => Promise.resolve({ ok: true, act: 'born', ask, world: null, val: theirs }))
    await TH.expectRefusal(minder.tryWrite(boxBirthAskOf()), 'unexpected_error')
    expect(minder.at(TH.BoxScope)).to.be.undefined
  })

  const RefusedAsks = [
    [{ ...boxBirthAskOf(), userid: 'u2' }, 'refuses an ask of another bank'],
    ["box/openai",                         'refuses an ask that is not a bag'],
  ] as const
  for (const [ask, blurb] of RefusedAsks) {
    it(blurb, async () => {
      const vaultDB = await bornOf(new QuietVaultDB())
      const { minder } = await minderWorldOf(vaultDB)
      const written = vi.spyOn(vaultDB, 'tryWriteThing')
      await TH.expectBad(minder.tryWrite(ask as never), 'bad_record')
      expect(written.mock.calls).to.have.lengthOf(0)
    })
  }
})

describe("VaultMinder.write", () => {
  it("returns the record written, once it is in its item", async () => {
    const vaultDB = await bornOf(new QuietVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    expect(await minder.write(boxBirthAskOf())).to.deep.equal(TH.boxThingOf())
    expect(minder.at(TH.BoxScope)).to.deep.equal(TH.boxThingOf())
  })

  it("throws the vaultDB's refusal", async () => {
    const vaultDB = await bornOf(new QuietVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    await minder.write(boxBirthAskOf())
    await TH.expectRefusal(minder.write(boxBirthAskOf()), 'stale_write')
  })

  it("throws, and asks the vaultDB nothing, while not minding", async () => {
    const vaultDB = await bornOf(new QuietVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    minder.goodbye()
    const written = vi.spyOn(vaultDB, 'tryWriteThing')
    await TH.expectRefusal(minder.write(boxBirthAskOf()), 'disabled')
    expect(written.mock.calls).to.have.lengthOf(0)
  })
})
