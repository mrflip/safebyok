import { noop } from 'es-toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type QueryClient, onlineManager } from '@tanstack/query-core'
import { Errors } from 'safebyok-big/internals'
import { VaultMinder } from '../../src/minding/vault-minder'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { MemoryPersister } from '../../src/storage/persister'
import { refusedAnswerOf } from '../../src/storage/refused-answer'
import { ThingFormat } from '../../src/shapes/shapes-thing'
import * as TH from '../test-helpers'
import { DownVaultDB, Hours24, boxScopeOf, cheatBox, fakeBankOf, storedBoxOf } from './vault-minder/world'

afterEach(() => { vi.restoreAllMocks() })

// TanStack tells its cache's subscribers of a change a macrotask after it, so a snapshot is saved a tick after the get that changed it.
/** Resolve on the next turn of the macrotask queue. */
async function nextTick(): Promise<void> { await new Promise((resolve) => { setTimeout(resolve, 0) }) }

/** A minder over `vaultDB` caching in `queryClient`, started. */
function minderIn(queryClient: QueryClient, vaultDB: MemoryVaultDB): VaultMinder {
  const minder = VaultMinder.make({ vaultDB, queryClient }, fakeBankOf())
  minder.hello()
  return minder
}

/** A memory persister saving the client of a minder started over `vaultDB`, once the minder's get of the box at `TH.BoxScope` is saved, and that minder. */
async function savedGetOf(vaultDB: MemoryVaultDB): Promise<{ persister: MemoryPersister, minder: VaultMinder }> {
  const persister   = new MemoryPersister()
  const queryClient = VaultMinder.makeClient()
  await VaultMinder.persist(queryClient, persister)
  const minder = minderIn(queryClient, vaultDB)
  await minder.get(TH.BoxScope)
  await nextTick()
  return { persister, minder }
}

/** A client restored from `persister`, and a minder started over it whose vaultDB cannot be reached: what it has, it has from the restore. */
async function restoredMinderOf(persister: MemoryPersister): Promise<VaultMinder> {
  const queryClient = VaultMinder.makeClient()
  await VaultMinder.persist(queryClient, persister)
  return minderIn(queryClient, new DownVaultDB())
}

describe("Minder.persist(queryClient, persister, scope)", () => {
  it("saves each box and listing a minder caches, and restores them into another client, frozen, before its minder's hello", async () => {
    const vaultDB   = new MemoryVaultDB()
    const box       = await storedBoxOf(vaultDB)
    const anthropic = TH.boxThingOf('anthropic')
    cheatBox(vaultDB, anthropic)
    const persister = new MemoryPersister()
    const queryClient = VaultMinder.makeClient()
    await VaultMinder.persist(queryClient, persister)
    const minder = minderIn(queryClient, vaultDB)
    await minder.get(TH.BoxScope)
    await minder.list('box')
    await nextTick()
    const restored = await restoredMinderOf(persister)
    expect(restored.at(TH.BoxScope)).to.deep.equal(box)
    expect(Object.isFrozen(restored.at(TH.BoxScope))).to.be.true
    expect(Object.keys(restored.listingAt(TH.RootScope)?.items ?? {}).toSorted((left, right) => left.localeCompare(right))).to.deep.equal(['anthropic', 'openai'])
    expect(restored.at(boxScopeOf('anthropic'))).to.be.undefined
  })

  it("saves only the queries of the bank at scope, where one is given, from a client other banks' minders share", async () => {
    const vaultDB     = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const persister   = new MemoryPersister()
    const queryClient = VaultMinder.makeClient()
    await VaultMinder.persist(queryClient, persister, TH.ThingBank)
    const minder      = minderIn(queryClient, vaultDB)
    const otherBank   = { ...TH.ThingBank, userid: 'u_other' }
    // Another bank's item, as its own minder would cache it: no bank is stored for it to fetch from.
    queryClient.setQueryData(VaultMinder.itemQueryKeyOf({ ...otherBank, labelpath: TH.BoxScope.labelpath }), null)
    await minder.get(TH.BoxScope)
    await nextTick()
    const savedKeys = persister.restoreClient()!.clientState.queries.map(({ queryKey }) => queryKey)
    expect(savedKeys).to.deep.include(minder.itemQueryKey(TH.BoxScope))
    expect(savedKeys.map((queryKey) => queryKey[1])).to.not.include(otherBank.userid)
    expect(queryClient.getQueryCache().getAll().map(({ queryKey }) => queryKey[1])).to.include(otherBank.userid)
  })

  it("builds each query it restores with the query defaults the client was made with, before any minder's hello", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { persister, minder } = await savedGetOf(vaultDB)
    await minder.list('box')
    await nextTick()
    const queryClient = VaultMinder.makeClient()
    await VaultMinder.persist(queryClient, persister)
    for (const queryKey of [VaultMinder.itemQueryKeyOf(TH.BoxScope), VaultMinder.listQueryKeyOf(TH.RootScope)]) {
      const { options } = queryClient.getQueryCache().find({ queryKey, exact: true })!
      const defaults = queryClient.getQueryDefaults(queryKey)
      expect([options.queryFn, options.structuralSharing, options.gcTime]).to.deep.equal([defaults.queryFn, defaults.structuralSharing, Infinity])
    }
  })

  it("keeps what it restored past TanStack's collection, however old the snapshot", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { persister } = await savedGetOf(vaultDB)
    const saved = persister.restoreClient()!
    persister.persistClient({ ...saved, timestamp: 1 })
    vi.useFakeTimers()
    try {
      const restored = await restoredMinderOf(persister)
      await vi.advanceTimersByTimeAsync(Hours24)
      expect(restored.at(TH.BoxScope)).to.deep.equal(box)
    } finally {
      vi.useRealTimers()
    }
  })

  it("restores an item that is null as null, not as no item", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { persister, minder } = await savedGetOf(vaultDB)
    expect(await minder.get(boxScopeOf('anthropic'))).to.be.null
    await nextTick()
    const restored = await restoredMinderOf(persister)
    expect(restored.at(boxScopeOf('anthropic'))).to.be.null
  })

  it("saves an item whose last get was refused, with the record it had", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { persister, minder } = await savedGetOf(vaultDB)
    vi.spyOn(vaultDB, 'tryGetThing').mockImplementation((ask) => Promise.resolve(refusedAnswerOf(ask, new Errors.VaultError('storage_unavailable', "Down."))))
    await TH.expectBad(minder.tryGet(TH.BoxScope, { staleTime: 0 }), 'storage_unavailable')
    const restored = await restoredMinderOf(persister)
    expect(restored.at(TH.BoxScope)).to.deep.equal(box)
  })

  it("saves no mutation, even one paused with the cleartexts it was handed", async () => {
    const persister   = new MemoryPersister()
    const queryClient = VaultMinder.makeClient()
    await VaultMinder.persist(queryClient, persister)
    onlineManager.setOnline(false)
    try {
      const mutation = queryClient.getMutationCache().build(queryClient, { mutationKey: ['put'], mutationFn: () => new Promise(noop), networkMode: 'online' })
      void mutation.execute({ whisper: TH.Whisper }).catch(noop)
      await nextTick()
      expect(mutation.state.isPaused).to.be.true
      expect(persister.restoreClient()!.clientState.mutations).to.deep.equal([])
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it("discards a snapshot saved under another ThingFormat, restoring nothing", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const { persister } = await savedGetOf(vaultDB)
    const saved = persister.restoreClient()!
    expect(saved.buster).to.equal(ThingFormat)
    persister.persistClient({ ...saved, buster: 'a000000' })
    const restored = await restoredMinderOf(persister)
    expect(restored.at(TH.BoxScope)).to.be.undefined
  })

  it("rejects where the restore fails, and saves the client from then on", async () => {
    vi.spyOn(console, 'error').mockImplementation(noop)
    vi.spyOn(console, 'warn').mockImplementation(noop)
    const persister = new MemoryPersister()
    vi.spyOn(persister, 'restoreClient').mockRejectedValueOnce(new Error('disk on fire'))
    const queryClient = VaultMinder.makeClient()
    await expect(VaultMinder.persist(queryClient, persister)).rejects.toThrow('disk on fire')
    const vaultDB = new MemoryVaultDB()
    await storedBoxOf(vaultDB)
    const minder = minderIn(queryClient, vaultDB)
    await minder.get(TH.BoxScope)
    await nextTick()
    const saved = persister.restoreClient()!
    expect(saved.clientState.queries.map(({ queryKey }) => queryKey)).to.deep.include(minder.itemQueryKey(TH.BoxScope))
  })
})
