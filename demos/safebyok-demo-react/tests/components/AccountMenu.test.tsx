// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as TH from '../test-helpers'

/** Render the session bar with a fresh fake auth beside the vault probe, in a bank for `u1` with no vault, and sign in as margo. */
const renderSignedIn = async () => {
  const auth = TH.makeAuth()
  const { bankDB, deviceDB } = await TH.renderInBank(<><TH.LiveSessionBar auth={auth} /><TH.VaultProbe /></>)
  TH.signInAs('margo')
  await screen.findByText('margo')
  await TH.expectProbe('absent none')
  return { auth, bankDB, deviceDB }
}

/** Sign in as margo, then unlock her bank through the provider's dialog and put the vault. */
const renderWithVault = async () => {
  const world = await renderSignedIn()
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  await TH.answerPassphraseDialog()
  await TH.expectProbe('present unlocked')
  return world
}

/** Render the session bar beside the vault probe over an empty bankDB, sign in as margo, and cancel the dialog that builds her bank. */
const renderBankless = async () => {
  const auth = TH.makeAuth()
  await TH.renderInBank(<><TH.LiveSessionBar auth={auth} /><TH.VaultProbe /></>, { isBankBuilt: false })
  TH.signInAs('margo')
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
  await TH.expectProbe('bankless none')
  return { auth }
}

const accountMenu = () => within(screen.getByRole('region', { name: 'Account' }))

describe("AccountMenu", () => {
  it("says who is signed in, builds the bank never built from its dialog, then the vault from a click", async () => {
    const auth = TH.makeAuth()
    await TH.renderInBank(<><TH.LiveSessionBar auth={auth} /><TH.VaultProbe /></>, { isBankBuilt: false })
    TH.signInAs('margo')
    await screen.findByText('margo')
    expect(screen.getByText(`(${auth.getSnapshot()?.user_id ?? ''})`)).to.not.be.null
    await TH.answerPassphraseDialog()
    await TH.expectProbe('absent none')
    fireEvent.click(accountMenu().getByRole('button', { name: 'Create vault' }))
    await TH.expectProbe('present unlocked')
    expect(screen.getByText('Vault unlocked')).to.not.be.null
  })

  it("locks and unlocks the bank from its lock control", async () => {
    await renderWithVault()
    fireEvent.click(accountMenu().getByRole('button', { name: 'Lock' }))
    await TH.expectProbe('present locked')
    fireEvent.click(accountMenu().getByRole('button', { name: 'Unlock' }))
    await TH.answerPassphraseDialog()
    await TH.expectProbe('present unlocked')
  })

  it("shows the bank's ways in, vault or none", async () => {
    await renderSignedIn()
    expect(screen.getByText('Vault unlockers')).to.not.be.null
    expect(screen.getByRole('button', { name: 'Change passphrase' })).to.not.be.null
  })

  it("vacates the device as it signs out, forgetting its unlock and its device row", async () => {
    const { auth, deviceDB } = await renderWithVault()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByPlaceholderText('username')
    expect(auth.getSnapshot()).to.be.null
    await TH.expectProbe('spent none')
    await waitFor(async () => { expect(await deviceDB.listLeases()).to.deep.equal([]) })
    expect(await deviceDB.listRawDevices()).to.deep.equal([])
  })

  it("deletes the bank and the account behind the bank's own dialog alone", async () => {
    const confirm = vi.spyOn(globalThis, 'confirm')
    const { auth, bankDB } = await renderWithVault()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await TH.answerDeletionDialog()
    await screen.findByPlaceholderText('username')
    expect(auth.getSnapshot()).to.be.null
    expect(confirm).not.toHaveBeenCalled()
    await TH.expectProbe('bankless none')
    expect(await TH.isBankStored(bankDB)).to.be.false
  })

  it("keeps the account and the bank when the user cancels the dialog", async () => {
    const { auth } = await renderWithVault()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
    await waitFor(() => { expect(screen.queryByText('Delete everything')).to.be.null })
    expect(auth.getSnapshot()?.userlabel).to.eq('margo')
    expect(document.querySelector('.account-menu .gripe')).to.be.null
    await TH.expectProbe('present unlocked')
  })

  it("deletes a locked bank on its passphrase, unlocking nothing first", async () => {
    const { auth, bankDB } = await renderWithVault()
    fireEvent.click(accountMenu().getByRole('button', { name: 'Lock' }))
    await TH.expectProbe('present locked')
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await TH.answerDeletionDialog()
    await screen.findByPlaceholderText('username')
    expect(auth.getSnapshot()).to.be.null
    expect(await TH.isBankStored(bankDB)).to.be.false
  })

  it("deletes an account whose bank has no vault through the bank's dialog", async () => {
    const { auth, bankDB } = await renderSignedIn()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await TH.answerDeletionDialog()
    await screen.findByPlaceholderText('username')
    expect(auth.getSnapshot()).to.be.null
    expect(await TH.isBankStored(bankDB)).to.be.false
  })

  it("deletes an account with no bank once the user confirms", async () => {
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    const { auth } = await renderBankless()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await screen.findByPlaceholderText('username')
    expect(confirm).toHaveBeenCalledOnce()
    expect(auth.getSnapshot()).to.be.null
  })

  it("keeps an account with no bank when the user does not confirm", async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    const { auth } = await renderBankless()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(screen.queryByRole('dialog')).to.be.null
    expect(auth.getSnapshot()?.userlabel).to.eq('margo')
  })
})
