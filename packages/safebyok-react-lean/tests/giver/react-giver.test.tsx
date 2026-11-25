import { QueryClient, QueryClientProvider, type UseMutationResult, onlineManager, useMutation, useQuery } from '@tanstack/react-query'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { type ReactNode, useActionState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { type Root, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { type WorldSnapshot, type BoxRecord, type Device, type GateRecord, type Gating, type LiveOf, type Whisper, MemoryVaultDB, Thing, VaultTSQ, isVaultError } from 'safebyok'
import * as LeanTH from 'safebyok/testing'
import { noop } from 'es-toolkit'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { liveOf, passkeyHeaderOf } from '../../src/giver/giver-defaults'
import { EmptyMaskedView, mask } from '../../src/index'
import { type PutBoxActionOpts, type PutBoxActionResult, type PutBoxMutationOptions, reactGiver } from '../../src/giver/react-giver'
import * as Phrases from '../../src/giver/phrases-giver'
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

/** `hook` and the bank's stage over a world with the joke service's key stored, rendered while the bank is still starting: its gets wait until `release` is called. */
async function renderStarting<ResultT>(hook: (world: TH.ProviderWorld) => ResultT) {
  const world = await TH.buildProviderWorld({ stored: 'jokes' })
  const release = world.pauseGets()
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, { userid: TH.ProviderUser }) }
  const rendered = renderHook(() => ({ stage: world.Bank.useWorld((snap) => snap.stage), hooked: hook(world) }), { wrapper: Wrapper })
  onTestFinished(release)
  return { world, release, ...rendered }
}

/** The bank's stage, read by `useWorld`, and every stage it rendered with, the first among them. */
function useStageSeen(world: TH.ProviderWorld, seen: WorldSnapshot['stage'][]) {
  const stage = world.Bank.useWorld((snap) => snap.stage)
  seen.push(stage)
  return stage
}

/** Count the calls to `vacate` on each gating from here on, by the gating: a gating freezes, so the spy goes on the class that defines `vacate`, found from `sample`, which is vacated. */
function watchVacates(sample: Gating) {
  sample.vacate()
  let proto = Object.getPrototypeOf(sample) as object
  while (! Object.hasOwn(proto, 'vacate')) { proto = Object.getPrototypeOf(proto) as object }
  const spy = vi.spyOn(proto as Gating, 'vacate')
  onTestFinished(() => { spy.mockRestore() })
  return { countOf: (gating: unknown) => spy.mock.contexts.filter((context) => context === gating).length }
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
  it("gives the provider, the strength hook, the devtool's masked view, and the bank's hooks and calls", async () => {
    const { SOK } = await TH.buildProviderWorld()
    expect(Object.keys(SOK)).to.deep.equal(['Provider', 'useStrengthVerdict', 'useQueryOptions', 'maskedView', 'bank'])
    expect(Object.keys(SOK.bank('acme'))).to.deep.equal([
      'useWorld', 'useStageChange', 'useGate', 'useBox', 'useBoxList', 'boxQuery', 'queryClient', 'keys', 'withWhisper', 'withLockableWhisper', 'putBoxOnce', 'delBoxOnce', 'putBoxAction', 'putBoxMutationOptions', 'useDraft', 'lock', 'dismissUnlock',
      'useBirth', 'useUnlock', 'useReplacePassphrase', 'useAddPasskey', 'useRevokePasskey',
      'gatingBirthAttempt', 'gatingUnlockAttempt', 'gatingReplacePassphraseAttempt', 'gatingAddPasskeyAttempt', 'gatingRevokePasskeyAttempt',
    ])
  })

  it("refuses any other banklabel", async () => {
    const { SOK } = await TH.buildProviderWorld()
    for (const banklabel of ['other', '']) {
      TH.expectSyncRefusal(() => SOK.bank(banklabel as never), 'bad_scope')
    }
  })
})

describe("the provider", () => {
  it("shows signed_out, and starts nothing, while it has no userid", async () => {
    const seen: WorldSnapshot['stage'][] = []
    const { world, result } = await renderUnder((world) => useStageSeen(world, seen), { stored: 'jokes' }, { userid: undefined })
    expect(result.current).to.eq('signed_out')
    expect(world.counts.watches).to.eq(0)
  })

  it("starts the user's device when a userid arrives, showing starting until its bank is found locked", async () => {
    const seen: WorldSnapshot['stage'][] = []
    const { world, result } = await renderUnder((world) => useStageSeen(world, seen), { stored: 'jokes' })
    expect(seen[0]).to.eq('starting')
    await waitFor(() => { expect(result.current).to.eq('locked') })
    expect(seen).to.not.include('signed_out')
    expect(world.counts.watches).to.eq(1)
  })

  it("shows unborn for a user with no bank stored", async () => {
    const { result } = await renderUnder((world) => world.Bank.useWorld((snap) => snap.stage))
    await waitFor(() => { expect(result.current).to.eq('unborn') })
  })

  it("changes nothing when the userid goes null", async () => {
    const { world, result, treeOpts, rerender } = await renderUnder((world) => world.Bank.useWorld((snap) => snap.stage), { stored: 'jokes' })
    await waitFor(() => { expect(result.current).to.eq('locked') })
    treeOpts.userid = null
    rerender()
    expect(result.current).to.eq('locked')
    treeOpts.userid = TH.ProviderUser
    rerender()
    expect([result.current, world.counts.watches]).to.deep.equal(['locked', 1])
  })

  it("starts one device once under StrictMode, which makes its state twice and runs its effects twice", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useWorld((snap) => snap.stage), { stored: 'jokes' }, { isStrict: true })
    await waitFor(() => { expect(result.current).to.eq('locked') })
    const signedIn = world._cheat_devices().filter((device) => device.userid !== null)
    expect([world._cheat_devices().length, signedIn.length, world.counts.watches]).to.deep.equal([2, 1, 1])
  })

  it("shows starting, in the same render, under a userid other than its device's", async () => {
    const seen: WorldSnapshot['stage'][] = []
    const { result, treeOpts, rerender } = await renderUnder((world) => useStageSeen(world, seen), { stored: 'jokes' })
    await waitFor(() => { expect(result.current).to.eq('locked') })
    treeOpts.userid = 'someone_else'
    seen.length = 0
    rerender()
    expect(seen).to.deep.equal(['starting'])
  })

  it("uses the config's vaultDB and key deriver where it is handed none", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useWorld((snap) => snap.stage), { stored: 'jokes', isInConfig: true }, { isBare: true })
    await waitFor(() => { expect(result.current).to.eq('locked') })
    expect(world.counts.watches).to.eq(1)
  })

  it("needs no QueryClientProvider for the record hooks under it", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    function BoxProbe() { return <p>{(world.Bank.useBox(TH.JokesPath).data?.sidecar['service'] as string | undefined) ?? 'pending'}</p> }
    const { container } = render(<world.SOK.Provider userid={TH.ProviderUser} vaultDB={world.vaultDB} keyDeriver={world.deriver}><BoxProbe /></world.SOK.Provider>)
    await waitFor(() => { expect(container.textContent).to.eq('jokes') })
  })

  it("signs nobody in and watches nothing in a server render, showing starting for a userid and signed_out for none", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    function StageProbe() { return <p>{world.Bank.useWorld((snap) => snap.stage)}</p> }
    const htmlOf = (userid: string | null) => renderToString(TH.providerTreeOf(world, <StageProbe />, { userid }))
    expect([htmlOf(TH.ProviderUser), htmlOf(null)]).to.deep.equal(['<p>starting</p>', '<p>signed_out</p>'])
    expect([world._cheat_devices().map((device) => device.userid), world.counts.watches]).to.deep.equal([[null, null], 0])
  })

  it("hydrates a server render with no mismatch, then starts the device", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    function StageProbe() { return <p>{world.Bank.useWorld((snap) => snap.stage)}</p> }
    const tree = TH.providerTreeOf(world, <StageProbe />, { userid: TH.ProviderUser })
    const container = document.createElement('div')
    container.innerHTML = renderToString(tree)
    document.body.append(container)
    const mismatches: unknown[] = []
    let root: Root | null = null
    act(() => { root = hydrateRoot(container, tree, { onRecoverableError: (err) => { mismatches.push(err) } }) })
    onTestFinished(() => { act(() => { root?.unmount() }); container.remove() })
    await waitFor(() => { expect(container.textContent).to.eq('locked') })
    // One device for the server render, and one for the hydration, which alone signs in.
    expect([mismatches, world._cheat_devices().map((device) => device.userid)]).to.deep.equal([[], [null, TH.ProviderUser]])
  })

  it("gives each mount a device of its own, sharing nothing with another mount of the same giver", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    function StageProbe() { return <p>{`${world.Bank.useWorld((snap) => snap.stage)} ${(world.Bank.useBox(TH.JokesPath).data?.sidecar['service'] as string | undefined) ?? ''}`}</p> }
    const one = render(TH.providerTreeOf(world, <StageProbe />, { userid: TH.ProviderUser }))
    const other = render(TH.providerTreeOf(world, <StageProbe />, { userid: TH.ProviderUser }))
    await waitFor(() => { expect([one.container.textContent, other.container.textContent]).to.deep.equal(['locked jokes', 'locked jokes']) })
    const [oneDevice, otherDevice] = world._cheat_devices() as [Device, Device]
    expect(world._cheat_devices()).to.have.lengthOf(2)
    expect([await oneDevice.ensureDevicetok(oneDevice.scope.userid) === await otherDevice.ensureDevicetok(otherDevice.scope.userid), oneDevice.vaultTsqClient === otherDevice.vaultTsqClient]).to.deep.equal([false, false])
    await act(() => oneDevice.bank!.gate.unlock({ passphraseCleartext: Passphrase }))
    expect([one.container.textContent, other.container.textContent]).to.deep.equal(['unlocked jokes', 'locked jokes'])
  })

  it("keeps its device watching the vaultDB while mounted, and once it unmounts locks the bank and stops the watch", async () => {
    const { world, result, unmount } = await renderUnder((world) => world.Bank.useWorld((snap) => snap.stage), { stored: 'jokes' })
    await waitFor(() => { expect(result.current).to.eq('locked') })
    const device = world._cheat_device()
    await act(() => device.bank!.gate.unlock({ passphraseCleartext: Passphrase }))
    expect([result.current, device.world.vaultMinder?.isWatching]).to.deep.equal(['unlocked', true])
    unmount()
    expect([device.world.getSnapshot().stage, device.world.vaultMinder?.isWatching, device.isEnabled]).to.deep.equal(['locked', false, true])
  })

  it("leaves the calls that are not hooks refusing once it unmounts, ending nothing", async () => {
    const { world, result, unmount } = await renderUnder((world) => world.Bank.useWorld((snap) => snap.stage), { stored: 'jokes' })
    await waitFor(() => { expect(result.current).to.eq('locked') })
    const device = world._cheat_device()
    expect(world.Bank.queryClient()).to.eq(device.vaultTsqClient)
    unmount()
    await TH.expectRefusal(world.Bank.withWhisper(TH.JokesPath, (whisper) => whisper), 'absent_vault')
    await TH.expectRefusal(world.Bank.gatingUnlockAttempt({ passphrase: Passphrase }), 'absent_vault')
    expect(world.Bank.queryClient()).to.not.eq(device.vaultTsqClient)
    expect(device.world.getSnapshot().stage).to.eq('locked')
  })

  it("hands maskedView its device's masked view while it is mounted, and EmptyMaskedView before or after", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    expect(world.SOK.maskedView()).to.equal(EmptyMaskedView)
    const { result, unmount } = renderHook(() => world.Bank.useWorld((snap) => snap.stage), { wrapper: ({ children }: Readonly<{ children: ReactNode }>) => TH.providerTreeOf(world, children, { userid: TH.ProviderUser }) })
    await waitFor(() => { expect(result.current).to.eq('locked') })
    const shown = world.SOK.maskedView()
    expect(shown).to.deep.equal(world._cheat_device().inspectable())
    expect(shown.bankTSQ.map(({ val }) => (val as { labelpath: string }).labelpath)).to.have.members(['bank', 'box', 'gate'])
    expect(shown.lease).to.deep.equal({ active: false })
    unmount()
    expect(world.SOK.maskedView()).to.equal(EmptyMaskedView)
  })

  it("leaves the calls that are not hooks with the provider mounted last, while two are mounted", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    function StageProbe() { return <p>{world.Bank.useWorld((snap) => snap.stage)}</p> }
    const one = render(TH.providerTreeOf(world, <StageProbe />, { userid: TH.ProviderUser }))
    const other = render(TH.providerTreeOf(world, <StageProbe />, { userid: TH.ProviderUser }))
    await waitFor(() => { expect([one.container.textContent, other.container.textContent]).to.deep.equal(['locked', 'locked']) })
    const [, otherDevice] = world._cheat_devices()
    expect(world.Bank.queryClient()).to.eq(otherDevice!.vaultTsqClient)
    one.unmount()
    expect(world.Bank.queryClient()).to.eq(otherDevice!.vaultTsqClient)
    other.unmount()
    await TH.expectRefusal(world.Bank.gatingUnlockAttempt({ passphrase: Passphrase }), 'absent_vault')
  })
})

describe("useWorld", () => {
  it("given a selector, re-renders only when what it selects changes", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const onRender = vi.fn()
    function LockedProbe() {
      onRender()
      return <p>{world.Bank.useWorld((snap) => snap.isLocked) ? 'is locked' : 'is unlocked'}</p>
    }
    function StageProbe() { return <p>{world.Bank.useWorld((snap) => snap.stage)}</p> }
    render(TH.providerTreeOf(world, <><LockedProbe /><StageProbe /></>, { userid: TH.ProviderUser }))
    // It renders at `starting` before the device is made, and again once the provider shows the device.
    await waitFor(() => { expect(world._cheat_devices()).to.have.lengthOf(1) })
    const renders = onRender.mock.calls.length
    await screen.findByText('locked')
    // `starting` and `locked` are both locked.
    expect(screen.getByText('is locked')).to.exist
    expect(onRender.mock.calls.length).to.eq(renders)
  })
})

describe("useWorld, as the roots land", () => {
  it("renders the stage they bring only once every listener to the VaultMinder has heard them", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const release = world.pauseGets()
    onTestFinished(release)
    const heard: string[] = []
    const heardAtLocked: string[][] = []
    function StageProbe() {
      const stage = world.Bank.useWorld((snap) => snap.stage)
      if (stage === 'locked') { heardAtLocked.push([...heard]) }
      return <p>{stage}</p>
    }
    render(TH.providerTreeOf(world, <StageProbe />, { userid: TH.ProviderUser }))
    await waitFor(() => { expect(world._cheat_device().world.vaultMinder).to.not.be.null })
    world._cheat_device().world.demandVaultMinder().listen({ hear: (event) => { heard.push(event.labelpath) }, onBadNews: noop })
    release()
    await screen.findByText('locked')
    expect(heardAtLocked[0]).to.include.members(['bank', 'gate', 'box'])
  })
})

describe("useStageChange", () => {
  // useStageChange @example
  it("calls back once for each change of stage, with the stage before it, under StrictMode", async () => {
    const calls: [WorldSnapshot['stage'], WorldSnapshot['stage']][] = []
    const { world, result } = await renderUnder((world) => {
      world.Bank.useStageChange((stage, prevStage) => { calls.push([stage, prevStage]) })
      return { unlock: world.Bank.useUnlock(), stage: world.Bank.useWorld((snap) => snap.stage) }
    }, { stored: 'jokes' }, { isStrict: true })
    await waitFor(() => { expect(result.current.stage).to.eq('locked') })
    await act(() => result.current.unlock.attempt({ passphrase: Passphrase }))
    await waitFor(() => { expect(result.current.stage).to.eq('unlocked') })
    act(() => { world.Bank.lock() })
    expect(calls).to.deep.equal([['locked', 'starting'], ['unlocked', 'locked'], ['locked', 'unlocked']])
  })

  it("never calls back on the first render, nor on a render at the same stage", async () => {
    const onChange = vi.fn()
    const { rerender } = await renderUnder((world) => { world.Bank.useStageChange(onChange) }, {}, { userid: null })
    rerender()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("calls the latest callback it was handed", async () => {
    const seen: string[] = []
    let label = 'first'
    const { result, rerender } = await renderUnder((world) => {
      const own = label
      world.Bank.useStageChange(() => { seen.push(own) })
      return world.Bank.useWorld((snap) => snap.stage)
    }, { stored: 'jokes' })
    label = 'second'
    rerender()
    await waitFor(() => { expect(result.current).to.eq('locked') })
    expect(seen).to.deep.equal(['second'])
  })

  it("refuses a callback that is not a function", async () => {
    const world = await TH.buildProviderWorld()
    function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, { userid: null }) }
    TH.expectSyncRefusal(() => renderHook(() => { world.Bank.useStageChange('not a function' as never) }, { wrapper: Wrapper }), 'bad_record')
  })
})

/** What a test calls of any form verb's hook. */
type AnyForm = Readonly<{ attempt: (params: never) => Promise<void>, wasRefused: () => boolean, error: Error | null }>

/** Each form verb, the stage it runs at, its hook, and the dna a form hands it, obvious fakes, new at each call. */
const FormCases = [
  ["birth",             'unborn', (world: TH.ProviderWorld): AnyForm => world.Bank.useBirth(),             () => ({ passphrase: NewPassphrase })],
  ["unlock",            'locked', (world: TH.ProviderWorld): AnyForm => world.Bank.useUnlock(),            () => ({ passphrase: Passphrase })],
  ["replacePassphrase", 'locked', (world: TH.ProviderWorld): AnyForm => world.Bank.useReplacePassphrase(), () => ({ passphrase: Passphrase, nextPassphrase: NewPassphrase })],
  ["addPasskey",        'locked', (world: TH.ProviderWorld): AnyForm => world.Bank.useAddPasskey(),        () => ({ passphrase: Passphrase, nextPasskeyAnswer: LeanTH.passkeyAnswerOf() })],
  ["revokePasskey",     'locked', (world: TH.ProviderWorld): AnyForm => world.Bank.useRevokePasskey(),     () => ({ passphrase: Passphrase })],
] as const

/** A form verb's hook, beside the bank's stage, rendered over a world at `stage`, once the bank shows it. */
async function renderForm<FormT extends AnyForm>(useForm: (world: TH.ProviderWorld) => FormT, stage: 'unborn' | 'locked') {
  const rendered = await renderUnder((world) => ({ form: useForm(world), bank: world.Bank.useWorld() }), { stored: (stage === 'unborn') ? 'none' : 'jokes' })
  await waitFor(() => { expect(rendered.result.current.bank.stage).to.eq(stage) })
  return rendered
}

/** The gating, or the maker's refusal, each of `world`'s form mutations was handed, oldest first. */
function gatingsHanded(world: TH.ProviderWorld): unknown[] {
  return world.client.getMutationCache().getAll().map((mutation) => mutation.state.variables)
}

describe("the form mutations", () => {
  for (const [verb, stage, useForm, dnaOf] of FormCases) {
    it(`runs the bank's ${verb}, leaving it unlocked`, async () => {
      const { result } = await renderForm(useForm, stage)
      await act(() => result.current.form.attempt(dnaOf() as never))
      expect(result.current.bank.stage).to.eq('unlocked')
    })

    it(`vacates the gating once the bank's ${verb} runs`, async () => {
      const { world, result } = await renderForm(useForm, stage)
      const vacates = watchVacates(world._cheat_device().birthGating(new FormData()))
      await act(() => result.current.form.attempt(dnaOf() as never))
      expect(result.current.bank.stage).to.eq('unlocked')
      await waitFor(() => { expect(vacates.countOf(gatingsHanded(world)[0])).to.equal(2) })
    })
  }

  it("reports a wrong passphrase as the mutation's error, and leaves the bank locked", async () => {
    const { result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    await act(() => result.current.form.attempt({ passphrase: 'correct horse battery stable' }))
    await waitFor(() => { expect(result.current.form.error).to.not.be.null })
    const err = result.current.form.error
    expect([isVaultError(err) && err.refusalkind, isVaultError(err) && err.family]).to.deep.equal(['wrong_passphrase', 'condition'])
    expect(result.current.bank.stage).to.eq('locked')
  })

  it("vacates the gating when the verb refuses", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    const vacates = watchVacates(world._cheat_device().birthGating(new FormData()))
    await act(() => result.current.form.attempt({ passphrase: 'correct horse battery stable' }))
    await waitFor(() => { expect(result.current.form.error).to.not.be.null })
    expect(vacates.countOf(gatingsHanded(world)[0])).to.equal(2)
  })

  it("runs the verb once under a host's default of retrying mutations", async () => {
    const world  = await TH.buildProviderWorld({ stored: 'jokes' })
    const client = new QueryClient({ defaultOptions: { mutations: { retry: 1, retryDelay: 0 } } })
    onTestFinished(() => { client.clear() })
    function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
      return <QueryClientProvider client={client}><world.SOK.Provider userid={TH.ProviderUser} vaultDB={world.vaultDB} keyDeriver={world.deriver}>{children}</world.SOK.Provider></QueryClientProvider>
    }
    const { result } = renderHook(() => ({ form: world.Bank.useUnlock(), stage: world.Bank.useWorld((snap) => snap.stage) }), { wrapper: Wrapper })
    await waitFor(() => { expect(result.current.stage).to.eq('locked') })
    await act(() => result.current.form.attempt({ passphrase: 'correct horse battery stable' }))
    await waitFor(() => { expect(result.current.form.error).to.not.be.null })
    expect(world.deriver.heard).to.eq(1)
  })

  it("keys each form mutation under the user's bank", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    await act(() => result.current.form.attempt({ passphrase: Passphrase }))
    expect(result.current.bank.stage).to.eq('unlocked')
    expect(world.client.getMutationCache().getAll().map((mutation) => mutation.options.mutationKey)).to.deep.equal([['sok', TH.ProviderUser, 'acme', 'unlock']])
  })

  it("resolves a birth refused while nobody is signed in, the refusal its error, and the mutation handed the refusal alone", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useBirth(), {}, { userid: null })
    await act(() => result.current.attempt({ passphrase: NewPassphrase }))
    expect(result.current.wasRefused()).to.be.true
    await waitFor(() => { expect(result.current.error).to.include({ refusalkind: 'absent_vault' }) })
    expect(gatingsHanded(world)).to.deep.equal([result.current.error])
    expect(JSON.stringify(gatingsHanded(world))).to.not.include(NewPassphrase)
  })
})

/** A `FormData` holding `texts`, by fieldname, as a form hands its action. */
function formOf(texts: Readonly<Record<string, string>>): FormData {
  const form = new FormData()
  for (const [fieldname, text] of Object.entries(texts)) { form.append(fieldname, text) }
  return form
}

/** Each form verb a form can run, the stage it runs at, its hook, and the form it is handed, obvious fakes, new at each call. */
const AttemptCases = [
  ["birth",             'unborn', (world: TH.ProviderWorld) => world.Bank.useBirth(),             () => formOf({ username: 'hue', passphrase: NewPassphrase, confirmation: NewPassphrase })],
  ["unlock",            'locked', (world: TH.ProviderWorld) => world.Bank.useUnlock(),            () => formOf({ username: 'hue', passphrase: Passphrase })],
  ["replacePassphrase", 'locked', (world: TH.ProviderWorld) => world.Bank.useReplacePassphrase(), () => formOf({ username: 'hue', passphrase: Passphrase, nextPassphrase: NewPassphrase, confirmation: NewPassphrase })],
  ["revokePasskey",     'locked', (world: TH.ProviderWorld) => world.Bank.useRevokePasskey(),     () => formOf({ username: 'hue', passphrase: Passphrase })],
] as const

describe("a form verb's attempt", () => {
  for (const [verb, stage, useForm, formOfCase] of AttemptCases) {
    it(`runs the bank's ${verb} from a form, taking out its secret fields before anything is awaited and leaving the username`, async () => {
      const { result } = await renderForm(useForm as (world: TH.ProviderWorld) => AnyForm & { attempt: (form: FormData) => Promise<void> }, stage)
      const form = formOfCase()
      await act(async () => {
        const attempting = result.current.form.attempt(form)
        expect([...form.keys()]).to.deep.equal(['username'])
        await attempting
      })
      expect(result.current.bank.stage).to.eq('unlocked')
    })
  }

  it("adds a passkey from a dna", async () => {
    const { result } = await renderForm((world) => world.Bank.useAddPasskey(), 'locked')
    await act(() => result.current.form.attempt({ passphrase: Passphrase, nextPasskeyAnswer: LeanTH.passkeyAnswerOf() }))
    expect(result.current.bank.stage).to.eq('unlocked')
  })

  it("hands the mutation the gating, never the form: no mutation cache subscriber is told the passphrase", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    const told: unknown[] = []
    onTestFinished(world.client.getMutationCache().subscribe((event) => { told.push(event.mutation?.state.variables) }))
    await act(() => result.current.form.attempt(formOf({ passphrase: Passphrase })))
    expect(told.length).to.be.greaterThan(0)
    const texts = told.filter((variables) => variables !== undefined).map((variables) => JSON.stringify(variables))
    // Each subscriber is told the gating and nothing else: a FormData handed over would print as `{}`, whatever it held.
    expect(new Set(texts)).to.deep.equal(new Set(['"[gating]"']))
  })

  it("resolves once a refusal settles, never rejecting: the refusal is the error, and wasRefused says so until an attempt lands", async () => {
    const { result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    await act(() => result.current.form.attempt(formOf({ passphrase: 'correct horse battery stable' })))
    expect(result.current.form.wasRefused()).to.be.true
    await waitFor(() => { expect(isVaultError(result.current.form.error) && result.current.form.error.refusalkind).to.eq('wrong_passphrase') })
    await act(() => result.current.form.attempt({ passphrase: Passphrase }))
    expect([result.current.form.wasRefused(), result.current.bank.stage]).to.deep.equal([false, 'unlocked'])
  })

  it("resolves refused where the gating cannot be made at the stage shown, never rejecting, the maker's refusal its error", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'unborn')
    await act(() => result.current.form.attempt({ passphrase: Passphrase }))
    expect(result.current.form.wasRefused()).to.be.true
    await waitFor(() => { expect(result.current.form.error).to.include({ refusalkind: 'absent_vault', message: Phrases.BankAbsent }) })
    expect(gatingsHanded(world)).to.deep.equal([result.current.form.error])
  })

  it("shows the latest attempt's refusal as its error, whichever step refused, and hands the mutation no cleartext", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    const wrongPassphrase = 'correct horse battery stable'
    await act(() => result.current.form.attempt(formOf({ passphrase: wrongPassphrase })))
    await waitFor(() => { expect(result.current.form.error).to.include({ refusalkind: 'wrong_passphrase' }) })
    await act(() => result.current.form.attempt({ passphrase: [wrongPassphrase] } as never))
    await waitFor(() => { expect(result.current.form.error).to.include({ refusalkind: 'bad_record' }) })
    expect([result.current.form.wasRefused(), result.current.form.isError]).to.deep.equal([true, true])
    expect(JSON.stringify(gatingsHanded(world))).to.not.include(wrongPassphrase)
  })

  // FormMutationResult.keepTextIfRefused @example, both
  it("keeps what a form action's fields hold through a refusal, a Cancel still empties them, and React's reset empties them once the attempt lands, calling onEmptied on each reset that empties", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    let resets = 0
    const onEmptied = vi.fn()
    function UnlockByAction() {
      const unlock = world.Bank.useUnlock()
      const stage = world.Bank.useWorld((snap) => snap.stage)
      return (
        <form action={unlock.attempt} onReset={(event) => { resets += 1; unlock.keepTextIfRefused(event, onEmptied) }}>
          <input name="username" aria-label="Username" />
          <input name="passphrase" aria-label="Passphrase" />
          <button type="submit">Unlock</button>
          <button type="reset">Cancel</button>
          <p>{stage}</p>
        </form>
      )
    }
    const { container } = render(TH.providerTreeOf(world, <UnlockByAction />, { userid: TH.ProviderUser }))
    await screen.findByText('locked')
    const [username, passphrase] = [screen.getByLabelText<HTMLInputElement>('Username'), screen.getByLabelText<HTMLInputElement>('Passphrase')]
    fireEvent.change(username, { target: { value: 'hue' } })
    fireEvent.change(passphrase, { target: { value: 'correct horse battery stable' } })
    fireEvent.click(screen.getByText('Unlock'))
    await waitFor(() => { expect(resets).to.eq(1) })
    expect([username.value, passphrase.value, onEmptied.mock.calls.length]).to.deep.equal(['hue', 'correct horse battery stable', 0])
    fireEvent.click(screen.getByText('Cancel'))
    expect([resets, username.value, passphrase.value, onEmptied.mock.calls.length]).to.deep.equal([2, '', '', 1])

    fireEvent.change(username, { target: { value: 'hue' } })
    fireEvent.change(passphrase, { target: { value: Passphrase } })
    fireEvent.click(screen.getByText('Unlock'))
    await waitFor(() => { expect(resets).to.eq(3) })
    expect([username.value, passphrase.value, screen.getByText('unlocked').textContent]).to.deep.equal(['', '', 'unlocked'])
    expect(onEmptied.mock.calls.map(([event]) => (event as Event).type)).to.deep.equal(['reset', 'reset'])
    TH.expectTextUnheld(Passphrase, container, world.clients())
  })

  it("refuses an onEmptied that is not a function", async () => {
    const { result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    TH.expectSyncRefusal(() => { result.current.form.keepTextIfRefused(new Event('reset') as never, 'not a function' as never) }, 'bad_record')
  })
})

describe("the plain form calls", () => {
  it("unlock the bank from a form, with no hook", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useWorld((snap) => snap.stage), { stored: 'jokes' })
    await waitFor(() => { expect(result.current).to.eq('locked') })
    const form = formOf({ passphrase: Passphrase })
    await act(() => world.Bank.gatingUnlockAttempt(form))
    expect([result.current, [...form.keys()]]).to.deep.equal(['unlocked', []])
  })

  it("birth the bank from a dna", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useWorld((snap) => snap.stage))
    await waitFor(() => { expect(result.current).to.eq('unborn') })
    await act(() => world.Bank.gatingBirthAttempt({ passphrase: NewPassphrase }))
    expect(result.current).to.eq('unlocked')
  })
})

/** What a test calls of a form verb's plain call. */
type AnyPlainCall = (params: never) => Promise<void>

/** Each form verb at the main gate, its hook, its plain call, and what a page hands it, obvious fakes, new at each call: a form where it takes one, and a dna with a passkey answer. */
const GateVerbCases = [
  ["unlock",            (world: TH.ProviderWorld): AnyForm => world.Bank.useUnlock(),            (world: TH.ProviderWorld): AnyPlainCall => world.Bank.gatingUnlockAttempt,
    () => [formOf({ username: 'hue', passphrase: Passphrase }), { passkeyAnswer: LeanTH.passkeyAnswerOf() }]],
  ["replacePassphrase", (world: TH.ProviderWorld): AnyForm => world.Bank.useReplacePassphrase(), (world: TH.ProviderWorld): AnyPlainCall => world.Bank.gatingReplacePassphraseAttempt,
    () => [formOf({ username: 'hue', passphrase: Passphrase, nextPassphrase: NewPassphrase, confirmation: NewPassphrase }), { passkeyAnswer: LeanTH.passkeyAnswerOf(), nextPassphrase: NewPassphrase }]],
  ["addPasskey",        (world: TH.ProviderWorld): AnyForm => world.Bank.useAddPasskey(),        (world: TH.ProviderWorld): AnyPlainCall => world.Bank.gatingAddPasskeyAttempt,
    () => [{ passphrase: Passphrase, nextPasskeyAnswer: LeanTH.passkeyAnswerOf() }]],
  ["revokePasskey",     (world: TH.ProviderWorld): AnyForm => world.Bank.useRevokePasskey(),     (world: TH.ProviderWorld): AnyPlainCall => world.Bank.gatingRevokePasskeyAttempt,
    () => [formOf({ username: 'hue', passphrase: Passphrase }), { passkeyAnswer: LeanTH.passkeyAnswerOf() }]],
] as const

/** Expect `params` cleared: a form holds only its username, and a dna's passkey answer has zeroed PRF bytes. */
function expectVacated(params: FormData | Readonly<{ passkeyAnswer?: { prfBytes: Uint8Array }, nextPasskeyAnswer?: { prfBytes: Uint8Array } }>): void {
  if (params instanceof FormData) {
    expect([...params.keys()]).to.deep.equal(['username'])
    return
  }
  const answer = params.passkeyAnswer ?? params.nextPasskeyAnswer
  expect(TH.isZeroed(answer!.prfBytes)).to.be.true
}

/** `hook` and the bank's stage over a world with the joke service's key stored, rendered once the bank shows `failed`: its vaultDB cannot get the bank's roots. */
async function renderFailed<ResultT>(hook: (world: TH.ProviderWorld) => ResultT) {
  const world = await TH.buildProviderWorld({ stored: 'jokes' })
  vi.spyOn(world.vaultDB, 'tryGetWorld').mockRejectedValue(new Error('no roots here'))
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, { userid: TH.ProviderUser }) }
  const rendered = renderHook(() => ({ stage: world.Bank.useWorld((snap) => snap.stage), hooked: hook(world) }), { wrapper: Wrapper })
  await waitFor(() => { expect(rendered.result.current.stage).to.eq('failed') })
  return { world, ...rendered }
}

/** `hook` and the bank's stage over a world with the joke service's key stored, under a provider with no userid. */
async function renderSignedOut<ResultT>(hook: (world: TH.ProviderWorld) => ResultT) {
  const rendered = await renderUnder((world) => ({ stage: world.Bank.useWorld((snap) => snap.stage), hooked: hook(world) }), { stored: 'jokes' }, { userid: undefined })
  return rendered
}

/** Each stage with no bank a form verb is tested at, how to render a hook at it, and the message of its refusal. */
const NoBankStageCases = [
  ["starting", renderStarting, Phrases.BankNotStarted],
  ["failed",   renderFailed,   Phrases.BankFailed],
] as const

describe("a form verb at the main gate, refused for want of a bank", () => {
  for (const [stage, renderAt, message] of NoBankStageCases) {
    for (const [verb, useForm, plainCallOf, paramsOfCase] of GateVerbCases) {
      it(`clears a form's secret fields and a passkey answer, by ${verb}'s hook and its plain call, at ${stage}, refusing as the stage does`, async () => {
        const { world, result } = await renderAt(useForm)
        expect(result.current.stage).to.eq(stage)
        const [hooked, plain] = [paramsOfCase(), paramsOfCase()]
        for (const params of hooked) { await act(() => result.current.hooked.attempt(params as never)) }
        expect(result.current.hooked.wasRefused()).to.be.true
        await waitFor(() => { expect(result.current.hooked.error).to.include({ refusalkind: 'absent_vault', message }) })
        expect(gatingsHanded(world).every((handed) => isVaultError(handed))).to.be.true
        for (const params of plain) {
          const refusal = await TH.expectRefusal(plainCallOf(world)(params as never), 'absent_vault')
          expect(refusal.message).to.eq(message)
        }
        for (const params of [...hooked, ...plain]) { expectVacated(params) }
        expect(result.current.stage).to.eq(stage)
      })
    }
  }

  it("clears a form's secret fields and a passkey answer while nobody is signed in, refusing as the stage does", async () => {
    const { world, result } = await renderSignedOut((world) => world.Bank.useUnlock())
    expect(result.current.stage).to.eq('signed_out')
    const [form, dna] = [formOf({ username: 'hue', passphrase: Passphrase }), { passkeyAnswer: LeanTH.passkeyAnswerOf() }]
    await act(() => result.current.hooked.attempt(form))
    expect(result.current.hooked.wasRefused()).to.be.true
    const refusal = await TH.expectRefusal(world.Bank.gatingUnlockAttempt(dna), 'absent_vault')
    expect(refusal.message).to.eq(Phrases.NobodySignedIn)
    expectVacated(form)
    expectVacated(dna)
  })

  it("clears what each plain call is handed while no provider is mounted, refusing as signed out", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    for (const verbCase of GateVerbCases) {
      const [plainCallOf, paramsOfCase] = [verbCase[2], verbCase[3]]
      for (const params of paramsOfCase()) {
        const refusal = await TH.expectRefusal(plainCallOf(world)(params as never), 'absent_vault')
        expect(refusal.message).to.eq(Phrases.NobodySignedIn)
        expectVacated(params)
      }
    }
  })
})

/** What a page hands the birth form verb, obvious fakes, new at each call: a form, and a dna with a passkey answer. */
function birthParamsOf(): [FormData, { passphrase: string, passkeyAnswer: { prfBytes: Uint8Array } }] {
  return [formOf({ username: 'hue', passphrase: NewPassphrase, confirmation: NewPassphrase }), { passphrase: NewPassphrase, passkeyAnswer: LeanTH.passkeyAnswerOf() }]
}

describe("the birth form verb, refused for want of a signed-in device", () => {
  it("clears a form's secret fields and a passkey answer, by its hook and its plain call, while nobody is signed in, refusing as signed out", async () => {
    const { world, result } = await renderSignedOut((world) => world.Bank.useBirth())
    expect(result.current.stage).to.eq('signed_out')
    const [hooked, plain] = [birthParamsOf(), birthParamsOf()]
    for (const params of hooked) { await act(() => result.current.hooked.attempt(params as never)) }
    expect(result.current.hooked.wasRefused()).to.be.true
    for (const params of plain) {
      const refusal = await TH.expectRefusal(world.Bank.gatingBirthAttempt(params as never), 'absent_vault')
      expect(refusal.message).to.eq(Phrases.NobodySignedIn)
    }
    for (const params of [...hooked, ...plain]) { expectVacated(params) }
  })

  it("clears what its plain call is handed while no provider is mounted, refusing as signed out", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    for (const params of birthParamsOf()) {
      const refusal = await TH.expectRefusal(world.Bank.gatingBirthAttempt(params as never), 'absent_vault')
      expect(refusal.message).to.eq(Phrases.NobodySignedIn)
      expectVacated(params)
    }
  })
})

/** The gate's passkey header, by `useGate`, beside the add and revoke mutations, over a world with the jokes bank stored, once it shows `locked`. */
async function renderGate() {
  const rendered = await renderUnder((world) => ({
    gate: world.Bank.useGate(), header: world.Bank.useGate({ select: passkeyHeaderOf }).data,
    add: world.Bank.useAddPasskey(), revoke: world.Bank.useRevokePasskey(), stage: world.Bank.useWorld((snap) => snap.stage),
  }), { stored: 'jokes' })
  await waitFor(() => { expect(rendered.result.current.stage).to.eq('locked') })
  await waitFor(() => { expect(rendered.result.current.gate.data).to.not.be.undefined })
  return rendered
}

/** The ciphertext of each wrapped bankKey on the gate the world's vaultDB stores. */
function storedWrapsOf(world: TH.ProviderWorld): string[] {
  const gate = world.vaultDB._cheat_things(LeanTH.WorldScope).get('gate') as GateRecord
  return [gate.wayins.main, gate.wayins.passkey0].filter((wayin) => wayin !== null).map((wayin) => wayin.bank_key_wayin_wrapped.ciphertext_b64)
}

describe("useGate", () => {
  it("answers undefined and fetches nothing while nobody is signed in", async () => {
    const { result, world } = await renderUnder((world) => world.Bank.useGate(), { stored: 'jokes' }, { userid: null })
    expect(result.current.data).to.be.undefined
    expect(world.counts.gets).to.eq(0)
  })

  it("answers null while the bank is unborn", async () => {
    const { result } = await renderUnder((world) => ({ gate: world.Bank.useGate(), stage: world.Bank.useWorld((snap) => snap.stage) }))
    await waitFor(() => { expect(result.current.stage).to.eq('unborn') })
    await waitFor(() => { expect(result.current.gate.data).to.be.null })
  })

  it("answers the stored gate with no passkey, and caches nothing of it in the giver's client", async () => {
    const { result, world } = await renderGate()
    expect(result.current.header).to.be.null
    expect(result.current.gate.data?.wayins.main.wayinkind).to.eq('passphrase')
    expect(world.Bank.queryClient().getQueryCache().findAll().map((tsqQuery) => tsqQuery.queryKey)).to.not.deep.include(VaultTSQ.itemQueryKeyOf({ ...LeanTH.WorldScope, labelpath: 'gate' }))
  })

  // useGate @example
  it("shows a passkey added, and then revoked, with no reload", async () => {
    const { result, world } = await renderGate()
    await act(() => result.current.add.attempt({ passphrase: Passphrase, nextPasskeyAnswer: LeanTH.passkeyAnswerOf() }))
    await waitFor(() => { expect(result.current.header?.wayinkind).to.eq('passkey') })
    expect(result.current.header).to.deep.equal(await TH._cheat_passkeyHeaderOf(world))
    await act(() => result.current.revoke.attempt({ passphrase: Passphrase }))
    await waitFor(() => { expect(result.current.header).to.be.null })
  })

  it("answers the same header at each render until the passkey changes", async () => {
    const { result, rerender } = await renderGate()
    await act(() => result.current.add.attempt({ passphrase: Passphrase, nextPasskeyAnswer: LeanTH.passkeyAnswerOf() }))
    await waitFor(() => { expect(result.current.header).to.not.be.null })
    const { header } = result.current
    rerender()
    expect(result.current.header).to.eq(header)
  })

  it("holds no wrapped bankKey or passphrase in the host's cache, the giver's, or the rendered tree", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    function ShowGate() {
      const { data: gate } = world.Bank.useGate()
      const add = world.Bank.useAddPasskey()
      const stage = world.Bank.useWorld((snap) => snap.stage)
      useEffect(() => { if (stage === 'locked') { void add.attempt({ passphrase: Passphrase, nextPasskeyAnswer: LeanTH.passkeyAnswerOf() }) } }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps
      return <pre>{JSON.stringify(gate)}</pre>
    }
    const { container } = render(TH.providerTreeOf(world, <ShowGate />, { userid: TH.ProviderUser }))
    await waitFor(() => { expect(container.textContent).to.contain('"wayinkind":"passkey"') })
    const wraps = storedWrapsOf(world)
    expect(wraps).to.have.lengthOf(2)
    // The whole gate is in the world's gate Thing, in neither client.
    for (const text of wraps) { TH.expectTextUnheld(text, container, world.clients()) }
    TH.expectTextUnheld(Passphrase, container, world.clients())
  })
})

describe("withWhisper", () => {
  it("calls back with the box's whisper and the whole box, once the bank is unlocked", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    await act(() => result.current.form.attempt({ passphrase: Passphrase }))
    await waitFor(() => { expect(result.current.bank.stage).to.eq('unlocked') })
    const answer = await world.Bank.withWhisper(TH.JokesPath, (whisper, box) => [String(whisper['apiKey']), box.sidecar])
    expect(answer).to.deep.equal([TH.JokesKey, { service: 'jokes' }])
  })

  it("waits on a locked bank, wanting an unlock, and resumes once unlocked", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    const answering = world.Bank.withWhisper(TH.JokesPath, (whisper) => String(whisper['apiKey']))
    await waitFor(() => { expect(result.current.bank.isUnlockWanted).to.eq(true) })
    await act(() => result.current.form.attempt({ passphrase: Passphrase }))
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
    await act(() => result.current.form.attempt({ passphrase: Passphrase }))
    await waitFor(() => { expect(result.current.bank.stage).to.eq('unlocked') })
    const thrown = new TypeError('The joke service is down')
    await expect(world.Bank.withWhisper(TH.JokesPath, () => { throw thrown })).rejects.to.eq(thrown)
  })

  it("refuses while nobody is signed in", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    await TH.expectRefusal(world.Bank.withWhisper(TH.JokesPath, (whisper) => whisper), 'absent_vault')
  })

  it("refuses for a user with no bank stored", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useWorld((snap) => snap.stage))
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

describe("withLockableWhisper", () => {
  /** The callback and `ifLocked`, each answering which it was and what it was handed. */
  const unlockedFn = vi.fn((whisper: Whisper, box: { sidecar: unknown }) => ['unlocked', String(whisper['apiKey']), box.sidecar])
  const ifLocked = vi.fn((box: BoxRecord) => ['locked', box.sidecar])

  it("calls back with the whisper on an unlocked bank", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    await act(() => result.current.form.attempt({ passphrase: Passphrase }))
    await waitFor(() => { expect(result.current.bank.stage).to.eq('unlocked') })
    expect(await world.Bank.withLockableWhisper(TH.JokesPath, unlockedFn, { ifLocked })).to.deep.equal(['unlocked', TH.JokesKey, { service: 'jokes' }])
  })

  it("calls ifLocked with the sealed record on a locked bank, wanting no unlock", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    const answer = await world.Bank.withLockableWhisper(TH.JokesPath, unlockedFn, { ifLocked })
    expect(answer).to.deep.equal(['locked', { service: 'jokes' }])
    expect(result.current.bank.isUnlockWanted).to.eq(false)
    expect(ifLocked.mock.calls.at(-1)![0]).to.not.have.property('whisper')
  })

  it("masks a field whole while the bank is locked, and to its tail while it is unlocked", async () => {
    // withLockableWhisper @example 2
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    function JokesMask() {
      const maskRef = useRef<HTMLElement>(null)
      const stage = world.Bank.useWorld((snap) => snap.stage)
      useEffect(() => {
        if ((stage !== 'locked') && (stage !== 'unlocked')) { return }
        void world.Bank.withLockableWhisper(TH.JokesPath, ({ apiKey }) => mask(String(apiKey), { tail: 4 }), { ifLocked: () => '••••••••' })
          .then((shown) => { maskRef.current!.textContent = shown })
      }, [stage])
      return <><p>{stage}</p><code ref={maskRef} /></>
    }
    const { container } = render(TH.providerTreeOf(world, <JokesMask />, { userid: TH.ProviderUser }))
    await screen.findByText('locked')
    await waitFor(() => { expect(container.querySelector('code')?.textContent).to.eq('••••••••') })
    await act(() => world.Bank.gatingUnlockAttempt({ passphrase: Passphrase }))
    await waitFor(() => { expect(container.querySelector('code')?.textContent).to.eq(mask(TH.JokesKey, { tail: 4 })) })
  })

  it("refuses on a locked bank for a box never stored", async () => {
    const { world } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    await TH.expectRefusal(world.Bank.withLockableWhisper('other', unlockedFn, { ifLocked }), 'absent_box')
  })

  it("refuses while the bank is starting, calling neither function", async () => {
    const { world, result } = await renderStarting(() => null)
    expect(result.current.stage).to.eq('starting')
    const [fn, ifLockedHere] = [vi.fn(), vi.fn()]
    const err = await TH.expectRefusal(world.Bank.withLockableWhisper(TH.JokesPath, fn, { ifLocked: ifLockedHere }), 'absent_vault')
    expect(err.message).to.eq(Phrases.BankNotStarted)
    expect([fn, ifLockedHere].map((each) => each.mock.calls.length)).to.deep.equal([0, 0])
  })

  it("refuses for a user with no bank stored", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useWorld((snap) => snap.stage))
    await waitFor(() => { expect(result.current).to.eq('unborn') })
    await TH.expectRefusal(world.Bank.withLockableWhisper(TH.JokesPath, unlockedFn, { ifLocked }), 'absent_vault')
  })

  it("refuses a callback or an ifLocked that is not a function", async () => {
    const world = await TH.buildProviderWorld()
    await TH.expectRefusal(world.Bank.withLockableWhisper(TH.JokesPath, 'not a function' as never, { ifLocked }), 'bad_record')
    for (const opts of [undefined, {}, { ifLocked: 'not a function' }]) {
      await TH.expectRefusal(world.Bank.withLockableWhisper(TH.JokesPath, unlockedFn, opts as never), 'bad_record')
    }
  })

  // withLockableWhisper @example
  it("resolves a live mask to write into the page while unlocked, and the stored one while locked", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    const maskElement = document.createElement('code')
    const showMask = async () => {
      const shown = await world.Bank.withLockableWhisper(TH.JokesPath, ({ apiKey }) => mask(String(apiKey), { tail: 4 }), { ifLocked: (box) => box.sidecar['service'] as string })
      maskElement.textContent = shown
    }
    await showMask()
    expect(maskElement.textContent).to.eq('jokes')
    await act(() => result.current.form.attempt({ passphrase: Passphrase }))
    await waitFor(() => { expect(result.current.bank.stage).to.eq('unlocked') })
    await showMask()
    expect(maskElement.textContent).to.eq(mask(TH.JokesKey, { tail: 4 }))
  })
})

describe("lock", () => {
  it("locks an unlocked bank", async () => {
    const { world, result } = await renderForm((world) => world.Bank.useUnlock(), 'locked')
    await act(() => result.current.form.attempt({ passphrase: Passphrase }))
    await waitFor(() => { expect(result.current.bank.stage).to.eq('unlocked') })
    act(() => { world.Bank.lock() })
    expect(result.current.bank.stage).to.eq('locked')
  })

  it("does nothing while nobody is signed in", async () => {
    const world = await TH.buildProviderWorld()
    expect(() => { world.Bank.lock(); world.Bank.dismissUnlock() }).to.not.throw()
  })
})

/** {@link renderUnder} over a world with the joke service's key stored, its bank unlocked once the device starts. */
async function renderUnlocked<ResultT>(hook: (world: TH.ProviderWorld) => ResultT) {
  const rendered = await renderUnder(hook, { stored: 'jokes' })
  const device = await waitFor(() => rendered.world._cheat_device())
  await act(async () => {
    await device.signin(TH.ProviderUser)
    await device.bank!.gate.unlock({ passphraseCleartext: Passphrase })
  })
  return rendered
}

/** The key the vault TSQ keeps the jokes box under, for the world's user. */
const JokesKey = VaultTSQ.itemQueryKeyOf({ ...LeanTH.WorldScope, labelpath: `box/${TH.JokesPath}` })

describe("useBox", () => {
  it("shows the stored record once the device starts, and fetches nothing while nobody is signed in", async () => {
    const { result, treeOpts, rerender } = await renderUnder((world) => world.Bank.useBox(TH.JokesPath), { stored: 'jokes' }, { userid: null })
    expect([result.current.data, result.current.fetchStatus]).to.deep.equal([undefined, 'idle'])
    treeOpts.userid = TH.ProviderUser
    rerender()
    await waitFor(() => { expect(result.current.data?.sidecar).to.deep.equal({ service: 'jokes' }) })
  })

  it("fetches nothing while the bank is starting, and the stored record once it shows locked", async () => {
    const { release, result } = await renderStarting((world) => world.Bank.useBox(TH.JokesPath))
    expect([result.current.stage, result.current.hooked.fetchStatus]).to.deep.equal(['starting', 'idle'])
    release()
    await waitFor(() => { expect(result.current.hooked.data?.sidecar).to.deep.equal({ service: 'jokes' }) })
  })

  it("answers null for a box none is stored at", async () => {
    const { result } = await renderUnder((world) => world.Bank.useBox('nothing_here'), { stored: 'jokes' })
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    expect(result.current.data).to.be.null
  })

  it("answers null for a deleted box, and hands a select of its own null", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const tombstone = await world._cheat_otherVault!.delBoxOnce(`box/${TH.JokesPath}`)
    function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, { userid: TH.ProviderUser }) }
    const { result } = renderHook(() => ({ shown: world.Bank.useBox(TH.JokesPath), whole: world.Bank.useBox(TH.JokesPath, { select: (thing) => thing }) }), { wrapper: Wrapper })
    await waitFor(() => { expect(result.current.whole.isSuccess).to.eq(true) })
    expect([result.current.shown.data, result.current.whole.data]).to.deep.equal([null, null])
    expect(tombstone.sidecar).to.deep.equal({})
  })

  it("hands a select of its own the whole record", async () => {
    const { result } = await renderUnder((world) => world.Bank.useBox(TH.JokesPath, { select: (thing) => thing?.revseq }), { stored: 'jokes' })
    await waitFor(() => { expect(result.current.data).to.eq(0) })
  })

  it("stays fresh until its item is invalidated in the giver's client, and then fetches again", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useBox(TH.JokesPath), { stored: 'jokes' })
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    expect(result.current.isStale).to.eq(false)
    const client = world.Bank.queryClient()
    const updates = client.getQueryState(JokesKey)!.dataUpdateCount
    await act(() => client.invalidateQueries({ queryKey: JokesKey }))
    await waitFor(() => { expect(client.getQueryState(JokesKey)?.dataUpdateCount).to.eq(updates + 1) })
    expect(result.current.isStale).to.eq(false)
  })

  it("fetches while the browser is offline", async () => {
    onlineManager.setOnline(false)
    onTestFinished(() => { onlineManager.setOnline(true) })
    const { result } = await renderUnder((world) => world.Bank.useBox(TH.JokesPath), { stored: 'jokes' })
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
  })

  it("takes only the options that shape what it shows, leaving the vault TSQ's own query as the giver sets it", async () => {
    const hostOpts = { staleTime: 0, gcTime: 0, retry: 3, enabled: false, structuralSharing: false, initialData: LeanTH.boxShellOf(), queryKey: ['mine'], queryFn: () => null }
    const { world, result } = await renderUnder((world) => world.Bank.useBox(TH.JokesPath, { notifyOnChangeProps: 'all', ...hostOpts } as never), { stored: 'jokes' })
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    expect([result.current.isStale, (result.current.data as BoxRecord | null)?.sidecar]).to.deep.equal([false, { service: 'jokes' }])
    const { options } = world.Bank.queryClient().getQueryCache().find({ queryKey: JokesKey, exact: true })!
    expect([options.gcTime === 0, options.retry, options.structuralSharing === false]).to.deep.equal([false, false, false])
  })

  it("shows the new box's record when the labelpath changes under a select that returns records", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    await world._cheat_otherVault!.putBoxOnce('box/puns', { sidecar: { service: 'puns' } }, { whisper: LeanTH.Whisper })
    function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, { userid: TH.ProviderUser }) }
    const { result, rerender } = renderHook(({ labelpath }) => world.Bank.useBox(labelpath, { select: (thing) => ({ ...thing }) }), { wrapper: Wrapper, initialProps: { labelpath: TH.JokesPath } })
    await waitFor(() => { expect((result.current.data as BoxRecord | undefined)?.labelpath).to.eq(`box/${TH.JokesPath}`) })
    rerender({ labelpath: 'puns' })
    await waitFor(() => { expect(result.current.isFetching).to.eq(false) })
    expect((result.current.data as BoxRecord | undefined)?.labelpath).to.eq('box/puns')
  })

  it("shows null when the labelpath changes to a box not stored, under a select that returns what it is handed", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, { userid: TH.ProviderUser }) }
    const { result, rerender } = renderHook(({ labelpath }) => world.Bank.useBox(labelpath, { select: (thing) => thing }), { wrapper: Wrapper, initialProps: { labelpath: TH.JokesPath } })
    await waitFor(() => { expect((result.current.data as BoxRecord | undefined)?.labelpath).to.eq(`box/${TH.JokesPath}`) })
    await act(() => world.Bank.queryClient().query(world.Bank.boxQuery('puns')))
    rerender({ labelpath: 'puns' })
    expect(result.current.data).to.be.null
  })

  it("shows what a new select returns from the same record, when it returns records", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, { userid: TH.ProviderUser }) }
    const { result, rerender } = renderHook(({ title }) => world.Bank.useBox(TH.JokesPath, { select: (thing) => ({ ...thing, title }) }), { wrapper: Wrapper, initialProps: { title: 'Jokes' } })
    await waitFor(() => { expect(result.current.data?.title).to.eq('Jokes') })
    rerender({ title: 'Puns' })
    expect(result.current.data?.title).to.eq('Puns')
  })

  it("refuses a labelpath that is not a string", async () => {
    const world = await TH.buildProviderWorld()
    function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, { userid: null }) }
    for (const labelpath of [42, null, '']) {
      TH.expectSyncRefusal(() => renderHook(() => world.Bank.useBox(labelpath as never), { wrapper: Wrapper }), 'bad_record')
    }
  })
})

/** The world's user's key for the listing of the root box's children, as the vault TSQ keeps it. */
const BoxListKey = VaultTSQ.listQueryKeyOf({ ...LeanTH.WorldScope, labelpath: 'box' })

describe("useBoxList", () => {
  it("lists the stored boxes once the device starts, and fetches nothing while nobody is signed in", async () => {
    const { result, treeOpts, rerender } = await renderUnder((world) => world.Bank.useBoxList(), { stored: 'jokes' }, { userid: null })
    expect([result.current.data, result.current.fetchStatus]).to.deep.equal([undefined, 'idle'])
    treeOpts.userid = TH.ProviderUser
    rerender()
    await waitFor(() => { expect(result.current.data).to.deep.equal([TH.JokesPath]) })
  })

  it("lists nothing for a user with no bank stored, its query idle while the bank is unborn", async () => {
    const { result } = await renderUnder((world) => ({ stage: world.Bank.useWorld((snap) => snap.stage), list: world.Bank.useBoxList() }), { stored: 'none' })
    await waitFor(() => { expect(result.current.stage).to.eq('unborn') })
    expect([result.current.list.data, result.current.list.status, result.current.list.fetchStatus]).to.deep.equal([undefined, 'pending', 'idle'])
  })

  it("lists once the bank is born, from an empty listing", async () => {
    const { world, result } = await renderUnder((world) => ({ stage: world.Bank.useWorld((snap) => snap.stage), list: world.Bank.useBoxList() }), { stored: 'none' })
    await waitFor(() => { expect(result.current.stage).to.eq('unborn') })
    await act(() => world.Bank.gatingBirthAttempt({ passphrase: NewPassphrase }))
    await waitFor(() => { expect(result.current.list.data).to.deep.equal([]) })
  })

  // useBoxList @example
  it("grows when a box is written, the same array until then", async () => {
    const { world, result } = await renderUnlocked((world) => world.Bank.useBoxList().data)
    await waitFor(() => { expect(result.current).to.deep.equal([TH.JokesPath]) })
    const first = result.current
    await act(() => world.Bank.putBoxOnce(TH.JokesPath, { sidecar: { service: 'jokes', tier: 'pro' } }, { whisper: LeanTH.Whisper }))
    expect(result.current).to.eq(first)
    await act(() => world.Bank.putBoxOnce('puns', { sidecar: { service: 'puns' } }, { whisper: LeanTH.Whisper }))
    await waitFor(() => { expect(result.current).to.deep.equal([TH.JokesPath, 'puns']) })
  })

  it("drops a deleted box once it lists again", async () => {
    const { world, result } = await renderUnlocked((world) => world.Bank.useBoxList().data)
    await waitFor(() => { expect(result.current).to.deep.equal([TH.JokesPath]) })
    await act(() => world.Bank.delBoxOnce(TH.JokesPath))
    await waitFor(() => { expect(result.current).to.deep.equal([]) })
  })

  it("keys the listing as the bank's vault TSQ keys it, under no key from keys.under", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useBoxList(), { stored: 'jokes' })
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    expect(world.Bank.keys.boxList()).to.deep.equal(['sok', 'u1', 'acme', 'list', 'box', '#', 'kids'])
    const client = world.Bank.queryClient()
    expect(client.getQueryData(BoxListKey)).to.have.nested.property(`items.${TH.JokesPath}`)
    await client.invalidateQueries({ queryKey: world.Bank.keys.under() })
    expect(client.getQueryState(BoxListKey)?.isInvalidated).to.eq(false)
  })
})

describe("boxQuery", () => {
  it("gives a host's useQuery what useBox answers, in the giver's client", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useWorld((snap) => snap.stage), { stored: 'jokes' })
    await waitFor(() => { expect(result.current).to.eq('locked') })
    const queried = renderHook(() => useQuery(world.Bank.boxQuery(TH.JokesPath), world.Bank.queryClient()))
    await waitFor(() => { expect(queried.result.current.data?.sidecar).to.deep.equal({ service: 'jokes' }) })
  })

  it("keys the record as the bank's vault TSQ keys its item", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useWorld((snap) => snap.stage), { stored: 'jokes' })
    await waitFor(() => { expect(result.current).to.eq('locked') })
    expect(world.Bank.boxQuery(TH.JokesPath).queryKey).to.deep.equal(['sok', 'u1', 'acme', 'item', 'box', '/', 'jokes', '!'])
  })

  // boxQuery @example
  it("lets a fetch ahead of render fill the item that useBox then shows at once", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    let shown: unknown
    function BoxProbe() {
      shown = world.Bank.useBox(TH.JokesPath).data
      return null
    }
    function StageProbe() { return <p>{world.Bank.useWorld((snap) => snap.stage)}</p> }
    const { rerender } = render(TH.providerTreeOf(world, <StageProbe />, { userid: TH.ProviderUser }))
    await screen.findByText('locked')
    const record = await world.Bank.queryClient().query(world.Bank.boxQuery(TH.JokesPath))
    const { gets } = world.counts
    rerender(TH.providerTreeOf(world, <><StageProbe /><BoxProbe /></>, { userid: TH.ProviderUser }))
    expect([shown, world.counts.gets]).to.deep.equal([record, gets])
  })

  it("never replaces a record with an older one a get answers", async () => {
    const { world, result } = await renderUnlocked((world) => world.Bank.useBox(TH.JokesPath))
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    const client = world.Bank.queryClient()
    const first = client.getQueryData(JokesKey)
    const second = await act(() => world.Bank.putBoxOnce(TH.JokesPath, { sidecar: { service: 'jokes', tier: 'pro' } }, { whisper: LeanTH.Whisper }))
    world.vaultDB._cheat_things(LeanTH.WorldScope).set(`box/${TH.JokesPath}`, first)
    const { gets } = world.counts
    await act(() => client.query({ ...world.Bank.boxQuery(TH.JokesPath), staleTime: 0 }))
    expect([client.getQueryData(JokesKey), world.counts.gets]).to.deep.equal([second, gets + 1])
  })

  it("fetches nothing while nobody is signed in", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const options = world.Bank.boxQuery(TH.JokesPath)
    expect(options.queryKey).to.deep.equal(['sok', null, 'acme', 'box/jokes'])
    await expect(world.Bank.queryClient().query(options)).rejects.toThrow('Missing queryFn')
    expect(world.counts.gets).to.eq(0)
  })
})

describe("keys", () => {
  const UnderCases = [
    ["jokes",     true,   'the box itself'],
    ["jokes_v2",  false,  'a box beside it, whose label starts the same'],
    ["puns",      false,  'another box'],
  ] as const
  for (const [labelpath, expected, blurb] of UnderCases) {
    it(`starts the key of ${blurb}: ${expected ? 'under' : 'not under'}`, async () => {
      const { world, result } = await renderUnder((world) => world.Bank.useWorld((snap) => snap.stage), { stored: 'jokes' })
      await waitFor(() => { expect(result.current).to.eq('locked') })
      const client = world.Bank.queryClient()
      client.setQueryData(world.Bank.keys.box(labelpath), LeanTH.boxShellOf())
      await client.invalidateQueries({ queryKey: world.Bank.keys.under(TH.JokesPath), refetchType: 'none' })
      expect(client.getQueryState(world.Bank.keys.box(labelpath))?.isInvalidated).to.eq(expected)
    })
  }

  it("starts every box's key when given no labelpath", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useWorld((snap) => snap.stage), { stored: 'jokes' })
    await waitFor(() => { expect(result.current).to.eq('locked') })
    expect(world.Bank.keys.under()).to.deep.equal(['sok', 'u1', 'acme', 'item', 'box'])
    expect(world.Bank.keys.box('puns')).to.deep.equal(['sok', 'u1', 'acme', 'item', 'box', '/', 'puns', '!'])
  })
})

describe("useQueryOptions", () => {
  it("gives the bank's query factories, keyed for the user shown, the same across renders", async () => {
    const { result, rerender } = await renderUnder((world) => {
      const sok = world.SOK.useQueryOptions()
      return { sok, box: useQuery(sok.acme.box(TH.JokesPath), sok.acme.client) }
    }, { stored: 'jokes' })
    await waitFor(() => { expect(result.current.box.data?.sidecar).to.deep.equal({ service: 'jokes' }) })
    const { sok } = result.current
    rerender()
    expect(result.current.sok).to.eq(sok)
    expect(sok.acme.box(TH.JokesPath).queryKey).to.deep.equal(JokesKey)
  })

  it("changes key with the user, and fetches nothing while nobody is signed in", async () => {
    const { world, result, treeOpts, rerender } = await renderUnder((world) => {
      const sok = world.SOK.useQueryOptions()
      return useQuery(sok.acme.box(TH.JokesPath), sok.acme.client)
    }, { stored: 'jokes' }, { userid: null })
    expect(result.current.fetchStatus).to.eq('idle')
    treeOpts.userid = TH.ProviderUser
    rerender()
    await waitFor(() => { expect(result.current.data?.sidecar).to.deep.equal({ service: 'jokes' }) })
    expect(world.Bank.queryClient().getQueryCache().getAll().map((entry) => entry.queryKey)).to.deep.include.members([['sok', null, 'acme', 'box/jokes'], JokesKey])
  })
})

describe("liveOf", () => {
  const box = LeanTH.boxThingOf('jokes')
  const ThingCases = [
    [box,                         box,       'answers a live record itself'],
    [LeanTH.boxTombOf(box),       null,      'answers null for a tombstone'],
    [LeanTH.boxShellOf(),         null,      'answers null for the shell, where nothing is stored'],
    [Thing.sparseOf(box),         undefined, 'answers undefined for a sparse record, whose body is not yet known'],
  ] as const
  for (const [thing, expected, blurb] of ThingCases) {
    it(blurb, () => { expect(liveOf(thing as never)).to.eq(expected) })
  }
})

describe("putBoxOnce", () => {
  it("writes the box, in the giver's query of it by the time it resolves, and useBox shows it", async () => {
    const { world, result } = await renderUnlocked((world) => world.Bank.useBox(TH.JokesPath))
    // React Query re-renders a hook only for the fields it has read.
    await waitFor(() => { expect(result.current.data).to.not.be.undefined })
    const box = await act(() => world.Bank.putBoxOnce(TH.JokesPath, { sidecar: { service: 'jokes', tier: 'pro' } }, { whisper: { apiKey: 'sk-test-1111' } }))
    expect(world.Bank.queryClient().getQueryData(JokesKey)).to.deep.equal(box)
    await waitFor(() => { expect(result.current.data).to.deep.equal(box) })
    expect(box.sidecar).to.deep.equal({ service: 'jokes', tier: 'pro' })
    expect(await world.Bank.withWhisper(TH.JokesPath, (whisper) => String(whisper['apiKey']))).to.eq('sk-test-1111')
  })

  it("writes over the newest revision this device has heard of, whatever the record that names the box", async () => {
    const { world, result } = await renderUnlocked((world) => world.Bank.useBox(TH.JokesPath))
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    const first = result.current.data!
    await act(() => world.Bank.putBoxOnce(first, { sidecar: { service: 'jokes', tier: 'pro' } }, { whisper: LeanTH.Whisper }))
    const third = await act(() => world.Bank.putBoxOnce(first, { sidecar: { service: 'jokes', tier: 'max' } }, { whisper: LeanTH.Whisper }))
    expect(third.revseq).to.eq(2)
  })

  it("writes a new box, given its sidecar", async () => {
    const { world, result } = await renderUnlocked((world) => world.Bank.useBox('puns'))
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    expect(result.current.data).to.be.null
    await act(() => world.Bank.putBoxOnce('puns', { sidecar: { service: 'puns' } }, { whisper: LeanTH.Whisper }))
    await waitFor(() => { expect(result.current.data?.sidecar).to.deep.equal({ service: 'puns' }) })
  })

  it("refuses on a locked bank, without waiting for the unlock form", async () => {
    const { world, result } = await renderUnder((world) => world.Bank.useWorld(), { stored: 'jokes' })
    await waitFor(() => { expect(result.current.stage).to.eq('locked') })
    await TH.expectRefusal(world.Bank.putBoxOnce(TH.JokesPath, { sidecar: {} }, { whisper: LeanTH.Whisper }), 'bank_locked')
    expect(result.current.isUnlockWanted).to.eq(false)
  })

  it("refuses while nobody is signed in", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    await TH.expectRefusal(world.Bank.putBoxOnce(TH.JokesPath, { sidecar: {} }, { whisper: LeanTH.Whisper }), 'absent_vault')
  })

  it("refuses what names no box", async () => {
    const world = await TH.buildProviderWorld()
    for (const boxNamed of [42, null, '', {}, { labelpath: 'gate' }, { labelpath: 'jokes' }]) {
      await TH.expectRefusal(world.Bank.putBoxOnce(boxNamed as never, { sidecar: {} }, { whisper: LeanTH.Whisper }), 'bad_record')
    }
  })
})

describe("delBoxOnce", () => {
  it("deletes the box, null in the giver's query by the time it resolves, and useBox shows null", async () => {
    const { world, result } = await renderUnlocked((world) => world.Bank.useBox(TH.JokesPath))
    await waitFor(() => { expect(result.current.isSuccess).to.eq(true) })
    const tombstone = await act(() => world.Bank.delBoxOnce(result.current.data!))
    expect(world.Bank.queryClient().getQueryData(JokesKey)).to.be.null
    await waitFor(() => { expect(result.current.data).to.be.null })
    expect(tombstone.am).to.eq('x')
    await TH.expectRefusal(world.Bank.withWhisper(TH.JokesPath, (whisper) => whisper), 'absent_box')
  })
})

/** The core's test whisper, whatever the form. */
function whisperOfAnyForm(): Whisper { return LeanTH.Whisper }

/** A key for the joke service a user types, an obvious fake. */
const TypedKey = 'sk-test-typed-4242'

/** The key editor a host would write: the stored key's mask, a form whose action is `putBoxAction`, and what the action last resolved. */
function makeKeyEditor(world: TH.ProviderWorld, opts: Partial<PutBoxActionOpts> = {}) {
  const putJokesKey = world.Bank.putBoxAction(TH.JokesPath, {
    whisperOf: (form) => ({ apiKey: form.get('apiKey') as string }),
    sidecarOf: (whisper) => ({ service: 'jokes', mask: `…${String(whisper['apiKey']).slice(-4)}` }),
    ...opts,
  })
  const seen: { result: PutBoxActionResult | null } = { result: null }
  function KeyEditor() {
    const mask = world.Bank.useBox(TH.JokesPath, { select: (thing) => liveOf(thing)?.sidecar['mask'] }).data
    const [result, putAction, isPutting] = useActionState(putJokesKey, null)
    // A layout effect, so a test reads it as soon as the page shows it.
    useLayoutEffect(() => { seen.result = result }, [result])
    return (
      <form action={putAction}>
        <p>{(typeof mask === 'string') ? `Key ${mask}` : 'No mask'}</p>
        <input name="title" aria-label="Title" defaultValue={result?.texts['title']} />
        <input name="apiKey" type="password" aria-label="Key" />
        <button disabled={isPutting}>Save</button>
        {(result !== null) && <output>{(result.err === null) ? 'Saved' : 'Refused'}</output>}
      </form>
    )
  }
  return { KeyEditor, seen }
}

/** Throw `val`, an `Error` or not, as a host's callback may. */
function throwValue(val: unknown): never { throw val as Error }

/** Render the key editor over a world with the joke service's key stored, its bank unlocked. */
async function renderKeyEditor(opts: Partial<PutBoxActionOpts> = {}) {
  const world = await TH.buildProviderWorld({ stored: 'jokes' })
  const editor = makeKeyEditor(world, opts)
  const rendered = render(TH.providerTreeOf(world, <editor.KeyEditor />, { userid: TH.ProviderUser }))
  const device = await waitFor(() => world._cheat_device())
  await act(async () => {
    await device.signin(TH.ProviderUser)
    await device.bank!.gate.unlock({ passphraseCleartext: Passphrase })
  })
  return { world, ...editor, ...rendered }
}

/** Type {@link TypedKey} into the key editor and save it. */
function submitKey(): void {
  fireEvent.change(screen.getByLabelText('Key'), { target: { value: TypedKey } })
  fireEvent.click(screen.getByText('Save'))
}

describe("putBoxAction", () => {
  // putBoxAction @example
  it("writes the box from the form, and useBox shows its new sidecar, with the whisper in no action result and no cache", async () => {
    const { world, seen, container } = await renderKeyEditor()
    submitKey()
    await screen.findByText('Saved')
    await screen.findByText('Key …4242')
    expect(seen.result?.box?.sidecar).to.deep.equal({ service: 'jokes', mask: '…4242' })
    expect(await world.Bank.withWhisper(TH.JokesPath, (whisper) => String(whisper['apiKey']))).to.eq(TypedKey)
    const kept = [seen.result, TH.reactTreeOf(container), world.client.getQueryCache().getAll(), world.client.getMutationCache().getAll(), world.Bank.queryClient().getQueryCache().getAll()]
    expect(kept.map((each) => TH.holdsText(each, TypedKey))).to.deep.equal([false, false, false, false, false])
  })

  it("empties the form before it writes, so no render sees the whisper in its FormData", async () => {
    const forms: FormData[] = []
    const { world } = await renderKeyEditor({ whisperOf: (form) => {
      forms.push(form)
      return { apiKey: form.get('apiKey') as string }
    } })
    const release = world.pauseGets()
    submitKey()
    await waitFor(() => { expect(forms).to.have.lengthOf(1) })
    expect([...forms[0]!.keys()]).to.deep.equal([])
    release()
    await screen.findByText('Saved')
  })

  it("resolves a refusal as its error, and never rejects", async () => {
    const { world, seen } = await renderKeyEditor()
    act(() => { world.Bank.lock() })
    submitKey()
    await screen.findByText('Refused')
    const { err } = seen.result!
    expect(isVaultError(err) && err.refusalkind).to.eq('bank_locked')
    expect(TH.holdsText(seen.result, TypedKey)).to.eq(false)
  })

  it("resolves what whisperOf throws, as thrown, and empties the form all the same", async () => {
    const thrown = new TypeError('The key field is missing')
    const forms: FormData[] = []
    const { seen } = await renderKeyEditor({ whisperOf: (form) => {
      forms.push(form)
      throw thrown
    } })
    submitKey()
    await screen.findByText('Refused')
    expect(seen.result?.err).to.eq(thrown)
    expect([...forms[0]!.keys()]).to.deep.equal([])
  })

  it("wraps a thrown value that is no Error in an Error, the value its cause, and empties the form all the same", async () => {
    const thrown = { code: 42 }
    const forms: FormData[] = []
    const { seen } = await renderKeyEditor({ whisperOf: (form) => {
      forms.push(form)
      return throwValue(thrown)
    } })
    submitKey()
    await screen.findByText('Refused')
    expect(seen.result?.err).to.be.instanceOf(Error)
    expect(seen.result?.err?.cause).to.eq(thrown)
    expect([...forms[0]!.keys()]).to.deep.equal([])
  })

  it("deletes only the named secret fields, and a refusal carries the other fields' text back for defaultValue", async () => {
    const forms: FormData[] = []
    const { world, seen, container } = await renderKeyEditor({ secretFieldnames: ['apiKey'], whisperOf: (form) => {
      forms.push(form)
      return { apiKey: form.get('apiKey') as string }
    } })
    act(() => { world.Bank.lock() })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My jokes key' } })
    submitKey()
    await screen.findByText('Refused')
    expect(seen.result?.texts).to.deep.equal({ title: 'My jokes key' })
    expect([...forms[0]!.keys()]).to.deep.equal(['title'])
    expect(screen.getByLabelText<HTMLInputElement>('Title').value).to.eq('My jokes key')
    expect(screen.getByLabelText<HTMLInputElement>('Key').value).to.eq('')
    const retained = [seen.result, forms, TH.reactTreeOf(container), world.client.getQueryCache().getAll(), world.client.getMutationCache().getAll(), world.Bank.queryClient().getQueryCache().getAll()]
    expect(retained.map((each) => TH.holdsText(each, TypedKey))).to.deep.equal([false, false, false, false, false, false])
  })

  it("carries no text after a write that lands, so the form comes back empty", async () => {
    const { seen } = await renderKeyEditor({ secretFieldnames: ['apiKey'] })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My jokes key' } })
    submitKey()
    await screen.findByText('Saved')
    expect(seen.result?.texts).to.deep.equal({})
    expect(screen.getByLabelText<HTMLInputElement>('Title').value).to.eq('')
  })

  it("deletes every field when it is told no secret fieldnames, and carries no text back", async () => {
    const forms: FormData[] = []
    const { world, seen } = await renderKeyEditor({ whisperOf: (form) => {
      forms.push(form)
      return { apiKey: form.get('apiKey') as string }
    } })
    act(() => { world.Bank.lock() })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My jokes key' } })
    submitKey()
    await screen.findByText('Refused')
    expect([...forms[0]!.keys()]).to.deep.equal([])
    expect(seen.result?.texts).to.deep.equal({})
  })

  it("refuses secretFieldnames that is not an array of names", async () => {
    const world = await TH.buildProviderWorld()
    const whisperOf = whisperOfAnyForm
    TH.expectSyncRefusal(() => world.Bank.putBoxAction(TH.JokesPath, { whisperOf, secretFieldnames: 'apiKey' as never }), 'bad_record')
    TH.expectSyncRefusal(() => world.Bank.putBoxAction(TH.JokesPath, { whisperOf, secretFieldnames: [''] }), 'bad_record')
  })

  it("keeps the box's sidecar when it has no sidecarOf", async () => {
    const { world } = await renderKeyEditor({ sidecarOf: undefined })
    submitKey()
    await screen.findByText('Saved')
    expect(world.Bank.queryClient().getQueryData<BoxRecord>(JokesKey)?.sidecar).to.deep.equal({ service: 'jokes' })
  })

  it("refuses what names no box, and a whisperOf or sidecarOf that is not a function", async () => {
    const world = await TH.buildProviderWorld()
    const whisperOf = whisperOfAnyForm
    TH.expectSyncRefusal(() => world.Bank.putBoxAction('', { whisperOf }), 'bad_record')
    TH.expectSyncRefusal(() => world.Bank.putBoxAction(TH.JokesPath, {} as never), 'bad_record')
    TH.expectSyncRefusal(() => world.Bank.putBoxAction(TH.JokesPath, { whisperOf, sidecarOf: 'mask' as never }), 'bad_record')
  })

  it("resolves a refusal when handed something other than a FormData", async () => {
    const world = await TH.buildProviderWorld()
    const { err } = await world.Bank.putBoxAction(TH.JokesPath, { whisperOf: whisperOfAnyForm })(null, { apiKey: TypedKey } as never)
    expect(isVaultError(err) && err.refusalkind).to.eq('bad_record')
  })
})

/** The key editor of a host that writes its form as a mutation: the stored key's mask, a form whose action hands `mutate` the form, and the mutation. */
function makeMutationKeyEditor(world: TH.ProviderWorld, opts: Partial<PutBoxActionOpts> = {}) {
  const seen: { options: PutBoxMutationOptions | null, put: UseMutationResult<LiveOf<BoxRecord>, Error, FormData> | null } = { options: null, put: null }
  function KeyEditor() {
    const mask = world.Bank.useBox(TH.JokesPath, { select: (thing) => liveOf(thing)?.sidecar['mask'] }).data
    const options = useMemo(() => world.Bank.putBoxMutationOptions(TH.JokesPath, {
      whisperOf: (form) => ({ apiKey: form.get('apiKey') as string }),
      sidecarOf: (whisper) => ({ service: 'jokes', mask: `…${String(whisper['apiKey']).slice(-4)}` }),
      ...opts,
    }), [])
    const put = useMutation(options)
    useEffect(() => { seen.options = options; seen.put = put })
    return (
      <form action={(form) => { put.mutate(form) }}>
        <p>{(typeof mask === 'string') ? `Key ${mask}` : 'No mask'}</p>
        <input name="title" aria-label="Title" />
        <input name="apiKey" type="password" aria-label="Key" />
        <button disabled={put.isPending}>Save</button>
        {put.isSuccess && <output>Saved</output>}
        {put.isError && <output>Refused</output>}
      </form>
    )
  }
  return { KeyEditor, seen }
}

/** Render the mutation key editor over a world with the joke service's key stored, its bank unlocked. */
async function renderMutationKeyEditor(opts: Partial<PutBoxActionOpts> = {}) {
  const world = await TH.buildProviderWorld({ stored: 'jokes' })
  const editor = makeMutationKeyEditor(world, opts)
  const rendered = render(TH.providerTreeOf(world, <editor.KeyEditor />, { userid: TH.ProviderUser }))
  const device = await waitFor(() => world._cheat_device())
  await act(async () => {
    await device.signin(TH.ProviderUser)
    await device.bank!.gate.unlock({ passphraseCleartext: Passphrase })
  })
  return { world, ...editor, ...rendered }
}

describe("putBoxMutationOptions", () => {
  // putBoxMutationOptions @example
  it("writes the box from the form, and useBox shows its new sidecar, with the whisper in no variable, result or cache", async () => {
    const { world, seen, container } = await renderMutationKeyEditor()
    submitKey()
    await screen.findByText('Saved')
    await screen.findByText('Key …4242')
    expect(seen.put?.data?.sidecar).to.deep.equal({ service: 'jokes', mask: '…4242' })
    expect(await world.Bank.withWhisper(TH.JokesPath, (whisper) => String(whisper['apiKey']))).to.eq(TypedKey)
    const mutations = world.client.getMutationCache().getAll()
    expect(mutations).to.have.lengthOf(1)
    expect([...(mutations[0]!.state.variables as FormData).keys()]).to.deep.equal([])
    TH.expectTextUnheld(TypedKey, container, world.clients())
    expect(TH.holdsText(seen.put, TypedKey)).to.eq(false)
  })

  it("rejects with the refusal, and the form is empty and holds no secret all the same", async () => {
    const { world, seen, container } = await renderMutationKeyEditor()
    act(() => { world.Bank.lock() })
    submitKey()
    await screen.findByText('Refused')
    const err = seen.put!.error
    expect(isVaultError(err) && err.refusalkind).to.eq('bank_locked')
    const mutations = world.client.getMutationCache().getAll()
    expect([...(mutations[0]!.state.variables as FormData).keys()]).to.deep.equal([])
    TH.expectTextUnheld(TypedKey, container, world.clients())
    expect(TH.holdsText(seen.put, TypedKey)).to.eq(false)
  })

  it("sets the mutation's error to what whisperOf throws, the same object, and empties the form all the same", async () => {
    const thrown = new TypeError('The key field is missing')
    const forms: FormData[] = []
    const { seen } = await renderMutationKeyEditor({ whisperOf: (form) => {
      forms.push(form)
      throw thrown
    } })
    submitKey()
    await screen.findByText('Refused')
    expect(seen.put?.error).to.eq(thrown)
    expect([...forms[0]!.keys()]).to.deep.equal([])
  })

  it("deletes only the named secret fields", async () => {
    const forms: FormData[] = []
    const { world, container } = await renderMutationKeyEditor({ secretFieldnames: ['apiKey'], whisperOf: (form) => {
      forms.push(form)
      return { apiKey: form.get('apiKey') as string }
    } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My jokes key' } })
    submitKey()
    await screen.findByText('Saved')
    expect([...forms[0]!.keys()]).to.deep.equal(['title'])
    expect(forms[0]!.get('title')).to.eq('My jokes key')
    TH.expectTextUnheld(TypedKey, container, world.clients())
  })

  it("wraps a thrown value that is no Error in an Error, the value its cause", async () => {
    const thrown = { code: 42 }
    const { seen } = await renderMutationKeyEditor({ whisperOf: () => throwValue(thrown) })
    submitKey()
    await screen.findByText('Refused')
    expect(seen.put?.error).to.be.instanceOf(Error)
    expect(seen.put?.error?.cause).to.eq(thrown)
  })

  it("runs offline and never retries, so a form is never left waiting in the variables", async () => {
    onlineManager.setOnline(false)
    onTestFinished(() => { onlineManager.setOnline(true) })
    const { seen } = await renderMutationKeyEditor()
    expect([seen.options?.networkMode, seen.options?.retry]).to.deep.equal(['always', false])
    submitKey()
    await screen.findByText('Saved')
  })

  it("keys its mutation under the user's bank, or no user's while nobody is signed in", async () => {
    const { world } = await renderMutationKeyEditor()
    expect(world.Bank.putBoxMutationOptions(TH.JokesPath, { whisperOf: whisperOfAnyForm }).mutationKey).to.deep.equal(['sok', TH.ProviderUser, 'acme', 'putBox'])
    const unsigned = await TH.buildProviderWorld()
    expect(unsigned.Bank.putBoxMutationOptions(TH.JokesPath, { whisperOf: whisperOfAnyForm }).mutationKey).to.deep.equal(['sok', null, 'acme', 'putBox'])
  })

  it("refuses what names no box, and a whisperOf or sidecarOf that is not a function", async () => {
    const world = await TH.buildProviderWorld()
    const whisperOf = whisperOfAnyForm
    TH.expectSyncRefusal(() => world.Bank.putBoxMutationOptions('', { whisperOf }), 'bad_record')
    TH.expectSyncRefusal(() => world.Bank.putBoxMutationOptions(TH.JokesPath, {} as never), 'bad_record')
    TH.expectSyncRefusal(() => world.Bank.putBoxMutationOptions(TH.JokesPath, { whisperOf, sidecarOf: 'mask' as never }), 'bad_record')
  })

  it("rejects, handed something other than a FormData", async () => {
    const world = await TH.buildProviderWorld()
    const options = world.Bank.putBoxMutationOptions(TH.JokesPath, { whisperOf: whisperOfAnyForm })
    await TH.expectRefusal(options.mutationFn!({ apiKey: TypedKey } as never, undefined as never), 'bad_record')
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
