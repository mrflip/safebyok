import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, onTestFinished } from 'vitest'
import { PendingBank, makeReactGiver, type BankSnapshot } from '../../src/giver/react-giver'
import * as TH from '../test-helpers'

const OpenaiPath = 'box/openai'
const ReadyUnlocked: BankSnapshot = Object.freeze({ stage: 'ready', isLocked: false, leaseEndsAt: 1_800_000_000_000, lastErr: null })

/** A fake world signed in as `userid`, its giver for the bank `acme`, and a wrapper providing a fresh QueryClient. */
function setup(userid: string | null = 'u1') {
  const world  = TH.makeFakeGiverWorld(userid)
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

  it("refuses an empty banklabel", () => {
    const { Giver } = setup()
    TH.expectSyncRefusal(() => Giver.forBank(''), 'bad_record')
  })
})

describe("useBankSnapshot", () => {
  it("reads as locked and signed out before the Device has heard of the bank", () => {
    const { Acme, wrapper } = setup()
    const { result } = renderHook(() => Acme.useBankSnapshot(), { wrapper })
    expect(result.current).to.eq(PendingBank)
    expect(result.current.isLocked).to.eq(true)
  })

  it("re-renders with the bank's snapshot when it changes", () => {
    const { world, Acme, wrapper } = setup()
    const { result } = renderHook(() => Acme.useBankSnapshot(), { wrapper })
    act(() => { world._cheat_setBank('acme', ReadyUnlocked) })
    expect(result.current).to.eq(ReadyUnlocked)
  })

  it("given a selector, re-renders only when what it selects changes", () => {
    const { world, Acme, wrapper } = setup()
    let renders = 0
    const { result } = renderHook(() => {
      renders += 1
      return Acme.useBankSnapshot((snap) => snap.isLocked)
    }, { wrapper })
    act(() => { world._cheat_setBank('acme', ReadyUnlocked) })
    expect([result.current, renders]).to.deep.equal([false, 2])
    act(() => { world._cheat_setBank('acme', { ...ReadyUnlocked, lastErr: new Error('a refusal the lock does not care about') }) })
    expect(renders).to.eq(2)
  })

  it("ignores a change to another bank", () => {
    const { world, Acme, wrapper } = setup()
    let renders = 0
    renderHook(() => {
      renders += 1
      return Acme.useBankSnapshot()
    }, { wrapper })
    act(() => { world._cheat_setBank('other', ReadyUnlocked) })
    expect(renders).to.eq(1)
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

  it("fetches nothing while nobody is signed in, and fetches once someone is", async () => {
    const { world, Acme, wrapper } = setup(null)
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath), { wrapper })
    expect([result.current.isPending, result.current.fetchStatus, world.counts.gets]).to.deep.equal([true, 'idle', 0])
    act(() => { world._cheat_signIn('u1') })
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    expect(world.counts.gets).to.eq(1)
  })

  it("keeps each user's record under a key of its own", async () => {
    const { world, Acme, wrapper } = setup('u1')
    world.stored.set(OpenaiPath, TH.fullCarOf(TH.fakeBoxRecordOf(OpenaiPath, 1)))
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath), { wrapper })
    await waitFor(() => { expect(result.current.data).not.to.be.undefined })
    world.stored.delete(OpenaiPath)
    act(() => { world._cheat_signIn('u2') })
    expect(result.current.data).to.be.undefined
    await waitFor(() => { expect(result.current.data).to.be.null })
  })

  it("takes React Query's own options", () => {
    const { world, Acme, wrapper } = setup()
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath, { enabled: false }), { wrapper })
    expect([result.current.fetchStatus, world.counts.gets]).to.deep.equal(['idle', 0])
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

  it("lets a fetch ahead of render fill the entry that useBoxRecord then shows at once", async () => {
    const { world, Acme, client, wrapper } = setup()
    const record = TH.fakeBoxRecordOf(OpenaiPath, 1)
    world.stored.set(OpenaiPath, TH.fullCarOf(record))
    await client.query(Acme.boxCarQueryOptions(OpenaiPath))
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath), { wrapper })
    expect([result.current.data, world.counts.gets]).to.deep.equal([record, 1])
  })
})
