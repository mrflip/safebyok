import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DelVaultModal } from '../src/modals/del-vault-modal'
import { Messages } from '../src/helpers/messages'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

/** Render a DelVaultModal over a vault just built, and so unlocked, with a spy for its `onDone`. */
const shownFor = async () => {
  const { world, bank, vault } = await TH.makeBankWithVault()
  const onDone = vi.fn()
  render(<DelVaultModal vault={vault} onDone={onDone} />)
  return { world, bank, vault, onDone }
}

const alertText = () => screen.getByRole('alert').textContent

describe("DelVaultModal", () => {
  it("deletes the vault on Delete, asking nothing more, and calls onDone with true", async () => {
    const { bank, onDone } = await shownFor()
    expect(screen.getByText(Messages.delVaultTitle)).to.exist
    expect(screen.queryByPlaceholderText(Messages.passphraseField)).to.be.null
    fireEvent.click(screen.getByText(Messages.delVaultButton))
    await waitFor(() => { expect(onDone).toHaveBeenCalledWith(true) })
    expect(bank.vaultAt(TH.VaultScopeGiven)?.isPresent).to.not.be.true
  })

  const CancelCases = [
    ['Cancel', () => { fireEvent.click(screen.getByText(Messages.cancelButton)) }],
    ['Escape', () => { fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })) }],
  ] as const

  for (const [how, cancel] of CancelCases) {
    it(`calls onDone with false on ${how}, and the vault stays`, async () => {
      const { bank, onDone } = await shownFor()
      cancel()
      expect(onDone).toHaveBeenCalledExactlyOnceWith(false)
      expect(bank.vaultAt(TH.VaultScopeGiven)?.isPresent).to.be.true
    })
  }

  it("focuses Cancel as it opens, so a stray Enter deletes nothing", async () => {
    await shownFor()
    expect(document.activeElement).to.have.property('textContent', Messages.cancelButton)
  })

  it("unlocks a locked bank first, asking the user, then deletes the vault and calls onDone with true", async () => {
    const { bank, onDone } = await shownFor()
    act(() => { bank.lock() })
    fireEvent.click(screen.getByText(Messages.delVaultButton))
    await waitFor(() => { expect(onDone).toHaveBeenCalledWith(true) })
    expect(bank.isUnlocked).to.be.true
    expect(bank.vaultAt(TH.VaultScopeGiven)?.isPresent).to.not.be.true
  })

  it("shows the refusal in place where the user does not unlock a locked bank, deleting nothing", async () => {
    const { world, bank, onDone } = await shownFor()
    act(() => { bank.lock() })
    world.dialog.typing = TH.byPassphrase('not the passphrase')
    fireEvent.click(screen.getByText(Messages.delVaultButton))
    await waitFor(() => { expect(alertText()).to.not.eq('') })
    expect(onDone).not.toHaveBeenCalled()
    expect(bank.vaultAt(TH.VaultScopeGiven)?.isPresent).to.be.true
  })
})
