import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bank, MemoryDeviceDB, VaultError, type AnyGating, type BadNewsHandler, type LifecycleHandler } from 'safebyok'
import { BankProvider } from '../src/provider/bank-provider'
import { Messages } from '../src/helpers/messages'
import { createPasskey } from '../src/helpers/passkey'
import type { BankProviderProps } from '../src/shapes'
import * as TH from './test-helpers'

TH.sweepBankWorlds()
beforeEach(() => { TH.seenBanks.length = 0 })

type Props = Omit<BankProviderProps, 'children'>

const shown = (testid: 'bank' | 'vault') => screen.getByTestId(testid).textContent
const dialogShown = () => screen.queryByRole('dialog') !== null

/** The world, the provider's props over it, and its render, with ShowsVault inside. */
const provided = (overrides: Partial<Props> = {}, world = TH.makeBankWorld()) => {
  const props = TH.providerPropsOf(world, overrides)
  const ui = (given: Props) => <BankProvider {...given}><TH.ShowsVault /></BankProvider>
  const rendered = render(ui(props))
  return { world, props, rerender: (given: Props) => { rendered.rerender(ui(given)) }, unmount: rendered.unmount }
}

/** A MemoryDeviceDB whose ensureBank for `user_id` waits until the test calls `answer`; every other user's answers at once. */
const deviceDBHolding = (user_id: string) => {
  const deviceDB = new MemoryDeviceDB()
  const answering = TH.held()
  const ensureBank = deviceDB.ensureBank.bind(deviceDB)
  vi.spyOn(deviceDB, 'ensureBank').mockImplementation(async (scope) => {
    if (scope.user_id === user_id) { await answering.promise }
    return ensureBank(scope)
  })
  return { deviceDB, answer: () => { answering.resolve(undefined) } }
}

/** The users whose leases `deviceDB` caches. */
const leaseUsers = async (deviceDB: MemoryDeviceDB) => {
  const rows = await deviceDB.listLeases()
  return rows.map(({ user_id }) => user_id)
}

describe("BankProvider's bank", () => {
  it("holds no bank while nobody is signed in", async () => {
    provided({ user_id: null })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(shown('bank')).to.eq('none')
    expect(shown('vault')).to.eq('waiting none')
  })

  it("makes the signed-in user's bank, says hello, and sweeps it when the user changes", async () => {
    const { props, rerender } = provided()
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, user_id: 'u2' })
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    const [first, second] = TH.seenBanks
    expect(TH.seenBanks).to.have.lengthOf(2)
    expect(first?.isEnabled).to.eq(false)
    expect(second?.user_id).to.eq('u2')
  })

  it("makes a new bank when the applabel changes", async () => {
    const { props, rerender } = provided()
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, applabel: 'globex' })
    await waitFor(() => { expect(TH.seenBanks).to.have.lengthOf(2) })
    expect(TH.seenBanks.map(({ applabel }) => applabel)).to.deep.equal(['acme', 'globex'])
    expect(TH.seenBanks[0]?.isEnabled).to.eq(false)
  })

  it("makes each bank with the device_id its deviceDB keeps for the bank's scope", async () => {
    const deviceDB = new MemoryDeviceDB()
    const kept = await deviceDB.ensureBank({ applabel: 'acme', user_id: 'u1' })
    const { props, rerender } = provided({ deviceDB })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, user_id: 'u2' })
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    const [first, second] = TH.seenBanks
    expect(first?.device_id).to.eq(kept.device_id)
    const { device_id } = await deviceDB.ensureBank({ applabel: 'acme', user_id: 'u2' })
    expect(second?.device_id).to.eq(device_id)
    expect(second?.device_id).to.not.eq(kept.device_id)
  })

  it("sweeps its bank as it unmounts", async () => {
    const { unmount } = provided()
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    unmount()
    expect(TH.seenBanks[0]?.isEnabled).to.eq(false)
  })

  // StrictMode runs the effect twice at mount, while the device_id is still on its way: the effect makes
  // its bank once, when the device_id lands.
  it("makes one bank under StrictMode, once the device_id lands", async () => {
    const making = vi.spyOn(Bank, 'make')
    render(<StrictMode><BankProvider {...TH.providerPropsOf(TH.makeBankWorld())}><TH.ShowsVault /></BankProvider></StrictMode>)
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    const [made] = making.mock.results.map((result) => result.value as Bank)
    expect(making.mock.results).to.have.lengthOf(1)
    expect(made?.isEnabled).to.be.true
    expect(TH.seenBanks.at(-1)).to.eq(made)
  })

  it("hands down no bank until its deviceDB answers", async () => {
    const { deviceDB, answer } = deviceDBHolding('u1')
    const making = vi.spyOn(Bank, 'make')
    provided({ deviceDB })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(shown('bank')).to.eq('none')
    expect(making).not.toHaveBeenCalled()
    answer()
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
  })

  it("waits for the next user's device_id before making their bank", async () => {
    const { deviceDB, answer } = deviceDBHolding('u2')
    const { props, rerender } = provided({ deviceDB })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    const making = vi.spyOn(Bank, 'make')
    rerender({ ...props, user_id: 'u2' })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(shown('bank')).to.eq('none')
    expect(making).not.toHaveBeenCalled()
    answer()
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    const { device_id } = await deviceDB.ensureBank({ applabel: 'acme', user_id: 'u2' })
    expect(making.mock.calls.map(([opts]) => [opts.user_id, opts.device_id])).to.deep.equal([['u2', device_id]])
  })

  it("makes no bank when the user signs out while its deviceDB answers", async () => {
    const { deviceDB, answer } = deviceDBHolding('u1')
    const making = vi.spyOn(Bank, 'make')
    const { props, rerender } = provided({ deviceDB })
    rerender({ ...props, user_id: null })
    answer()
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(making).not.toHaveBeenCalled()
    expect(shown('bank')).to.eq('none')
  })

  it("throws a refused ensureBank to the nearest error boundary", async () => {
    const deviceDB = new MemoryDeviceDB()
    vi.spyOn(deviceDB, 'ensureBank').mockRejectedValue(new VaultError('storage_unavailable', 'the disk is full'))
    const props = TH.providerPropsOf(TH.makeBankWorld(), { deviceDB })
    const { reported } = TH.renderReporting(<TH.Catcher><BankProvider {...props}><TH.ShowsVault /></BankProvider></TH.Catcher>)
    await waitFor(() => { expect(screen.getByText(/^caught: /)).to.exist })
    expect(reported[0]).to.include({ refusalkind: 'storage_unavailable' })
  })

  it("throws a deviceDB that is no DeviceDB to the nearest error boundary", async () => {
    const props = TH.providerPropsOf(TH.makeBankWorld(), { deviceDB: { ensureBank: vi.fn() } as unknown as MemoryDeviceDB })
    const { reported } = TH.renderReporting(<TH.Catcher><BankProvider {...props}><TH.ShowsVault /></BankProvider></TH.Catcher>)
    await waitFor(() => { expect(screen.getByText(/^caught: /)).to.exist })
    expect(reported[0]).to.include({ refusalkind: 'bad_option' })
  })

  it("throws an option Bank.make does not take to the nearest error boundary", async () => {
    const props = { ...TH.providerPropsOf(TH.makeBankWorld()), leaseHours: 3 } as Props
    const { reported } = TH.renderReporting(<TH.Catcher><BankProvider {...props}><TH.ShowsVault /></BankProvider></TH.Catcher>)
    await waitFor(() => { expect(screen.getByText(/^caught: /)).to.exist })
    expect(reported[0]).to.include({ refusalkind: 'bad_option' })
  })
})

describe("BankProvider's props", () => {
  it("keeps its bank when a prop it was made with changes", async () => {
    const { props, rerender } = provided()
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, keyDeriver: { ...props.keyDeriver } })
    rerender({ ...props, autolockMinutes: 5 })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(TH.seenBanks).to.have.lengthOf(1)
    expect(shown('bank')).to.eq('u1 ready')
  })

  it("says once, through the bank's logger, that a change to a prop it was made with is ignored", async () => {
    const spy = TH.spyLogger()
    const { props, rerender } = provided({ logger: spy.logger })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, keyDeriver: { ...props.keyDeriver } })
    rerender({ ...props, autolockMinutes: 5 })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(spy.calls.map(({ level, story }) => [level, story])).to.deep.equal([['warn', { call: 'BankProvider', props: ['keyDeriver'] }]])
    expect(spy.calls[0]?.message).to.match(/^BankProvider ignored a change to its keyDeriver/)
  })

  it("names each prop that changed", async () => {
    const spy = TH.spyLogger()
    const { props, rerender } = provided({ logger: spy.logger })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, keyDeriver: { ...props.keyDeriver }, deviceDB: new MemoryDeviceDB() })
    expect(spy.calls[0]?.story).to.deep.equal({ call: 'BankProvider', props: ['deviceDB', 'keyDeriver'] })
  })

  it("says nothing of handlers written inline at each render", async () => {
    const spy = TH.spyLogger()
    const { props, rerender } = provided({ logger: spy.logger, onBadNews: () => undefined, onLifecycle: () => undefined })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, onBadNews: () => undefined, onLifecycle: () => undefined })
    rerender({ ...props, onBadNews: () => undefined, onLifecycle: () => undefined })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(TH.seenBanks).to.have.lengthOf(1)
    expect(spy.calls).to.deep.equal([])
  })

  it("says nothing of a prop the host makes anew for each user", async () => {
    const spy = TH.spyLogger()
    const { props, rerender } = provided({ logger: spy.logger })
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

/** A provider over a vault another device built, unlocked from its dialog, with the deviceDB the provider's bank keeps its lease in. */
const unlockedProvided = async (overrides: Partial<Props> = {}) => {
  const world = TH.makeBankWorld()
  await TH.makeBankWithVault(world)
  const deviceDB = new MemoryDeviceDB()
  const made = provided({ deviceDB, ...overrides }, world)
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

  it("vacates the last user's bank at a switch, and not the next user's", async () => {
    const { props, rerender, deviceDB } = await unlockedProvided()
    rerender({ ...props, user_id: 'u2' })
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    await waitFor(async () => { expect(await leaseUsers(deviceDB)).to.deep.equal([]) })
    expect(TH.seenBanks.map(({ user_id, isEnabled }) => [user_id, isEnabled])).to.deep.equal([['u1', false], ['u2', true]])
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
    const props = { ...TH.providerPropsOf(TH.makeBankWorld()), ...misuse } as unknown as Props
    const { reported } = TH.renderReporting(<TH.Catcher><BankProvider {...props}><TH.ShowsVault /></BankProvider></TH.Catcher>)
    await waitFor(() => { expect(screen.getByText(/^caught: /)).to.exist })
    expect(reported[0]).to.include({ refusalkind: 'bad_option' })
  })

  it("tells onLifecycle of a refused hello, and onBadNews nothing", async () => {
    const world = TH.makeBankWorld()
    vi.spyOn(world.vaultDB, 'listVaults').mockRejectedValue(Refusal)
    const [onLifecycle, onBadNews] = [vi.fn<LifecycleHandler>(), vi.fn<BadNewsHandler>()]
    provided({ onLifecycle, onBadNews }, world)
    await waitFor(() => { expect(onLifecycle).toHaveBeenCalled() })
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'helloed', outcome: { ok: false, err: Refusal }, vault: null }))
    expect(onBadNews).not.toHaveBeenCalled()
  })

  it("reports an onLifecycle that throws to the platform, never to the render", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const world = TH.makeBankWorld()
    vi.spyOn(world.vaultDB, 'listVaults').mockRejectedValue(Refusal)
    const thrown = new Error('the handler broke')
    provided({ onLifecycle: () => { throw thrown } }, world)
    await waitFor(() => { expect(reported).toHaveBeenCalledWith(thrown) })
    expect(shown('bank')).to.not.eq('none')
    vi.unstubAllGlobals()
  })

  it("tells a refused hello to the onLifecycle last rendered", async () => {
    const world = TH.makeBankWorld()
    const held: { refuse?: (err: unknown) => void } = {}
    vi.spyOn(world.vaultDB, 'listVaults').mockReturnValue(new Promise((_resolve, reject) => { held.refuse = reject }))
    const [first, last] = [vi.fn<LifecycleHandler>(), vi.fn<LifecycleHandler>()]
    const { props, rerender } = provided({ onLifecycle: first }, world)
    await waitFor(() => { expect(TH.seenBanks).to.have.lengthOf(1) })
    rerender({ ...props, onLifecycle: last })
    held.refuse?.(Refusal)
    await waitFor(() => { expect(last).toHaveBeenCalledOnce() })
    expect(first).not.toHaveBeenCalled()
  })

  it("tells neither onLifecycle, onBadNews nor the logger of a hello that a sign-out crossed", async () => {
    const world = TH.makeBankWorld()
    const held: { refuse?: (err: unknown) => void } = {}
    vi.spyOn(world.vaultDB, 'listVaults').mockReturnValue(new Promise((_resolve, reject) => { held.refuse = reject }))
    const [onLifecycle, onBadNews] = [vi.fn(), vi.fn()]
    const spy = TH.spyLogger()
    const { props, rerender } = provided({ onLifecycle, onBadNews, logger: spy.logger }, world)
    await waitFor(() => { expect(TH.seenBanks).to.have.lengthOf(1) })
    rerender({ ...props, user_id: null })
    await waitFor(() => { expect(shown('bank')).to.eq('none') })
    held.refuse?.(Refusal)
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
    await waitFor(() => { expect(last).toHaveBeenCalledWith(expect.objectContaining({ kind: 'lease_unerased', refusal: Refusal })) })
    expect(first).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'lease_unerased' }))
    expect(TH.seenBanks).to.have.lengthOf(1)
    expect(shown('vault')).to.eq('present locked')
  })

  it("leaves a vault whose lease survived its erase to be vacated when the host has no onLifecycle, as the core does", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const { deviceDB } = await unlockedProvided()
    refuseErase(deviceDB)
    fireEvent.click(screen.getByText('Lock'))
    await waitFor(() => { expect(reported).toHaveBeenCalledWith(Refusal) })
    await waitFor(() => { expect(shown('vault')).to.not.eq('present locked') })
  })

  it("tells the next user's onLifecycle nothing of the bank it let go, whose vacate tells the last user's onLifecycle of the lease it cannot erase", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const next = vi.fn()
    const erasing = TH.held()
    const previous = vi.fn()
    const { props, rerender, deviceDB } = await unlockedProvided({ onLifecycle: previous })
    vi.spyOn(deviceDB, 'forget').mockImplementation(async () => { await erasing.promise; throw Refusal })
    fireEvent.click(screen.getByText('Lock'))
    rerender({ ...props, user_id: 'u2', onLifecycle: next })
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    erasing.resolve(undefined)
    await waitFor(() => { expect(reported).toHaveBeenCalledWith(Refusal) })
    await waitFor(() => { expect(previous).toHaveBeenCalledWith(expect.objectContaining({ kind: 'vacated', unerased: 1 })) })
    expect(previous.mock.calls.map(([event]) => (event as { kind: string }).kind).filter((kind) => kind !== 'helloed')).to.deep.equal(['lease_unerased', 'vacated'])
    expect(previous).toHaveBeenCalledWith(expect.objectContaining({ kind: 'lease_unerased', refusal: Refusal, where: 'vacate' }))
    expect(next.mock.calls.map(([event]) => (event as { kind: string }).kind).filter((kind) => kind !== 'helloed')).to.deep.equal([])
  })
})

/** The one bank a provider has made. */
const onlyBank = (): Bank => {
  const [bank] = TH.seenBanks
  if (bank === undefined) { throw new Error('no bank seen') }
  return bank
}

/** The passphrase field on screen. */
const passphraseFieldOf = (): HTMLInputElement => screen.getByLabelText(Messages.passphraseField)

describe("BankProvider's dialog", () => {
  it("builds the vault from a click: unborn, then present and unlocked", async () => {
    provided()
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(screen.queryByText(Messages.chooseTitle)).to.not.be.null })
    TH.submitNewPassphrase(TH.Passphrase)
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    expect(dialogShown()).to.be.false
  })

  it("unlocks a vault built on another device from a click", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    provided({}, world)
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(screen.queryByText(Messages.unlockTitle)).to.not.be.null })
    TH.submitPassphrase(TH.Passphrase)
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    expect(dialogShown()).to.be.false
  })

  it("opens the dialog for the gating the bank holds", async () => {
    provided()
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(screen.queryByText(Messages.chooseTitle)).to.not.be.null })
    expect(onlyBank().snapshot.openGating).to.not.be.null
  })

  it("shows the dialog with the user's gesture spent, as its own click supplies the next", async () => {
    provided()
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    TH.withoutGesture()
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(screen.queryByText(Messages.chooseTitle)).to.not.be.null })
  })

  it("asks the vault's passkey within the dialog's own click, the user's gesture otherwise spent", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const world = TH.makeBankWorld()
    const { vault } = await TH.makeBankWithVault(world)
    await TH.addPasskeyTo(world, vault, await createPasskey(TH.PasskeyMaking))
    provided({}, world)
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
    provided()
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(dialogShown()).to.be.true })
    const gating = onlyBank().snapshot.openGating
    fireEvent.click(screen.getByText(Messages.cancelButton))
    await waitFor(() => { expect(dialogShown()).to.be.false })
    expect(gating?.isOpen).to.be.false
    expect(onlyBank().snapshot.openGating).to.be.null
    expect(shown('vault')).to.eq('unborn none')
  })

  it("closes the dialog at a sweep of the bank", async () => {
    provided()
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(dialogShown()).to.be.true })
    act(() => { onlyBank().sweep() })
    expect(dialogShown()).to.be.false
  })

  it("closes the dialog at a vacate of the bank", async () => {
    provided()
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(dialogShown()).to.be.true })
    await act(async () => { await onlyBank().vacate() })
    expect(dialogShown()).to.be.false
  })

  it("replaces a concluded gating's dialog with the next one's, nothing typed carried over", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    provided({}, world)
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(dialogShown()).to.be.true })
    const bank = onlyBank()
    const first = bank.snapshot.openGating
    fireEvent.change(passphraseFieldOf(), { target: { value: 'half typed' } })
    const vault = bank.vaultAt({ vaultlabel: 'main' })!
    await act(async () => {
      first?.dismiss()
      void vault.tryEnsureUnlocked()
      await vi.waitFor(() => { expect(bank.snapshot.openGating).to.not.equal(first); expect(bank.snapshot.openGating).to.not.be.null })
    })
    await waitFor(() => { expect(dialogShown()).to.be.true })
    expect(passphraseFieldOf().value).to.eq('')
    expect(bank.snapshot.openGating).to.not.equal(first)
    TH.submitPassphrase(TH.Passphrase)
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    expect(dialogShown()).to.be.false
  })

  it("leaves the dialog up through a lock", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    provided({}, world)
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(dialogShown()).to.be.true })
    fireEvent.click(screen.getByText('Lock'))
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
    expect(dialogShown()).to.be.true
  })

  it("closes the dialog when the user signs out", async () => {
    const { props, rerender } = provided()
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(dialogShown()).to.be.true })
    rerender({ ...props, user_id: null })
    await waitFor(() => { expect(dialogShown()).to.be.false })
    expect(shown('bank')).to.eq('none')
  })

  it("asks the vault's passkey under the relying party it was handed", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const world = TH.makeBankWorld()
    const { vault } = await TH.makeBankWithVault(world)
    await TH.addPasskeyTo(world, vault, await createPasskey(TH.PasskeyMaking))
    provided({ passkeyRpId: 'example.com' }, world)
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
    fireEvent.click(screen.getByText('Open'))
    fireEvent.click(await screen.findByText(Messages.passkeyButton))
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    expect(authenticator.calls.get.at(-1)?.publicKey).to.include({ rpId: 'example.com' })
  })

  it("hands each gating to the host's requestCleartext in place of its own dialog", async () => {
    const handed: AnyGating[] = []
    provided({ requestCleartext: async (gating) => { handed.push(gating); await gating.attempt(TH.byPassphrase(TH.Passphrase)) } })
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    expect(handed.map(({ gatingkind }) => gatingkind)).to.deep.equal(['build_vault'])
    expect(dialogShown()).to.be.false
  })

  it("hands each gating to the host's requestCleartext as it was last rendered", async () => {
    const first = vi.fn()
    const handed: AnyGating[] = []
    const { props, rerender } = provided({ requestCleartext: first })
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    rerender({ ...props, requestCleartext: async (gating) => { handed.push(gating); await gating.attempt(TH.byPassphrase(TH.Passphrase)) } })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    expect(handed.map(({ gatingkind }) => gatingkind)).to.deep.equal(['build_vault'])
    expect(first).not.toHaveBeenCalled()
  })

  it("keeps to its own dialog when requestCleartext arrives after the first render", async () => {
    const requestCleartext = vi.fn()
    const { props, rerender } = provided()
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    rerender({ ...props, requestCleartext })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(dialogShown()).to.be.true })
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  it("keeps to the host's dialog when requestCleartext is dropped after the first render", async () => {
    const { props, rerender } = provided({ requestCleartext: () => undefined })
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    rerender({ ...props, requestCleartext: undefined })
    fireEvent.click(screen.getByText('Open'))
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(dialogShown()).to.be.false
    expect(shown('vault')).to.eq('unborn none')
  })

  it("asks nobody when requestCleartext answers nothing", async () => {
    provided({ requestCleartext: () => undefined })
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    fireEvent.click(screen.getByText('Open'))
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(dialogShown()).to.be.false
    expect(shown('vault')).to.eq('unborn none')
  })
})
