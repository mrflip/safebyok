import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BankProvider } from '../../src/provider/bank-provider'
import { DevVaultDBInspector } from '../../src/devmode'
import * as TH from '../test-helpers'

TH.sweepBankWorlds()

/** Render the inspector over a world whose vault has a box `anthropic`, under a provider signed in as the world's user. */
const renderOverBox = async () => {
  const { world, vault } = await TH.makeBankWithVault()
  await vault.putBox({ boxlabel: 'anthropic', whisper: { apiKey: 'sk-ant-fake-stored' } }, { ifAbsent: 'add' })
  render(<BankProvider {...TH.providerPropsOf(world)}><DevVaultDBInspector vaultDB={world.vaultDB} /></BankProvider>)
  await waitFor(() => { expect(boxRow('anthropic')).to.exist })
  return { world, vault }
}

/** Return the table row for the box named `boxlabel`. */
const boxRow = (boxlabel: string) => screen.getByText(boxlabel).closest('tr') as HTMLElement
const lastCall = () => screen.getByRole('status').textContent

describe("DevVaultDBInspector", () => {
  it("lists the vault row and its box rows as listVaults and listBoxes answer them", async () => {
    await renderOverBox()
    expect(screen.getByText('main').closest('tr')?.dataset['am']).to.eq('a')
    expect(boxRow('anthropic').dataset['am']).to.eq('a')
  })

  it("shows what getBox answers for a box row, which is ciphertext", async () => {
    await renderOverBox()
    fireEvent.click(within(boxRow('anthropic')).getByRole('button', { name: 'getBox' }))
    await waitFor(() => { expect(lastCall()).to.include('whisper_ciphered') })
    expect(lastCall()).not.to.include('sk-ant-fake-stored')
  })

  it("deletes a box row with delBox, then shows tidyGone's count", async () => {
    await renderOverBox()
    fireEvent.click(within(boxRow('anthropic')).getByRole('button', { name: 'delBox' }))
    await waitFor(() => { expect(boxRow('anthropic').dataset['am']).to.eq('x') })
    fireEvent.click(screen.getByRole('button', { name: 'tidyGone' }))
    await waitFor(() => { expect(lastCall()).to.include('totalCount') })
  })

  it("lists a damaged box row with getBox and no delBox", async () => {
    const { world, vault } = await renderOverBox()
    world.vaultDB._cheat_boxRowsOf(vault.scope, vault.snapshot.vault_tok).set('mangled', { am: 'a', fmt: 'nonsense' })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => { expect(boxRow('mangled').dataset['am']).to.eq('d') })
    expect(within(boxRow('mangled')).getByRole('button', { name: 'getBox' })).to.exist
    expect(within(boxRow('mangled')).queryByRole('button', { name: 'delBox' })).to.be.null
  })

  it("leaves a damaged box row's revision and time blank", async () => {
    const { world, vault } = await renderOverBox()
    world.vaultDB._cheat_boxRowsOf(vault.scope, vault.snapshot.vault_tok).set('mangled', { am: 'a', revision_seq: 9 })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => { expect(boxRow('mangled').dataset['am']).to.eq('d') })
    const cells = within(boxRow('mangled')).getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells.slice(1, 5)).to.deep.eq(['mangled', 'd', '', ''])
  })

  it("lists a box put elsewhere, as its watch hears of it", async () => {
    const { vault } = await renderOverBox()
    await vault.putBox({ boxlabel: 'openai', whisper: { apiKey: 'sk-fake' } }, { ifAbsent: 'add' })
    await waitFor(() => { expect(boxRow('openai')).to.exist })
  })

  it("says so when no user is signed in", () => {
    render(<BankProvider {...TH.providerPropsOf(TH.makeBankWorld(), { user_id: null })}><DevVaultDBInspector vaultDB={TH.makeBankWorld().vaultDB} /></BankProvider>)
    expect(screen.getByText(/^No bank/)).to.exist
  })
})
