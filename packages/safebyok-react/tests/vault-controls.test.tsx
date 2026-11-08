import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Bank, MinuteMillis, type RequestCleartext, type VaultError } from 'safebyok'
import { BankProvider } from '../src/bank-provider'
import { CreateVaultButton, VaultLockControl } from '../src/vault-controls'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

afterEach(() => { vi.restoreAllMocks() })

/** A requestCleartext that types the test's passphrase into every dialog, and the gatingkinds it was asked for. */
const typingPassphrase = () => {
  const asked: string[] = []
  const requestCleartext: RequestCleartext = async (gating) => {
    asked.push(gating.gatingkind)
    await gating.attempt(TH.byPassphrase(TH.Passphrase))
  }
  return { asked, requestCleartext }
}

/** What the control says of the lock, or null where it shows no state. */
const lockWords = () => screen.queryByText(/^Vault (un)?locked$/)?.textContent ?? null

describe("VaultLockControl", () => {
  it("shows nothing while the bank is not ready", () => {
    const { container } = render(<BankProvider {...TH.providerPropsOf(TH.makeBankWorld())}><VaultLockControl vaultlabel="main" /></BankProvider>)
    expect(container.childNodes).to.have.lengthOf(0)
  })

  it("offers to create a vault never built, and shows it unlocked once the user has", async () => {
    const { asked, requestCleartext } = typingPassphrase()
    render(<BankProvider {...TH.providerPropsOf(TH.makeBankWorld(), { requestCleartext })}><VaultLockControl vaultlabel="main" /></BankProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'Create vault' }))
    await waitFor(() => { expect(lockWords()).to.eq('Vault unlocked') })
    expect(asked).to.deep.equal(['build_vault'])
    expect(screen.getByRole('button', { name: 'Lock' })).to.exist
  })

  it("unlocks a locked vault from the click, and locks it again", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    const { asked, requestCleartext } = typingPassphrase()
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext })}><VaultLockControl vaultlabel="main" /></BankProvider>)
    await waitFor(() => { expect(lockWords()).to.eq('Vault locked') })
    expect(asked).to.deep.equal([])
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => { expect(lockWords()).to.eq('Vault unlocked') })
    expect(asked).to.deep.equal(['unlock_vault'])
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    await waitFor(() => { expect(lockWords()).to.eq('Vault locked') })
    expect(screen.getByText('Vault locked').parentElement?.dataset['locked']).to.eq('true')
  })

  it("unlocks the vault in hand, never asking the bank to ensure one", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    const ensuring = vi.spyOn(Bank.prototype, 'ensureVault')
    const { requestCleartext } = typingPassphrase()
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext })}><VaultLockControl vaultlabel="main" /></BankProvider>)
    await waitFor(() => { expect(lockWords()).to.eq('Vault locked') })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => { expect(lockWords()).to.eq('Vault unlocked') })
    expect(ensuring).not.toHaveBeenCalled()
  })

  it("stays locked, and tells nobody, when the user declines the dialog", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    const news: VaultError[] = []
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext: async () => undefined, onBadNews: ({ news: told }) => { news.push(told) } })}><VaultLockControl vaultlabel="main" /></BankProvider>)
    await waitFor(() => { expect(lockWords()).to.eq('Vault locked') })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await TH.wakeupAtNextTick()
    expect(lockWords()).to.eq('Vault locked')
    expect(news).to.deep.equal([])
  })

  it("tells the host's onBadNews of an unlock storage refused", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    const news: VaultError[] = []
    const { requestCleartext } = typingPassphrase()
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext, onBadNews: ({ news: told }) => { news.push(told) } })}><VaultLockControl vaultlabel="main" /></BankProvider>)
    await waitFor(() => { expect(lockWords()).to.eq('Vault locked') })
    world.vaultDB._cheat_refuseGets('storage_unavailable')
    world.advance(60 * MinuteMillis)
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => { expect(news.map(({ refusalkind }) => refusalkind)).to.include('storage_unavailable') })
    expect(lockWords()).to.eq('Vault locked')
  })
})

describe("CreateVaultButton", () => {
  it("builds the vault from the click", async () => {
    const world = TH.makeBankWorld()
    const { asked, requestCleartext } = typingPassphrase()
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext })}><CreateVaultButton vaultlabel="main" /></BankProvider>)
    const button = screen.getByRole('button', { name: 'Create vault' })
    await waitFor(() => { expect(button.hasAttribute('disabled')).to.be.false })
    fireEvent.click(button)
    await waitFor(() => { expect(asked).to.deep.equal(['build_vault']) })
    const bank = world.bankOnAnotherDevice()
    await waitFor(async () => {
      await bank.hello()
      expect(bank.vaultAt({ vaultlabel: 'main' })?.isPresent).to.be.true
    })
  })

  it("is disabled until the bank's hello lands", async () => {
    render(<BankProvider {...TH.providerPropsOf(TH.makeBankWorld())}><CreateVaultButton vaultlabel="main" /></BankProvider>)
    const button = screen.getByRole('button', { name: 'Create vault' })
    expect(button.hasAttribute('disabled')).to.be.true
    await waitFor(() => { expect(button.hasAttribute('disabled')).to.be.false })
  })

  it("is disabled while nobody is signed in", () => {
    render(<BankProvider {...TH.providerPropsOf(TH.makeBankWorld(), { user_id: null })}><CreateVaultButton vaultlabel="main" /></BankProvider>)
    expect(screen.getByRole('button', { name: 'Create vault' }).hasAttribute('disabled')).to.be.true
  })
})
