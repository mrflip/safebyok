import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { type BankSnapshot, type Gating, MemoryVaultDB, isVaultError } from 'safebyok'
import * as LeanTH from 'safebyok/testing'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { reactGiver } from '../../src/giver/react-giver'
import * as TH from '../test-helpers'

const Passphrase = LeanTH.TestPassphrase

/** A passphrase the held checker finds strong, an obvious fake. */
const NewPassphrase = 'a fake new passphrase'

/** `hook` over a fresh world built from `given`, rendered under its provider with `opts` (signed in as the world's user unless they say otherwise).
 * Change `treeOpts` and call `rerender` to render the provider again with them.
 */
async function renderUnder<ResultT>(hook: (world: TH.ProviderWorld) => ResultT, given: TH.ProviderWorldGiven = {}, opts: Partial<TH.ProviderTreeOpts> = {}) {
  const world = await TH.buildProviderWorld(given)
  const treeOpts: TH.ProviderTreeOpts = { userid: TH.ProviderUser, ...opts }
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, treeOpts) }
  const rendered = renderHook(() => hook(world), { wrapper: Wrapper })
  return { world, treeOpts, ...rendered }
}

/** The bank's stage, read by `useBank`, and every stage it rendered with, the first among them. */
function useStageSeen(world: TH.ProviderWorld, seen: BankSnapshot['stage'][]) {
  const stage = world.Bank.useBank((bank) => bank.stage)
  seen.push(stage)
  return stage
}

/** Count the calls to `vacate` on `gating`, from here on: a gating freezes, so the spy goes on the class that defines `vacate`. */
function watchVacates(gating: Gating) {
  let proto = Object.getPrototypeOf(gating) as object
  while (! Object.hasOwn(proto, 'vacate')) { proto = Object.getPrototypeOf(proto) as object }
  const spy = vi.spyOn(proto as Gating, 'vacate')
  onTestFinished(() => { spy.mockRestore() })
  return { countOf: () => spy.mock.contexts.filter((context) => context === gating).length }
}

describe("reactGiver", () => {
  const ConfigCases = [
    [undefined,                                                                               'refuses a config left out'],
    [{ keyDeriver: LeanTH.testDeriver },                                                      'refuses a config with no banks'],
    [{ banks: {}, keyDeriver: LeanTH.testDeriver },                                           'refuses a config naming no bank'],
    [{ banks: { acme: { vaultDB: new MemoryVaultDB() }, beta: { vaultDB: new MemoryVaultDB() } }, keyDeriver: LeanTH.testDeriver }, 'refuses a config naming two banks'],
    [{ banks: { 'not a label': { vaultDB: new MemoryVaultDB() } }, keyDeriver: LeanTH.testDeriver }, 'refuses a bank whose banklabel is not a label'],
    [{ banks: { acme: {} }, keyDeriver: LeanTH.testDeriver },                                 'refuses a bank with no vaultDB'],
    [{ banks: { acme: { vaultDB: {} } }, keyDeriver: LeanTH.testDeriver },                    'refuses a bank whose vaultDB lacks its verbs'],
  ] as const
  for (const [config, blurb] of ConfigCases) {
    it(blurb, () => { TH.expectSyncRefusal(() => reactGiver(config as never), 'bad_record') })
  }

  // reactGiver @example
  it("gives the provider, the strength hook, and the bank's hooks and calls", async () => {
    const { SOK } = await TH.buildProviderWorld()
    expect(Object.keys(SOK)).to.deep.equal(['Provider', 'useStrengthVerdict', 'bank'])
    expect(Object.keys(SOK.bank('acme'))).to.deep.equal([
      'useBank', 'useBoxRecord', 'withWhisper', 'lock', 'dismissUnlock',
      'useBirth', 'useUnlock', 'useReplacePassphrase', 'useAddPasskey', 'useRevokePasskey',
    ])
  })

  it("refuses any other banklabel", async () => {
    const { SOK } = await TH.buildProviderWorld()
    for (const banklabel of ['other', '']) {
      TH.expectSyncRefusal(() => SOK.bank(banklabel), 'bad_scope')
    }
  })
})

describe("the provider", () => {
  it("shows signed_out, and starts nothing, while it has no userid", async () => {
    const seen: BankSnapshot['stage'][] = []
    const { world, result } = await renderUnder((world) => useStageSeen(world, seen), { stored: 'jokes' }, { userid: undefined })
    expect(result.current).to.eq('signed_out')
    expect(world.counts.watches).to.eq(0)
  })

  it("starts the user's device when a userid arrives, showing starting until its bank is found locked", async () => {
    const seen: BankSnapshot['stage'][] = []
    const { world, result } = await renderUnder((world) => useStageSeen(world, seen), { stored: 'jokes' })
    expect(seen[0]).to.eq('starting')
    await waitFor(() => { expect(result.current).to.eq('locked') })
    expect(seen).to.not.include('signed_out')
    expect(world.counts.watches).to.eq(1)
  })

  it("shows unborn for a user with no bank stored", async () => {
    const { result } = await renderUnder((world) => world.Bank.useBank((bank) => bank.stage))
    await waitFor(() => { expect(result.current).to.eq('unborn') })
  })

  it("changes nothing when the userid goes null", async () => {
    const { world, result, treeOpts, rerender } = await renderUnder((world) => world.Bank.useBank((bank) => bank.stage), { stored: 'jokes' })
    await waitFor(() => { expect(result.current).to.eq('locked') })
    treeOpts.userid = null
    rerender()
    expect(result.current).to.eq('locked')
    treeOpts.userid = TH.ProviderUser
    rerender()
    expect([result.current, world.counts.watches]).to.deep.equal(['locked', 1])
  })

  it("starts the device once under StrictMode, which runs its effect twice", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useBank((bank) => bank.stage), { stored: 'jokes' }, { isStrict: true })
    await waitFor(() => { expect(result.current).to.eq('locked') })
    expect(world.counts.watches).to.eq(1)
  })

  it("shows starting, in the same render, under a userid other than its device's", async () => {
    const seen: BankSnapshot['stage'][] = []
    const { result, treeOpts, rerender } = await renderUnder((world) => useStageSeen(world, seen), { stored: 'jokes' })
    await waitFor(() => { expect(result.current).to.eq('locked') })
    treeOpts.userid = 'someone_else'
    seen.length = 0
    rerender()
    expect(seen).to.deep.equal(['starting'])
  })

  it("uses the config's vaultDB and key deriver where it is handed none", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useBank((bank) => bank.stage), { stored: 'jokes', isInConfig: true }, { isBare: true })
    await waitFor(() => { expect(result.current).to.eq('locked') })
    expect(world.counts.watches).to.eq(1)
  })

  it("refuses to render outside a QueryClientProvider", async () => {
    const { SOK } = await TH.buildProviderWorld()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    onTestFinished(() => { vi.restoreAllMocks() })
    expect(() => render(<SOK.Provider userid={TH.ProviderUser} />)).to.throw('No QueryClient set')
  })
})

describe("useBank", () => {
  it("given a selector, re-renders only when what it selects changes", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const onRender = vi.fn()
    function LockedProbe() {
      onRender()
      return <p>{world.Bank.useBank((bank) => bank.isLocked) ? 'is locked' : 'is unlocked'}</p>
    }
    function StageProbe() { return <p>{world.Bank.useBank((bank) => bank.stage)}</p> }
    render(TH.providerTreeOf(world, <><LockedProbe /><StageProbe /></>, { userid: TH.ProviderUser }))
    await screen.findByText('locked')
    // `starting` and `locked` are both locked.
    expect(screen.getByText('is locked')).to.exist
    expect(onRender).toHaveBeenCalledOnce()
  })
})

/** What a test calls of any form verb's hook. */
type AnyForm = Readonly<{ mutate: (gating: Gating) => void, gating: (cleartexts: never) => Gating }>

/** Each form verb, the stage it runs at, its hook, and the cleartexts a form hands it, obvious fakes, new at each call. */
const FormCases = [
  ["birth",             'unborn', (world: TH.ProviderWorld): AnyForm => world.Bank.useBirth(),             () => ({ passphraseCleartext: NewPassphrase })],
  ["unlock",            'locked', (world: TH.ProviderWorld): AnyForm => world.Bank.useUnlock(),            () => ({ passphraseCleartext: Passphrase })],
  ["replacePassphrase", 'locked', (world: TH.ProviderWorld): AnyForm => world.Bank.useReplacePassphrase(), () => ({ passphraseCleartext: Passphrase, nextPassphraseCleartext: NewPassphrase })],
  ["addPasskey",        'locked', (world: TH.ProviderWorld): AnyForm => world.Bank.useAddPasskey(),        () => ({ passphraseCleartext: Passphrase, nextPasskeyCleartext: LeanTH.passkeyAnswerOf() })],
  ["revokePasskey",     'locked', (world: TH.ProviderWorld): AnyForm => world.Bank.useRevokePasskey(),     () => ({ passphraseCleartext: Passphrase })],
] as const

/** A form verb's hook, beside the bank's stage, rendered over a world at `stage`, once the bank shows it. */
async function renderForm<FormT extends AnyForm>(useForm: (world: TH.ProviderWorld) => FormT, stage: 'unborn' | 'locked') {
  const rendered = await renderUnder((world) => ({ form: useForm(world), bank: world.Bank.useBank() }), { stored: (stage === 'unborn') ? 'none' : 'jokes' })
  await waitFor(() => { expect(rendered.result.current.bank.stage).to.eq(stage) })
  return rendered
}

describe("the form mutations", () => {
  for (const [verb, stage, useForm, cleartextsOf] of FormCases) {
    it(`runs the bank's ${verb}, leaving it unlocked`, async () => {
      const { result } = await renderForm(useForm, stage)
      act(() => { result.current.form.mutate(result.current.form.gating(cleartextsOf() as never)) })
      await waitFor(() => { expect(result.current.bank.stage).to.eq('unlocked') })
    })

    it(`vacates the gating once the bank's ${verb} runs`, async () => {
      const { result } = await renderForm(useForm, stage)
      const gating  = result.current.form.gating(cleartextsOf() as never)
      const vacates = watchVacates(gating)
      act(() => { result.current.form.mutate(gating) })
      await waitFor(() => { expect(result.current.bank.stage).to.eq('unlocked') })
      await waitFor(() => { expect(vacates.countOf()).to.equal(2) })
    })
  }

  it("reports a wrong passphrase as the mutation's error, and leaves the bank locked", async () => {
    const { result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    act(() => { result.current.form.mutate(result.current.form.gating({ passphraseCleartext: 'correct horse battery stable' })) })
    await waitFor(() => { expect(result.current.form.error).to.not.be.null })
    const err = result.current.form.error
    expect([isVaultError(err) && err.refusalkind, isVaultError(err) && err.family]).to.deep.equal(['wrong_passphrase', 'condition'])
    expect(result.current.bank.stage).to.eq('locked')
  })

  it("vacates the gating when the verb refuses", async () => {
    const { result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    const gating  = result.current.form.gating({ passphraseCleartext: 'correct horse battery stable' })
    const vacates = watchVacates(gating)
    act(() => { result.current.form.mutate(gating) })
    await waitFor(() => { expect(result.current.form.error).to.not.be.null })
    expect(vacates.countOf()).to.equal(2)
  })

  it("runs the verb once under a host's default of retrying mutations", async () => {
    const world  = await TH.buildProviderWorld({ stored: 'jokes' })
    const client = new QueryClient({ defaultOptions: { mutations: { retry: 1, retryDelay: 0 } } })
    onTestFinished(() => { client.clear() })
    function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
      return <QueryClientProvider client={client}><world.SOK.Provider userid={TH.ProviderUser} vaultDB={world.vaultDB} keyDeriver={world.deriver}>{children}</world.SOK.Provider></QueryClientProvider>
    }
    const { result } = renderHook(() => ({ form: world.Bank.useUnlock(), stage: world.Bank.useBank((bank) => bank.stage) }), { wrapper: Wrapper })
    await waitFor(() => { expect(result.current.stage).to.eq('locked') })
    act(() => { result.current.form.mutate(result.current.form.gating({ passphraseCleartext: 'correct horse battery stable' })) })
    await waitFor(() => { expect(result.current.form.error).to.not.be.null })
    expect(world.deriver.heard).to.eq(1)
  })

  it("keys each form mutation under the bank", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    act(() => { result.current.form.mutate(result.current.form.gating({ passphraseCleartext: Passphrase })) })
    await waitFor(() => { expect(result.current.bank.stage).to.eq('unlocked') })
    expect(world.client.getMutationCache().getAll().map((mutation) => mutation.options.mutationKey)).to.deep.equal([['sok', 'acme', 'unlock']])
  })

  it("refuses an unlock gating while the bank is unborn", async () => {
    const { result } = await renderForm((world) => world.Bank.useUnlock(), 'unborn')
    TH.expectSyncRefusal(() => result.current.form.gating({ passphraseCleartext: Passphrase }), 'absent_vault')
  })

  it("refuses a birth gating while nobody is signed in", async () => {
    const { result } = await renderUnder((world) => world.Bank.useBirth(), {}, { userid: null })
    TH.expectSyncRefusal(() => result.current.gating({ passphraseCleartext: NewPassphrase }), 'absent_vault')
  })
})

describe("withWhisper", () => {
  it("calls back with the box's whisper and the whole box, once the bank is unlocked", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    act(() => { result.current.form.mutate(result.current.form.gating({ passphraseCleartext: Passphrase })) })
    await waitFor(() => { expect(result.current.bank.stage).to.eq('unlocked') })
    const answer = await world.Bank.withWhisper(TH.JokesPath, (whisper, box) => [String(whisper['apiKey']), box.sidecar])
    expect(answer).to.deep.equal([TH.JokesKey, { service: 'jokes' }])
  })

  it("waits on a locked bank, wanting an unlock, and resumes once unlocked", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    const answering = world.Bank.withWhisper(TH.JokesPath, (whisper) => String(whisper['apiKey']))
    await waitFor(() => { expect(result.current.bank.isUnlockWanted).to.eq(true) })
    act(() => { result.current.form.mutate(result.current.form.gating({ passphraseCleartext: Passphrase })) })
    expect(await answering).to.eq(TH.JokesKey)
    expect(result.current.bank.isUnlockWanted).to.eq(false)
  })

  it("rejects dismissed when the wait for an unlock is dismissed", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    const answering = world.Bank.withWhisper(TH.JokesPath, (whisper) => String(whisper['apiKey']))
    await waitFor(() => { expect(result.current.bank.isUnlockWanted).to.eq(true) })
    act(() => { world.Bank.dismissUnlock() })
    await TH.expectRefusal(answering, 'dismissed')
    expect(result.current.bank.stage).to.eq('locked')
  })

  it("rethrows what its callback throws, as thrown", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    act(() => { result.current.form.mutate(result.current.form.gating({ passphraseCleartext: Passphrase })) })
    await waitFor(() => { expect(result.current.bank.stage).to.eq('unlocked') })
    const thrown = new TypeError('The joke service is down')
    await expect(world.Bank.withWhisper(TH.JokesPath, () => { throw thrown })).rejects.to.eq(thrown)
  })

  it("refuses while nobody is signed in", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    await TH.expectRefusal(world.Bank.withWhisper(TH.JokesPath, (whisper) => whisper), 'absent_vault')
  })

  it("refuses for a user with no bank stored", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useBank((bank) => bank.stage))
    await waitFor(() => { expect(result.current).to.eq('unborn') })
    await TH.expectRefusal(world.Bank.withWhisper(TH.JokesPath, (whisper) => whisper), 'absent_vault')
  })

  it("refuses a labelpath that is not a string, and a callback that is not a function", async () => {
    const world = await TH.buildProviderWorld()
    for (const labelpath of [undefined, 42, '']) {
      await TH.expectRefusal(world.Bank.withWhisper(labelpath as never, (whisper) => whisper), 'bad_record')
    }
    await TH.expectRefusal(world.Bank.withWhisper(TH.JokesPath, 'not a function' as never), 'bad_record')
  })
})

describe("lock", () => {
  it("locks an unlocked bank", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    act(() => { result.current.form.mutate(result.current.form.gating({ passphraseCleartext: Passphrase })) })
    await waitFor(() => { expect(result.current.bank.stage).to.eq('unlocked') })
    act(() => { world.Bank.lock() })
    expect(result.current.bank.stage).to.eq('locked')
  })

  it("does nothing while nobody is signed in", async () => {
    const world = await TH.buildProviderWorld()
    expect(() => { world.Bank.lock(); world.Bank.dismissUnlock() }).to.not.throw()
  })
})

describe("useBoxRecord", () => {
  it("shows the stored record once the device starts, and fetches nothing while nobody is signed in", async () => {
    const { result, treeOpts, rerender } = await renderUnder((world) => world.Bank.useBoxRecord(TH.JokesPath), { stored: 'jokes' }, { userid: null })
    expect([result.current.data, result.current.fetchStatus]).to.deep.equal([undefined, 'idle'])
    treeOpts.userid = TH.ProviderUser
    rerender()
    await waitFor(() => { expect(result.current.data?.sidecar).to.deep.equal({ service: 'jokes' }) })
  })

  it("shows a newer revision another device writes, without fetching again", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useBoxRecord(TH.JokesPath), { stored: 'jokes' })
    await waitFor(() => { expect(result.current.data?.sidecar).to.deep.equal({ service: 'jokes' }) })
    const gets = vi.spyOn(world.vaultDB, 'tryGetThing')
    await act(() => world._cheat_otherVault!.putBoxOnce(`box/${TH.JokesPath}`, { sidecar: { service: 'jokes', tier: 'pro' } }, { whisper: LeanTH.Whisper }))
    await waitFor(() => { expect(result.current.data?.sidecar).to.deep.equal({ service: 'jokes', tier: 'pro' }) })
    expect(gets).not.toHaveBeenCalled()
  })

  it("answers null for a box none is stored at", async () => {
    const { result } = await renderUnder((world) => world.Bank.useBoxRecord('nothing_here'), { stored: 'jokes' })
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    expect(result.current.data).to.be.null
  })
})

describe("useStrengthVerdict", () => {
  it("judges a new passphrase, pending until the verdict lands", async () => {
    const { world, result } = await renderUnder((world) => world.SOK.useStrengthVerdict())
    expect([result.current.verdict, result.current.isJudging]).to.deep.equal([null, false])
    const release = world.checker.hold()
    let judging: Promise<void> = Promise.resolve()
    act(() => { judging = result.current.judge('short') })
    expect([result.current.verdict, result.current.isJudging]).to.deep.equal([null, true])
    release()
    await act(() => judging)
    expect([result.current.verdict, result.current.isJudging]).to.deep.equal([TH.heldVerdictOf('short'), false])
    await act(() => result.current.judge(NewPassphrase))
    expect(result.current.verdict).to.deep.equal({ strong: true })
  })

  it("still shows the last verdict while the next is judged", async () => {
    const { world, result } = await renderUnder((world) => world.SOK.useStrengthVerdict())
    await act(() => result.current.judge('short'))
    const release = world.checker.hold()
    let judging: Promise<void> = Promise.resolve()
    act(() => { judging = result.current.judge(NewPassphrase) })
    expect([result.current.verdict, result.current.isJudging]).to.deep.equal([TH.heldVerdictOf('short'), true])
    release()
    await act(() => judging)
    expect(result.current.verdict).to.deep.equal({ strong: true })
  })

  it("returns the same judge across renders", async () => {
    const { result } = await renderUnder((world) => world.SOK.useStrengthVerdict())
    const { judge } = result.current
    await act(() => result.current.judge('short'))
    expect(result.current.judge).to.eq(judge)
  })

  it("reports the checker's refusal as lastErr, with no verdict", async () => {
    const { world, result } = await renderUnder((world) => world.SOK.useStrengthVerdict())
    await act(() => result.current.judge('short'))
    world.checker.throwing(new Error('The strength checker failed.'))
    await act(() => result.current.judge(NewPassphrase))
    expect([result.current.verdict, result.current.isJudging]).to.deep.equal([null, false])
    expect(isVaultError(result.current.lastErr) && result.current.lastErr.refusalkind).to.eq('unexpected_error')
  })

  it("reports a refusal while nobody is signed in", async () => {
    const { result } = await renderUnder((world) => world.SOK.useStrengthVerdict(), {}, { userid: null })
    await act(() => result.current.judge(NewPassphrase))
    expect(isVaultError(result.current.lastErr) && result.current.lastErr.refusalkind).to.eq('absent_vault')
  })
})
