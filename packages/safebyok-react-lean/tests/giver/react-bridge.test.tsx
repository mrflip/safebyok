import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, onTestFinished } from 'vitest'
import { boxRecordQueryKey, makeReactGiver } from '../../src/giver/react-giver'
import * as TH from '../test-helpers'

const OpenaiPath = 'box/openai'
const OpenaiKey  = boxRecordQueryKey({ userid: 'u1', banklabel: 'acme', labelpath: OpenaiPath })

/** A fake world with revision 1 of the OpenAI box stored, its giver for `acme`, and a fresh QueryClient's wrapper. */
function setup() {
  const world  = TH.makeFakeGiverWorld()
  const Giver  = makeReactGiver(world.device)
  const Acme   = Giver.forBank('acme')
  const client = new QueryClient()
  onTestFinished(() => { client.clear() })
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
  const first  = TH.fakeBoxRecordOf(OpenaiPath, 1)
  world.stored.set(OpenaiPath, first)
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
  it("shows a newer record the minder caches, without fetching again", async () => {
    const { world, result } = await setupShowing()
    const second = TH.fakeBoxRecordOf(OpenaiPath, 2)
    act(() => { world._cheat_hear(OpenaiPath, second) })
    await waitFor(() => { expect(result.current.data).to.deep.equal(second) })
    expect(world.counts.gets).to.eq(1)
  })

  it("dates the host's item by when the minder received the record", async () => {
    const { world, result } = await setupShowing()
    act(() => { world._cheat_hear(OpenaiPath, TH.fakeBoxRecordOf(OpenaiPath, 2), 1_700_000_000_000) })
    await waitFor(() => { expect(result.current.dataUpdatedAt).to.eq(1_700_000_000_000) })
  })

  it("keeps showing the older record while the newer revision the item fell behind is fetched whole", async () => {
    const { world, first, client, result } = await setupShowing()
    const second = TH.fakeBoxRecordOf(OpenaiPath, 2)
    world.stored.set(OpenaiPath, second)
    act(() => { world._cheat_hearBehind(OpenaiPath) })
    expect(result.current.data).to.eq(first)
    expect(client.getQueryState(OpenaiKey)?.isInvalidated).to.be.true
    await waitFor(() => { expect(result.current.data).to.deep.equal(second) })
    expect(world.counts.gets).to.eq(2)
  })

  it("refetches the host's item of the box when the minder caches a newer soon", async () => {
    const { world, client, result } = await setupShowing()
    const second = TH.fakeBoxRecordOf(OpenaiPath, 2)
    world.stored.set(OpenaiPath, second)
    act(() => { world._cheat_hearSoon(OpenaiPath, second) })
    expect(client.getQueryState(OpenaiKey)?.isInvalidated).to.be.true
    await waitFor(() => { expect(result.current.data).to.deep.equal(second) })
    expect(world.counts.gets).to.eq(2)
  })

  it("counts the host's item stale while the minder's item is behind, though a setQueryData or a fetch has landed since", async () => {
    const { world, Acme, client, first } = setup()
    const options = Acme.boxRecordQueryOptions(OpenaiPath)
    // The fetch reads revision 1 and waits; the minder hears of revision 2 meanwhile.
    const answer   = world.pauseAnswers()
    const fetching = client.query(options)
    await waitFor(() => { expect(world.counts.gets).to.eq(1) })
    const second = TH.fakeBoxRecordOf(OpenaiPath, 2)
    world._cheat_hearSoon(OpenaiPath, second)
    answer()
    expect(await fetching).to.eq(first)
    client.setQueryData(OpenaiKey, first)
    world.stored.set(OpenaiPath, second)
    expect(await client.query(options)).to.eq(second)
    expect(await client.query(options)).to.eq(second)
    expect(world.counts.gets).to.eq(2)
  })

  it("never lets an older record a late fetch answers replace a newer one it copied", async () => {
    const { world, client, renderShowing } = setup()
    const answer = world.pauseAnswers()
    const { result } = renderShowing()
    await waitFor(() => { expect(world.counts.gets).to.eq(1) })
    const second = TH.fakeBoxRecordOf(OpenaiPath, 2)
    act(() => { world._cheat_hear(OpenaiPath, second) })
    await waitFor(() => { expect(result.current.data).to.deep.equal(second) })
    act(() => { answer() })
    await waitFor(() => { expect(client.getQueryState(OpenaiKey)?.fetchStatus).to.eq('idle') })
    expect(result.current.data).to.deep.equal(second)
  })

  it("leaves the host's item showing its record when the minder lets go of its item", async () => {
    const { world, first, client, result } = await setupShowing()
    act(() => { world._cheat_hearRemoved(OpenaiPath) })
    expect([result.current.data, client.getQueryData(OpenaiKey)]).to.deep.equal([first, first])
  })

  it("copies no record into an item no hook has made", async () => {
    const { world, client } = await setupShowing()
    const otherLabelpath = 'box/anthropic'
    act(() => { world._cheat_hear(otherLabelpath, TH.fakeBoxRecordOf(otherLabelpath, 1)) })
    expect(client.getQueryData(boxRecordQueryKey({ userid: 'u1', banklabel: 'acme', labelpath: otherLabelpath }))).to.be.undefined
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
    act(() => { world._cheat_hear(OpenaiPath, TH.fakeBoxRecordOf(OpenaiPath, 2)) })
    expect(client.getQueryData(OpenaiKey)).to.eq(first)
  })

  it("shows a revision the minder received before the bridge mounted, without asking the vaultDB again", async () => {
    const { world, Acme, client, renderShowing } = setup()
    // A route loader fetches the box before any component mounts.
    await client.query(Acme.boxRecordQueryOptions(OpenaiPath))
    const second = TH.fakeBoxRecordOf(OpenaiPath, 2)
    world._cheat_hear(OpenaiPath, second)
    const { result } = renderShowing()
    await waitFor(() => { expect(result.current.data).to.deep.equal(second) })
    expect(world.counts.gets).to.eq(1)
  })
})
