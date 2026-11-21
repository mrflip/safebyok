import { QueryClient, QueryClientProvider, onlineManager, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, onTestFinished } from 'vitest'
import { makeReactGiver } from '../../src/giver/old-giver'
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
  it("gives the hooks of the Device's bank", () => {
    const { Giver } = setup()
    expect(Object.keys(Giver.forBank('acme'))).to.deep.equal([
      'useBankSnapshot', 'useBoxRecord', 'boxRecordQueryOptions',
      'birthGating', 'birthMutationOptions', 'useBirth', 'unlockGating', 'unlockMutationOptions', 'useUnlock',
      'replacePassphraseGating', 'replacePassphraseMutationOptions', 'useReplacePassphrase', 'addPasskeyGating', 'addPasskeyMutationOptions', 'useAddPasskey',
      'revokePasskeyGating', 'revokePasskeyMutationOptions', 'useRevokePasskey', 'dismissUnlock',
    ])
  })

  it("refuses any other banklabel", () => {
    const { Giver } = setup()
    for (const banklabel of ['other', '']) {
      TH.expectSyncRefusal(() => Giver.forBank(banklabel), 'bad_scope')
    }
  })
})

describe("useBoxRecord", () => {
  it("shows the whole record once fetched", async () => {
    const { world, Acme, wrapper } = setup()
    const record = TH.fakeBoxRecordOf(OpenaiPath, 1)
    world.stored.set(OpenaiPath, record)
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

  it("answers null for a deleted box, and hands a select of its own the tombstone", async () => {
    const { world, Acme, wrapper } = setup()
    const tombstone = Object.freeze({ ...TH.fakeBoxRecordOf(OpenaiPath, 2), am: 'x' as const })
    world.stored.set(OpenaiPath, tombstone)
    const shown    = renderHook(() => Acme.useBoxRecord(OpenaiPath), { wrapper })
    const selected = renderHook(() => Acme.useBoxRecord(OpenaiPath, { select: (record) => record }), { wrapper })
    await waitFor(() => { expect(shown.result.current.isSuccess).to.eq(true) })
    await waitFor(() => { expect(selected.result.current.isSuccess).to.eq(true) })
    expect([shown.result.current.data, selected.result.current.data]).to.deep.equal([null, tombstone])
  })

  it("stays fresh until the host's item is invalidated, and then fetches again", async () => {
    const { world, Acme, client, wrapper } = setup()
    const first = TH.fakeBoxRecordOf(OpenaiPath, 1)
    world.stored.set(OpenaiPath, first)
    await client.query(Acme.boxRecordQueryOptions(OpenaiPath))
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath), { wrapper })
    expect([result.current.data, result.current.isStale]).to.deep.equal([first, false])
    const { queryKey } = Acme.boxRecordQueryOptions(OpenaiPath)
    expect(client.getQueryState(queryKey)?.dataUpdateCount).to.eq(1)
    await act(() => client.invalidateQueries({ queryKey }))
    await waitFor(() => { expect(client.getQueryState(queryKey)?.dataUpdateCount).to.eq(2) })
    expect([result.current.data, result.current.isStale]).to.deep.equal([first, false])
  })

  it("fetches while the browser is offline", async () => {
    const { world, Acme, wrapper } = setup()
    onlineManager.setOnline(false)
    onTestFinished(() => { onlineManager.setOnline(true) })
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath), { wrapper })
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    expect(world.counts.gets).to.eq(1)
  })

  it("prefers React Query's own options to the giver's defaults", async () => {
    const { world, Acme, wrapper } = setup()
    world.stored.set(OpenaiPath, TH.fakeBoxRecordOf(OpenaiPath, 1))
    const idle = renderHook(() => Acme.useBoxRecord(OpenaiPath, { enabled: false }), { wrapper })
    expect([idle.result.current.fetchStatus, world.counts.gets]).to.deep.equal(['idle', 0])
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath, { staleTime: 0 }), { wrapper })
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    expect(result.current.isStale).to.eq(true)
  })

  it("hands a host's select the whole record", async () => {
    const { world, Acme, wrapper } = setup()
    world.stored.set(OpenaiPath, TH.fakeBoxRecordOf(OpenaiPath, 2))
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath, { select: (record) => record.revseq }), { wrapper })
    await waitFor(() => { expect(result.current.data).to.eq(2) })
  })

  it("shows the new box's record when the labelpath changes under a select that returns records", async () => {
    const { world, Acme, client, wrapper } = setup()
    const AnthropicPath = 'box/anthropic'
    world.stored.set(OpenaiPath, TH.fakeBoxRecordOf(OpenaiPath, 5))
    world.stored.set(AnthropicPath, TH.fakeBoxRecordOf(AnthropicPath, 1))
    await client.query(Acme.boxRecordQueryOptions(AnthropicPath))
    const { result, rerender } = renderHook(({ labelpath }) => Acme.useBoxRecord(labelpath, { select: (record) => ({ ...record }) }), { wrapper, initialProps: { labelpath: OpenaiPath } })
    await waitFor(() => { expect(result.current.data?.labelpath).to.eq(OpenaiPath) })
    rerender({ labelpath: AnthropicPath })
    await waitFor(() => { expect(result.current.isFetching).to.eq(false) })
    expect(result.current.data?.labelpath).to.eq(AnthropicPath)
  })

  it("shows what a new select returns from the same record, when it returns records", async () => {
    const { world, Acme, wrapper } = setup()
    world.stored.set(OpenaiPath, TH.fakeBoxRecordOf(OpenaiPath, 1))
    const { result, rerender } = renderHook(({ title }) => Acme.useBoxRecord(OpenaiPath, { select: (record) => ({ ...record, title }) }), { wrapper, initialProps: { title: 'OpenAI' } })
    await waitFor(() => { expect(result.current.data?.title).to.eq('OpenAI') })
    rerender({ title: 'Open AI' })
    expect(result.current.data?.title).to.eq('Open AI')
  })

  it("refuses a labelpath that is not a string", () => {
    const { Acme, wrapper } = setup()
    for (const labelpath of [42, null, '']) {
      TH.expectSyncRefusal(() => renderHook(() => Acme.useBoxRecord(labelpath as never), { wrapper }), 'bad_record')
    }
  })
})

describe("boxRecordQueryOptions", () => {
  it("gives a host's useQuery the whole record", async () => {
    const { world, Acme, wrapper } = setup()
    const record = TH.fakeBoxRecordOf(OpenaiPath, 1)
    world.stored.set(OpenaiPath, record)
    const { result } = renderHook(() => useQuery(Acme.boxRecordQueryOptions(OpenaiPath)), { wrapper })
    await waitFor(() => { expect(result.current.data).to.eq(record) })
  })

  it("keys the record as the bank's minder keys its item", () => {
    const { Acme } = setup()
    expect(Acme.boxRecordQueryOptions(OpenaiPath).queryKey).to.deep.equal(['sok', 'u1', 'acme', 'item', 'box', '/', 'openai', '!'])
  })

  it("lets a fetch ahead of render fill the item that useBoxRecord then shows at once", async () => {
    const { world, Acme, client, wrapper } = setup()
    const record = TH.fakeBoxRecordOf(OpenaiPath, 1)
    world.stored.set(OpenaiPath, record)
    await client.query(Acme.boxRecordQueryOptions(OpenaiPath))
    const { result } = renderHook(() => Acme.useBoxRecord(OpenaiPath), { wrapper })
    expect([result.current.data, world.counts.gets]).to.deep.equal([record, 1])
  })

  it("never replaces a record with an older one", async () => {
    const { world, Acme, client } = setup()
    const first = TH.fakeBoxRecordOf(OpenaiPath, 1)
    world.stored.set(OpenaiPath, first)
    const { queryKey } = Acme.boxRecordQueryOptions(OpenaiPath)
    await client.query(Acme.boxRecordQueryOptions(OpenaiPath))
    const second = TH.fakeBoxRecordOf(OpenaiPath, 2)
    client.setQueryData(queryKey, second)
    client.setQueryData(queryKey, structuredClone(first))
    expect(client.getQueryData(queryKey)).to.eq(second)
  })
})
