import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, onTestFinished } from 'vitest'
import { boxCarQueryKey, makeReactGiver } from '../../src/giver/react-giver'
import * as TH from '../test-helpers'

const OpenaiPath = 'box/openai'

/** A fake world with revision 1 of the OpenAI box stored, its giver for `acme`, and a hook that mounts the bridge and shows the box's record. */
async function setupShowing() {
  const world  = TH.makeFakeGiverWorld('u1')
  const Giver  = makeReactGiver(world.device)
  const Acme   = Giver.forBank('acme')
  const client = new QueryClient()
  onTestFinished(() => { client.clear() })
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
  const first  = TH.fakeBoxRecordOf(OpenaiPath, 1)
  world.stored.set(OpenaiPath, TH.fullCarOf(first))
  const rendered = renderHook(() => {
    Giver.useBridge()
    return Acme.useBoxRecord(OpenaiPath)
  }, { wrapper: Wrapper })
  await waitFor(() => { expect(rendered.result.current.data).to.eq(first) })
  return { world, client, first, ...rendered }
}

describe("the bridge", () => {
  it("shows a newer car the minders cache, without fetching again", async () => {
    const { world, result } = await setupShowing()
    const second = TH.fakeBoxRecordOf(OpenaiPath, 2)
    act(() => { world._cheat_hear(OpenaiPath, TH.fullCarOf(second)) })
    await waitFor(() => { expect(result.current.data).to.deep.equal(second) })
    expect(world.counts.gets).to.eq(1)
  })

  it("keeps showing the older record while a newer revision is fetched whole", async () => {
    const { world, first, result } = await setupShowing()
    const second = TH.fakeBoxRecordOf(OpenaiPath, 2)
    world.stored.set(OpenaiPath, TH.fullCarOf(second))
    act(() => { world._cheat_hear(OpenaiPath, TH.behindCarOf(second, first)) })
    expect(result.current.data).to.eq(first)
    await waitFor(() => { expect(result.current.data).to.deep.equal(second) })
    expect(world.counts.gets).to.eq(2)
  })

  it("copies no car into an entry no hook has made", async () => {
    const { world, client } = await setupShowing()
    const otherPath = 'box/anthropic'
    act(() => { world._cheat_hear(otherPath, TH.fullCarOf(TH.fakeBoxRecordOf(otherPath, 1))) })
    expect(client.getQueryData(boxCarQueryKey({ userid: 'u1', banklabel: 'acme', labelpath: otherPath }))).to.be.undefined
  })

  it("fetches again from the next bank object when a bank object ends", async () => {
    const { world, result } = await setupShowing()
    world.stored.delete(OpenaiPath)
    act(() => { world._cheat_endBank('acme') })
    await waitFor(() => { expect(result.current.data).to.be.null })
    expect(world.counts.gets).to.eq(2)
  })

  it("stops copying once unmounted", async () => {
    const { world, client, first, unmount } = await setupShowing()
    unmount()
    act(() => { world._cheat_hear(OpenaiPath, TH.fullCarOf(TH.fakeBoxRecordOf(OpenaiPath, 2))) })
    const car = client.getQueryData(boxCarQueryKey({ userid: 'u1', banklabel: 'acme', labelpath: OpenaiPath }))
    expect(car).to.deep.equal(TH.fullCarOf(first))
  })
})
