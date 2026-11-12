// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as TH from '../test-helpers'

/** Render the session bar with a fresh fake auth beside the vault probe, in a bank for `u1`, and sign in as margo. */
const renderSignedIn = async () => {
  const auth = TH.makeAuth()
  const { bankDB } = await TH.renderInBank(<><TH.LiveSessionBar auth={auth} /><TH.VaultProbe /></>)
  TH.signInAs('margo')
  await screen.findByText('margo')
  await TH.expectProbe('unborn none')
  return { auth, bankDB }
}

/** Sign in as margo, then build and unlock her vault through the provider's dialog. */
const renderWithVault = async () => {
  const world = await renderSignedIn()
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  await TH.answerPassphraseDialog()
  await TH.expectProbe('present unlocked')
  return world
}

describe("AccountMenu", () => {
  it("says who is signed in, builds the bank never built from its dialog, then the vault from a click", async () => {
    const auth = TH.makeAuth()
    await TH.renderInBank(<><TH.LiveSessionBar auth={auth} /><TH.VaultProbe /></>, { isBankBuilt: false })
    TH.signInAs('margo')
    await screen.findByText('margo')
    expect(screen.getByText(`(${auth.getSnapshot()?.user_id ?? ''})`)).to.not.be.null
    await TH.answerPassphraseDialog()
    await TH.expectProbe('unborn none')
    fireEvent.click(within(screen.getByRole('region', { name: 'Account' })).getByRole('button', { name: 'Create vault' }))
    await TH.expectProbe('present unlocked')
    expect(screen.getByText('Vault unlocked')).to.not.be.null
  })

  it("locks and unlocks the vault from its lock control", async () => {
    await renderWithVault()
    const menu = within(screen.getByRole('region', { name: 'Account' }))
    fireEvent.click(menu.getByRole('button', { name: 'Lock' }))
    await TH.expectProbe('present locked')
    fireEvent.click(menu.getByRole('button', { name: 'Unlock' }))
    await TH.answerPassphraseDialog()
    await TH.expectProbe('present unlocked')
  })

  it("shows the vault's ways in once it is built", async () => {
    await renderWithVault()
    expect(screen.getByText('Vault unlockers')).to.not.be.null
    expect(screen.getByRole('button', { name: 'Change passphrase' })).to.not.be.null
  })

  it("locks the vault as it signs out", async () => {
    const { auth } = await renderWithVault()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByPlaceholderText('username')
    expect(auth.getSnapshot()).to.be.null
    await TH.expectProbe('present locked')
  })

  it("deletes the vault and the account behind its confirming dialog alone", async () => {
    const confirm = vi.spyOn(globalThis, 'confirm')
    const { auth } = await renderWithVault()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await TH.answerDeletionDialog()
    await screen.findByPlaceholderText('username')
    expect(auth.getSnapshot()).to.be.null
    expect(confirm).not.toHaveBeenCalled()
    await TH.expectProbe('unborn none')
  })

  it("keeps the account and the vault when the user cancels the dialog", async () => {
    const { auth } = await renderWithVault()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
    expect(auth.getSnapshot()?.userlabel).to.eq('margo')
    expect(document.querySelector('.account-menu .gripe')).to.be.null
    await TH.expectProbe('present unlocked')
  })

  it("unlocks a locked vault before it confirms the deletion", async () => {
    const { auth } = await renderWithVault()
    const menu = within(screen.getByRole('region', { name: 'Account' }))
    fireEvent.click(menu.getByRole('button', { name: 'Lock' }))
    await TH.expectProbe('present locked')
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await TH.answerPassphraseDialog()
    await TH.answerDeletionDialog()
    await screen.findByPlaceholderText('username')
    expect(auth.getSnapshot()).to.be.null
    await TH.expectProbe('unborn none')
  })

  it("deletes an account whose vault was never born once the user confirms", async () => {
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    const { auth } = await renderSignedIn()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await screen.findByPlaceholderText('username')
    expect(confirm).toHaveBeenCalledOnce()
    expect(auth.getSnapshot()).to.be.null
  })

  it("keeps an account whose vault was never born when the user does not confirm", async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    const { auth } = await renderSignedIn()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(screen.queryByRole('dialog')).to.be.null
    expect(auth.getSnapshot()?.userlabel).to.eq('margo')
  })
})
