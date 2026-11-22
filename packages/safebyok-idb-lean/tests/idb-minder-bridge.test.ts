/** Tests for IdbMinderBridge: a real VaultMinder over a MemoryVaultDB, bridged to an IdbVaultDB on fake-indexeddb. */

// Import fake-indexeddb first: it installs IndexedDB's globals before the adapter loads.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryVaultDB, Shell, VaultError } from 'safebyok/storage'
import { IdbMinderBridge } from '../src/idb-minder-bridge'
import * as TH from './test-helpers'

afterEach(() => { vi.restoreAllMocks() })

/** The scope of a box under the root box that no one has stored. */
const AbsentScope = Object.freeze({ ...TH.ThingBank, labelpath: 'box/absent' })

/** Make the next put to IndexedDB fail, as it does when the origin is out of room. */
function failNextPut(): void {
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('IndexedDB says no.', 'QuotaExceededError') })
}

describe("IdbMinderBridge", () => {
  it("copies a record the minder lands into IndexedDB", async () => {
    const { minder, idbVaultDB, onBadNews } = await TH.bridgedWorldOf()
    const rows = TH._cheat_idbThingsOf(idbVaultDB)
    await minder.get(TH.BoxScope)
    await vi.waitFor(async () => { expect(await rows.rawAt(TH.BoxScope)).to.deep.equal(TH.boxThingOf()) })
    expect(onBadNews.mock.calls).to.deep.equal([])
  })

  it("copies a tombstone over the live record", async () => {
    const { vaultDB, minder, idbVaultDB } = await TH.bridgedWorldOf()
    const rows = TH._cheat_idbThingsOf(idbVaultDB)
    const box = await minder.get(TH.BoxScope)
    await vi.waitFor(async () => { expect(await rows.rawAt(TH.BoxScope)).to.deep.equal(box) })
    const tomb = TH.boxTombOf(TH.boxThingOf())
    const delAsk = TH.delAskFor(TH.boxThingOf(), tomb)
    await TH.expectGood(vaultDB.tryWriteThing(delAsk))
    await vi.waitFor(async () => { expect(await rows.rawAt(TH.BoxScope)).to.deep.equal(tomb) })
  })

  it("writes nothing for a soon or a shell", async () => {
    const { minder, idbVaultDB, onBadNews } = await TH.bridgedWorldOf()
    const rows = TH._cheat_idbThingsOf(idbVaultDB)
    await minder.list('box')
    expect(minder.soonAt(TH.BoxScope)).to.not.be.undefined
    await minder.get(AbsentScope)
    await TH.aWhile()
    expect([await rows.rawAt(TH.BoxScope), await rows.rawAt(AbsentScope)]).to.deep.equal([null, null])
    expect(onBadNews.mock.calls).to.deep.equal([])
  })

  it("leaves a newer record in IndexedDB over an older one the minder lands", async () => {
    const { minder, idbVaultDB, onBadNews } = await TH.bridgedWorldOf()
    const rows = TH._cheat_idbThingsOf(idbVaultDB)
    const overwriting = vi.spyOn(idbVaultDB, 'overwriteThing')
    const planted = TH.nextOf(TH.boxThingOf())
    await rows.plant(planted, planted)
    await minder.get(TH.BoxScope)
    await vi.waitFor(() => { expect(overwriting.mock.calls).to.have.lengthOf(1) })
    await overwriting.mock.results[0]?.value
    expect(await rows.rawAt(TH.BoxScope)).to.deep.equal(planted)
    expect(onBadNews.mock.calls).to.deep.equal([])
  })

  it("leaves a Thing in IndexedDB that the minder never tells of", async () => {
    const { minder, idbVaultDB } = await TH.bridgedWorldOf()
    const rows = TH._cheat_idbThingsOf(idbVaultDB)
    const unheard = TH.boxThingOf('unheard')
    await rows.plant(unheard, unheard)
    await minder.get(TH.BoxScope)
    await vi.waitFor(async () => { expect(await rows.rawAt(TH.BoxScope)).to.deep.equal(TH.boxThingOf()) })
    expect(await rows.rawAt(unheard)).to.deep.equal(unheard)
  })

  it("tells its onBadNews of a copy IndexedDB refused, and the minder nothing", async () => {
    const { bank, minder, onBadNews } = await TH.bridgedWorldOf()
    failNextPut()
    await minder.get(TH.BoxScope)
    await vi.waitFor(() => { expect(onBadNews.mock.calls).to.have.lengthOf(1) })
    expect(onBadNews.mock.calls[0]?.[0]).to.be.instanceOf(VaultError).with.property('refusalkind', 'vault_full')
    expect(bank.tellBadNews.mock.calls).to.deep.equal([])
  })

  it("throws nowhere for a refused copy when made with no onBadNews", async () => {
    const { bank, minder, idbVaultDB } = await TH.bridgedWorldOf({ isBadNewsHeard: false })
    failNextPut()
    await minder.get(TH.BoxScope)
    await TH.aWhile()
    expect(await TH._cheat_idbThingsOf(idbVaultDB).rawAt(TH.BoxScope)).to.be.null
    expect(bank.tellBadNews.mock.calls).to.deep.equal([])
  })

  it("copies nothing the cache changed before hello", async () => {
    const { minder, idbVaultDB, bridge } = await TH.bridgedWorldOf({ isStarted: false })
    minder.hello()
    await minder.get(TH.BoxScope)
    bridge.hello()
    await TH.aWhile()
    expect(await TH._cheat_idbThingsOf(idbVaultDB).rawAt(TH.BoxScope)).to.be.null
  })

  it("copies each record once, however often it is said hello to", async () => {
    const { minder, idbVaultDB, bridge } = await TH.bridgedWorldOf({ isStarted: false })
    const overwriting = vi.spyOn(idbVaultDB, 'overwriteThing')
    bridge.hello()
    bridge.hello()
    minder.hello()
    await minder.get(TH.BoxScope)
    await vi.waitFor(() => { expect(overwriting.mock.calls).to.have.lengthOf(1) })
    await TH.aWhile()
    expect(overwriting.mock.calls).to.have.lengthOf(1)
  })

  it("copies nothing after goodbye, until hello again", async () => {
    const { minder, idbVaultDB, bridge } = await TH.bridgedWorldOf()
    const rows = TH._cheat_idbThingsOf(idbVaultDB)
    bridge.goodbye()
    await minder.get(TH.BoxScope)
    await TH.aWhile()
    expect(await rows.rawAt(TH.BoxScope)).to.be.null
    bridge.hello()
    const other = TH.boxThingOf('anthropic')
    const shell = Shell.of({ ...TH.ThingBank, labelpath: other.labelpath }, TH.rootBoxOf())
    await minder.write(TH.birthAskOf(other, shell))
    await vi.waitFor(async () => { expect(await rows.rawAt(other)).to.deep.equal(other) })
  })
})

describe("IdbMinderBridge.make(opts)", () => {
  it("refuses a minder, a vaultDB or an onBadNews it cannot use, or a field it does not know", async () => {
    const { minder, idbVaultDB } = await TH.bridgedWorldOf({ isStarted: false })
    const BadOpts = [
      { minder: {}, idbVaultDB },
      { minder, idbVaultDB: new MemoryVaultDB() },
      { minder, idbVaultDB, onBadNews: 'console' },
      { minder, idbVaultDB, onbadnews: () => null },
    ]
    for (const opts of BadOpts) {
      expect(() => IdbMinderBridge.make(opts as never)).to.throw(VaultError).with.property('refusalkind', 'bad_record')
    }
  })
})
