import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, onTestFinished } from 'vitest'
import { giverBankOfMinder } from '../../src/giver/minder-bank'
import { makeReactGiver } from '../../src/giver/react-giver'
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
    await act(() => world.minder.list('box'))
    expect(result.current.data).to.deep.equal(box)
    await waitFor(() => { expect(result.current.data).to.deep.equal(next) })
    expect(world.counts.gets).to.eq(gets + 1)
  })
})
