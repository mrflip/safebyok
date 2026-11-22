import * as TSQ from '@tanstack/query-core'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { type DeadEvent, type ListingEvent, type MinderEvent, type SoonEvent, type ThingEvent, MinderEventFormat } from '../../../src/shapes/shapes-minder'
import type { Kids } from '../../../src/storage/vault-db'
import { Thing } from '../../../src/models/thing'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import { type BoxRecord, type GateRecord, type Sparse, type Tombstone } from '../../../src/shapes/shapes-thing'
import * as TH from '../../test-helpers'
import { badnewsOf, LateVaultDB, DownVaultDB, minderWorldOf, bornOf, cheatBox, storedBoxOf, noticeOf, sparseNoticeOf, boxScopeOf, everyEventListenerOf, listenerOf, toldOf, isListingEvent, labelpathsOf } from './world'

/** The last item's event `heard` was told, or undefined for none. */
function lastItemEventOf(heard: ReturnType<typeof listenerOf>): MinderEvent | undefined {
  return heard.mock.calls.findLast(([event]) => event.eventkind === 'item')?.[0]
}

describe("VaultMinder.listen", () => {
  it("tells the cached record of every box, until stopped", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    cheatBox(vaultDB, TH.boxThingOf('anthropic'))
    const { minder } = await minderWorldOf(vaultDB)
    const heard    = listenerOf()
    const unlisten = minder.listen(heard, MinderEventFormat)
    await minder.get(TH.BoxScope)
    expect(heard.mock.calls).to.have.lengthOf(1)
    expect(heard.mock.calls[0]?.[0]).to.deep.nested.include({ eventkind: 'item', type: 'updated', 'action.type': 'success', ...TH.BoxScope, modelkind: 'box', queryKey: minder.itemQueryKey(TH.BoxScope) })
    expect(heard.mock.calls[0]?.[0]).to.have.nested.property('state.data', minder.at(TH.BoxScope))
    const anthropic = await minder.get(boxScopeOf('anthropic'))
    const lastItem  = lastItemEventOf(heard)
    expect(lastItem).to.deep.include({ ...boxScopeOf('anthropic'), modelkind: 'box', queryKey: minder.itemQueryKey(boxScopeOf('anthropic')) })
    expect(lastItem).to.have.nested.property('state.data', anthropic)
    unlisten()
    heard.mockClear()
    await minder.get(boxScopeOf('anthropic'), { staleTime: 0 })
    expect(heard.mock.calls).to.have.lengthOf(0)
  })

  it("types an item's event and a soon's by its modelkind", () => {
    expectTypeOf<Extract<ThingEvent, { modelkind: 'box' }>['state']['data']>().toEqualTypeOf<BoxRecord | null | undefined>()
    expectTypeOf<Extract<ThingEvent, { modelkind: 'gate' }>['state']['data']>().toEqualTypeOf<GateRecord | null | undefined>()
    expectTypeOf<Extract<SoonEvent, { modelkind: 'box' }>['state']['data']>().toEqualTypeOf<Sparse<BoxRecord> | undefined>()
    expectTypeOf<Extract<DeadEvent, { modelkind: 'box' }>['state']['data']>().toEqualTypeOf<Tombstone<BoxRecord> | undefined>()
    expectTypeOf<Exclude<MinderEvent, ThingEvent | SoonEvent | DeadEvent>['state']['data']>().toEqualTypeOf<Kids | undefined>()
  })

  it("tells an item's event, a soon's and a listing's apart by its eventkind", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    const heard = everyEventListenerOf()
    minder.listen(heard, MinderEventFormat)
    await minder.list('box')
    await minder.get(TH.BoxScope)
    const told = heard.mock.calls.map(([event]) => [event.eventkind, event.type, event.action?.type, event.queryKey.at(-1)])
    expect(told).to.deep.equal([
      ['list', 'added', undefined, 'kids'], ['list', 'updated', 'fetch', 'kids'], ['soon', 'added', undefined, '~'], ['soon', 'updated', 'success', '~'],
      ['list', 'updated', 'invalidate', 'kids'], ['list', 'updated', 'success', 'kids'],
      ['item', 'added', undefined, '!'], ['item', 'updated', 'fetch', '!'], ['item', 'updated', 'success', '!'], ['soon', 'removed', undefined, '~'],
    ])
  })

  it("narrows a minder's event on its eventkind", () => {
    expectTypeOf<Extract<MinderEvent, { eventkind: 'item' }>>().toEqualTypeOf<ThingEvent>()
    expectTypeOf<Extract<MinderEvent, { eventkind: 'soon' }>>().toEqualTypeOf<SoonEvent>()
    expectTypeOf<Extract<MinderEvent, { eventkind: 'list' }>>().toEqualTypeOf<ListingEvent>()
  })

  it("tells a frozen copy of TanStack's current state, never the query itself", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    await minder.get(TH.BoxScope)
    const event = heard.mock.calls[0]![0]
    expect(event).to.not.have.property('query')
    expect(event.state).to.include({ status: 'success', error: null, isInvalidated: false })
    expect(event.state.dataUpdatedAt).to.be.above(0)
    expect([Object.isFrozen(event), Object.isFrozen(event.state), Object.isFrozen(event.queryKey), Object.isFrozen(event.action)]).to.deep.equal([true, true, true, true])
  })

  it("tells TanStack's action whole, in a frozen copy", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder, receive } = await minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    receive(noticeOf(box0))
    const { action, state } = heard.mock.calls[0]![0]
    expect(action).to.include({ type: 'success', manual: true })
    expect(action).to.have.property('data', state.data)
    expect(Object.isFrozen(action)).to.equal(true)
  })

  it("tells the refusal a get's error carries in its action", async () => {
    const vaultDB = await bornOf(new DownVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    await TH.expectRefusal(minder.get(TH.BoxScope), 'storage_unavailable')
    const { action, state } = heard.mock.calls[0]![0]
    expect(action).to.have.property('type', 'error')
    expect(action).to.have.nested.property('error.refusalkind', 'storage_unavailable')
    expect(action).to.have.property('error', state.error)
  })

  it("tells the query's hash beside its key", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    const heard = everyEventListenerOf()
    minder.listen(heard, MinderEventFormat)
    await minder.list('box')
    await minder.get(TH.BoxScope)
    for (const [event] of heard.mock.calls) { expect(event.queryHash).to.equal(TSQ.hashKey(event.queryKey)) }
    expect(heard.mock.calls).to.have.length.above(2)
  })

  it("tells the record's revision and life", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB, 1)
    const { minder } = await minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    await minder.get(TH.BoxScope)
    const { revtok, revseq, am, lifeseq, lifepath } = box
    expect(heard.mock.calls[0]?.[0]).to.deep.include({ revtok, revseq, am, lifeseq, lifepath })
    expect(heard.mock.calls[0]?.[0]).to.not.have.property('agerank')
  })

  it("tells null, with no revision or life, where nothing is stored", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    await minder.get(TH.BoxScope)
    expect(toldOf(heard)).to.deep.equal([['box/openai', 'null']])
    expect(heard.mock.calls.at(-1)?.[0]).to.deep.include({ revtok: undefined, revseq: undefined, am: undefined, lifeseq: undefined, lifepath: undefined })
    expect(heard.mock.calls.at(-1)?.[0]).to.have.nested.property('state.data', minder.at(TH.BoxScope))
  })

  it("tells a newer sparse record in the soon, then the item invalidated, once, then each later sparse record in the soon", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder, receive } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    const box1  = TH.nextOf(box0)
    receive(sparseNoticeOf(box1))
    receive(sparseNoticeOf(TH.nextOf(box1)))
    expect(toldOf(heard)).to.deep.equal([['soon', 'box/openai', box1.revseq], ['box/openai', 'behind'], ['soon', 'box/openai', box1.revseq + 1]])
    expect(heard.mock.calls[0]?.[0]).to.deep.nested.include({ type: 'updated', 'action.type': 'success', modelkind: 'box', revtok: box1.revtok, queryKey: minder.soonQueryKey(TH.BoxScope) })
    expect(heard.mock.calls[1]?.[0]).to.deep.nested.include({ type: 'updated', 'action.type': 'invalidate', revseq: box0.revseq })
    expect(heard.mock.calls[1]?.[0]).to.have.nested.property('state.isInvalidated', true)
    expect(heard.mock.calls[1]?.[0]).to.have.nested.property('state.data', minder.at(TH.BoxScope))
    expect(heard.mock.calls[2]?.[0]).to.have.nested.property('state.data', minder.soonAt(TH.BoxScope))
  })

  it("tells the record a get catches the item up with, and then the soon's removal", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const box1    = TH.nextOf(box0)
    cheatBox(vaultDB, box1)
    await minder.list('box')
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    await minder.get(TH.BoxScope)
    expect(toldOf(heard)).to.deep.equal([['box/openai', 'live'], ['soon', 'box/openai', 'removed']])
    expect(heard.mock.calls[0]?.[0]).to.have.nested.property('state.data', minder.at(TH.BoxScope))
    expect(heard.mock.calls[0]?.[0]).to.have.nested.property('state.isInvalidated', false)
    expect(heard.mock.calls[1]?.[0]).to.deep.include({ type: 'removed', action: undefined, queryKey: minder.soonQueryKey(TH.BoxScope) })
    expect(minder.soonAt(TH.BoxScope)).to.be.undefined
  })

  it("tells the record itself, the same object after a record that changes nothing", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB, 0)
    const { minder, receive } = await minderWorldOf(vaultDB)
    const heard   = listenerOf()
    minder.listen(heard, MinderEventFormat)
    await minder.get(TH.BoxScope)
    receive(noticeOf(box))
    const cached = minder.at(TH.BoxScope)
    const items  = heard.mock.calls.map(([event]) => event).filter((event) => event.eventkind === 'item')
    expect(items).to.have.lengthOf(2)
    expect(items[0]).to.have.nested.property('state.data', cached)
    expect(items[1]).to.have.nested.property('state.data', cached)
  })

  it("tells null, and then a tombstone in the dead entry before null again in the item", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder, receive } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    receive(noticeOf(tombstone))
    expect(toldOf(heard)).to.deep.equal([['dead', 'box/openai', tombstone.revseq], ['box/openai', 'null']])
    expect(heard.mock.calls[0]?.[0]).to.deep.nested.include({ type: 'updated', "action.type": 'success', modelkind: 'box', am: 'x', revtok: tombstone.revtok, queryKey: minder.deadQueryKey(TH.BoxScope) })
    expect(heard.mock.calls[0]?.[0]).to.have.nested.property('state.data', minder.deadAt(TH.BoxScope))
    expect(minder.at(TH.BoxScope)).to.deep.equal(null)
    expect(minder.deadAt(TH.BoxScope)).to.deep.equal(tombstone)
  })

  it("tells nothing while a get waits, then the record it lands", async () => {
    const vaultDB = new LateVaultDB()
    const box     = await storedBoxOf(vaultDB, 0)
    const { minder } = await minderWorldOf(vaultDB)
    const heard   = listenerOf()
    minder.listen(heard, MinderEventFormat)
    const getting = minder.get(TH.BoxScope)
    await TH.eventually(() => vaultDB.isHolding)
    expect(heard.mock.calls).to.have.lengthOf(0)
    vaultDB.release()
    await getting
    expect(lastItemEventOf(heard)?.state.data).to.deep.equal(box)
  })

  it("tells the record as cached after a refused get", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB, 1)
    const { minder } = await minderWorldOf(vaultDB)
    const cached = await minder.get(TH.BoxScope)
    const heard  = listenerOf()
    minder.listen(heard, MinderEventFormat)
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, TH.boxThingOf())
    await TH.expectRefusal(minder.get(TH.BoxScope, { staleTime: 0 }), 'stale_read')
    expect(heard.mock.calls).to.have.lengthOf(1)
    expect(heard.mock.calls[0]?.[0]).to.have.nested.property('state.data', cached)
    expect(heard.mock.calls[0]?.[0]).to.deep.nested.include({ type: 'updated', "action.type": 'error', revtok: TH.itemRevtokOf(cached) })
    expect(heard.mock.calls[0]?.[0]).to.have.nested.property('state.error.refusalkind', 'stale_read')
    expect(heard.mock.calls[0]?.[0]).to.have.nested.property('state.isInvalidated', true)
  })

  it("tells no invalidate when the item falls behind after a refused get, which left it invalidated", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const box1    = TH.nextOf(box0)
    const { minder, receive } = await minderWorldOf(vaultDB)
    receive(noticeOf(box1))
    vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, box0)
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    await TH.expectRefusal(minder.get(TH.BoxScope, { staleTime: 0 }), 'stale_read')
    receive(sparseNoticeOf(TH.nextOf(box1)))
    expect(toldOf(heard)).to.deep.equal([['box/openai', 'live'], ['soon', 'box/openai', box1.revseq + 1]])
    expect(heard.mock.calls[0]?.[0]).to.have.nested.property('action.type', 'error')
    expect(minder.tryAt(TH.BoxScope)).to.deep.include({ act: 'untimely', record: box1 })
  })

  for (const landing of ['notice', 'get'] as const) {
    it(`answers gotlive to a read inside the item's success, for a whole record by ${landing} that catches up the soon`, async () => {
      const vaultDB = new MemoryVaultDB()
      const box0    = await storedBoxOf(vaultDB)
      const box1    = TH.nextOf(box0)
      const { minder, receive } = await minderWorldOf(vaultDB)
      await minder.get(TH.BoxScope)
      cheatBox(vaultDB, box1)
      await minder.list('box')
      const acts: string[] = []
      minder.listen((event) => {
        if ((event.eventkind === 'item') && (event.action?.type === 'success')) { acts.push(minder.tryAt(TH.BoxScope).act) }
      }, MinderEventFormat)
      if (landing === 'notice') { receive(noticeOf(box1)) } else { await minder.get(TH.BoxScope) }
      expect(acts).to.deep.equal(['gotlive'])
      expect(minder.soonAt(TH.BoxScope)).to.be.undefined
    })
  }

  it("finds the soon cached and the item behind from inside a soon's success", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const box1    = TH.nextOf(box0)
    const { minder, receive } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const seen: unknown[][] = []
    minder.listen((event) => {
      if ((event.eventkind === 'soon') && (event.action?.type === 'success')) { seen.push([minder.soonAt(TH.BoxScope), minder.isBehindAt(TH.BoxScope)]) }
    }, MinderEventFormat)
    receive(sparseNoticeOf(box1))
    expect(seen).to.deep.equal([[Thing.sparseOf(box1), true]])
  })

  it("answers the cached item for a get with a staleTime of its own from inside a soon's success", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const box1    = TH.nextOf(box0)
    const { minder, receive } = await minderWorldOf(vaultDB)
    const item    = await minder.get(TH.BoxScope)
    cheatBox(vaultDB, box1)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    const gets: Promise<unknown>[] = []
    minder.listen((event) => {
      if ((event.eventkind === 'soon') && (event.action?.type === 'success')) { gets.push(minder.get(TH.BoxScope, { staleTime: Infinity })) }
    }, MinderEventFormat)
    receive(sparseNoticeOf(box1))
    expect(await Promise.all(gets)).to.deep.equal([item])
    expect(asked).not.toHaveBeenCalled()
  })

  it("answers isStaleAt as a get would from inside a soon's success: false under a staleTime of Infinity, true under none", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const box1    = TH.nextOf(box0)
    const { minder, receive } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    const seen: boolean[][] = []
    minder.listen((event) => {
      if ((event.eventkind === 'soon') && (event.action?.type === 'success')) {
        seen.push([minder.isStaleAt(TH.BoxScope, { staleTime: Infinity }), minder.isStaleAt(TH.BoxScope)])
      }
    }, MinderEventFormat)
    receive(sparseNoticeOf(box1))
    expect(seen).to.deep.equal([[false, true]])
  })

  it("asks the vaultDB for a get from inside a soon's success, as its item is behind", async () => {
    const vaultDB = new MemoryVaultDB()
    const box0    = await storedBoxOf(vaultDB)
    const box1    = TH.nextOf(box0)
    const { minder, receive } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    cheatBox(vaultDB, box1)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    const gets: Promise<unknown>[] = []
    minder.listen((event) => {
      if ((event.eventkind === 'soon') && (event.action?.type === 'success')) { gets.push(minder.get(TH.BoxScope)) }
    }, MinderEventFormat)
    receive(sparseNoticeOf(box1))
    expect(await Promise.all(gets)).to.deep.equal([box1])
    expect(asked).toHaveBeenCalledOnce()
  })

  it("tells no record for a first get that is refused", async () => {
    const vaultDB = await bornOf(new DownVaultDB())
    const { minder } = await minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    await TH.expectRefusal(minder.get(TH.BoxScope), 'storage_unavailable')
    expect(toldOf(heard)).to.deep.equal([['box/openai', undefined]])
    expect(heard.mock.calls[0]?.[0]).to.deep.include({ revtok: undefined, revseq: undefined, am: undefined, lifeseq: undefined, lifepath: undefined })
  })

  it("tells the last record or listing of each item, soon and listing goodbye removes", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB, 0)
    const { minder, receive } = await minderWorldOf(vaultDB)
    await minder.get(TH.BoxScope)
    await minder.list('box')
    const newer = TH.nextOf(TH.boxThingOf())
    receive(sparseNoticeOf(newer))
    const cached = [minder.at(TH.BoxScope), minder.soonAt(TH.BoxScope), minder.listingAt(TH.RootScope)]
    expect(cached.every((val) => val !== undefined)).to.eq(true)
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    minder.goodbye()
    expect(toldOf(heard)).to.have.deep.members([['box/openai', 'removed'], ['soon', 'box/openai', 'removed'], ['listing']])
    expect(heard.mock.calls.map(([event]) => [event.type, event.action])).to.deep.equal(Array.from({ length: 3 }, () => ['removed', undefined]))
    expect(heard.mock.calls.map(([event]) => event.state.data)).to.have.members(cached)
  })

  it("tells a listing as cached, with its parent and the kind of its Things", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    await minder.list('box')
    // The box, new to the cache, marks the listing stale as it lands, and the list lands after it.
    const listed = heard.mock.calls.map(([event]) => event).filter(isListingEvent)
    expect(listed.map((event) => event.action?.type)).to.deep.equal(['invalidate', 'success'])
    expect(listed[1]).to.deep.nested.include({ eventkind: 'list', type: 'updated', 'action.type': 'success', ...TH.RootScope, modelkind: 'box', queryKey: minder.listQueryKey(TH.RootScope) })
    expect(listed[1]).to.have.nested.property('state.data', minder.listingAt(TH.RootScope))
    expect(labelpathsOf(listed[1]?.state.data)).to.deep.equal(['box/openai'])
    expect(listed[1]?.state.isInvalidated).to.be.false
  })

  it("tells a refused list as an error, the listing left as it was and marked stale", async () => {
    const { minder } = await minderWorldOf(new MemoryVaultDB())
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    await TH.expectRefusal(minder.list('box'), 'storage_issue')
    const listed = heard.mock.calls.map(([event]) => event).filter(isListingEvent)
    expect(listed.map((event) => [event.action?.type, event.state.isInvalidated, event.state.data])).to.deep.equal([['error', true, undefined]])
  })

  it("tells a listing marked stale once a box new to it lands, and not for a record it lists", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { minder, receive } = await minderWorldOf(vaultDB)
    await minder.list('box')
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    receive(noticeOf(TH.nextOf(box)))
    receive(noticeOf(TH.boxThingOf('anthropic')))
    expect(toldOf(heard)).to.deep.equal([['box/openai', 'live'], ['soon', 'box/openai', 'removed'], ['box/anthropic', 'live'], ['listing']])
    expect(heard.mock.calls.at(-1)?.[0]).to.deep.nested.include({ 'action.type': 'invalidate', 'state.isInvalidated': true })
    expect(heard.mock.calls.at(-1)?.[0]).to.have.nested.property('state.data', minder.listingAt(TH.RootScope))
  })

  it("tells the Kids value a listing goodbye removes had", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { minder } = await minderWorldOf(vaultDB)
    await minder.list('box')
    const heard = listenerOf()
    minder.listen(heard, MinderEventFormat)
    minder.goodbye()
    const removed = heard.mock.calls.map(([event]) => event).filter(isListingEvent)
    expect(removed).to.have.lengthOf(1)
    expect(removed[0]).to.deep.include({ type: 'removed', action: undefined, ...TH.RootScope, modelkind: 'box', queryKey: minder.listQueryKey(TH.RootScope) })
    expect(removed[0]?.state).to.deep.include({ status: 'success' })
    expect(labelpathsOf(removed[0]?.state.data)).to.deep.equal(['box/openai'])
  })

  /** A minder whose first listener throws on each success and whose second is `later`, once it has fetched the box at `TH.BoxScope`; the bank and the box it stored. */
  async function throwingListenerWorldOf() {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB, 0)
    const { minder, bank } = await minderWorldOf(vaultDB)
    const later   = listenerOf()
    minder.listen((event) => { if ((event.eventkind === 'item') && (event.action?.type === 'success')) { throw new Error('listener broke') } }, MinderEventFormat)
    minder.listen(later, MinderEventFormat)
    await minder.get(TH.BoxScope)
    return { bank, box, later }
  }

  it("tells the bank's onBadNews what a listener throws", async () => {
    const { bank } = await throwingListenerWorldOf()
    expect(badnewsOf(bank)).to.deep.equal(['unexpected_error'])
    expect(bank.tellBadNews.mock.calls[0]?.[0][0]).to.have.nested.property('cause.message', 'listener broke')
  })

  it("tells the listeners after one that throws", async () => {
    const { box, later } = await throwingListenerWorldOf()
    expect(later.mock.calls.map(([event]) => event.state.data)).to.deep.include(box)
  })

  it("refuses a listener that is not a function", async () => {
    const { minder } = await minderWorldOf(new MemoryVaultDB())
    // @ts-expect-error -- sloppy input is the point
    TH.expectSyncRefusal(() => minder.listen(undefined, MinderEventFormat), 'bad_record')
  })

  const BadVersions = [
    [undefined,                 'refuses a listener given no feed version'],
    [`${MinderEventFormat}-next`,     'refuses a feed version other than its own'],
    [MinderEventFormat.toUpperCase(), 'refuses its own feed version spelled another way'],
  ] as const
  for (const [version, blurb] of BadVersions) {
    it(blurb, async () => {
      const { minder } = await minderWorldOf(new MemoryVaultDB())
      TH.expectSyncRefusal(() => minder.listen(listenerOf(), version as never), 'bad_record')
    })
  }
})
