import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, onTestFinished } from 'vitest'
import { giverBankOfMinder, giverBankOfVault } from '../../src/giver/minder-bank'
import { makeReactGiver } from '../../src/giver/react-giver'
import { ThingMinder } from 'safebyok'
import * as LeanTH from 'safebyok/testing'
import * as TH from '../test-helpers'

const OpenaiPath = 'box/openai'

/** A world over a real minder, its giver for the bank, and a hook that mounts the bridge and shows the box at `labelpath`. */
async function setupShowing(labelpath: string, worldOpts: Parameters<typeof TH.makeMinderGiverWorld>[0] = {}) {
  const world  = await TH.makeMinderGiverWorld(worldOpts)
  const Giver  = makeReactGiver(world.device)
  const Bank   = Giver.forBank(LeanTH.ThingBank.banklabel)
  const client = new QueryClient()
  onTestFinished(() => { client.clear() })
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
  const rendered = renderHook(() => {
    Giver.useBridge()
    return Bank.useBoxRecord(labelpath)
  }, { wrapper: Wrapper })
  return { world, ...rendered }
}

describe("giverBankOfVault", () => {
  it("refuses something that is not a Vault", async () => {
    const { minder } = await TH.makeMinderGiverWorld()
    for (const notVault of [null, {}, { bank: {}, minder }, minder]) {
      TH.expectSyncRefusal(() => giverBankOfVault(notVault as never), 'bad_record')
    }
  })
})

describe("giverBankOfMinder", () => {
  it("refuses something that is not a ThingMinder", () => {
    for (const notMinder of [null, {}, { get: () => null }]) {
      TH.expectSyncRefusal(() => giverBankOfMinder(notMinder as never), 'bad_record')
    }
  })

  it("refuses a labelpath that is not a box's", async () => {
    const { minder } = await TH.makeMinderGiverWorld()
    const bank = giverBankOfMinder(minder)
    for (const labelpath of ['gate', 'bank', 'boxes/openai']) {
      await TH.expectRefusal(bank.getBoxCar(labelpath), 'bad_record')
    }
  })

  it("passes on each event of the minder about a box's car, and none about another kind's", async () => {
    const { minder } = await TH.makeMinderGiverWorld()
    const told: unknown[][] = []
    giverBankOfMinder(minder).listenBoxCars((event) => { told.push([event.type, event.queryKey, event.state.data?.liveness]) })
    await minder.get({ ...minder.scope, labelpath: 'gate' })
    await minder.get({ ...minder.scope, labelpath: OpenaiPath })
    minder.goodbye()
    const queryKey = ThingMinder.queryKeyOf({ ...minder.scope, labelpath: OpenaiPath })
    expect(told).to.deep.equal([['updated', queryKey, 'void'], ['removed', queryKey, undefined]])
  })
})

describe("the giver over a minder", () => {
  it("shows a stored box's whole record, fetched through the minder", async () => {
    const box = LeanTH.boxThingOf('openai', { sidecar: { account: 'work' } })
    const { world, result } = await setupShowing(OpenaiPath)
    await act(() => world._cheat_birthBox(box))
    await waitFor(() => { expect(result.current.data).to.deep.equal(box) })
  })

  it("answers null for a box none is stored at", async () => {
    const { result } = await setupShowing('box/nothing')
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    expect(result.current.data).to.be.null
  })

  it("shows a newer revision the vaultDB tells of, without the host fetching again", async () => {
    const box = LeanTH.boxThingOf('openai')
    const { world, result } = await setupShowing(OpenaiPath)
    await act(() => world._cheat_birthBox(box))
    await waitFor(() => { expect(result.current.data).to.deep.equal(box) })
    const { gets } = world.counts
    const next = LeanTH.nextOf(box, { sidecar: { account: 'home' } })
    await act(() => world._cheat_replace(box, next))
    await waitFor(() => { expect(result.current.data).to.deep.equal(next) })
    expect(world.counts.gets).to.eq(gets)
  })

  it("shows the older record while a listed newer revision is fetched whole", async () => {
    const box = LeanTH.boxThingOf('openai')
    const { world, result } = await setupShowing(OpenaiPath, { isWatching: false })
    await act(() => world._cheat_birthBox(box))
    // Unwatched, the minder knows of the box only by asking: the host refetches the void car it showed.
    await act(() => world.minder.list('box'))
    await waitFor(() => { expect(result.current.data).to.deep.equal(box) })
    const next = LeanTH.nextOf(box, { sidecar: { account: 'home' } })
    await act(() => world._cheat_replace(box, next))
    const { gets } = world.counts
    // The get of the newer revision waits until released, so the older record is still what shows.
    const releaseGets = world.pauseGets()
    await act(() => world.minder.list('box'))
    expect(result.current.data).to.deep.equal(box)
    releaseGets()
    await waitFor(() => { expect(result.current.data).to.deep.equal(next) })
    expect(world.counts.gets).to.eq(gets + 1)
  })
})

// == [In any order]: OrderStep, settleInOrder, WatchedOrders, UnwatchedOrders

/** One thing that happens to the host's entry: its fetch answers, the minder hears the next revision by the watch or a list, or the bridge starts. */
type OrderStep = 'fetch' | 'notice' | 'list' | 'bridge'

/** A world over a real minder with the box at revision 1, a hook showing it whose fetch has read revision 1 and waits, then `steps` in order.
 * Watched, the `notice` step puts revision 2; unwatched, revision 2 is put before the steps, and only a list tells the minder of it.
 * Returns the hook's result, and revision 2.
 */
async function settleInOrder(steps: readonly OrderStep[], { isWatching }: Readonly<{ isWatching: boolean }>) {
  const world  = await TH.makeMinderGiverWorld({ isWatching })
  const box    = LeanTH.boxThingOf('openai')
  await world._cheat_birthBox(box)
  // Empty the minder's cache, so that the host's fetch asks the vaultDB.
  world.minder.goodbye()
  world.minder.hello()
  const answer = world.pauseAnswers()
  const Giver  = makeReactGiver(world.device)
  const Bank   = Giver.forBank(LeanTH.ThingBank.banklabel)
  const client = new QueryClient()
  onTestFinished(() => { client.clear() })
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
  const { result } = renderHook(() => Bank.useBoxRecord(OpenaiPath), { wrapper: Wrapper })
  await waitFor(() => { expect(world.counts.gets).to.eq(1) })
  const next = LeanTH.nextOf(box, { sidecar: { account: 'home' } })
  if (! isWatching) { await act(() => world._cheat_replace(box, next)) }
  const stepRunners: Readonly<Record<OrderStep, () => Promise<void> | void>> = {
    fetch:  async () => {
      act(() => { answer() })
      // The next step waits until the fetch's answer reaches the host.
      await waitFor(() => { expect(result.current.data).to.not.be.undefined })
    },
    notice: async () => { await act(() => world._cheat_replace(box, next)) },
    list:   async () => { await act(async () => { await world.minder.list('box') }) },
    bridge: () => { renderHook(() => { Giver.useBridge() }, { wrapper: Wrapper }) },
  }
  for (const step of steps) { await stepRunners[step]() }
  return { result, next }
}

// Each order of three steps: the host's fetch answering what it read before revision 2, the minder hearing of revision 2,
// and the bridge starting.
const WatchedOrders = [
  ["fetch",  "notice", "bridge"],
  ["fetch",  "bridge", "notice"],
  ["notice", "fetch",  "bridge"],
  ["notice", "bridge", "fetch"],
  ["bridge", "fetch",  "notice"],
  ["bridge", "notice", "fetch"],
] as const

const UnwatchedOrders = [
  ["fetch",  "list",   "bridge"],
  ["fetch",  "bridge", "list"],
  ["list",   "fetch",  "bridge"],
  ["list",   "bridge", "fetch"],
  ["bridge", "fetch",  "list"],
  ["bridge", "list",   "fetch"],
] as const

describe("the giver over a minder shows the newest record, in any order", () => {
  describe("of the fetch's late answer, a watch notice and the bridge's start", () => {
    for (const steps of WatchedOrders) {
      it(steps.join(', '), async () => {
        const { result, next } = await settleInOrder(steps, { isWatching: true })
        await waitFor(() => { expect(result.current.data).to.deep.equal(next) })
      })
    }
  })

  describe("of the fetch's late answer, a list and the bridge's start, unwatched", () => {
    for (const steps of UnwatchedOrders) {
      it(steps.join(', '), async () => {
        const { result, next } = await settleInOrder(steps, { isWatching: false })
        await waitFor(() => { expect(result.current.data).to.deep.equal(next) })
      })
    }
  })
})
// --
