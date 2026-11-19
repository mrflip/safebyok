import { describe, expect, expectTypeOf, it } from 'vitest'
import type { BoxCar, GateCar, MinderEvent } from '../../../src/shapes/shapes-minder'
import { carOf } from '../../../src/minding/thing-car'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import * as TH from '../../test-helpers'
import { badnewsOf, LateVaultDB, DownVaultDB, minderWorldOf, bornOf, storedGateOf, storedBoxOf, noticeOf, listenerOf, toldOf } from './world'

describe("ThingMinder.listen", () => {
  it("tells the cached car of every Thing of every kind, until stopped", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const heard    = listenerOf()
    const unlisten = minder.listen(heard)
    await minder.get(TH.BoxScope)
    expect(heard.mock.calls).to.deep.equal([[{ carkind: 'thing', modelkind: 'box', labelpath: 'box/openai', car: minder.at(TH.BoxScope) }]])
    const gateCar = await minder.get(TH.GateScope)
    expect(heard.mock.calls.at(-1)?.[0]).to.deep.equal({ carkind: 'thing', modelkind: 'gate', labelpath: 'gate', car: gateCar })
    unlisten()
    heard.mockClear()
    await minder.get(TH.GateScope, { staleTime: 0 })
    expect(heard.mock.calls).to.have.lengthOf(0)
  })

  it("types a car's event by its modelkind", () => {
    expectTypeOf<Extract<MinderEvent, { carkind: 'thing', modelkind: 'box' }>['car']>().toEqualTypeOf<BoxCar | undefined>()
    expectTypeOf<Extract<MinderEvent, { carkind: 'thing', modelkind: 'gate' }>['car']>().toEqualTypeOf<GateCar | undefined>()
  })

  it("tells the car itself, the same object after a record that changes nothing", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder, receive } = minderWorldOf(vaultDB)
    const heard   = listenerOf()
    minder.listen(heard)
    await minder.get(TH.GateScope)
    receive(noticeOf(gate))
    const cached = minder.at(TH.GateScope)
    expect(heard.mock.calls).to.have.lengthOf(2)
    expect(heard.mock.calls[0]?.[0]).to.have.property('car', cached)
    expect(heard.mock.calls[1]?.[0]).to.have.property('car', cached)
  })

  it("tells the void car of a shell and the gone car of a tombstone", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder, receive } = minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard)
    await minder.get(TH.BoxScope)
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    receive(noticeOf(tombstone))
    expect(toldOf(heard)).to.deep.equal([['box/openai', 'void'], ['box/openai', 'gone'], ['listing']])
    expect(heard.mock.calls[1]?.[0]).to.have.nested.property('car.newest', tombstone)
  })

  it("tells nothing while a get waits, then the car it lands", async () => {
    const vaultDB = new LateVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const heard   = listenerOf()
    minder.listen(heard)
    const getting = minder.get(TH.GateScope)
    await TH.eventually(() => vaultDB.isHolding)
    expect(heard.mock.calls).to.have.lengthOf(0)
    vaultDB.release()
    await getting
    expect(heard.mock.calls.at(-1)?.[0]).to.deep.equal({ carkind: 'thing', modelkind: 'gate', labelpath: 'gate', car: carOf(gate) })
  })

  it("tells the car as cached after a refused get", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 1)
    const { minder } = minderWorldOf(vaultDB)
    const cached = await minder.get(TH.GateScope)
    const heard  = listenerOf()
    minder.listen(heard)
    vaultDB._cheat_things(TH.ThingBank).set(TH.GateScope.labelpath, TH.gateThingOf())
    await TH.expectRefusal(minder.get(TH.GateScope, { staleTime: 0 }), 'stale_read')
    expect(heard.mock.calls).to.have.lengthOf(1)
    expect(heard.mock.calls[0]?.[0]).to.have.property('car', cached)
  })

  it("tells no car for a first get that is refused, as for a removed one", async () => {
    const vaultDB = await bornOf(new DownVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard)
    await TH.expectRefusal(minder.get(TH.GateScope), 'storage_unavailable')
    expect(toldOf(heard)).to.deep.equal([['gate', undefined]])
  })

  it("tells nothing cached for each car and listing goodbye removes", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.GateScope)
    const heard = listenerOf()
    minder.listen(heard)
    minder.goodbye()
    expect(toldOf(heard)).to.have.deep.members([['box', undefined], ['gate', undefined], ['listing']])
  })

  it("tells a listing as cached, with its parent and the kind of its Things", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard)
    await minder.list('box')
    const listed = heard.mock.calls.map(([event]) => event).filter((event) => event.carkind === 'listing')
    expect(listed).to.deep.equal([{ carkind: 'listing', modelkind: 'box', labelpaths: ['box/openai'], tag: 'kids', of: { parentpath: 'box' } }])
    expect(listed[0]).to.have.property('labelpaths', minder.listingAt(TH.RootScope))
  })

  it("tells the root box's listing, empty, when hello caches it", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB(), { isStarted: false })
    const heard = listenerOf()
    minder.listen(heard)
    minder.hello()
    expect(heard.mock.calls).to.deep.equal([[{ carkind: 'listing', modelkind: 'box', labelpaths: [], tag: 'kids', of: { parentpath: 'box' } }]])
  })

  it("tells a listing once a labelpath joins it, and not for a record that joins none", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder, receive } = minderWorldOf(vaultDB)
    await minder.list('box')
    const heard = listenerOf()
    minder.listen(heard)
    receive(noticeOf(TH.nextOf(box)))
    receive(noticeOf(TH.boxThingOf('anthropic')))
    expect(toldOf(heard)).to.deep.equal([['box/openai', 'full'], ['box/anthropic', 'full'], ['listing']])
    expect(heard.mock.calls.at(-1)?.[0]).to.have.property('labelpaths', minder.listingAt(TH.RootScope))
  })

  it("tells no labelpaths for a listing goodbye removes", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    await minder.list('box')
    const heard = listenerOf()
    minder.listen(heard)
    minder.goodbye()
    expect(heard.mock.calls.map(([event]) => event)).to.deep.include({ carkind: 'listing', modelkind: 'box', labelpaths: undefined, tag: 'kids', of: { parentpath: 'box' } })
  })

  it("tells the bank's onBadNews what a listener throws, as unexpected_error, and tells the listeners after it", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder, bank } = minderWorldOf(vaultDB)
    const later   = listenerOf()
    minder.listen(() => { throw new Error('listener broke') })
    minder.listen(later)
    await minder.get(TH.GateScope)
    expect(later.mock.calls.map(([event]) => event)).to.deep.include({ carkind: 'thing', modelkind: 'gate', labelpath: 'gate', car: carOf(gate) })
    expect(badnewsOf(bank)).to.deep.equal(['unexpected_error'])
    expect(bank.tellBadNews.mock.calls[0]?.[0][0]).to.have.nested.property('cause.message', 'listener broke')
  })

  it("refuses a listener that is not a function", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    // @ts-expect-error -- sloppy input is the point
    TH.expectSyncRefusal(() => minder.listen(undefined), 'bad_record')
  })
})
