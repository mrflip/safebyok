import { describe, expect, expectTypeOf, it } from 'vitest'
import type { BoxCar, GateCar, MinderEvent, ThingEvent } from '../../../src/shapes/shapes-minder'
import type { Labelpath } from '../../../src/shapes/primitives'
import { carOf } from '../../../src/minding/thing-car'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import { ThingMinder } from '../../../src/minding/thing-minder'
import { ThingFormat } from '../../../src/shapes/shapes-thing'
import * as TH from '../../test-helpers'
import { badnewsOf, LateVaultDB, DownVaultDB, minderWorldOf, bornOf, storedGateOf, storedBoxOf, noticeOf, listenerOf, toldOf } from './world'

describe("ThingMinder.listen", () => {
  it("tells the cached car of every Thing of every kind, until stopped", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const heard    = listenerOf()
    const unlisten = minder.listen(heard, ThingFormat)
    await minder.get(TH.BoxScope)
    expect(heard.mock.calls).to.have.lengthOf(1)
    expect(heard.mock.calls[0]?.[0]).to.deep.include({ type: 'updated', action: { type: 'success' }, ...TH.BoxScope, modelkind: 'box', queryKey: minder.queryKey(TH.BoxScope) })
    expect(heard.mock.calls[0]?.[0]).to.have.nested.property('state.data', minder.at(TH.BoxScope))
    const gateCar = await minder.get(TH.GateScope)
    expect(heard.mock.calls.at(-1)?.[0]).to.deep.include({ ...TH.GateScope, modelkind: 'gate', queryKey: minder.queryKey(TH.GateScope) })
    expect(heard.mock.calls.at(-1)?.[0]).to.have.nested.property('state.data', gateCar)
    unlisten()
    heard.mockClear()
    await minder.get(TH.GateScope, { staleTime: 0 })
    expect(heard.mock.calls).to.have.lengthOf(0)
  })

  it("types a car's event by its modelkind", () => {
    expectTypeOf<Extract<MinderEvent, { modelkind: 'box' }>['state']['data']>().toEqualTypeOf<BoxCar | undefined>()
    expectTypeOf<Extract<MinderEvent, { modelkind: 'gate' }>['state']['data']>().toEqualTypeOf<GateCar | undefined>()
    expectTypeOf<Exclude<MinderEvent, ThingEvent>['state']['data']>().toEqualTypeOf<readonly Labelpath[] | undefined>()
  })

  it("tells a car's event from a listing's by isThingEvent", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard, ThingFormat)
    await minder.list('box')
    await minder.get(TH.BoxScope)
    const told = heard.mock.calls.map(([event]) => [ThingMinder.isThingEvent(event), event.queryKey.at(-1)])
    expect(told).to.deep.equal([[false, 'kids'], [true, '!'], [true, '!']])
  })

  it("narrows a minder's event to a car's by isThingEvent", () => {
    const narrowed = (event: MinderEvent) => (ThingMinder.isThingEvent(event) ? event : undefined)
    expectTypeOf<ReturnType<typeof narrowed>>().toEqualTypeOf<ThingEvent | undefined>()
  })

  it("tells TanStack's state as it stands, in a frozen copy, and never the query itself", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard, ThingFormat)
    await minder.get(TH.GateScope)
    const event = heard.mock.calls[0]![0]
    expect(event).to.not.have.property('query')
    expect(event.state).to.include({ status: 'success', error: null, isInvalidated: false })
    expect(event.state.dataUpdatedAt).to.be.above(0)
    expect([Object.isFrozen(event), Object.isFrozen(event.state), Object.isFrozen(event.queryKey), Object.isFrozen(event.action)]).to.deep.equal([true, true, true, true])
  })

  it("tells the car's agerank and its newest record's revision and life", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 1)
    const { minder } = minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard, ThingFormat)
    const car = await minder.get(TH.GateScope)
    const { revtok, revseq, am, lifeseq, lifepath } = gate
    expect(heard.mock.calls[0]?.[0]).to.deep.include({ agerank: car.agerank, revtok, revseq, am, lifeseq, lifepath })
  })

  it("tells the shell's revision and life for a void car", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard, ThingFormat)
    const car = await minder.get(TH.BoxScope)
    const { revtok, lifeseq, lifepath } = car.newest
    expect(heard.mock.calls[0]?.[0]).to.deep.include({ agerank: car.agerank, revtok, revseq: -1, am: 'x', lifeseq, lifepath })
  })

  it("tells the car itself, the same object after a record that changes nothing", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder, receive } = minderWorldOf(vaultDB)
    const heard   = listenerOf()
    minder.listen(heard, ThingFormat)
    await minder.get(TH.GateScope)
    receive(noticeOf(gate))
    const cached = minder.at(TH.GateScope)
    expect(heard.mock.calls).to.have.lengthOf(2)
    expect(heard.mock.calls[0]?.[0]).to.have.nested.property('state.data', cached)
    expect(heard.mock.calls[1]?.[0]).to.have.nested.property('state.data', cached)
  })

  it("tells the void car of a shell and the gone car of a tombstone", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder, receive } = minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard, ThingFormat)
    await minder.get(TH.BoxScope)
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    receive(noticeOf(tombstone))
    expect(toldOf(heard)).to.deep.equal([['box/openai', 'void'], ['box/openai', 'gone'], ['listing']])
    expect(heard.mock.calls[1]?.[0]).to.have.nested.property('state.data.newest', tombstone)
  })

  it("tells nothing while a get waits, then the car it lands", async () => {
    const vaultDB = new LateVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const heard   = listenerOf()
    minder.listen(heard, ThingFormat)
    const getting = minder.get(TH.GateScope)
    await TH.eventually(() => vaultDB.isHolding)
    expect(heard.mock.calls).to.have.lengthOf(0)
    vaultDB.release()
    await getting
    expect(heard.mock.calls.at(-1)?.[0].state.data).to.deep.equal(carOf(gate))
  })

  it("tells the car as cached after a refused get", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 1)
    const { minder } = minderWorldOf(vaultDB)
    const cached = await minder.get(TH.GateScope)
    const heard  = listenerOf()
    minder.listen(heard, ThingFormat)
    vaultDB._cheat_things(TH.ThingBank).set(TH.GateScope.labelpath, TH.gateThingOf())
    await TH.expectRefusal(minder.get(TH.GateScope, { staleTime: 0 }), 'stale_read')
    expect(heard.mock.calls).to.have.lengthOf(1)
    expect(heard.mock.calls[0]?.[0]).to.have.nested.property('state.data', cached)
    expect(heard.mock.calls[0]?.[0]).to.deep.include({ type: 'updated', action: { type: 'error' }, agerank: cached.agerank })
    expect(heard.mock.calls[0]?.[0]).to.have.nested.property('state.error.refusalkind', 'stale_read')
  })

  it("tells no car for a first get that is refused, as for a removed one", async () => {
    const vaultDB = await bornOf(new DownVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard, ThingFormat)
    await TH.expectRefusal(minder.get(TH.GateScope), 'storage_unavailable')
    expect(toldOf(heard)).to.deep.equal([['gate', undefined]])
    expect(heard.mock.calls[0]?.[0]).to.deep.include({ agerank: undefined, revtok: undefined, revseq: undefined, am: undefined, lifeseq: undefined, lifepath: undefined })
  })

  it("tells nothing cached for each car and listing goodbye removes", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(TH.GateScope)
    const heard = listenerOf()
    minder.listen(heard, ThingFormat)
    minder.goodbye()
    expect(toldOf(heard)).to.have.deep.members([['box', undefined], ['gate', undefined], ['listing']])
    expect(heard.mock.calls.map(([event]) => [event.type, event.action, event.state.data])).to.deep.equal(Array.from({ length: 3 }, () => ['removed', undefined, undefined]))
  })

  it("tells a listing as cached, with its parent and the kind of its Things", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard, ThingFormat)
    await minder.list('box')
    const listed = heard.mock.calls.map(([event]) => event).filter((event) => ! ThingMinder.isThingEvent(event))
    expect(listed).to.have.lengthOf(1)
    expect(listed[0]).to.deep.include({ type: 'updated', action: { type: 'success' }, ...TH.RootScope, modelkind: 'box', queryKey: minder.listingQueryKey(TH.RootScope) })
    expect(listed[0]).to.have.nested.property('state.data', minder.listingAt(TH.RootScope))
    expect(listed[0]?.state.data).to.deep.equal(['box/openai'])
  })

  it("tells the root box's listing, empty, when hello caches it", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB(), { isStarted: false })
    const heard = listenerOf()
    minder.listen(heard, ThingFormat)
    minder.hello()
    expect(heard.mock.calls).to.have.lengthOf(1)
    expect(heard.mock.calls[0]?.[0]).to.deep.include({ ...TH.RootScope, modelkind: 'box', queryKey: minder.listingQueryKey(TH.RootScope) })
    expect(heard.mock.calls[0]?.[0].state).to.deep.include({ data: [], dataUpdatedAt: 0 })
  })

  it("tells a listing once a labelpath joins it, and not for a record that joins none", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder, receive } = minderWorldOf(vaultDB)
    await minder.list('box')
    const heard = listenerOf()
    minder.listen(heard, ThingFormat)
    receive(noticeOf(TH.nextOf(box)))
    receive(noticeOf(TH.boxThingOf('anthropic')))
    expect(toldOf(heard)).to.deep.equal([['box/openai', 'full'], ['box/anthropic', 'full'], ['listing']])
    expect(heard.mock.calls.at(-1)?.[0]).to.have.nested.property('state.data', minder.listingAt(TH.RootScope))
  })

  it("tells no labelpaths for a listing goodbye removes, though its query keeps them", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = minderWorldOf(vaultDB)
    await minder.list('box')
    const heard = listenerOf()
    minder.listen(heard, ThingFormat)
    minder.goodbye()
    const removed = heard.mock.calls.map(([event]) => event).filter((event) => ! ThingMinder.isThingEvent(event))
    expect(removed).to.have.lengthOf(1)
    expect(removed[0]).to.deep.include({ type: 'removed', action: undefined, ...TH.RootScope, modelkind: 'box', queryKey: minder.listingQueryKey(TH.RootScope) })
    expect(removed[0]?.state).to.deep.include({ data: undefined, status: 'success' })
  })

  it("tells the bank's onBadNews what a listener throws, as unexpected_error, and tells the listeners after it", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder, bank } = minderWorldOf(vaultDB)
    const later   = listenerOf()
    minder.listen(() => { throw new Error('listener broke') }, ThingFormat)
    minder.listen(later, ThingFormat)
    await minder.get(TH.GateScope)
    expect(later.mock.calls.map(([event]) => event.state.data)).to.deep.include(carOf(gate))
    expect(badnewsOf(bank)).to.deep.equal(['unexpected_error'])
    expect(bank.tellBadNews.mock.calls[0]?.[0][0]).to.have.nested.property('cause.message', 'listener broke')
  })

  it("refuses a listener that is not a function", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    // @ts-expect-error -- sloppy input is the point
    TH.expectSyncRefusal(() => minder.listen(undefined, ThingFormat), 'bad_record')
  })

  const BadVersions = [
    [undefined,                 'refuses a listener given no feed version'],
    [`${ThingFormat}-next`,     'refuses a feed version other than its own'],
    [ThingFormat.toUpperCase(), 'refuses its own feed version spelled another way'],
  ] as const
  for (const [version, blurb] of BadVersions) {
    it(blurb, () => {
      const { minder } = minderWorldOf(new MemoryVaultDB())
      TH.expectSyncRefusal(() => minder.listen(listenerOf(), version as never), 'bad_record')
    })
  }
})
