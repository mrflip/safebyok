import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bank, MemoryDeviceDB, MinuteMillis, VaultError, type AnyGating } from 'safebyok'
import { BankProvider, type BankProviderProps } from '../src/bank-provider'
import { Messages } from '../src/messages'
import { createPasskey } from '../src/passkey'
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

  it("ends with one bank, ready, under StrictMode", async () => {
    const making = vi.spyOn(Bank, 'make')
    const world = TH.makeBankWorld()
    render(<StrictMode><BankProvider {...TH.providerPropsOf(world)}><TH.ShowsVault /></BankProvider></StrictMode>)
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    await act(async () => { await TH.wakeupAtNextTick() })
    const live = making.mock.results.filter((made) => (made.value as Bank).snapshot.stage === 'ready')
    expect(live).to.have.lengthOf(1)
  })

  it("makes no bank when the user signs out while its deviceDB answers", async () => {
    const deviceDB = new MemoryDeviceDB()
    const answering = TH.held()
    const ensureBank = deviceDB.ensureBank.bind(deviceDB)
    vi.spyOn(deviceDB, 'ensureBank').mockImplementation(async (scope) => {
      await answering.promise
      return ensureBank(scope)
    })
    const making = vi.spyOn(Bank, 'make')
    const { props, rerender } = provided({ deviceDB })
    rerender({ ...props, user_id: null })
    answering.resolve(undefined)
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
    const { props, rerender } = provided({ logger: spy.logger, onBadNews: () => undefined, onPanic: () => undefined })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, onBadNews: () => undefined, onPanic: () => undefined })
    rerender({ ...props, onBadNews: () => undefined, onPanic: () => undefined })
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

describe("BankProvider's handlers", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  const Refusal = new VaultError('storage_unavailable', 'the disk is full')
  const refuseErase = (deviceDB: MemoryDeviceDB) => vi.spyOn(deviceDB, 'tryForget').mockResolvedValue(TH.bad(Refusal))

  it.each([
    ['onBadNews', { onBadNews: 'not a function' }],
    ['onPanic', { onPanic: 'not a function' }],
    ['requestCleartext', { requestCleartext: 'not a function' }],
  ])("throws %s given as no function to the nearest error boundary", async (_name, misuse) => {
    const props = { ...TH.providerPropsOf(TH.makeBankWorld()), ...misuse } as unknown as Props
    const { reported } = TH.renderReporting(<TH.Catcher><BankProvider {...props}><TH.ShowsVault /></BankProvider></TH.Catcher>)
    await waitFor(() => { expect(screen.getByText(/^caught: /)).to.exist })
    expect(reported[0]).to.include({ refusalkind: 'bad_option' })
  })

  it("calls an onPanic written inline at each render as it was last rendered", async () => {
    vi.stubGlobal('reportError', vi.fn())
    const first = vi.fn()
    const last = vi.fn()
    const { props, rerender, deviceDB } = await unlockedProvided({ onPanic: first })
    rerender({ ...props, onPanic: () => undefined })
    rerender({ ...props, onPanic: last })
    refuseErase(deviceDB)
    fireEvent.click(screen.getByText('Lock'))
    await waitFor(() => { expect(last).toHaveBeenCalledWith(expect.objectContaining({ refusal: Refusal })) })
    expect(first).not.toHaveBeenCalled()
    expect(TH.seenBanks).to.have.lengthOf(1)
    expect(shown('vault')).to.eq('present locked')
  })

  it("leaves a vault whose lease survived its erase to be vacated when the host has no onPanic, as the core does", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const { deviceDB } = await unlockedProvided()
    refuseErase(deviceDB)
    fireEvent.click(screen.getByText('Lock'))
    await waitFor(() => { expect(reported).toHaveBeenCalledWith(Refusal) })
    await waitFor(() => { expect(shown('vault')).to.not.eq('present locked') })
  })

  it("tells the next user's onPanic nothing of a panic from the bank it let go", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const next = vi.fn()
    const erasing = TH.held<ReturnType<typeof TH.bad>>()
    const previous = vi.fn()
    const { props, rerender, deviceDB } = await unlockedProvided({ onPanic: previous })
    vi.spyOn(deviceDB, 'tryForget').mockReturnValue(erasing.promise)
    fireEvent.click(screen.getByText('Lock'))
    rerender({ ...props, user_id: 'u2', onPanic: next })
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    erasing.resolve(TH.bad(Refusal))
    await waitFor(() => { expect(reported).toHaveBeenCalledWith(Refusal) })
    expect(previous).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })
})

describe("BankProvider's autolock", () => {
  afterEach(() => { vi.useRealTimers() })

  it("asks its bank to autolock each minute", async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const autolock = vi.spyOn(Bank.prototype, 'autolock')
    provided()
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    expect(autolock).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(MinuteMillis) })
    expect(autolock).toHaveBeenCalledOnce()
  })
})

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

  it("shows no dialog once the user's gesture is spent, and the ask is declined", async () => {
    provided()
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    TH.withoutGesture()
    fireEvent.click(screen.getByText('Open'))
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(dialogShown()).to.be.false
    expect(shown('vault')).to.eq('unborn none')
  })

  it("closes the dialog once its gating settles elsewhere, as at a lock", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    provided({}, world)
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(dialogShown()).to.be.true })
    fireEvent.click(screen.getByText('Lock'))
    await waitFor(() => { expect(dialogShown()).to.be.false })
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

  it("asks nobody when requestCleartext answers nothing", async () => {
    provided({ requestCleartext: async () => undefined })
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    fireEvent.click(screen.getByText('Open'))
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(dialogShown()).to.be.false
    expect(shown('vault')).to.eq('unborn none')
  })
})
