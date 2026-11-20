import { QueryClient, QueryClientProvider, onlineManager, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { OpenGatingSnapshot } from 'safebyok'
import { describe, expect, it, onTestFinished } from 'vitest'
import { PendingBank, makeReactGiver } from '../../src/giver/react-giver'
import * as TH from '../test-helpers'

const OpenaiPath = 'box/openai'

/** A fake world, its giver for the bank `acme`, and a wrapper providing a fresh QueryClient. */
function setup() {
  const world  = TH.makeFakeGiverWorld()
  const Giver  = makeReactGiver(world.device)
  const Acme   = Giver.forBank('acme')
  const client = new QueryClient()
  onTestFinished(() => { client.clear() })
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
  return { world, Giver, Acme, client, wrapper: Wrapper }
}

describe("makeReactGiver", () => {
  it("refuses something that is not a Device", () => {
    for (const notDevice of [null, {}, { subscribe: () => null }, 'device']) {
      TH.expectSyncRefusal(() => makeReactGiver(notDevice as never), 'bad_record')
    }
  })

  // makeReactGiver @example
  it("gives the hooks of the Device's bank, and refuses any other banklabel", () => {
    const { Giver } = setup()
    expect(Object.keys(Giver.forBank('acme'))).to.deep.equal(['useBankSnapshot', 'useBoxRecord', 'boxCarQueryOptions'])
    for (const banklabel of ['other', '']) {
      TH.expectSyncRefusal(() => Giver.forBank(banklabel), 'bad_scope')
    }
  })
})

describe("useBankSnapshot", () => {
  it("reads as starting and locked before the Device holds a bank object", () => {
    const { Acme, wrapper } = setup()
    const { result } = renderHook(() => Acme.useBankSnapshot(), { wrapper })
    expect(result.current).to.eq(PendingBank)
    expect([result.current.stage, result.current.isLocked]).to.deep.equal(['starting', true])
  })

  it("re-renders with the bank's snapshot when it changes", () => {
    const { world, Acme, wrapper } = setup()
    const { result } = renderHook(() => Acme.useBankSnapshot(), { wrapper })
    act(() => { world._cheat_setBank(TH.UnlockedBank) })
    expect(result.current).to.eq(TH.UnlockedBank)
  })

  it("given a selector, re-renders only when what it selects changes", () => {
    const { world, Acme, wrapper } = setup()
    let renders = 0
    const { result } = renderHook(() => {
      renders += 1
      return Acme.useBankSnapshot((snap) => snap.isLocked)
    }, { wrapper })
    act(() => { world._cheat_setBank(TH.UnlockedBank) })
    expect([result.current, renders]).to.deep.equal([false, 2])
    act(() => { world._cheat_setBank({ ...TH.UnlockedBank, leaseEndsAt: 1_900_000_000_000 }) })
    expect(renders).to.eq(2)
  })

  it("ignores a change to the gating", () => {
    const { world, Acme, wrapper } = setup()
    let renders = 0
    renderHook(() => {
      renders += 1
      return Acme.useBankSnapshot()
    }, { wrapper })
    act(() => { world._cheat_setGating({ gatingkind: 'unlock_bank', gatingseq: 1, isAttempting: false }) })
    expect(renders).to.eq(1)
  })
})

describe("useGating", () => {
  it("reads null with no gating open, and re-renders with the gating once one is", () => {
    const { world, Giver, wrapper } = setup()
    const { result } = renderHook(() => Giver.useGating(), { wrapper })
    expect(result.current).to.be.null
    const gating = { gatingkind: 'unlock_bank', gatingseq: 1, isAttempting: false } as OpenGatingSnapshot
    act(() => { world._cheat_setGating(gating) })
    expect(result.current).to.eq(gating)
  })
})

describe("useBoxRecord", () => {
  it("shows the fullest record once fetched", async () => {
    const { world, Acme, wrapper } = setup()
    const record = TH.fakeBoxRecordOf(OpenaiPath, 1)
    world.stored.set(OpenaiPath, TH.fullCarOf(record))
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath), { wrapper })
    expect(result.current.isPending).to.eq(true)
    await waitFor(() => { expect(result.current.data).to.eq(record) })
  })

  it("answers null for a box none is stored at", async () => {
    const { Acme, wrapper } = setup()
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath), { wrapper })
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    expect(result.current.data).to.be.null
  })

  it("stays fresh while the car is whole, and goes stale while the vaultDB holds a newer revision", async () => {
    const { world, Acme, client, wrapper } = setup()
    const first = TH.fakeBoxRecordOf(OpenaiPath, 1)
    world.stored.set(OpenaiPath, TH.fullCarOf(first))
    await client.query(Acme.boxCarQueryOptions(OpenaiPath))
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath), { wrapper })
    expect([result.current.data, result.current.isStale]).to.deep.equal([first, false])
    act(() => { client.setQueryData(Acme.boxCarQueryOptions(OpenaiPath).queryKey, TH.bhndCarOf(TH.fakeBoxRecordOf(OpenaiPath, 2), first)) })
    await waitFor(() => { expect([result.current.data, result.current.isStale]).to.deep.equal([first, true]) })
  })

  it("fetches while the browser is offline", async () => {
    const { world, Acme, wrapper } = setup()
    onlineManager.setOnline(false)
    onTestFinished(() => { onlineManager.setOnline(true) })
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath), { wrapper })
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    expect(world.counts.gets).to.eq(1)
  })

  it("takes React Query's own options over the giver's defaults", async () => {
    const { world, Acme, wrapper } = setup()
    world.stored.set(OpenaiPath, TH.fullCarOf(TH.fakeBoxRecordOf(OpenaiPath, 1)))
    const idle = renderHook(() => Acme.useBoxRecord(OpenaiPath, { enabled: false }), { wrapper })
    expect([idle.result.current.fetchStatus, world.counts.gets]).to.deep.equal(['idle', 0])
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath, { staleTime: 0 }), { wrapper })
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    expect(result.current.isStale).to.eq(true)
  })

  it("hands a select of the host's the whole car", async () => {
    const { world, Acme, wrapper } = setup()
    world.stored.set(OpenaiPath, TH.bhndCarOf(TH.fakeBoxRecordOf(OpenaiPath, 2), TH.fakeBoxRecordOf(OpenaiPath, 1)))
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath, { select: (car) => car.newest.revseq }), { wrapper })
    await waitFor(() => { expect(result.current.data).to.eq(2) })
  })

  it("shows the new box's car when the labelpath changes under a select that returns cars", async () => {
    const { world, Acme, client, wrapper } = setup()
    const AnthropicPath = 'box/anthropic'
    world.stored.set(OpenaiPath, TH.fullCarOf(TH.fakeBoxRecordOf(OpenaiPath, 5)))
    world.stored.set(AnthropicPath, TH.fullCarOf(TH.fakeBoxRecordOf(AnthropicPath, 1)))
    await client.query(Acme.boxCarQueryOptions(AnthropicPath))
    const { result, rerender } = renderHook(({ labelpath }) => Acme.useBoxRecord(labelpath, { select: (car) => ({ ...car }) }), { wrapper, initialProps: { labelpath: OpenaiPath } })
    await waitFor(() => { expect(result.current.data?.newest.labelpath).to.eq(OpenaiPath) })
    rerender({ labelpath: AnthropicPath })
    await waitFor(() => { expect(result.current.isFetching).to.eq(false) })
    expect(result.current.data?.newest.labelpath).to.eq(AnthropicPath)
  })

  it("refuses a labelpath that is not a string", () => {
    const { Acme, wrapper } = setup()
    for (const labelpath of [42, null, '']) {
      TH.expectSyncRefusal(() => renderHook(() => Acme.useBoxRecord(labelpath as never), { wrapper }), 'bad_record')
    }
  })
})

describe("boxCarQueryOptions", () => {
  it("gives a useQuery of the host's the whole car", async () => {
    const { world, Acme, wrapper } = setup()
    const car = TH.fullCarOf(TH.fakeBoxRecordOf(OpenaiPath, 1))
    world.stored.set(OpenaiPath, car)
    const { result } = renderHook(() => useQuery(Acme.boxCarQueryOptions(OpenaiPath)), { wrapper })
    await waitFor(() => { expect(result.current.data).to.eq(car) })
  })

  it("keys the car as the bank's minder does", () => {
    const { Acme } = setup()
    expect(Acme.boxCarQueryOptions(OpenaiPath).queryKey).to.deep.equal(['sok', 'u1', 'acme', 'box', '/', 'openai', '!'])
  })

  it("lets a fetch ahead of render fill the entry that useBoxRecord then shows at once", async () => {
    const { world, Acme, client, wrapper } = setup()
    const record = TH.fakeBoxRecordOf(OpenaiPath, 1)
    world.stored.set(OpenaiPath, TH.fullCarOf(record))
    await client.query(Acme.boxCarQueryOptions(OpenaiPath))
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath), { wrapper })
    expect([result.current.data, world.counts.gets]).to.deep.equal([record, 1])
  })

  it("never replaces a car with an older one", async () => {
    const { world, Acme, client } = setup()
    const first = TH.fakeBoxRecordOf(OpenaiPath, 1)
    world.stored.set(OpenaiPath, TH.fullCarOf(first))
    const { queryKey } = Acme.boxCarQueryOptions(OpenaiPath)
    await client.query(Acme.boxCarQueryOptions(OpenaiPath))
    const second = TH.fullCarOf(TH.fakeBoxRecordOf(OpenaiPath, 2))
    client.setQueryData(queryKey, second)
    client.setQueryData(queryKey, TH.fullCarOf(first))
    expect(client.getQueryData(queryKey)).to.eq(second)
  })
})
