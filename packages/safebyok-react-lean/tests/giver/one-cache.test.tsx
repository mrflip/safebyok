import { act, render, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { type BoxRecord, type GateRecord, type PasskeyWayinHeader, ThingMinder } from 'safebyok'
import { passkeyHeaderOf } from '../../src/index'
import * as LeanTH from 'safebyok/testing'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import * as TH from '../test-helpers'

/** The core's labelpath of the box with the joke service's key. */
const JokesBoxPath = `box/${TH.JokesPath}`

/** The key the minder caches the jokes box under, which the hooks observe. */
const JokesKey = ThingMinder.itemQueryKeyOf({ ...LeanTH.WorldScope, labelpath: JokesBoxPath })

/** A world with the jokes box stored, its provider signed in and its bank found locked. */
async function setupLocked({ isWatching = true }: Readonly<{ isWatching?: boolean }> = {}) {
  const world = await TH.buildProviderWorld({ stored: 'jokes', isWatching })
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, { userid: TH.ProviderUser }) }
  const probe = renderHook(() => world.Bank.useBank((bank) => bank.stage), { wrapper: Wrapper })
  await waitFor(() => { expect(probe.result.current).to.eq('locked') })
  return { world, Wrapper, minder: world._cheat_device().minder }
}

/** {@link setupLocked}; then, rendered under it, `useBox` of the jokes box. Before the hook renders, `beforeShowing` runs: to pause the vaultDB's answers, say. */
async function setupShowing({ isWatching = true, beforeShowing = () => undefined }: Readonly<{ isWatching?: boolean, beforeShowing?: (world: TH.ProviderWorld) => void }> = {}) {
  const { world, Wrapper, minder } = await setupLocked({ isWatching })
  beforeShowing(world)
  // Read in render, as a component would: React Query re-renders a hook only for the fields it has read.
  const { result } = renderHook(() => {
    const { data, isStale, fetchStatus, isError } = world.Bank.useBox(TH.JokesPath)
    return { data, isStale, fetchStatus, isError }
  }, { wrapper: Wrapper })
  return { world, result, minder }
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

describe("useBox over the minder's own cache", () => {
  it("answers on its first render a record the minder already has", async () => {
    const { world, Wrapper, minder } = await setupLocked()
    const record = await minder.get({ ...minder.scope, labelpath: JokesBoxPath })
    const { gets } = world.counts
    const { result } = renderHook(() => world.Bank.useBox(TH.JokesPath), { wrapper: Wrapper })
    expect([result.current.status, result.current.data]).to.deep.equal(['success', record])
    expect(world.counts.gets).to.eq(gets)
  })

  it("shows a newer revision another device writes, without fetching again", async () => {
    const { world, result } = await setupShown()
    const { gets } = world.counts
    const second = await act(() => putFromOtherTab(world))
    await waitFor(() => { expect(result.current.data).to.deep.equal(second) })
    expect(world.counts.gets).to.eq(gets)
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

  it("shows the refusal of a get of its item, keeping the record and fetching nothing more", async () => {
    const { world, result, minder, first } = await setupShown({ isWatching: false })
    // The vaultDB answers an older revision than the minder has: the get refuses stale_read.
    await putFromOtherTab(world)
    await act(() => minder.list('box'))
    await waitFor(() => { expect(result.current.data?.revseq).to.eq(1) })
    const second = result.current.data
    world.vaultDB._cheat_things(LeanTH.WorldScope).set(JokesBoxPath, first)
    const { gets } = world.counts
    await act(async () => { await LeanTH.expectBad(minder.tryGet({ ...minder.scope, labelpath: JokesBoxPath }, { staleTime: 0 }), 'stale_read') })
    await waitFor(() => { expect(result.current.isError).to.eq(true) })
    expect([result.current.data, result.current.isStale]).to.deep.equal([second, true])
    expect(world.Bank.queryClient().getQueryState(JokesKey)).to.deep.include({ isInvalidated: true, data: second })
    expect(world.counts.gets).to.eq(gets + 1)
  })
})

/** The key the minder caches the listing of the root box's children under. */
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

describe("useBoxList over the minder's own cache", () => {
  it("lists once, and shows a box another device writes without listing again", async () => {
    const { world, result, lists } = await setupListed()
    expect(lists.count).to.eq(1)
    await act(() => world._cheat_otherVault!.putBoxOnce('box/puns', { sidecar: { service: 'puns' } }, { whisper: LeanTH.Whisper }))
    await waitFor(() => { expect(result.current).to.deep.equal([TH.JokesPath, 'puns']) })
    expect(lists.count).to.eq(1)
  })

  it("lists again when the minder marks its listing stale", async () => {
    const { world, result, lists, minder } = await setupListed()
    act(() => { minder.invalidate('box', { list: 'all' }) })
    await waitFor(() => { expect(world.Bank.queryClient().getQueryState(BoxListKey)?.isInvalidated).to.eq(false) })
    expect([lists.count, result.current]).to.deep.equal([2, [TH.JokesPath]])
  })
})

describe("useGate over the minder's own cache", () => {
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
    // The minder's own item holds the whole gate, by design; the host's cache and the page hold none of it.
    const stored = world.vaultDB._cheat_things(LeanTH.WorldScope).get('gate') as GateRecord
    TH.expectTextUnheld(stored.wayins.passkey0!.bank_key_wayin_wrapped.ciphertext_b64, container, world.client)
  })
})

// The hook's fetch reads the first revision and waits; meanwhile the minder hears of the second, from the watch or from a
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
