import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { noop } from 'es-toolkit'
import { type ReactNode, useEffect, useLayoutEffect } from 'react'
import { type BoxRecord, type GateRecord, type PasskeyWayinHeader, type PersistedClient, type Persister, MemoryPersister, VaultTSQ } from 'safebyok'
import { Classifier, SortedVaultDB, storageUnavailable } from 'safebyok/storage'
import * as LeanTH from 'safebyok/testing'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { type BoxSelected, passkeyHeaderOf } from '../../src/index'
import * as TH from '../test-helpers'

/** The core's labelpath of the box with the joke service's key. */
const JokesBoxPath = `box/${TH.JokesPath}`

/** The scope of the jokes box. */
const JokesScope = { ...LeanTH.WorldScope, labelpath: JokesBoxPath }

/** The key the vault TSQ keeps the jokes box under, which the hooks observe. */
const JokesKey = VaultTSQ.itemQueryKeyOf(JokesScope)

/** The key the vault TSQ keeps the listing of the root box's children under. */
const BoxListKey = VaultTSQ.listQueryKeyOf({ ...LeanTH.WorldScope, labelpath: 'box' })

/** The stage of the world's bank, as a page shows it. */
function StageShown({ world }: Readonly<{ world: TH.ProviderWorld }>) {
  return <p>{world.Bank.useBank((bank) => bank.stage)}</p>
}

/** What `useBox` of the jokes box showed at its latest commit, read in render as a component reads it: React Query re-renders a hook only for the fields it has read. */
interface BoxSeen {
  data:        BoxSelected
  isStale:     boolean
  fetchStatus: string
  isError:     boolean
}

/** A component that renders `useBox` of the jokes box; what it last showed; and how many times it has mounted. */
function makeBoxProbe(world: TH.ProviderWorld) {
  const seen: { current: BoxSeen | null, mounts: number } = { current: null, mounts: 0 }
  function BoxProbe() {
    const { data, isStale, fetchStatus, isError } = world.Bank.useBox(TH.JokesPath)
    useLayoutEffect(() => { seen.current = { data, isStale, fetchStatus, isError } })
    useEffect(() => { seen.mounts += 1 }, [])
    return null
  }
  return { BoxProbe, seen }
}

/** `children` under the world's provider, signed in as `userid`. */
function treeOf(world: TH.ProviderWorld, children: ReactNode, userid: string | null = TH.ProviderUser) {
  return TH.providerTreeOf(world, children, { userid })
}

/** A world with the jokes box stored, its provider signed in and its bank found locked; then, rendered in the same tree, `useBox` of the jokes box.
 * Before the hook renders, `beforeShowing` runs: to pause the vaultDB's answers, say.
 */
async function setupShowing({ isWatching = true, beforeShowing = () => undefined }: Readonly<{ isWatching?: boolean, beforeShowing?: (world: TH.ProviderWorld) => void }> = {}) {
  const world = await TH.buildProviderWorld({ stored: 'jokes', isWatching })
  const { rerender } = render(treeOf(world, <StageShown world={world} />))
  await screen.findByText('locked')
  beforeShowing(world)
  const { BoxProbe, seen } = makeBoxProbe(world)
  rerender(treeOf(world, <><StageShown world={world} /><BoxProbe /></>))
  return { world, seen, vaultTSQ: world._cheat_device().vaultTSQ }
}

/** {@link setupShowing}, once the hook shows the first revision, which it returns. */
async function setupShown(opts: Parameters<typeof setupShowing>[0] = {}) {
  const shown = await setupShowing(opts)
  await waitFor(() => { expect(shown.seen.current?.data).to.not.be.undefined })
  return { ...shown, first: shown.seen.current!.data! }
}

/** A persister of each bank's records, the same one at every call: one of a device's two, kept in memory across a reload. */
function memoryPersisterOf(): () => MemoryPersister {
  const persister = new MemoryPersister()
  return () => persister
}

/** Write the jokes box's next revision, of tier `pro`, from the other device, as another tab would, resolving it. */
async function putFromOtherTab(world: TH.ProviderWorld): Promise<BoxRecord> {
  const box = await world._cheat_otherVault!.putBoxOnce(JokesBoxPath, { sidecar: { service: 'jokes', tier: 'pro' } }, { whisper: LeanTH.Whisper })
  return box.pickle() as BoxRecord
}

describe("useBox, mounted before anyone is signed in", () => {
  it("shows the record after sign-in with no remount, and then a revision the watch tells of", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const { BoxProbe, seen } = makeBoxProbe(world)
    const { rerender } = render(treeOf(world, <BoxProbe />, null))
    expect([seen.current?.data, seen.current?.fetchStatus]).to.deep.equal([undefined, 'idle'])
    rerender(treeOf(world, <BoxProbe />))
    await waitFor(() => { expect(seen.current?.data?.sidecar).to.deep.equal({ service: 'jokes' }) })
    const second = await act(() => putFromOtherTab(world))
    await waitFor(() => { expect(seen.current?.data).to.deep.equal(second) })
    expect(seen.mounts).to.eq(1)
  })

  it("shows the record with no remount when mounted while the bank is starting, and then a revision the watch tells of", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const release = world.pauseGets()
    onTestFinished(release)
    const { BoxProbe, seen } = makeBoxProbe(world)
    render(treeOf(world, <><StageShown world={world} /><BoxProbe /></>))
    await screen.findByText('starting')
    expect(seen.current?.data).to.be.undefined
    release()
    await waitFor(() => { expect(seen.current?.data?.sidecar).to.deep.equal({ service: 'jokes' }) })
    const second = await act(() => putFromOtherTab(world))
    await waitFor(() => { expect(seen.current?.data).to.deep.equal(second) })
    expect(seen.mounts).to.eq(1)
  })

  it("observes a query that has the vault TSQ's defaults once the bank is up", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const { BoxProbe, seen } = makeBoxProbe(world)
    const { rerender } = render(treeOf(world, <BoxProbe />, null))
    rerender(treeOf(world, <BoxProbe />))
    await waitFor(() => { expect(seen.current?.data).to.not.be.undefined })
    const client = world._cheat_device().vaultTsqClient
    const { options } = client.getQueryCache().find({ queryKey: JokesKey, exact: true })!
    const defaults = client.getQueryDefaults(JokesKey)
    expect(defaults.queryFn).to.be.a('function')
    expect([options.queryFn, options.retry, options.networkMode]).to.deep.equal([defaults.queryFn, false, 'always'])
  })
})

describe("useBox on a page reloaded over a device's persisters", () => {
  it("shows the box's restored record once restored, before the vaultDB answers, when mounted while the bank is starting", async () => {
    const boxes: Persister = new MemoryPersister()
    const persisters = { roots: memoryPersisterOf(), boxes: () => boxes }
    const world      = await TH.buildProviderWorld({ stored: 'jokes', persisters })
    const saved      = await boxes.restoreClient()
    let land         = noop
    vi.spyOn(boxes, 'restoreClient').mockReturnValue(new Promise<PersistedClient | undefined>((resolve) => { land = () => { resolve(saved) } }))
    const release    = world.pauseGets()
    onTestFinished(release)
    const { BoxProbe, seen } = makeBoxProbe(world)
    render(treeOf(world, <><StageShown world={world} /><BoxProbe /></>))
    await screen.findByText('starting')
    expect(seen.current?.data).to.be.undefined
    act(() => { land() })
    await waitFor(() => { expect(seen.current?.data?.sidecar).to.deep.equal({ service: 'jokes' }) })
    expect(seen.mounts).to.eq(1)
  })

  it("shows the box's restored record while the stage is still starting, where no roots were kept", async () => {
    const persisters = { roots: () => new MemoryPersister(), boxes: memoryPersisterOf() }
    const world      = await TH.buildProviderWorld({ stored: 'jokes', persisters })
    const release    = world.pauseGets()
    onTestFinished(release)
    const { BoxProbe, seen } = makeBoxProbe(world)
    render(treeOf(world, <><StageShown world={world} /><BoxProbe /></>))
    await waitFor(() => { expect(seen.current?.data?.sidecar).to.deep.equal({ service: 'jokes' }) })
    expect(screen.getByText('starting')).to.exist
  })
})

describe("useBox over the vault TSQ's own items", () => {
  it("answers on its first render a record the vault TSQ already has", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const { rerender } = render(treeOf(world, <StageShown world={world} />))
    await screen.findByText('locked')
    const { vaultTSQ } = world._cheat_device()
    const record = await act(() => vaultTSQ.getOnce(JokesScope))
    const { gets } = world.counts
    const { BoxProbe, seen } = makeBoxProbe(world)
    rerender(treeOf(world, <><StageShown world={world} /><BoxProbe /></>))
    expect(seen.current?.data).to.deep.equal(record)
    expect(world.counts.gets).to.eq(gets)
  })

  it("shows a newer revision another device writes, without fetching again", async () => {
    const { world, seen } = await setupShown()
    const { gets } = world.counts
    const second = await act(() => putFromOtherTab(world))
    await waitFor(() => { expect(seen.current?.data).to.deep.equal(second) })
    expect(world.counts.gets).to.eq(gets)
  })

  it("keeps showing the older record, stale, while the newer revision a list told of is fetched whole", async () => {
    const { world, seen, vaultTSQ, first } = await setupShown({ isWatching: false })
    const second = await putFromOtherTab(world)
    const { gets } = world.counts
    const release = world.pauseGets()
    onTestFinished(release)
    await act(() => vaultTSQ.listOnce('box'))
    await waitFor(() => { expect(seen.current?.fetchStatus).to.eq('fetching') })
    expect([seen.current?.data, seen.current?.isStale]).to.deep.equal([first, true])
    release()
    await waitFor(() => { expect(seen.current?.data).to.deep.equal(second) })
    expect([seen.current?.isStale, world.counts.gets]).to.deep.equal([false, gets + 1])
  })

  it("shows the refusal of a get of its item, keeping the record and fetching nothing more", async () => {
    const { world, seen, vaultTSQ, first } = await setupShown({ isWatching: false })
    const gets = { count: 0 }
    world.vaultDB.tryGetThing = (ask) => {
      gets.count += 1
      return Promise.resolve({ ok: false, ask, act: 'unclassified_storing', world: null, banktok: null, read_tc: Classifier.readTcNow(), dbhas: null, err: storageUnavailable(new Error('The test vaultDB is down'), 'The test vaultDB is down') })
    }
    await act(async () => { await expect(vaultTSQ.getOnce(JokesScope, { staleTime: 0 })).rejects.toHaveProperty('refusalkind', 'storage_unavailable') })
    await waitFor(() => { expect(seen.current?.isError).to.eq(true) })
    expect(seen.current?.data).to.eq(first)
    expect(world._cheat_device().vaultTsqClient.getQueryState(JokesKey)).to.deep.include({ status: 'error', data: first })
    expect(gets.count).to.eq(1)
  })
})

// The hook's fetch reads the first revision and waits; meanwhile the device hears of the second, from the watch or from a
// list. Whichever lands first, the hook ends showing the second.
const OrderCases = [
  [true,  'answer', 'watched: the late answer, then the watch'],
  [true,  'news',   'watched: the watch, then the late answer'],
  [false, 'answer', 'unwatched: the late answer, then a list'],
  [false, 'news',   'unwatched: a list, then the late answer'],
] as const

/** Release nothing: no pause has been made yet. */
function releaseNothing(): void { /* nothing paused */ }

describe("useBox shows the newest record, in either order of a late answer and the news of a newer revision", () => {
  for (const [isWatching, firstStep, blurb] of OrderCases) {
    it(blurb, async () => {
      let release = releaseNothing
      const { world, seen, vaultTSQ } = await setupShowing({ isWatching, beforeShowing: (world) => { release = world.pauseAnswers() } })
      onTestFinished(() => { release() })
      await waitFor(() => { expect(seen.current?.fetchStatus).to.eq('fetching') })
      const steps = {
        answer: async () => {
          act(() => { release() })
          await waitFor(() => { expect(seen.current?.data).to.not.be.undefined })
        },
        news: async () => { await act(async () => { await (isWatching ? putFromOtherTab(world) : vaultTSQ.listOnce('box')) }) },
      }
      if (! isWatching) { await putFromOtherTab(world) }
      await steps[firstStep]()
      await steps[(firstStep === 'answer') ? 'news' : 'answer']()
      await waitFor(() => { expect(seen.current?.data?.sidecar).to.deep.equal({ service: 'jokes', tier: 'pro' }) })
    })
  }
})

/** A world with the jokes box stored, a count of the lists its vaultDB is asked, and `useBoxList` rendered under its provider, signed in. */
async function setupListing() {
  const world = await TH.buildProviderWorld({ stored: 'jokes' })
  const lists = { count: 0 }
  const tryListThings = world.vaultDB.tryListThings.bind(world.vaultDB)
  world.vaultDB.tryListThings = async (ask) => {
    lists.count += 1
    return await tryListThings(ask)
  }
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, { userid: TH.ProviderUser }) }
  const rendered = renderHook(() => world.Bank.useBoxList(), { wrapper: Wrapper })
  return { world, lists, ...rendered }
}

describe("useBoxList over the vault TSQ's own listing", () => {
  it("lists once, and lists again to show a box another device writes", async () => {
    const { world, result, lists } = await setupListing()
    await waitFor(() => { expect(result.current.data).to.deep.equal([TH.JokesPath]) })
    expect(lists.count).to.eq(1)
    await act(() => world._cheat_otherVault!.putBoxOnce('box/puns', { sidecar: { service: 'puns' } }, { whisper: LeanTH.Whisper }))
    await waitFor(() => { expect(result.current.data).to.deep.equal([TH.JokesPath, 'puns']) })
    expect(lists.count).to.eq(2)
  })

  it("does not list again on a remount of the hook, or a window focus", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const lists = { count: 0 }
    const tryListThings = world.vaultDB.tryListThings.bind(world.vaultDB)
    world.vaultDB.tryListThings = async (ask) => {
      lists.count += 1
      return await tryListThings(ask)
    }
    function Probe() { return <p>{world.Bank.useBoxList().data?.join(',') ?? 'none'}</p> }
    function Tree({ shown }: Readonly<{ shown: boolean }>) { return TH.providerTreeOf(world, shown ? <Probe /> : null, { userid: TH.ProviderUser }) }
    const { container, rerender } = render(<Tree shown />)
    await waitFor(() => { expect(container.textContent).to.eq(TH.JokesPath) })
    rerender(<Tree shown={false} />)
    rerender(<Tree shown />)
    await act(async () => { globalThis.dispatchEvent(new Event('focus')); await new Promise((resolve) => setTimeout(resolve, 50)) })
    expect([container.textContent, lists.count]).to.deep.equal([TH.JokesPath, 1])
  })

  it("lists again when its listing is invalidated", async () => {
    const { world, result, lists } = await setupListing()
    await waitFor(() => { expect(result.current.data).to.deep.equal([TH.JokesPath]) })
    const client = world.Bank.queryClient()
    act(() => { void client.invalidateQueries({ queryKey: world.Bank.keys.boxList() }) })
    await waitFor(() => { expect(client.getQueryState(BoxListKey)?.isInvalidated).to.eq(false) })
    expect([lists.count, result.current.data]).to.deep.equal([2, [TH.JokesPath]])
  })

  it("lists after sign-in when mounted while nobody is signed in", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const treeOpts: TH.ProviderTreeOpts = { userid: null }
    function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, treeOpts) }
    const { result, rerender } = renderHook(() => world.Bank.useBoxList(), { wrapper: Wrapper })
    expect([result.current.data, result.current.fetchStatus]).to.deep.equal([undefined, 'idle'])
    treeOpts.userid = TH.ProviderUser
    rerender()
    await waitFor(() => { expect(result.current.data).to.deep.equal([TH.JokesPath]) })
  })

  it("shows a list refused as its error", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    world.vaultDB.tryListThings = (ask) => Promise.resolve({ ok: false, ask, act: 'unclassified_storing', world: null, banktok: null, read_tc: Classifier.readTcNow(), dbhas: null, parentage: [], deltas: [], damaged_rows: [], err: storageUnavailable(new Error('The test vaultDB is down'), 'The test vaultDB is down') })
    function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, { userid: TH.ProviderUser }) }
    const { result } = renderHook(() => world.Bank.useBoxList(), { wrapper: Wrapper })
    await waitFor(() => { expect(result.current.isError).to.eq(true) })
    expect(result.current.error).to.have.property('refusalkind', 'storage_unavailable')
  })
})

describe("useGate over the world's gate Thing", () => {
  it("shows a passkey another device adds, without fetching again, and without the bankKey it wraps", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    let header: PasskeyWayinHeader | null | undefined
    function GateProbe() {
      const shown = world.Bank.useGate({ select: passkeyHeaderOf }).data
      useLayoutEffect(() => { header = shown })
      return <p>{shown?.wayinkind ?? 'none'}</p>
    }
    const { container } = render(TH.providerTreeOf(world, <GateProbe />, { userid: TH.ProviderUser }))
    await waitFor(() => { expect(header).to.be.null })
    // The SortedVaultDB freezes, so the spy goes on its class, counting the giver's device's calls alone.
    const { sortedVaultDB } = world._cheat_device().world
    const get = vi.spyOn(SortedVaultDB.prototype, 'tryGetThing')
    onTestFinished(() => { get.mockRestore() })
    const other = LeanTH.makeDevice({}, { vaultDB: world.vaultDB })
    await act(async () => {
      await other.signin(TH.ProviderUser)
      await other.bank!.gate.addPasskey({ passphraseCleartext: LeanTH.TestPassphrase, nextPasskeyCleartext: LeanTH.passkeyAnswerOf() })
    })
    await waitFor(() => { expect(header?.wayinkind).to.eq('passkey') })
    expect(get.mock.contexts.filter((context) => context === sortedVaultDB)).to.have.lengthOf(0)
    // The gate's Thing has the whole gate, by design; the giver's client and the page have none of it.
    const stored = world.vaultDB._cheat_things(LeanTH.WorldScope).get('gate') as GateRecord
    TH.expectTextUnheld(stored.wayins.passkey0!.bank_key_wayin_wrapped.ciphertext_b64, container, world.client)
  })
})

describe("the record hooks outside every provider", () => {
  it("show signed_out and fetch nothing", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const { result } = renderHook(() => ({
      stage: world.Bank.useBank((bank) => bank.stage), box: world.Bank.useBox(TH.JokesPath), gate: world.Bank.useGate(), list: world.Bank.useBoxList(),
    }))
    const { stage, box, gate, list } = result.current
    expect([stage, box.data, box.fetchStatus, gate.data, list.data]).to.deep.equal(['signed_out', undefined, 'idle', undefined, undefined])
    expect(world.counts.gets).to.eq(0)
  })
})
