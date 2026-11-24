import { QueryObserver } from '@tanstack/query-core'
import { noop } from 'es-toolkit'
import { Errors } from 'safebyok-big/internals'
import { describe, expect, it, vi } from 'vitest'
import { VaultTSQ } from '../../src/minding/vault-tsq'
import { Thing } from '../../src/models/thing'
import { Shell } from '../../src/shapes/shapes-thing'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { readAtOf, readTcNow } from '../../src/storage/agerank'
import * as TH from '../test-helpers'
import { type TSQWorld, cheatStored, isObservedStale, itemQueryAt, listQueryAt, noticeOf, readTcSpanAfter, tsqWorldOf } from './vault-minder/tsq-world'

/** The query key of the item of the box at `TH.BoxScope`. */
const BoxKey = VaultTSQ.itemQueryKeyOf(TH.BoxScope)

/** The box at `TH.BoxScope`, born under the root box's first life. */
const Box0 = TH.boxThingOf()

/** The revision after {@link Box0}. */
const Box1 = TH.nextOf(Box0)

/** The box reborn in its next live life after {@link Box0}'s tombstone. */
const Reborn = TH.boxRebornOf(TH.boxTombOf(Box0))

/** The void sentinel of the box at `TH.BoxScope`, for nothing stored there. */
const BoxShell = Shell.of(TH.BoxScope, TH.rootBoxOf())

/** A mutationFn, which resolves `'done'`. */
function putDone(): Promise<string> { return Promise.resolve('done') }

/** A world whose box at `TH.BoxScope` was put at {@link Box0} through its VaultMinder. */
async function worldWithBox(): Promise<TSQWorld<MemoryVaultDB>> {
  const world = await tsqWorldOf(new MemoryVaultDB())
  await world.sorted.putOnce({ record: Box0, cited: Shell.childCited(TH.Life0) })
  return world
}

/** The record the Thing at `TH.BoxScope` holds in `world`. */
function boxHeldIn({ sorted }: TSQWorld<MemoryVaultDB>) {
  return sorted.thingAt(TH.BoxScope)?.pickle()
}

describe("VaultTSQ.make", () => {
  it("sets its query and mutation defaults under the bank's key, and nothing outside it", async () => {
    const { queryClient } = await tsqWorldOf(new MemoryVaultDB())
    expect(queryClient.getQueryDefaults(BoxKey)).to.include({ networkMode: 'always', retry: false }).and.have.property('structuralSharing').that.is.a('function')
    expect(queryClient.getQueryDefaults(VaultTSQ.listQueryKeyOf(TH.RootScope))).to.include({ networkMode: 'always', retry: false, staleTime: Infinity, gcTime: Infinity })
    expect(queryClient.getMutationDefaults(VaultTSQ.bankQueryKeyOf(TH.ThingBank))).to.deep.equal({ networkMode: 'always', retry: false })
    expect(queryClient.getQueryDefaults(VaultTSQ.itemQueryKeyOf({ ...TH.BoxScope, banklabel: 'other' }))).to.deep.equal({})
    expect(queryClient.getQueryDefaults(['todos'])).to.deep.equal({})
    expect(queryClient.getMutationDefaults(['todos'])).to.deep.equal({})
  })

  it("lets a host's own options override its defaults", async () => {
    const { queryClient } = await tsqWorldOf(new MemoryVaultDB())
    expect(queryClient.defaultQueryOptions({ queryKey: BoxKey, retry: 2, networkMode: 'online' })).to.include({ retry: 2, networkMode: 'online' })
  })

  it("refuses a QueryClient or a VaultMinder that is not one", async () => {
    const { sorted, queryClient } = await tsqWorldOf(new MemoryVaultDB())
    expect(() => VaultTSQ.make({ vaultMinder: sorted, queryClient: {} as never, scope: TH.ThingBank })).to.throw('Expected a TanStack Query QueryClient')
    expect(() => VaultTSQ.make({ vaultMinder: {} as never, queryClient, scope: TH.ThingBank })).to.throw('Expected a VaultMinder')
  })
})

describe("VaultTSQ's keys", () => {
  it("start with the bank, then the kind of query, the labels and a mark", () => {
    expect(VaultTSQ.bankQueryKeyOf(TH.ThingBank)).to.deep.equal(['sok', 'u1', 'acme'])
    expect(VaultTSQ.itemQueryKeyOf(TH.BoxScope)).to.deep.equal(['sok', 'u1', 'acme', 'item', 'box', '/', 'openai', '!'])
    expect(VaultTSQ.listQueryKeyOf(TH.RootScope)).to.deep.equal(['sok', 'u1', 'acme', 'list', 'box', '#', 'kids'])
  })
})

describe("an item's structural sharing", () => {
  it("keeps the Thing's own record as the item, and a select's equal result as the same object across revisions", async () => {
    const world    = await worldWithBox()
    const observer = new QueryObserver(world.queryClient, { queryKey: BoxKey, select: (record: unknown) => ({ labelpath: (record as { labelpath: string }).labelpath }) })
    const stop     = observer.subscribe(noop)
    const selected = observer.getCurrentResult().data
    world.notify(noticeOf(Box1))
    expect(world.queryClient.getQueryData(BoxKey)).to.eq(boxHeldIn(world)).and.deep.equal(Box1)
    expect(observer.getCurrentResult().data).to.eq(selected).and.deep.equal({ labelpath: TH.BoxScope.labelpath })
    stop()
  })
})

describe("VaultTSQ's writer, on each event the VaultMinder tells", () => {
  it("sets a whole live record as the item, the Thing's own object, at the time it was read", async () => {
    const world   = await worldWithBox()
    const read_tc = readTcNow()
    world.notify(noticeOf(Box1, read_tc))
    expect(world.queryClient.getQueryData(BoxKey)).to.eq(boxHeldIn(world)).and.deep.equal(Box1)
    expect(itemQueryAt(world)?.state.dataUpdatedAt).to.eq(readAtOf(read_tc))
  })

  it("sets null for a tombstone, at the time it was read", async () => {
    const world   = await worldWithBox()
    const read_tc = readTcNow()
    world.notify(noticeOf(TH.boxTombOf(Box0), read_tc))
    expect(world.queryClient.getQueryData(BoxKey)).to.be.null
    expect(itemQueryAt(world)?.state.dataUpdatedAt).to.eq(readAtOf(read_tc))
  })

  it("sets null for nothing stored", async () => {
    const world = await tsqWorldOf(new MemoryVaultDB())
    world.sorted.receive({ ...TH.itemEventOf(BoxShell), sourcelabel: 'persister', read_tc: readTcNow() })
    expect(world.queryClient.getQueryData(BoxKey)).to.be.null
  })

  it("makes no item of a box known only sparse", async () => {
    const world = await tsqWorldOf(new MemoryVaultDB())
    world.notify(noticeOf(Thing.sparseOf(Box0)))
    expect(itemQueryAt(world)).to.be.undefined
  })

  it("marks an item invalidated, keeping its record, when a newer revision is known only sparse", async () => {
    const world = await worldWithBox()
    const held  = boxHeldIn(world)
    const asked = vi.spyOn(world.vaultDB, 'tryGetThing')
    world.notify(noticeOf(Thing.sparseOf(Box1)))
    expect(world.sorted.thingAt(TH.BoxScope)?.agekind).to.eq('cold')
    expect(itemQueryAt(world)?.state).to.deep.include({ data: held, isInvalidated: true })
    expect(asked).not.toHaveBeenCalled()
  })

  it("sets null as an item, invalidated, at the time it was read, when a newer life is known only sparse", async () => {
    const world   = await worldWithBox()
    const read_tc = readTcNow()
    world.notify(noticeOf(Thing.sparseOf(Reborn), read_tc))
    expect(world.sorted.thingAt(TH.BoxScope)?.agekind).to.eq('bare')
    expect(itemQueryAt(world)?.state).to.deep.include({ data: null, status: 'success', isInvalidated: true, dataUpdatedAt: readAtOf(read_tc) })
  })

  it("sets null over a tombstone's item, invalidated, when a newer life is known only sparse", async () => {
    const world = await worldWithBox()
    world.notify(noticeOf(TH.boxTombOf(Box0)))
    world.notify(noticeOf(Thing.sparseOf(Reborn)))
    expect(itemQueryAt(world)?.state).to.deep.include({ data: null, isInvalidated: true })
  })

  it("makes no item, when a newer life is known only sparse, of a box whose item holds nothing", async () => {
    const world = await worldWithBox()
    world.queryClient.removeQueries({ queryKey: BoxKey })
    world.notify(noticeOf(Thing.sparseOf(Reborn)))
    expect(world.sorted.thingAt(TH.BoxScope)?.agekind).to.eq('bare')
    expect(itemQueryAt(world)).to.be.undefined
  })

  it("on a box's new life, marks its parent's listing invalidated and resets its own", async () => {
    const world = await worldWithBox()
    await world.vaultTSQ.listOnce('box')
    await world.vaultTSQ.listOnce('box/openai')
    world.notify(noticeOf(TH.boxTombOf(Box0)))
    expect(listQueryAt(world)?.state).to.deep.include({ isInvalidated: true })
    expect(listQueryAt(world)?.state.data).to.not.be.undefined
    expect(listQueryAt(world, TH.BoxScope)?.state).to.deep.include({ data: undefined, status: 'pending' })
  })

  it("leaves the bank, its main gate and its root box out of the vault TSQ", async () => {
    const world = await tsqWorldOf(new MemoryVaultDB())
    const rootNext = TH.nextOf(TH.rootBoxOf())
    const gateNext = TH.nextGateOf(TH.gateThingOf())
    world.notify(noticeOf(rootNext))
    world.notify(noticeOf(gateNext))
    expect(world.queryClient.getQueryCache().getAll()).to.deep.equal([])
  })

  it("hears nothing once swept", async () => {
    const world = await worldWithBox()
    const held  = boxHeldIn(world)
    world.vaultTSQ.sweep()
    world.notify(noticeOf(Box1))
    expect(world.queryClient.getQueryData(BoxKey)).to.eq(held)
  })
})

describe("VaultTSQ's items", () => {
  it("hold the Thing's own record, which getOnce resolves", async () => {
    const world = await tsqWorldOf(new MemoryVaultDB())
    cheatStored(world.vaultDB, Box0)
    const got = await world.vaultTSQ.getOnce(TH.BoxScope)
    expect(got).to.eq(boxHeldIn(world)).and.deep.equal(Box0)
    expect(world.queryClient.getQueryData(BoxKey)).to.eq(got)
  })

  it("hold null for a tombstone or nothing stored", async () => {
    const world = await tsqWorldOf(new MemoryVaultDB())
    expect(await world.vaultTSQ.getOnce(TH.BoxScope)).to.be.null
    cheatStored(world.vaultDB, TH.boxTombOf(Box0))
    expect(await world.vaultTSQ.getOnce(TH.BoxScope, { staleTime: 0 })).to.be.null
    expect(Thing.isGone(boxHeldIn(world))).to.eq(true)
  })

  it("refuse stale_read where storage answers an earlier life than one known only sparse, and show an observer null", async () => {
    const world = await worldWithBox()
    world.notify(noticeOf(Thing.sparseOf(Reborn)))
    const err = await TH.expectRefusal(world.vaultTSQ.getOnce(TH.BoxScope))
    expect(err.refusalkind).to.eq('stale_read')
    expect(new QueryObserver(world.queryClient, { queryKey: BoxKey }).getCurrentResult()).to.deep.include({ status: 'error', data: null })
  })

  it("stay fresh while the Thing has its newest revision whole", async () => {
    const world = await worldWithBox()
    expect(isObservedStale(world.queryClient, BoxKey)).to.eq(false)
  })

  it("are stale while cold, after a get answers with the record held, with nothing invalidated", async () => {
    const world = await worldWithBox()
    world.notify(noticeOf(Thing.sparseOf(Box1)))
    expect(await world.vaultTSQ.getOnce(TH.BoxScope)).to.eq(boxHeldIn(world))
    expect(world.sorted.thingAt(TH.BoxScope)?.agekind).to.eq('cold')
    expect(itemQueryAt(world)?.state.isInvalidated).to.eq(false)
    expect(isObservedStale(world.queryClient, BoxKey)).to.eq(true)
  })

  it("show an observer null once a newer life is known only sparse, and fetch again", async () => {
    const world    = await worldWithBox()
    const observer = new QueryObserver(world.queryClient, { queryKey: BoxKey })
    const stop     = observer.subscribe(noop)
    cheatStored(world.vaultDB, Reborn)
    world.notify(noticeOf(Thing.sparseOf(Reborn)))
    expect(observer.getCurrentResult()).to.deep.include({ data: null, fetchStatus: 'fetching' })
    await vi.waitFor(() => { expect(observer.getCurrentResult().data).to.eq(boxHeldIn(world)).and.deep.equal(Reborn) })
    stop()
  })
})

describe("VaultTSQ.itemQueryOptions", () => {
  it("seeds an item with the live record its Thing holds, as of when it was read", async () => {
    const world = await worldWithBox()
    const thing = world.sorted.thingAt(TH.BoxScope)
    expect(world.vaultTSQ.itemQueryOptions(TH.BoxScope)).to.deep.equal({ queryKey: BoxKey, initialData: thing?.pickle(), initialDataUpdatedAt: thing?.read_at })
    expect(world.vaultTSQ.itemQueryOptions(TH.BoxScope).initialData).to.eq(thing?.pickle())
  })

  it("seeds null for a tombstone or nothing stored", async () => {
    const world = await tsqWorldOf(new MemoryVaultDB())
    await world.vaultTSQ.getOnce(TH.BoxScope)
    expect(world.vaultTSQ.itemQueryOptions(TH.BoxScope)).to.deep.include({ initialData: null })
    world.notify(noticeOf(TH.boxTombOf(Box0)))
    expect(world.vaultTSQ.itemQueryOptions(TH.BoxScope)).to.deep.include({ initialData: null })
  })

  it("seeds nothing for a box known only sparse in its newest life, or not known at all", async () => {
    const world = await worldWithBox()
    world.notify(noticeOf(Thing.sparseOf(Reborn)))
    expect(world.vaultTSQ.itemQueryOptions(TH.BoxScope)).to.deep.equal({ queryKey: BoxKey })
    const otherScope = { ...TH.ThingBank, labelpath: 'box/anthropic' }
    expect(world.vaultTSQ.itemQueryOptions(otherScope)).to.deep.equal({ queryKey: VaultTSQ.itemQueryKeyOf(otherScope) })
  })

  it("shows an item seeded from its Thing as null, not its old record, once a newer life is known only sparse", async () => {
    const world = await worldWithBox()
    world.queryClient.removeQueries({ queryKey: BoxKey })
    const observer = new QueryObserver(world.queryClient, world.vaultTSQ.itemQueryOptions(TH.BoxScope))
    const stop     = observer.subscribe(noop)
    expect(observer.getCurrentResult().data).to.eq(boxHeldIn(world))
    cheatStored(world.vaultDB, Reborn)
    world.notify(noticeOf(Thing.sparseOf(Reborn)))
    expect(observer.getCurrentResult()).to.deep.include({ data: null, fetchStatus: 'fetching' })
    await vi.waitFor(() => { expect(observer.getCurrentResult().data).to.eq(boxHeldIn(world)).and.deep.equal(Reborn) })
    stop()
  })

  it("seeds again an item the library collected, asking storage nothing", async () => {
    const world = await worldWithBox()
    world.queryClient.removeQueries({ queryKey: BoxKey })
    const asked    = vi.spyOn(world.vaultDB, 'tryGetThing')
    const observer = new QueryObserver(world.queryClient, world.vaultTSQ.itemQueryOptions(TH.BoxScope))
    const stop     = observer.subscribe(noop)
    expect(observer.getCurrentResult().data).to.eq(boxHeldIn(world))
    await TH.aWhile()
    expect(asked).not.toHaveBeenCalled()
    stop()
  })
})

describe("VaultTSQ, carrying over the old minder's promises", () => {
  it("has the record a putOnce wrote as the item before it resolves", async () => {
    const world  = await tsqWorldOf(new MemoryVaultDB())
    const stored = await world.sorted.putOnce({ record: Box0, cited: Shell.childCited(TH.Life0) })
    expect(world.queryClient.getQueryData(BoxKey)).to.eq(boxHeldIn(world)).and.deep.equal(stored)
  })

  it("has a refused put's stored record as the item before the refusal is thrown", async () => {
    const world = await worldWithBox()
    cheatStored(world.vaultDB, Box1)
    const mine = TH.nextOf(Box0, { revtok: TH.revtokOf('mine') })
    let item: unknown = 'stored'
    try { await world.sorted.putOnce({ record: mine }) } catch { item = world.queryClient.getQueryData(BoxKey) }
    expect(item).to.eq(boxHeldIn(world)).and.deep.equal(Box1)
  })

  it("keeps an item's object, and moves its time, for its revision seen again in a later span", async () => {
    const world   = await tsqWorldOf(new MemoryVaultDB())
    const read_tc = readTcNow()
    world.notify(noticeOf(Box0, read_tc))
    const held  = world.queryClient.getQueryData(BoxKey)
    const later = readTcSpanAfter(read_tc)
    world.notify(noticeOf(structuredClone(Box0), later))
    expect(world.queryClient.getQueryData(BoxKey)).to.eq(held)
    expect(itemQueryAt(world)?.state.dataUpdatedAt).to.eq(readAtOf(later))
  })
})

describe("VaultTSQ.getOnce and listOnce", () => {
  it("refuse a scope of another bank, or a Thing with no item or no listing", async () => {
    const { vaultTSQ } = await tsqWorldOf(new MemoryVaultDB())
    await TH.expectRefusal(vaultTSQ.getOnce({ ...TH.BoxScope, banklabel: 'other' }))
    await TH.expectRefusal(vaultTSQ.getOnce(TH.RootScope))
    await TH.expectRefusal(vaultTSQ.getOnce(TH.BoxScope, { staleTime: -1 }))
    await TH.expectRefusal(vaultTSQ.listOnce('gate'))
    expect(() => vaultTSQ.itemQueryOptions({ ...TH.ThingBank, labelpath: 'gate' })).to.throw('A vault TSQ keeps an item only for a box under the root box')
  })

  it("list each time asked, the listing replaced by each answer", async () => {
    const world = await tsqWorldOf(new MemoryVaultDB())
    const before = await world.vaultTSQ.listOnce('box')
    expect(Object.keys(before.items)).to.deep.equal([])
    cheatStored(world.vaultDB, Box0)
    const kids = await world.vaultTSQ.listOnce('box')
    expect(Object.keys(kids.items)).to.deep.equal(['openai'])
    expect(world.queryClient.getQueryData(VaultTSQ.listQueryKeyOf(TH.RootScope))).to.deep.equal(kids)
  })
})

describe("VaultTSQ.mutationOptionsOf", () => {
  it("runs a mutation once, whether or not the browser reports itself online", () => {
    expect(VaultTSQ.mutationOptionsOf(putDone)).to.deep.equal({ mutationFn: putDone, networkMode: 'always', retry: false })
  })

  it("refuses a mutationFn that is not a function", () => {
    expect(() => VaultTSQ.mutationOptionsOf('put' as never)).to.throw(Errors.VaultError)
  })
})
