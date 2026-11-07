// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Vault } from 'safebyok'
import { WaysIn } from '../../src/components/WaysIn'
import * as TH from '../test-helpers'

const NextPassphrase = 'a whole new passphrase for the vault'

afterEach(() => { vi.restoreAllMocks() })

/** WaysIn beside the vault probe, in a bank for `u1`, with the vault built and unlocked. */
const renderBuilt = async () => {
  TH.renderInBank(<><WaysIn /><TH.VaultProbe /></>)
  await TH.expectProbe('unborn none')
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  await TH.answerPassphraseDialog()
  await TH.expectProbe('present unlocked')
}

describe("WaysIn", () => {
  it("shows nothing while the vault is unborn", async () => {
    TH.renderInBank(<><WaysIn /><TH.VaultProbe /></>)
    await TH.expectProbe('unborn none')
    expect(screen.queryByText('Vault unlockers')).to.be.null
  })

  it("shows the vault's passphrase, and that it has no passkey", async () => {
    await renderBuilt()
    expect(screen.getByText(/^passphrase/)).to.not.be.null
    expect(screen.getByText('no passkey')).to.not.be.null
  })

  it("changes the passphrase through the provider's dialog, and the new one unlocks the vault", async () => {
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
    const prompting = vi.spyOn(Vault.prototype, 'tryReplacePassphrasePrompt')
    fireEvent.click(screen.getByRole('button', { name: 'Change passphrase' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await TH.settlePrompts(prompting)
    expect(screen.queryByRole('dialog')).to.be.null
    expect(document.querySelector('.ways-in .gripe')).to.be.null
  })
})
