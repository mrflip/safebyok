import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Vault, VaultError, type RequestCleartext } from 'safebyok'
import { MemoryVaultDB, type VaultQuery } from 'safebyok/storage'
import { BankProvider } from '../src/bank-provider'
import { useBank, useBankSnapshot, useVault, useVaultSnapshot } from '../src/hooks'
import * as TH from './test-helpers'

TH.sweepBankWorlds()
beforeEach(() => { TH.seenBanks.length = 0 })

const shown = (testid: 'bank' | 'vault') => screen.getByTestId(testid).textContent

/** A MemoryVaultDB whose listBoxes refuses, once told to, while its listVaults still answers. */
class BoxRefusingVaultDB extends MemoryVaultDB {
  refusing = false
  protected override doListBoxes(asked: VaultQuery) {
    if (this.refusing) { throw new VaultError('storage_unavailable', 'refused by the test') }
    return super.doListBoxes(asked)
  }
}

/** Calls `hook` as it renders, and renders nothing. */
const Calls = ({ hook }: { hook: () => unknown }) => { hook(); return null }

describe("the hooks outside a BankProvider", () => {
  const HookCases = [
    ['useBank',          () => useBank()],
    ['useBankSnapshot',  () => useBankSnapshot()],
    ['useVault',         () => useVault('main')],
    ['useVaultSnapshot', () => useVaultSnapshot('main')],
  ] as const

  for (const [hookname, hook] of HookCases) {
    it(`${hookname} throws, naming the provider it needs`, () => {
      TH.renderReporting(<TH.Catcher><Calls hook={hook} /></TH.Catcher>)
      expect(screen.getByText(`caught: ${hookname} needs a <BankProvider> above it.`)).to.exist
    })
  }
})

describe("useVault and useVaultSnapshot", () => {
  it("read waiting until the bank is ready, then unborn for a vault never built", async () => {
    render(<BankProvider {...TH.providerPropsOf(TH.makeBankWorld())}><TH.ShowsVault /></BankProvider>)
    expect(shown('vault')).to.eq('waiting none')
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
  })

  it("read waiting while the bank's hello is refused, its snapshot saying so", async () => {
    const world = TH.makeBankWorld()
    world.vaultDB._cheat_refuseGets('storage_unavailable')
    render(<BankProvider {...TH.providerPropsOf(world)}><TH.ShowsVault /></BankProvider>)
    await waitFor(() => { expect(shown('bank')).to.eq('u1 refused') })
    expect(shown('vault')).to.eq('waiting none')
  })

  it("read a vault deleted elsewhere as unborn", async () => {
    const world = TH.makeBankWorld()
    const { vault } = await TH.makeBankWithVault(world)
    await vault.delVaultPrompt()
    render(<BankProvider {...TH.providerPropsOf(world)}><TH.ShowsVault /></BankProvider>)
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
  })

  it("read a vault built elsewhere as present, its snapshot following each unlock and lock", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    const requestCleartext: RequestCleartext = async (gating) => { await gating.attempt(TH.byPassphrase(TH.Passphrase)) }
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext })}><TH.ShowsVault /></BankProvider>)
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    fireEvent.click(screen.getByText('Lock'))
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
  })

  it("say hello to each vault once, however many components ask for it", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    const hello = vi.spyOn(Vault.prototype, 'tryHello')
    render(<BankProvider {...TH.providerPropsOf(world)}><TH.ShowsVault /><TH.ShowsVault /></BankProvider>)
    await waitFor(() => { expect(screen.getAllByTestId('vault').map(({ textContent }) => textContent)).to.deep.equal(['present locked', 'present locked']) })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(hello).toHaveBeenCalledOnce()
  })

  it("tell a refused vault hello to the host's onBadNews", async () => {
    const world = TH.makeBankWorld()
    const vaultDB = new BoxRefusingVaultDB()
    const seeding = world.bankOn({ vaultDB })
    await seeding.hello()
    await seeding.ensureVault(TH.VaultScopeGiven)
    seeding.sweep()
    vaultDB.refusing = true
    const news: VaultError[] = []
    render(<BankProvider {...TH.providerPropsOf(world, { vaultDB, onBadNews: (told) => { news.push(told) } })}><TH.ShowsVault /></BankProvider>)
    await waitFor(() => { expect(news.map(({ refusalkind }) => refusalkind)).to.include('storage_unavailable') })
  })
})
