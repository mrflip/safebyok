import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, onTestFinished } from 'vitest'
import { boxCarQueryKey, makeReactGiver } from '../../src/giver/react-giver'
import * as TH from '../test-helpers'

const OpenaiPath = 'box/openai'
const OpenaiKey  = boxCarQueryKey({ userid: 'u1', banklabel: 'acme', labelpath: OpenaiPath })

/** A fake world with revision 1 of the OpenAI box stored, its giver for `acme`, and a fresh QueryClient's wrapper. */
function setup() {
  const world  = TH.makeFakeGiverWorld()
  const Giver  = makeReactGiver(world.device)
  const Acme   = Giver.forBank('acme')
  const client = new QueryClient()
  onTestFinished(() => { client.clear() })
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
  const first  = TH.fakeBoxRecordOf(OpenaiPath, 1)
  world.stored.set(OpenaiPath, TH.fullCarOf(first))
  /** Render a hook that mounts the bridge and shows the box's record */
  const renderShowing = () => renderHook(() => {
    Giver.useBridge()
    return Acme.useBoxRecord(OpenaiPath)
  }, { wrapper: Wrapper })
  return { world, Acme, client, first, renderShowing }
}

/** {@link setup}, with the hook rendered and showing revision 1. */
async function setupShowing() {
  const { renderShowing, ...rest } = setup()
  const rendered = renderShowing()
  await waitFor(() => { expect(rendered.result.current.data).to.eq(rest.first) })
  return { ...rest, ...rendered }
}

describe("the bridge", () => {
  it("shows a newer car the minder caches, without fetching again", async () => {
    const { world, result } = await setupShowing()
    const second = TH.fakeBoxRecordOf(OpenaiPath, 2)
    act(() => { world._cheat_hear(OpenaiPath, TH.fullCarOf(second)) })
    await waitFor(() => { expect(result.current.data).to.deep.equal(second) })
    expect(world.counts.gets).to.eq(1)
  })

  it("dates the host's item by when the minder received the car", async () => {
    const { world, result } = await setupShowing()
    act(() => { world._cheat_hear(OpenaiPath, TH.fullCarOf(TH.fakeBoxRecordOf(OpenaiPath, 2)), 1_700_000_000_000) })
    await waitFor(() => { expect(result.current.dataUpdatedAt).to.eq(1_700_000_000_000) })
  })

  it("keeps showing the older record while a newer revision is fetched whole", async () => {
    const { world, first, result } = await setupShowing()
    const second = TH.fakeBoxRecordOf(OpenaiPath, 2)
    world.stored.set(OpenaiPath, TH.fullCarOf(second))
    act(() => { world._cheat_hear(OpenaiPath, TH.bhndCarOf(second, first)) })
    expect(result.current.data).to.eq(first)
    await waitFor(() => { expect(result.current.data).to.deep.equal(second) })
    expect(world.counts.gets).to.eq(2)
  })

  it("fetches a car with no record to show in place of copying it", async () => {
    const { world, first, result } = await setupShowing()
    const second = TH.fakeBoxRecordOf(OpenaiPath, 2)
    world.stored.set(OpenaiPath, TH.fullCarOf(second))
    act(() => { world._cheat_hear(OpenaiPath, TH.bareCarOf(second)) })
    expect(result.current.data).to.eq(first)
    await waitFor(() => { expect(result.current.data).to.deep.equal(second) })
    expect(world.counts.gets).to.eq(2)
  })

  it("never lets an older car a late fetch answers replace a newer one it copied", async () => {
    const { world, client, renderShowing } = setup()
    const answer = world.pauseAnswers()
    const { result } = renderShowing()
    await waitFor(() => { expect(world.counts.gets).to.eq(1) })
    const second = TH.fakeBoxRecordOf(OpenaiPath, 2)
    act(() => { world._cheat_hear(OpenaiPath, TH.fullCarOf(second)) })
    await waitFor(() => { expect(result.current.data).to.deep.equal(second) })
    act(() => { answer() })
    await waitFor(() => { expect(client.getQueryState(OpenaiKey)?.fetchStatus).to.eq('idle') })
    expect(result.current.data).to.deep.equal(second)
  })

  it("leaves the host's item showing its car when the minder lets go of it", async () => {
    const { world, first, client, result } = await setupShowing()
    act(() => { world._cheat_hearRemoved(OpenaiPath) })
    expect([result.current.data, client.getQueryData(OpenaiKey)]).to.deep.equal([first, TH.fullCarOf(first)])
  })

  it("copies no car into an item no hook has made", async () => {
    const { world, client } = await setupShowing()
    const otherPath = 'box/anthropic'
    act(() => { world._cheat_hear(otherPath, TH.fullCarOf(TH.fakeBoxRecordOf(otherPath, 1))) })
    expect(client.getQueryData(boxCarQueryKey({ userid: 'u1', banklabel: 'acme', labelpath: otherPath }))).to.be.undefined
  })

  it("fetches again from the next bank object when a bank object ends", async () => {
    const { world, result } = await setupShowing()
    world.stored.delete(OpenaiPath)
    act(() => { world._cheat_endBank() })
    await waitFor(() => { expect(result.current.data).to.be.null })
    expect(world.counts.gets).to.eq(2)
  })

  it("stops copying once unmounted", async () => {
    const { world, client, first, unmount } = await setupShowing()
    unmount()
    act(() => { world._cheat_hear(OpenaiPath, TH.fullCarOf(TH.fakeBoxRecordOf(OpenaiPath, 2))) })
    expect(client.getQueryData(OpenaiKey)).to.deep.equal(TH.fullCarOf(first))
  })

  it("shows a revision the minder received before the bridge mounted, without asking the vaultDB again", async () => {
    const { world, Acme, client, renderShowing } = setup()
    // A route loader fetches the box before any component mounts.
    await client.query(Acme.boxCarQueryOptions(OpenaiPath))
    const second = TH.fakeBoxRecordOf(OpenaiPath, 2)
    world._cheat_hear(OpenaiPath, TH.fullCarOf(second))
    const { result } = renderShowing()
    await waitFor(() => { expect(result.current.data).to.deep.equal(second) })
    expect(world.counts.gets).to.eq(1)
  })
})
