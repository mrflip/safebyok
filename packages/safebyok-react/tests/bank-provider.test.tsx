import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Device, MemoryDeviceDB, VaultError, type AnyGating, type BadNewsHandler, type Bank, type LifecycleHandler } from 'safebyok-big'
import { BX } from 'safebyok-big/storage'
import { BankProvider } from '../src/provider/bank-provider'
import { useBank, useBankSnapshot } from '../src/hooks/hooks'
import { Messages } from '../src/helpers/messages'
import { createPasskey } from '../src/helpers/passkey'
import type { BankProviderProps } from '../src/shapes'
import * as TH from './test-helpers'

TH.sweepBankWorlds()
beforeEach(() => { TH.seenBanks.length = 0 })

type Props = Omit<BankProviderProps, 'children'>

const shown = (testid: 'bank' | 'vault') => screen.getByTestId(testid).textContent
const dialogShown = () => screen.queryByRole('dialog') !== null

/** A world with the banks these tests sign into already built, as another device builds them. */
async function builtWorld(): Promise<TH.BankWorld> {
  const world = TH.makeBankWorld()
  const scopes = [{ user_id: 'u1', banklabel: 'acme' }, { user_id: 'u2', banklabel: 'acme' }, { user_id: 'u1', banklabel: 'globex' }]
  await Promise.all(scopes.map((scope) => world.deviceOnAnotherDevice(scope).ensureBank()))
  return world
}

/** Render a BankProvider over `world`, or a {@link builtWorld}, with ShowsVault inside. Returns the world, the props, and `rerender` and `unmount`. */
const provided = async (overrides: Partial<Props> = {}, given?: TH.BankWorld) => {
  const world = given ?? await builtWorld()
  const props = TH.providerPropsOf(world, overrides)
  const ui = (given: Props) => <BankProvider {...given}><TH.ShowsVault /></BankProvider>
  const rendered = render(ui(props))
  return { world, props, rerender: (given: Props) => { rendered.rerender(ui(given)) }, unmount: rendered.unmount }
}

/** Make a MemoryDeviceDB whose ensureCachedDevice waits, for `user_id` only, until the test calls `answer`. Other users get their result at once. */
const deviceDBPending = (user_id: string) => {
  const deviceDB = new MemoryDeviceDB()
  const answering = TH.makePending()
  const ensureCachedDevice = deviceDB.ensureCachedDevice.bind(deviceDB)
  vi.spyOn(deviceDB, 'ensureCachedDevice').mockImplementation(async (scope) => {
    if (scope.user_id === user_id) { await answering.promise }
    return ensureCachedDevice(scope)
  })
  return { deviceDB, answer: () => { answering.resolve(undefined) } }
}

/** Return the user_id of each lease cached in `deviceDB`. */
const leaseUsers = async (deviceDB: MemoryDeviceDB) => {
  const rows = await deviceDB.listLeases()
  return rows.map(({ user_id }) => user_id)
}

describe("BankProvider's bank", () => {
  it("has no bank while nobody is signed in", async () => {
    await provided({ user_id: null })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(shown('bank')).to.eq('none')
    expect(shown('vault')).to.eq('bankless none')
  })

  it("makes the signed-in user's device, brings up its bank, and ends it when the user changes", async () => {
    const { props, rerender } = await provided()
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, user_id: 'u2' })
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    const [first, second] = TH.seenBanks
    expect(TH.seenBanks).to.have.lengthOf(2)
    expect(first?.device.isEnabled).to.eq(false)
    expect(second?.user_id).to.eq('u2')
  })

  it("makes a new bank when the banklabel changes", async () => {
    const { props, rerender } = await provided()
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, banklabel: 'globex' })
    await waitFor(() => { expect(TH.seenBanks).to.have.lengthOf(2) })
    expect(TH.seenBanks.map(({ banklabel }) => banklabel)).to.deep.equal(['acme', 'globex'])
    expect(TH.seenBanks[0]?.device.isEnabled).to.eq(false)
  })

  it("makes each bank with the device_tok its deviceDB keeps for the bank's scope", async () => {
    const deviceDB = new MemoryDeviceDB()
    const kept = await deviceDB.ensureCachedDevice({ user_id: 'u1', banklabel: 'acme' })
    const { props, rerender } = await provided({ deviceDB })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, user_id: 'u2' })
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    const [first, second] = TH.seenBanks
    expect(first?.device_tok).to.eq(kept.device_tok)
    const { device_tok } = await deviceDB.ensureCachedDevice({ user_id: 'u2', banklabel: 'acme' })
    expect(second?.device_tok).to.eq(device_tok)
    expect(second?.device_tok).to.not.eq(kept.device_tok)
  })

  it("sweeps its bank as it unmounts", async () => {
    const { unmount } = await provided()
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    unmount()
    expect(TH.seenBanks[0]?.device.isEnabled).to.eq(false)
  })

  // StrictMode runs the effect twice at mount: the first device is swept before its deviceDB answers.
  it("makes two devices under StrictMode, sweeps the first, and brings up the second", async () => {
    const world = await builtWorld()
    const making = vi.spyOn(Device, 'make')
    render(<StrictMode><BankProvider {...TH.providerPropsOf(world)}><TH.ShowsVault /></BankProvider></StrictMode>)
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    const [first, second] = making.mock.results.map((result) => result.value as Device)
    expect(making.mock.results).to.have.lengthOf(2)
    expect(first?.isEnabled).to.be.false
    expect(first?.bank).to.be.null
    expect(second?.isEnabled).to.be.true
    expect(TH.seenBanks).to.deep.equal([second?.bank])
  })

  it("provides its device, and no bank, until its deviceDB answers", async () => {
    const { deviceDB, answer } = deviceDBPending('u1')
    await provided({ deviceDB })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(shown('bank')).to.eq('u1 made')
    expect(shown('vault')).to.eq('bankless none')
    expect(TH.seenBanks).to.have.lengthOf(0)
    answer()
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
  })

  it("provides no bank for the next user until their deviceDB answers", async () => {
    const { deviceDB, answer } = deviceDBPending('u2')
    const { props, rerender } = await provided({ deviceDB })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    const making = vi.spyOn(Device, 'make')
    rerender({ ...props, user_id: 'u2' })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(shown('bank')).to.eq('u2 made')
    expect(TH.seenBanks).to.have.lengthOf(1)
    answer()
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    const { device_tok } = await deviceDB.ensureCachedDevice({ user_id: 'u2', banklabel: 'acme' })
    expect(making.mock.calls.map(([opts]) => [opts.user_id, opts.gates])).to.deep.equal([['u2', ['main']]])
    expect(TH.seenBanks[1]?.device_tok).to.eq(device_tok)
  })

  it("ends with no bank, its device swept, when the user signs out before its deviceDB answers", async () => {
    const { deviceDB, answer } = deviceDBPending('u1')
    const world = await builtWorld()
    const making = vi.spyOn(Device, 'make')
    const { props, rerender } = await provided({ deviceDB }, world)
    rerender({ ...props, user_id: null })
    answer()
    await act(async () => { await TH.wakeupAtNextTick() })
    const [made] = making.mock.results.map((result) => result.value as Device)
    expect(made?.isEnabled).to.be.false
    expect(made?.bank).to.be.null
    expect(TH.seenBanks).to.have.lengthOf(0)
    expect(shown('bank')).to.eq('none')
  })

  it("reports a refused ensureCachedDevice to onLifecycle, not the error boundary, and leaves its device made", async () => {
    const refusal = new VaultError('storage_unavailable', 'the disk is full')
    const deviceDB = new MemoryDeviceDB()
    vi.spyOn(deviceDB, 'ensureCachedDevice').mockRejectedValue(refusal)
    const onLifecycle = vi.fn<LifecycleHandler>()
    const props = TH.providerPropsOf(await builtWorld(), { deviceDB, onLifecycle })
    render(<TH.Catcher><BankProvider {...props}><TH.ShowsVault /></BankProvider></TH.Catcher>)
    await waitFor(() => { expect(onLifecycle).toHaveBeenCalled() })
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'helloed', outcome: { ok: false, err: refusal }, vault: null }))
    expect(screen.queryByText(/^caught: /)).to.be.null
    expect(shown('bank')).to.eq('u1 made')
    expect(TH.seenBanks).to.have.lengthOf(0)
  })

  it("throws a deviceDB that is no DeviceDB to the nearest error boundary", async () => {
    const props = TH.providerPropsOf(await builtWorld(), { deviceDB: { ensureCachedDevice: vi.fn() } as unknown as MemoryDeviceDB })
    const { reported } = TH.renderReporting(<TH.Catcher><BankProvider {...props}><TH.ShowsVault /></BankProvider></TH.Catcher>)
    await waitFor(() => { expect(screen.getByText(/^caught: /)).to.exist })
    expect(reported[0]).to.include({ refusalkind: 'bad_option' })
  })

  it("throws an option Device.make does not accept to the nearest error boundary", async () => {
    const props = { ...TH.providerPropsOf(await builtWorld()), leaseHours: 3 } as Props
    const { reported } = TH.renderReporting(<TH.Catcher><BankProvider {...props}><TH.ShowsVault /></BankProvider></TH.Catcher>)
    await waitFor(() => { expect(screen.getByText(/^caught: /)).to.exist })
    expect(reported[0]).to.include({ refusalkind: 'bad_option' })
  })
})

describe("BankProvider's props", () => {
  it("keeps its device when a prop it was made with changes", async () => {
    const spy = TH.spyLogger()
    const { props, rerender } = await provided({ logger: spy.logger })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, keyDeriver: { ...props.keyDeriver } })
    rerender({ ...props, autolockMinutes: 5 })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(TH.seenBanks).to.have.lengthOf(1)
    expect(shown('bank')).to.eq('u1 ready')
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
  })

  it("says once, through the device's logger, that a change to a prop it was made with is ignored", async () => {
    const spy = TH.spyLogger()
    const { props, rerender } = await provided({ logger: spy.logger })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, keyDeriver: { ...props.keyDeriver } })
    rerender({ ...props, autolockMinutes: 5 })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(spy.calls.map(({ level, story }) => [level, story])).to.deep.equal([['warn', { oplabel: 'BankProvider', props: ['keyDeriver'] }]])
    expect(spy.calls[0]?.message).to.match(/^BankProvider ignored a change to its keyDeriver/)
  })

  it("names each prop that changed", async () => {
    const spy = TH.spyLogger()
    const { props, rerender } = await provided({ logger: spy.logger })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, keyDeriver: { ...props.keyDeriver }, deviceDB: new MemoryDeviceDB() })
    expect(spy.calls[0]?.story).to.deep.equal({ oplabel: 'BankProvider', props: ['deviceDB', 'keyDeriver'] })
  })

  it("says nothing of handlers written inline at each render", async () => {
    const spy = TH.spyLogger()
    const { props, rerender } = await provided({ logger: spy.logger, onBadNews: () => undefined, onLifecycle: () => undefined })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, onBadNews: () => undefined, onLifecycle: () => undefined })
    rerender({ ...props, onBadNews: () => undefined, onLifecycle: () => undefined })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(TH.seenBanks).to.have.lengthOf(1)
    expect(spy.calls).to.deep.equal([])
  })

  it("says nothing of a prop the host makes anew for each user", async () => {
    const spy = TH.spyLogger()
    const { props, rerender } = await provided({ logger: spy.logger })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, user_id: 'u2', deviceDB: new MemoryDeviceDB() })
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    rerender({ ...props, user_id: null })
    await waitFor(() => { expect(shown('bank')).to.eq('none') })
    rerender({ ...props, user_id: 'u2', deviceDB: new MemoryDeviceDB() })
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    expect(spy.calls).to.deep.equal([])
  })
})

/** Render a provider over a vault that another device built, and unlock it through the dialog. Also returns the deviceDB where the provider's device caches its lease. */
const unlockedProvided = async (overrides: Partial<Props> = {}) => {
  const world = await builtWorld()
  await TH.makeBankWithVault(world)
  const deviceDB = new MemoryDeviceDB()
  const made = await provided({ deviceDB, ...overrides }, world)
  await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
  fireEvent.click(screen.getByText('Open'))
  await waitFor(() => { expect(screen.queryByText(Messages.unlockTitle)).to.not.be.null })
  TH.submitPassphrase(TH.Passphrase)
  await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
  return { ...made, deviceDB }
}

describe("BankProvider at sign-out", () => {
  it("leaves the user's cached leases when they sign out, for the host to vacate", async () => {
    const { props, rerender, deviceDB } = await unlockedProvided()
    expect(await leaseUsers(deviceDB)).to.deep.equal(['u1'])
    rerender({ ...props, user_id: null })
    await waitFor(() => { expect(shown('bank')).to.eq('none') })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(await leaseUsers(deviceDB)).to.deep.equal(['u1'])
  })

  it("keeps the leases when the same user signs in again, and vacates them when another does", async () => {
    const { props, rerender, deviceDB } = await unlockedProvided()
    rerender({ ...props, user_id: null })
    rerender({ ...props, user_id: 'u1' })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(await leaseUsers(deviceDB)).to.deep.equal(['u1'])
    rerender({ ...props, user_id: null })
    rerender({ ...props, user_id: 'u2' })
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    await waitFor(async () => { expect(await leaseUsers(deviceDB)).to.deep.equal([]) })
  })

  it("vacates the last user's device at a switch, and not the next user's", async () => {
    const { props, rerender, deviceDB } = await unlockedProvided()
    rerender({ ...props, user_id: 'u2' })
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    await waitFor(async () => { expect(await leaseUsers(deviceDB)).to.deep.equal([]) })
    expect(TH.seenBanks.map(({ user_id, device }) => [user_id, device.isEnabled])).to.deep.equal([['u1', false], ['u2', true]])
  })

  it("leaves the cached leases at an unmount, and through StrictMode's double effects", async () => {
    const { props, unmount, deviceDB } = await unlockedProvided()
    unmount()
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(await leaseUsers(deviceDB)).to.deep.equal(['u1'])
    render(<StrictMode><BankProvider {...props}><TH.ShowsVault /></BankProvider></StrictMode>)
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(await leaseUsers(deviceDB)).to.deep.equal(['u1'])
  })
})

describe("BankProvider's handlers", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  const Refusal = new VaultError('storage_unavailable', 'the disk is full')
  const refuseErase = (deviceDB: MemoryDeviceDB) => vi.spyOn(deviceDB, 'forget').mockRejectedValue(Refusal)

  it.each([
    ['onBadNews', { onBadNews: 'not a function' }],
    ['onLifecycle', { onLifecycle: 'not a function' }],
    ['requestCleartext', { requestCleartext: 'not a function' }],
  ])("throws %s given as no function to the nearest error boundary", async (_name, misuse) => {
    const props = { ...TH.providerPropsOf(await builtWorld()), ...misuse } as unknown as Props
    const { reported } = TH.renderReporting(<TH.Catcher><BankProvider {...props}><TH.ShowsVault /></BankProvider></TH.Catcher>)
    await waitFor(() => { expect(screen.getByText(/^caught: /)).to.exist })
    expect(reported[0]).to.include({ refusalkind: 'bad_option' })
  })

  it("reports a refused ensureBank to onLifecycle, and nothing to onBadNews", async () => {
    const world = await builtWorld()
    vi.spyOn(world.bankDB, 'tryEnsureBank').mockResolvedValue(BX.badAnswerOf(Refusal))
    const [onLifecycle, onBadNews] = [vi.fn<LifecycleHandler>(), vi.fn<BadNewsHandler>()]
    await provided({ onLifecycle, onBadNews }, world)
    await waitFor(() => { expect(onLifecycle).toHaveBeenCalled() })
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'helloed', outcome: { ok: false, err: Refusal }, vault: null }))
    expect(onBadNews).not.toHaveBeenCalled()
  })

  it("reports an onLifecycle that throws to the platform, never to the render", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const world = await builtWorld()
    vi.spyOn(world.bankDB, 'tryEnsureBank').mockResolvedValue(BX.badAnswerOf(Refusal))
    const thrown = new Error('the handler broke')
    await provided({ onLifecycle: () => { throw thrown } }, world)
    await waitFor(() => { expect(reported).toHaveBeenCalledWith(thrown) })
    expect(shown('bank')).to.not.eq('none')
    vi.unstubAllGlobals()
  })

  it("reports a refused ensureBank to the onLifecycle last rendered", async () => {
    const world = await builtWorld()
    const pendingEnsureBank: { refuse?: (err: VaultError) => void } = {}
    vi.spyOn(world.bankDB, 'tryEnsureBank').mockReturnValue(new Promise((resolve) => { pendingEnsureBank.refuse = (err) => { resolve(BX.badAnswerOf(err)) } }))
    const [first, last] = [vi.fn<LifecycleHandler>(), vi.fn<LifecycleHandler>()]
    const { props, rerender } = await provided({ onLifecycle: first }, world)
    await waitFor(() => { expect(shown('bank')).to.eq('u1 made') })
    rerender({ ...props, onLifecycle: last })
    pendingEnsureBank.refuse?.(Refusal)
    await waitFor(() => { expect(last).toHaveBeenCalledOnce() })
    expect(first).not.toHaveBeenCalled()
  })

  it("reports an ensureBank that a sign-out crossed to neither onLifecycle, onBadNews nor the logger", async () => {
    const world = await builtWorld()
    const pendingEnsureBank: { refuse?: (err: VaultError) => void } = {}
    vi.spyOn(world.bankDB, 'tryEnsureBank').mockReturnValue(new Promise((resolve) => { pendingEnsureBank.refuse = (err) => { resolve(BX.badAnswerOf(err)) } }))
    const [onLifecycle, onBadNews] = [vi.fn(), vi.fn()]
    const spy = TH.spyLogger()
    const { props, rerender } = await provided({ onLifecycle, onBadNews, logger: spy.logger }, world)
    await waitFor(() => { expect(shown('bank')).to.eq('u1 made') })
    rerender({ ...props, user_id: null })
    await waitFor(() => { expect(shown('bank')).to.eq('none') })
    pendingEnsureBank.refuse?.(Refusal)
    await act(async () => { await TH.wakeupAtNextTick() })
    expect([onLifecycle, onBadNews].map((handler) => handler.mock.calls.length)).to.deep.equal([0, 0])
    expect(spy.calls).to.deep.equal([])
  })

  it("calls an onLifecycle written inline at each render as it was last rendered", async () => {
    vi.stubGlobal('reportError', vi.fn())
    const first = vi.fn()
    const last = vi.fn()
    const { props, rerender, deviceDB } = await unlockedProvided({ onLifecycle: first })
    rerender({ ...props, onLifecycle: () => undefined })
    rerender({ ...props, onLifecycle: last })
    refuseErase(deviceDB)
    fireEvent.click(screen.getByText('Lock'))
    await waitFor(() => { expect(last).toHaveBeenCalledWith(expect.objectContaining({ kind: 'lease_revoke_failed', refusal: Refusal })) })
    expect(first).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'lease_revoke_failed' }))
    expect(TH.seenBanks).to.have.lengthOf(1)
    expect(shown('vault')).to.eq('present locked')
  })

  it("with no onLifecycle, still vacates a vault whose lease could not be forgotten", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const spy = TH.spyLogger()
    const { deviceDB } = await unlockedProvided({ logger: spy.logger })
    refuseErase(deviceDB)
    fireEvent.click(screen.getByText('Lock'))
    await waitFor(() => { expect(reported).toHaveBeenCalledWith(Refusal) })
    await waitFor(() => { expect(shown('vault')).to.not.eq('present locked') })
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['error', 'error'])
  })

  it("reports the last user's vacate to the last user's onLifecycle, and nothing to the next user's", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const next = vi.fn()
    const forgetting = TH.makePending()
    const previous = vi.fn()
    const spy = TH.spyLogger()
    const { props, rerender, deviceDB } = await unlockedProvided({ onLifecycle: previous, logger: spy.logger })
    vi.spyOn(deviceDB, 'forget').mockImplementation(async () => { await forgetting.promise; throw Refusal })
    fireEvent.click(screen.getByText('Lock'))
    rerender({ ...props, user_id: 'u2', onLifecycle: next })
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    forgetting.resolve(undefined)
    await waitFor(() => { expect(reported).toHaveBeenCalledWith(Refusal) })
    await waitFor(() => { expect(previous).toHaveBeenCalledWith(expect.objectContaining({ kind: 'vacated', unrevoked: 1 })) })
    expect(previous.mock.calls.map(([event]) => (event as { kind: string }).kind).filter((kind) => kind !== 'helloed')).to.deep.equal(['lease_revoke_failed', 'vacated'])
    expect(previous).toHaveBeenCalledWith(expect.objectContaining({ kind: 'lease_revoke_failed', refusal: Refusal, where: 'vacate' }))
    expect(next.mock.calls.map(([event]) => (event as { kind: string }).kind).filter((kind) => kind !== 'helloed')).to.deep.equal([])
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['error'])
  })
})

/** Return the first bank the provider made. Throws if it has made none. */
const onlyBank = (): Bank => {
  const [bank] = TH.seenBanks
  if (bank === undefined) { throw new Error('no bank seen') }
  return bank
}

/** Return the passphrase field on screen. */
const passphraseFieldOf = (): HTMLInputElement => screen.getByLabelText(Messages.passphraseField)

describe("BankProvider's dialog", () => {
  it("builds the bank from its dialog, then the vault from a click: absent, then present and unlocked", async () => {
    await provided({}, TH.makeBankWorld())
    await waitFor(() => { expect(screen.queryByText(Messages.chooseTitle)).to.not.be.null })
    await TH.submitNewPassphrase(TH.Passphrase)
    await waitFor(() => { expect(shown('vault')).to.eq('absent none') })
    expect(dialogShown()).to.be.false
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    expect(dialogShown()).to.be.false
  })

  it("unlocks a vault built on another device from a click", async () => {
    const world = await builtWorld()
    await TH.makeBankWithVault(world)
    await provided({}, world)
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(screen.queryByText(Messages.unlockTitle)).to.not.be.null })
    TH.submitPassphrase(TH.Passphrase)
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    expect(dialogShown()).to.be.false
  })

  it("opens the dialog for the gating the device has", async () => {
    await provided()
    await waitFor(() => { expect(shown('vault')).to.eq('absent none') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(screen.queryByText(Messages.unlockTitle)).to.not.be.null })
    expect(onlyBank().device.openGating).to.not.be.null
  })

  it("shows the dialog when the user's gesture is already used up", async () => {
    await provided()
    await waitFor(() => { expect(shown('vault')).to.eq('absent none') })
    TH.withoutGesture()
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(screen.queryByText(Messages.unlockTitle)).to.not.be.null })
  })

  it("asks the vault's passkey within the dialog's own click, the user's gesture otherwise spent", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const world = await builtWorld()
    const { vault } = await TH.makeBankWithVault(world)
    await TH.addPasskeyTo(world, vault, await createPasskey(TH.PasskeyMaking))
    await provided({}, world)
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
    TH.withoutGesture()
    fireEvent.click(screen.getByText('Open'))
    const press = await screen.findByText(Messages.passkeyButton)
    fireEvent.click(press)
    expect(authenticator.calls.get).to.have.lengthOf(1)
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    expect(dialogShown()).to.be.false
  })

  it("closes the dialog on Cancel, dismissing its gating", async () => {
    await provided()
    await waitFor(() => { expect(shown('vault')).to.eq('absent none') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(dialogShown()).to.be.true })
    const gating = onlyBank().device.openGating
    fireEvent.click(screen.getByText(Messages.cancelButton))
    await waitFor(() => { expect(dialogShown()).to.be.false })
    expect(gating?.isOpen).to.be.false
    expect(onlyBank().device.openGating).to.be.null
    expect(shown('vault')).to.eq('absent none')
  })

  it("closes the dialog at a sweep of the device", async () => {
    await provided()
    await waitFor(() => { expect(shown('vault')).to.eq('absent none') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(dialogShown()).to.be.true })
    act(() => { onlyBank().device.sweep() })
    expect(dialogShown()).to.be.false
  })

  it("closes the dialog at a vacate of the device", async () => {
    await provided()
    await waitFor(() => { expect(shown('vault')).to.eq('absent none') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(dialogShown()).to.be.true })
    await act(async () => { await onlyBank().device.vacate() })
    expect(dialogShown()).to.be.false
  })

  it("replaces a concluded gating's dialog with the next one's, nothing typed carried over", async () => {
    const world = await builtWorld()
    await TH.makeBankWithVault(world)
    await provided({}, world)
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(dialogShown()).to.be.true })
    const bank = onlyBank()
    const first = bank.device.openGating
    fireEvent.change(passphraseFieldOf(), { target: { value: 'half typed' } })
    await act(async () => {
      first?.dismiss()
      void bank.tryEnsureUnlocked()
      await vi.waitFor(() => { expect(bank.device.openGating).to.not.equal(first); expect(bank.device.openGating).to.not.be.null })
    })
    await waitFor(() => { expect(dialogShown()).to.be.true })
    expect(passphraseFieldOf().value).to.eq('')
    expect(bank.device.openGating).to.not.equal(first)
    TH.submitPassphrase(TH.Passphrase)
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    expect(dialogShown()).to.be.false
  })

  it("leaves the dialog up through a lock", async () => {
    const world = await builtWorld()
    await TH.makeBankWithVault(world)
    await provided({}, world)
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(dialogShown()).to.be.true })
    fireEvent.click(screen.getByText('Lock'))
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
    expect(dialogShown()).to.be.true
  })

  it("closes the dialog when the user signs out", async () => {
    const { props, rerender } = await provided()
    await waitFor(() => { expect(shown('vault')).to.eq('absent none') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(dialogShown()).to.be.true })
    rerender({ ...props, user_id: null })
    await waitFor(() => { expect(dialogShown()).to.be.false })
    expect(shown('bank')).to.eq('none')
  })

  it("asks the vault's passkey under the relying party it was handed", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const world = await builtWorld()
    const { vault } = await TH.makeBankWithVault(world)
    await TH.addPasskeyTo(world, vault, await createPasskey(TH.PasskeyMaking))
    await provided({ passkeyRpId: 'example.com' }, world)
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
    fireEvent.click(screen.getByText('Open'))
    fireEvent.click(await screen.findByText(Messages.passkeyButton))
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    expect(authenticator.calls.get.at(-1)?.publicKey).to.include({ rpId: 'example.com' })
  })

  it("hands each gating to the host's requestCleartext in place of its own dialog", async () => {
    const handed: AnyGating[] = []
    await provided({ requestCleartext: async (gating) => { handed.push(gating); await gating.attempt(TH.byPassphrase(TH.Passphrase)) } })
    await waitFor(() => { expect(shown('vault')).to.eq('absent none') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    expect(handed.map(({ gatingkind }) => gatingkind)).to.deep.equal(['unlock_bank'])
    expect(dialogShown()).to.be.false
  })

  it("hands each gating to the host's requestCleartext as it was last rendered", async () => {
    const first = vi.fn()
    const handed: AnyGating[] = []
    const { props, rerender } = await provided({ requestCleartext: first })
    await waitFor(() => { expect(shown('vault')).to.eq('absent none') })
    rerender({ ...props, requestCleartext: async (gating) => { handed.push(gating); await gating.attempt(TH.byPassphrase(TH.Passphrase)) } })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    expect(handed.map(({ gatingkind }) => gatingkind)).to.deep.equal(['unlock_bank'])
    expect(first).not.toHaveBeenCalled()
  })

  it("keeps to its own dialog when requestCleartext arrives after the first render", async () => {
    const requestCleartext = vi.fn()
    const { props, rerender } = await provided()
    await waitFor(() => { expect(shown('vault')).to.eq('absent none') })
    rerender({ ...props, requestCleartext })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(dialogShown()).to.be.true })
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  it("keeps to the host's dialog when requestCleartext is dropped after the first render", async () => {
    const { props, rerender } = await provided({ requestCleartext: () => undefined })
    await waitFor(() => { expect(shown('vault')).to.eq('absent none') })
    rerender({ ...props, requestCleartext: undefined })
    fireEvent.click(screen.getByText('Open'))
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(dialogShown()).to.be.false
    expect(shown('vault')).to.eq('absent none')
  })

  it("shows no dialog when requestCleartext returns nothing", async () => {
    await provided({ requestCleartext: () => undefined })
    await waitFor(() => { expect(shown('vault')).to.eq('absent none') })
    fireEvent.click(screen.getByText('Open'))
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(dialogShown()).to.be.false
    expect(shown('vault')).to.eq('absent none')
  })
})

// == [Two providers]: UnlocksNearest, dialogOfBank

/** The nearest provider's bank, by its banklabel and lock, under the test id `testid`, with a button that unlocks it. */
function UnlocksNearest({ testid }: Readonly<{ testid: string }>) {
  const bank = useBank()
  const snapshot = useBankSnapshot()
  const lockword = snapshot?.isLocked === false ? 'unlocked' : 'locked'
  return (
    <p>
      <span data-testid={testid}>{`${snapshot?.banklabel ?? '-'} ${lockword}`}</span>
      <button type="button" disabled={bank === null} onClick={() => { void bank?.tryEnsureUnlocked() }}>{`Unlock ${testid}`}</button>
    </p>
  )
}

/** The dialog open for the bank named `banklabel`, found by the username its passphrase is saved under. */
function dialogOfBank(banklabel: string): HTMLElement {
  const dialog = screen.getAllByRole('dialog').find((shown) => within(shown).queryByDisplayValue(`u1 (${banklabel} vault)`) !== null)
  if (dialog === undefined) { throw new Error(`no dialog open for ${banklabel}`) }
  return dialog
}
// --

describe("two BankProviders, one inside the other, for two banks", () => {
  it("hand each hook the nearest provider's bank, and each show its own gating's dialog, both open at once", async () => {
    const world = await builtWorld()
    render(
      <BankProvider {...TH.providerPropsOf(world)}>
        <UnlocksNearest testid="outer" />
        <BankProvider {...TH.providerPropsOf(world, { banklabel: 'globex' })}>
          <UnlocksNearest testid="inner" />
        </BankProvider>
      </BankProvider>,
    )
    await waitFor(() => { expect([screen.getByTestId('outer').textContent, screen.getByTestId('inner').textContent]).to.deep.equal(['acme locked', 'globex locked']) })
    fireEvent.click(screen.getByText('Unlock outer'))
    fireEvent.click(screen.getByText('Unlock inner'))
    await waitFor(() => { expect(screen.getAllByRole('dialog')).to.have.lengthOf(2) })
    fireEvent.change(within(dialogOfBank('globex')).getByPlaceholderText(Messages.passphraseField), { target: { value: TH.Passphrase } })
    fireEvent.click(within(dialogOfBank('globex')).getByText(Messages.unlockButton))
    await waitFor(() => { expect(screen.getByTestId('inner').textContent).to.eq('globex unlocked') })
    expect(screen.getAllByRole('dialog')).to.have.lengthOf(1)
    expect(screen.getByTestId('outer').textContent).to.eq('acme locked')
    fireEvent.change(within(dialogOfBank('acme')).getByPlaceholderText(Messages.passphraseField), { target: { value: TH.Passphrase } })
    fireEvent.click(within(dialogOfBank('acme')).getByText(Messages.unlockButton))
    await waitFor(() => { expect(screen.getByTestId('outer').textContent).to.eq('acme unlocked') })
    expect(dialogShown()).to.be.false
  })
})
