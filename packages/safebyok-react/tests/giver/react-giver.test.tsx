import { QueryClient, QueryClientProvider, type UseMutationOptions, onlineManager, useMutation, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { PendingBank, VaultError } from 'safebyok'
import { describe, expect, it, onTestFinished } from 'vitest'
import { makeReactGiver } from '../../src/giver/react-giver'
import * as TH from '../test-helpers'

const OpenaiPath = 'box/openai'

type AcmeGiver = ReturnType<typeof setup>['Acme']

/** A passkey answer, an obvious fake: what a WebAuthn ceremony with the PRF extension hands the host. */
const FakePasskeyAnswer = Object.freeze({ credential_id: 'fake-credential', prfBytes: new Uint8Array(32).fill(7) })

/** Each form verb, its mutationOptions and its hook, and the cleartexts a form hands it, obvious fakes. */
const FormCases = [
  ["birth",             (acme: AcmeGiver) => acme.birthMutationOptions(),             (acme: AcmeGiver) => acme.useBirth(),             { passphraseClear: "fake new passphrase" }],
  ["unlock",            (acme: AcmeGiver) => acme.unlockMutationOptions(),            (acme: AcmeGiver) => acme.useUnlock(),            { passphraseClear: "fake passphrase" }],
  ["replacePassphrase", (acme: AcmeGiver) => acme.replacePassphraseMutationOptions(), (acme: AcmeGiver) => acme.useReplacePassphrase(), { passkeyClear: FakePasskeyAnswer, nextPassphraseClear: "fake new passphrase" }],
  ["addPasskey",        (acme: AcmeGiver) => acme.addPasskeyMutationOptions(),        (acme: AcmeGiver) => acme.useAddPasskey(),        { passphraseClear: "fake passphrase", nextPasskeyClear: FakePasskeyAnswer }],
  ["revokePasskey",     (acme: AcmeGiver) => acme.revokePasskeyMutationOptions(),     (acme: AcmeGiver) => acme.useRevokePasskey(),     { passkeyClear: FakePasskeyAnswer }],
] as const

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
    expect(Object.keys(Giver.forBank('acme'))).to.deep.equal([
      'useBankSnapshot', 'useBoxRecord', 'boxCarQueryOptions',
      'birthMutationOptions', 'useBirth', 'unlockMutationOptions', 'useUnlock', 'replacePassphraseMutationOptions', 'useReplacePassphrase',
      'addPasskeyMutationOptions', 'useAddPasskey', 'revokePasskeyMutationOptions', 'useRevokePasskey', 'dismissUnlock',
    ])
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
})

describe("the form mutations", () => {
  for (const [verb, optionsOf, useForm, cleartexts] of FormCases) {
    it(`runs the bank's ${verb} through its mutationOptions`, async () => {
      const { world, Acme, wrapper } = setup()
      const { result } = renderHook(() => useMutation(optionsOf(Acme) as UseMutationOptions<void, Error, object>), { wrapper })
      await act(() => result.current.mutateAsync({ ...cleartexts }))
      expect(world.formCalls).to.deep.equal([{ verb, cleartexts }])
    })

    it(`runs the bank's ${verb} through its hook`, async () => {
      const { world, Acme, wrapper } = setup()
      const { result } = renderHook(() => useForm(Acme), { wrapper })
      act(() => { result.current.mutate({ ...cleartexts } as never) })
      await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
      expect(world.formCalls).to.deep.equal([{ verb, cleartexts }])
    })
  }

  it("takes the cleartexts out of the object handed to mutate, so React Query keeps none of them", async () => {
    const { world, Acme, client, wrapper } = setup()
    const { result } = renderHook(() => Acme.useUnlock(), { wrapper })
    const handed = { passphraseClear: "fake passphrase" }
    await act(() => result.current.mutateAsync(handed))
    expect(handed).to.deep.equal({})
    expect(client.getMutationCache().getAll().map((mutation) => mutation.state.variables)).to.deep.equal([{}])
    expect(world.formCalls).to.deep.equal([{ verb: 'unlock', cleartexts: { passphraseClear: "fake passphrase" } }])
  })

  it("hands the verb what is not an object, for the verb to refuse", async () => {
    const { world, Acme, wrapper } = setup()
    const { result } = renderHook(() => Acme.useUnlock(), { wrapper })
    await act(() => result.current.mutateAsync(null as never))
    expect(world.formCalls).to.deep.equal([{ verb: 'unlock', cleartexts: null }])
  })

  it("reports the verb's refusal as the mutation's error", async () => {
    const { world, Acme, wrapper } = setup()
    const refusal = new VaultError('wrong_passphrase', 'That passphrase does not unlock the bank.')
    world.refuseFormVerbs(refusal)
    const { result } = renderHook(() => Acme.useUnlock(), { wrapper })
    act(() => { result.current.mutate({ passphraseClear: "fake wrong passphrase" }) })
    await waitFor(() => { expect(result.current.error).to.eq(refusal) })
    expect(refusal.family).to.eq('condition')
  })

  it("keys each form mutation under the bank", () => {
    const { Acme } = setup()
    expect(Acme.unlockMutationOptions().mutationKey).to.deep.equal(['sok', 'u1', 'acme', 'unlock'])
    expect(Acme.addPasskeyMutationOptions().mutationKey).to.deep.equal(['sok', 'u1', 'acme', 'addPasskey'])
  })
})

describe("dismissUnlock", () => {
  it("dismisses the bank's wait for an unlock", async () => {
    const { world, Acme } = setup()
    await Acme.dismissUnlock()
    expect(world.formCalls).to.deep.equal([{ verb: 'dismissUnlock', cleartexts: undefined }])
  })
})

describe("useStrengthVerdict", () => {
  it("judges a new passphrase, pending until the verdict lands", async () => {
    const { world, Giver, wrapper } = setup()
    const { result } = renderHook(() => Giver.useStrengthVerdict(), { wrapper })
    expect([result.current.verdict, result.current.isJudging]).to.deep.equal([null, false])
    const release = world.pauseVerdicts()
    let judging: Promise<void> = Promise.resolve()
    act(() => { judging = result.current.judge("short") })
    expect([result.current.verdict, result.current.isJudging]).to.deep.equal([null, true])
    release()
    await act(() => judging)
    expect([result.current.verdict, result.current.isJudging]).to.deep.equal([TH.fakeVerdictOf("short"), false])
    await act(() => result.current.judge("a fake passphrase long enough"))
    expect(result.current.verdict).to.deep.equal({ strong: true })
  })

  it("keeps the last verdict while the next is judged", async () => {
    const { world, Giver, wrapper } = setup()
    const { result } = renderHook(() => Giver.useStrengthVerdict(), { wrapper })
    await act(() => result.current.judge("short"))
    const release = world.pauseVerdicts()
    let judging: Promise<void> = Promise.resolve()
    act(() => { judging = result.current.judge("a fake passphrase long enough") })
    expect([result.current.verdict, result.current.isJudging]).to.deep.equal([TH.fakeVerdictOf("short"), true])
    release()
    await act(() => judging)
    expect(result.current.verdict).to.deep.equal({ strong: true })
  })

  it("reports the checker's refusal as lastErr, with no verdict", async () => {
    const { world, Giver, wrapper } = setup()
    const { result } = renderHook(() => Giver.useStrengthVerdict(), { wrapper })
    await act(() => result.current.judge("short"))
    const refusal = new VaultError('unexpected_error', 'The strength checker failed.')
    world.refuseVerdicts(refusal)
    await act(() => result.current.judge("a fake passphrase long enough"))
    expect([result.current.verdict, result.current.isJudging, result.current.lastErr]).to.deep.equal([null, false, refusal])
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
