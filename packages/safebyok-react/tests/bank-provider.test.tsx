import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bank, MemoryDeviceDB, MinuteMillis, VaultError, type AnyGating } from 'safebyok'
import { BankProvider, type BankProviderProps } from '../src/bank-provider'
import { Messages } from '../src/messages'
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
    expect(first?.snapshot.stage).to.eq('made')
    expect(second?.user_id).to.eq('u2')
  })

  it("sweeps its bank as it unmounts", async () => {
    const { unmount } = provided()
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    unmount()
    expect(TH.seenBanks[0]?.snapshot.stage).to.eq('made')
  })

  it("makes no new bank for handlers written inline at each render", async () => {
    const { props, rerender } = provided({ onBadNews: () => undefined, requestCleartext: undefined })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, onBadNews: () => undefined })
    rerender({ ...props, onBadNews: () => undefined })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(TH.seenBanks).to.have.lengthOf(1)
  })

  it("ends with one bank, ready, under StrictMode", async () => {
    const world = TH.makeBankWorld()
    render(<StrictMode><BankProvider {...TH.providerPropsOf(world)}><TH.ShowsVault /></BankProvider></StrictMode>)
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    const live = TH.seenBanks.filter((bank) => bank.snapshot.stage === 'ready')
    expect(live).to.have.lengthOf(1)
  })

  it("throws an option Bank.make does not take to the nearest error boundary", () => {
    const props = { ...TH.providerPropsOf(TH.makeBankWorld()), leaseHours: 3 } as Props
    const { reported } = TH.renderReporting(<TH.Catcher><BankProvider {...props}><TH.ShowsVault /></BankProvider></TH.Catcher>)
    expect(screen.getByText(/^caught: /)).to.exist
    expect(reported[0]).to.include({ refusalkind: 'bad_option' })
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
  const refuseErase = (deviceDB: MemoryDeviceDB) => vi.spyOn(deviceDB, 'tryVacate').mockResolvedValue(TH.bad(Refusal))

  it.each([
    ['onBadNews', { onBadNews: 'not a function' }],
    ['onPanic', { onPanic: 'not a function' }],
    ['requestCleartext', { requestCleartext: 'not a function' }],
  ])("throws %s given as no function to the nearest error boundary", (_name, misuse) => {
    const props = { ...TH.providerPropsOf(TH.makeBankWorld()), ...misuse } as unknown as Props
    const { reported } = TH.renderReporting(<TH.Catcher><BankProvider {...props}><TH.ShowsVault /></BankProvider></TH.Catcher>)
    expect(screen.getByText(/^caught: /)).to.exist
    expect(reported[0]).to.include({ refusalkind: 'bad_option' })
  })

  it("makes no new bank for an onPanic written inline at each render, and tells the last render's", async () => {
    vi.stubGlobal('reportError', vi.fn())
    const first = vi.fn()
    const last = vi.fn()
    const { props, rerender, deviceDB } = await unlockedProvided({ onPanic: first })
    rerender({ ...props, onPanic: () => undefined })
    rerender({ ...props, onPanic: last })
    refuseErase(deviceDB)
    fireEvent.click(screen.getByText('Lock'))
    await waitFor(() => { expect(last).toHaveBeenCalledWith(Refusal) })
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

  it("tells the next user's onPanic nothing of a panic from the bank it let go; the platform hears it", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const next = vi.fn()
    const erasing = TH.held<ReturnType<typeof TH.bad>>()
    const previous = vi.fn()
    const { props, rerender, deviceDB } = await unlockedProvided({ onPanic: previous })
    vi.spyOn(deviceDB, 'tryVacate').mockReturnValue(erasing.promise)
    fireEvent.click(screen.getByText('Lock'))
    rerender({ ...props, user_id: 'u2', onPanic: next })
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    erasing.resolve(TH.bad(Refusal))
    await waitFor(() => { expect(reported).toHaveBeenCalledWith(Refusal) })
    expect(previous).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it("says once, through the logger, that a prop which remakes the bank changed identity between renders", async () => {
    const heard = [TH.spyLogger(), TH.spyLogger(), TH.spyLogger()]
    const [first, second, third] = heard
    const { props, rerender } = provided({ logger: first?.logger })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, logger: second?.logger })
    await waitFor(() => { expect(TH.seenBanks).to.have.lengthOf(2) })
    rerender({ ...props, logger: third?.logger })
    await waitFor(() => { expect(TH.seenBanks).to.have.lengthOf(3) })
    expect(first?.calls).to.deep.equal([])
    expect(second?.calls.map(({ level, story }) => [level, story])).to.deep.equal([['warn', { call: 'BankProvider', props: ['logger'] }]])
    expect(second?.calls[0]?.message).to.match(/^BankProvider made its bank anew, letting its vaults go, because its logger changed identity between renders/)
    expect(third?.calls).to.deep.equal([])
  })

  it("names each prop that changed, and says nothing for a change of user alone", async () => {
    const spy = TH.spyLogger()
    const { props, rerender } = provided({ logger: spy.logger })
    await waitFor(() => { expect(shown('bank')).to.eq('u1 ready') })
    rerender({ ...props, user_id: 'u2' })
    await waitFor(() => { expect(shown('bank')).to.eq('u2 ready') })
    expect(spy.calls).to.deep.equal([])
    rerender({ ...props, user_id: 'u2', keyDeriver: { ...props.keyDeriver }, deviceDB: new MemoryDeviceDB() })
    await waitFor(() => { expect(spy.calls).to.have.lengthOf(1) })
    expect(spy.calls[0]?.story).to.deep.equal({ call: 'BankProvider', props: ['keyDeriver', 'deviceDB'] })
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

  it("hands each gating to the host's requestCleartext in place of its own dialog", async () => {
    const handed: AnyGating[] = []
    provided({ requestCleartext: async (gating) => { handed.push(gating); await gating.attempt(TH.byPassphrase(TH.Passphrase)) } })
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    expect(handed.map(({ gatingkind }) => gatingkind)).to.deep.equal(['build_vault'])
    expect(dialogShown()).to.be.false
  })

  it("asks nobody when requestCleartext is null", async () => {
    provided({ requestCleartext: null })
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
    fireEvent.click(screen.getByText('Open'))
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(dialogShown()).to.be.false
    expect(shown('vault')).to.eq('unborn none')
  })
})
