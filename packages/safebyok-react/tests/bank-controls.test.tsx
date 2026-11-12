import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MinuteMillis, type RequestCleartext, type VaultError } from 'safebyok'
import { BankProvider } from '../src/provider/bank-provider'
import { BankLockControl, CreateVaultButton } from '../src/components/bank-controls'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

afterEach(() => { vi.restoreAllMocks() })

/** Return a requestCleartext that attempts every gating with the test's passphrase, and the list of gatingkinds it was asked for.
 * The first `dismissing` gatings it is handed it dismisses, as a user who presses Cancel.
 */
const typingPassphrase = (dismissing = 0) => {
  const asked: string[] = []
  const requestCleartext: RequestCleartext = async (gating) => {
    asked.push(gating.gatingkind)
    if (asked.length <= dismissing) { return }
    await gating.attempt(TH.byPassphrase(TH.Passphrase))
  }
  return { asked, requestCleartext }
}

/** Return the control's lock text ('Vault locked' or 'Vault unlocked'), or null when it shows neither. */
const lockWords = () => screen.queryByText(/^Vault (un)?locked$/)?.textContent ?? null

describe("BankLockControl", () => {
  it("shows nothing while there is no bank", () => {
    const { container } = render(<BankProvider {...TH.providerPropsOf(TH.makeBankWorld())}><BankLockControl /></BankProvider>)
    expect(container.childNodes).to.have.lengthOf(0)
  })

  it("shows the bank built at sign-in unlocked, whatever vaults it has", async () => {
    const { asked, requestCleartext } = typingPassphrase()
    render(<BankProvider {...TH.providerPropsOf(TH.makeBankWorld(), { requestCleartext })}><BankLockControl /></BankProvider>)
    await waitFor(() => { expect(lockWords()).to.eq('Vault unlocked') })
    expect(asked).to.deep.equal(['build_bank'])
  })

  it("unlocks a locked bank from the click, and locks it again", async () => {
    const world = TH.makeBankWorld()
    await world.ensureBuilt()
    const { asked, requestCleartext } = typingPassphrase()
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext })}><BankLockControl /></BankProvider>)
    await waitFor(() => { expect(lockWords()).to.eq('Vault locked') })
    expect(asked).to.deep.equal([])
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => { expect(lockWords()).to.eq('Vault unlocked') })
    expect(asked).to.deep.equal(['unlock_bank'])
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    await waitFor(() => { expect(lockWords()).to.eq('Vault locked') })
    expect(screen.getByText('Vault locked').parentElement?.dataset['locked']).to.eq('true')
  })

  it("stays locked, and reports nothing, when the user dismisses the dialog", async () => {
    const world = TH.makeBankWorld()
    await world.ensureBuilt()
    const news: VaultError[] = []
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext: () => undefined, onBadNews: ({ news: told }) => { news.push(told) } })}><BankLockControl /></BankProvider>)
    await waitFor(() => { expect(lockWords()).to.eq('Vault locked') })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await TH.wakeupAtNextTick()
    expect(lockWords()).to.eq('Vault locked')
    expect(news).to.deep.equal([])
  })

  it("tells the host's onBadNews of an unlock storage refused", async () => {
    const world = TH.makeBankWorld()
    await world.ensureBuilt()
    const news: VaultError[] = []
    const { requestCleartext } = typingPassphrase()
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext, onBadNews: ({ news: told }) => { news.push(told) } })}><BankLockControl /></BankProvider>)
    await waitFor(() => { expect(lockWords()).to.eq('Vault locked') })
    world.bankDB._cheat_refuseGets('storage_unavailable')
    world.advance(60 * MinuteMillis)
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => { expect(news.map(({ refusalkind }) => refusalkind)).to.include('storage_unavailable') })
    expect(lockWords()).to.eq('Vault locked')
  })
})

/** Wait until the bank stored in `world` lists the vault `main` as present. */
const expectVaultStored = async (world: TH.BankWorld) => {
  await waitFor(async () => {
    const bank = await world.bankOnAnotherDevice()
    expect(bank.vaultAt({ vaultlabel: 'main' })?.isPresent).to.be.true
  })
}

describe("CreateVaultButton", () => {
  it("unlocks a bank built elsewhere, then puts the vault, from one click", async () => {
    const world = TH.makeBankWorld()
    await world.ensureBuilt()
    const { asked, requestCleartext } = typingPassphrase()
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext })}><BankLockControl /><CreateVaultButton vaultlabel="main" /></BankProvider>)
    await waitFor(() => { expect(lockWords()).to.eq('Vault locked') })
    fireEvent.click(screen.getByRole('button', { name: 'Create vault' }))
    await expectVaultStored(world)
    expect(asked).to.deep.equal(['unlock_bank'])
    expect(lockWords()).to.eq('Vault unlocked')
  })

  it("builds the bank the user cancelled at sign-in, then puts the vault, from one click", async () => {
    const world = TH.makeBankWorld()
    const { asked, requestCleartext } = typingPassphrase(1)
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext })}><BankLockControl /><CreateVaultButton vaultlabel="main" /></BankProvider>)
    await waitFor(() => { expect(asked).to.deep.equal(['build_bank']) })
    await TH.wakeupAtNextTick()
    expect(lockWords()).to.be.null
    fireEvent.click(screen.getByRole('button', { name: 'Create vault' }))
    // Not until the bank is built here: the world builds one elsewhere for the bank it is asked for.
    await waitFor(() => { expect(lockWords()).to.eq('Vault unlocked') })
    await expectVaultStored(world)
    expect(asked).to.deep.equal(['build_bank', 'build_bank'])
  })

  it("says nothing to the host when the user cancels a dialog it opened", async () => {
    const world = TH.makeBankWorld()
    await world.ensureBuilt()
    const news: VaultError[] = []
    const { asked, requestCleartext } = typingPassphrase(1)
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext, onBadNews: ({ news: told }) => { news.push(told) } })}><BankLockControl /><CreateVaultButton vaultlabel="main" /></BankProvider>)
    await waitFor(() => { expect(lockWords()).to.eq('Vault locked') })
    fireEvent.click(screen.getByRole('button', { name: 'Create vault' }))
    await waitFor(() => { expect(asked).to.deep.equal(['unlock_bank']) })
    await TH.wakeupAtNextTick()
    expect(news).to.deep.equal([])
    expect(lockWords()).to.eq('Vault locked')
  })

  it("is disabled while nobody is signed in", () => {
    render(<BankProvider {...TH.providerPropsOf(TH.makeBankWorld(), { user_id: null })}><CreateVaultButton vaultlabel="main" /></BankProvider>)
    expect(screen.getByRole('button', { name: 'Create vault' }).hasAttribute('disabled')).to.be.true
  })
})
