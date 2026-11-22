import { act, render, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { type BoxRecord, type GateRecord, MinderEventFormat, type PasskeyWayinHeader, ThingMinder } from 'safebyok'
import { passkeyHeaderOf } from '../../src/index'
import { bridgeMinder } from '../../src/giver/react-bridge'
import * as LeanTH from 'safebyok/testing'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import * as TH from '../test-helpers'

/** The core's labelpath of the box with the joke service's key. */
const JokesBoxPath = `box/${TH.JokesPath}`

/** The key the minder and the host both cache the jokes box under. */
const JokesKey = ThingMinder.itemQueryKeyOf({ ...LeanTH.WorldScope, labelpath: JokesBoxPath })

/** A world with the jokes box stored, its provider signed in and its bank found locked; then, rendered under it, `useBox` of the jokes box, unless `isShowing` is false.
 * Before the hook renders, `beforeShowing` runs: to pause the vaultDB's answers, say.
 */
async function setupShowing({ isWatching = true, beforeShowing = () => undefined }: Readonly<{ isWatching?: boolean, beforeShowing?: (world: TH.ProviderWorld) => void }> = {}) {
  const world = await TH.buildProviderWorld({ stored: 'jokes', isWatching })
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, { userid: TH.ProviderUser }) }
  const probe = renderHook(() => world.Bank.useBank((bank) => bank.stage), { wrapper: Wrapper })
  await waitFor(() => { expect(probe.result.current).to.eq('locked') })
  beforeShowing(world)
  // Read in render, as a component would: React Query re-renders a hook only for the fields it has read.
  const { result } = renderHook(() => {
    const { data, isStale, fetchStatus } = world.Bank.useBox(TH.JokesPath)
    return { data, isStale, fetchStatus }
  }, { wrapper: Wrapper })
  return { world, result, minder: world._cheat_device().minder }
}

/** {@link setupShowing}, once the hook shows the first revision, which it returns. */
async function setupShown(opts: Parameters<typeof setupShowing>[0] = {}) {
  const shown = await setupShowing(opts)
  await waitFor(() => { expect(shown.result.current.data).to.not.be.undefined })
  return { ...shown, first: shown.result.current.data! }
}

/** Write the jokes box's next revision, of tier `pro`, from the other device, as another tab would, resolving it. */
async function putFromOtherTab(world: TH.ProviderWorld): Promise<BoxRecord> {
  return await world._cheat_otherVault!.putBoxOnce(JokesBoxPath, { sidecar: { service: 'jokes', tier: 'pro' } }, { whisper: LeanTH.Whisper })
}

describe("the bridge", () => {
  it("shows a newer revision another device writes, without fetching again", async () => {
    const { world, result } = await setupShown()
    const { gets } = world.counts
    const second = await act(() => putFromOtherTab(world))
    await waitFor(() => { expect(result.current.data).to.deep.equal(second) })
    expect(world.counts.gets).to.eq(gets)
  })

  it("dates the host's item by when the minder heard of the record", async () => {
    const { world, minder } = await setupShown()
    const heardAts: number[] = []
    minder.listen((event) => {
      if ((event.eventkind === 'item') && (event.action?.type === 'success')) { heardAts.push(event.state.dataUpdatedAt) }
    }, MinderEventFormat)
    // Each reading of the clock a millisecond later, so the host's own clock could not land on the minder's.
    let now = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now++)
    onTestFinished(() => { vi.restoreAllMocks() })
    await act(() => putFromOtherTab(world))
    expect(heardAts).to.have.lengthOf(1)
    expect(world.client.getQueryState(JokesKey)?.dataUpdatedAt).to.eq(heardAts[0])
  })

  it("keeps showing the older record, stale, while the newer revision a list told of is fetched whole", async () => {
    const { world, result, minder, first } = await setupShown({ isWatching: false })
    const second = await putFromOtherTab(world)
    const { gets } = world.counts
    const release = world.pauseGets()
    await act(() => minder.list('box'))
    await waitFor(() => { expect(result.current.fetchStatus).to.eq('fetching') })
    expect([result.current.data, result.current.isStale]).to.deep.equal([first, true])
    release()
    await waitFor(() => { expect(result.current.data).to.deep.equal(second) })
    expect([result.current.isStale, world.counts.gets]).to.deep.equal([false, gets + 1])
  })

  it("marks the host's item stale, keeping its record and fetching nothing, when a get of the minder's item is refused", async () => {
    const { world, minder, first } = await setupShown({ isWatching: false })
    // The vaultDB answers an older revision than the minder has: the get refuses stale_read.
    await putFromOtherTab(world)
    await act(() => minder.list('box'))
    await waitFor(() => { expect(world.client.getQueryData<BoxRecord>(JokesKey)?.revseq).to.eq(1) })
    const second = world.client.getQueryData(JokesKey)
    world.vaultDB._cheat_things(LeanTH.WorldScope).set(JokesBoxPath, first)
    const { gets } = world.counts
    await act(async () => { await LeanTH.expectBad(minder.tryGet({ ...minder.scope, labelpath: JokesBoxPath }, { staleTime: 0 }), 'stale_read') })
    expect(world.client.getQueryState(JokesKey)).to.deep.include({ isInvalidated: true, data: second })
    expect(world.counts.gets).to.eq(gets + 1)
  })

  it("copies no record into an item no hook has made", async () => {
    const { world } = await setupShown()
    await act(() => world._cheat_otherVault!.putBoxOnce('box/puns', { sidecar: { service: 'puns' } }, { whisper: LeanTH.Whisper }))
    expect(world.client.getQueryData(ThingMinder.itemQueryKeyOf({ ...LeanTH.WorldScope, labelpath: 'box/puns' }))).to.be.undefined
  })

  it("tells bad news what a delivery to the host's item throws", async () => {
    const delivered = new Error("setQueryData broke")
    const client = { getQueryCache: () => ({ find: () => ({}) }), setQueryData: () => { throw delivered } }
    let listener: ((event: unknown) => void) | undefined
    const minder = { listen: (fn: (event: unknown) => void) => { listener = fn; return vi.fn() } }
    const tellBadNews = vi.fn<(badnews: readonly unknown[]) => void>()
    bridgeMinder(client as never, minder as never, tellBadNews)
    listener!({ eventkind: 'item', modelkind: 'box', type: 'updated', action: { type: 'success' }, queryKey: ['box'], userid: 'u', banklabel: 'b', labelpath: 'box/x', state: { data: {}, dataUpdatedAt: 1 } })
    await Promise.resolve()
    expect(tellBadNews.mock.calls).to.deep.equal([[[delivered]]])
  })
})

/** The key the minder and the host both cache the listing of the root box's children under. */
const BoxListKey = ThingMinder.listQueryKeyOf({ ...LeanTH.WorldScope, labelpath: 'box' })

/** A world with the jokes box stored, its provider signed in, and `useBoxList` rendered under it, once it lists the jokes box; and how many lists the vaultDB has been asked. */
async function setupListed() {
  const world = await TH.buildProviderWorld({ stored: 'jokes' })
  const lists = { count: 0 }
  const tryListThings = world.vaultDB.tryListThings.bind(world.vaultDB)
  world.vaultDB.tryListThings = async (ask) => { lists.count += 1; return await tryListThings(ask) }
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, { userid: TH.ProviderUser }) }
  const { result } = renderHook(() => world.Bank.useBoxList().data, { wrapper: Wrapper })
  await waitFor(() => { expect(result.current).to.deep.equal([TH.JokesPath]) })
  return { world, result, lists, minder: world._cheat_device().minder }
}

describe("the bridge's listing", () => {
  it("shows a box another device writes, without listing again", async () => {
    const { world, result, lists } = await setupListed()
    const { count } = lists
    await act(() => world._cheat_otherVault!.putBoxOnce('box/puns', { sidecar: { service: 'puns' } }, { whisper: LeanTH.Whisper }))
    await waitFor(() => { expect(result.current).to.deep.equal([TH.JokesPath, 'puns']) })
    expect(lists.count).to.eq(count)
  })

  it("lists again when the minder marks its listing stale", async () => {
    const { world, result, lists, minder } = await setupListed()
    const { count } = lists
    act(() => { minder.invalidate('box', { list: 'all' }) })
    await waitFor(() => { expect(world.client.getQueryState(BoxListKey)?.isInvalidated).to.eq(false) })
    expect([lists.count, result.current]).to.deep.equal([count + 1, [TH.JokesPath]])
  })
})

// The host's fetch reads the first revision and waits; meanwhile the minder hears of the second, from the watch or from a
// list. Whichever lands first, the host ends showing the second.
const OrderCases = [
  [true,  'answer', 'watched: the late answer, then the watch'],
  [true,  'news',   'watched: the watch, then the late answer'],
  [false, 'answer', 'unwatched: the late answer, then a list'],
  [false, 'news',   'unwatched: a list, then the late answer'],
] as const

/** Release nothing: no pause has been made yet. */
function releaseNothing(): void { /* nothing paused */ }

describe("the bridge's main gate", () => {
  it("shows a passkey another device adds, without fetching again, and without the bankKey it wraps", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    let header: PasskeyWayinHeader | null | undefined
    function GateProbe() {
      header = world.Bank.useGate({ select: passkeyHeaderOf }).data
      return <p>{header?.wayinkind ?? 'none'}</p>
    }
    const { container } = render(TH.providerTreeOf(world, <GateProbe />, { userid: TH.ProviderUser }))
    await waitFor(() => { expect(header).to.be.null })
    // The minder freezes, so the spy goes on its class, counting the giver's device's calls alone.
    const { minder } = world._cheat_device()
    const get = vi.spyOn(ThingMinder.prototype, 'get')
    onTestFinished(() => { get.mockRestore() })
    const other = LeanTH.makeDevice({}, { vaultDB: world.vaultDB })
    await act(async () => {
      await other.hello()
      await other.bank!.gate.addPasskey({ passphraseCleartext: LeanTH.TestPassphrase, nextPasskeyCleartext: LeanTH.passkeyAnswerOf() })
    })
    await waitFor(() => { expect(header?.wayinkind).to.eq('passkey') })
    expect(get.mock.contexts.filter((context) => context === minder)).to.have.lengthOf(0)
    const stored = world.vaultDB._cheat_things(LeanTH.WorldScope).get('gate') as GateRecord
    TH.expectTextUnheld(stored.wayins.passkey0!.bank_key_wayin_wrapped.ciphertext_b64, container, world.client)
  })
})

describe("the bridge shows the newest record, in either order of a late answer and the news of a newer revision", () => {
  for (const [isWatching, firstStep, blurb] of OrderCases) {
    it(blurb, async () => {
      let release = releaseNothing
      const { world, result, minder } = await setupShowing({ isWatching, beforeShowing: (world) => { release = world.pauseAnswers() } })
      await waitFor(() => { expect(result.current.fetchStatus).to.eq('fetching') })
      const steps = {
        answer: async () => {
          act(() => { release() })
          await waitFor(() => { expect(result.current.data).to.not.be.undefined })
        },
        news: async () => { await act(async () => { await (isWatching ? putFromOtherTab(world) : minder.list('box')) }) },
      }
      if (! isWatching) { await putFromOtherTab(world) }
      await steps[firstStep]()
      await steps[(firstStep === 'answer') ? 'news' : 'answer']()
      await waitFor(() => { expect(result.current.data?.sidecar).to.deep.equal({ service: 'jokes', tier: 'pro' }) })
    })
  }
})
