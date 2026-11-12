// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WaysIn } from '../../src/components/WaysIn'
import * as TH from '../test-helpers'

const NextPassphrase = 'a whole new passphrase for the vault'

afterEach(() => { vi.restoreAllMocks() })

/** Render WaysIn beside the vault probe in a bank for `u1`, then build and unlock the vault. */
const renderBuilt = async () => {
  await TH.renderInBank(<><WaysIn /><TH.VaultProbe /></>)
  await TH.expectProbe('absent none')
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  await TH.answerPassphraseDialog()
  await TH.expectProbe('present unlocked')
}

describe("WaysIn", () => {
  it("shows nothing while there is no bank", async () => {
    await TH.renderInBank(<><WaysIn /><TH.VaultProbe /></>, { isBankBuilt: false })
    await screen.findByPlaceholderText('confirm vault passphrase')
    expect(screen.queryByText('Vault unlockers')).to.be.null
  })

  it("shows the bank's passphrase, and that it has no passkey", async () => {
    await renderBuilt()
    expect(screen.getByText(/^passphrase/)).to.not.be.null
    expect(screen.getByText('no passkey')).to.not.be.null
  })

  it("changes the passphrase through the provider's dialog, and the new one unlocks the bank", async () => {
    await renderBuilt()
    fireEvent.click(screen.getByRole('button', { name: 'Change passphrase' }))
    await TH.answerReplacementDialog(TH.Passphrase, NextPassphrase)
    await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
    await TH.expectProbe('present unlocked')
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    await TH.expectProbe('present locked')
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await TH.answerPassphraseDialog(NextPassphrase)
    await TH.expectProbe('present unlocked')
  })

  it("says nothing when the user cancels the dialog", async () => {
    await renderBuilt()
    fireEvent.click(screen.getByRole('button', { name: 'Change passphrase' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
    // The prompt settles as its gating concludes, which closed the dialog: a tick later, the page has heard it.
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(document.querySelector('.ways-in .gripe')).to.be.null
  })

  it("offers no fingerprint in a browser without WebAuthn", async () => {
    await renderBuilt()
    expect(screen.queryByRole('button', { name: 'Add fingerprint' })).to.be.null
    expect(screen.queryByRole('button', { name: 'Remove fingerprint' })).to.be.null
  })

  it("adds a fingerprint through the provider's dialog, then offers only to remove it, which leaves the passphrase alone", async () => {
    TH.installFakeAuthenticator()
    await renderBuilt()
    expect(screen.queryByRole('button', { name: 'Remove fingerprint' })).to.be.null
    fireEvent.click(screen.getByRole('button', { name: 'Add fingerprint' }))
    await TH.answerPasskeyAddDialog()
    await screen.findByText(/^passkey/)
    await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
    expect(screen.queryByRole('button', { name: 'Add fingerprint' })).to.be.null
    fireEvent.click(screen.getByRole('button', { name: 'Remove fingerprint' }))
    await TH.answerPasskeyRevokeDialog()
    await screen.findByText('no passkey')
    await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
    expect(screen.getByRole('button', { name: 'Add fingerprint' })).to.not.be.null
    await TH.expectProbe('present unlocked')
  })

  it("says nothing when the user cancels the fingerprint's dialog", async () => {
    TH.installFakeAuthenticator()
    await renderBuilt()
    fireEvent.click(screen.getByRole('button', { name: 'Add fingerprint' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
    // The prompt settles as its gating concludes, which closed the dialog: a tick later, the page has heard it.
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(document.querySelector('.ways-in .gripe')).to.be.null
  })
})
