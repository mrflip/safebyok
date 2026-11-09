import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DelVaultModal } from '../src/modals/del-vault-modal'
import { Messages } from '../src/helpers/messages'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

/** A del_vault gating on a vault built under {@link TH.Passphrase}, shown in a DelVaultModal. */
const shownFor = async () => {
  const world = TH.makeBankWorld()
  await TH.makeBankWithVault(world)
  const opened = await TH.openGatingOf(world, TH.deleting)
  render(<DelVaultModal gating={TH.gatingOfKind(opened.gating, 'del_vault')} />)
  return { ...opened }
}

const alertText = () => screen.getByRole('alert').textContent

describe("DelVaultModal", () => {
  it("deletes the vault on its passphrase, filed under the user and the vault, and the gating concludes", async () => {
    const { bank, raising } = await shownFor()
    expect(screen.getByText(Messages.delVaultTitle)).to.exist
    expect(screen.getByDisplayValue('u1 (main vault)')).to.exist
    TH.submitDeletion(TH.Passphrase)
    expect(await raising).to.include({ ok: true })
    expect(bank.vaultAt(TH.VaultScopeGiven)?.isPresent).to.not.be.true
  })

  it("shows a wrong passphrase in place, deleting nothing, and deletes on the right one", async () => {
    const { bank, gating, raising } = await shownFor()
    TH.submitDeletion('not the passphrase')
    await waitFor(() => { expect(alertText()).to.not.eq('') })
    expect(gating.isOpen).to.be.true
    expect(bank.vaultAt(TH.VaultScopeGiven)?.isPresent).to.be.true
    TH.submitDeletion(TH.Passphrase)
    expect(await raising).to.include({ ok: true })
  })

  it("dismisses the gating on Cancel, and the vault stays", async () => {
    const { bank, raising } = await shownFor()
    fireEvent.click(screen.getByText(Messages.cancelButton))
    expect(await raising).to.include({ ok: false })
    expect(bank.vaultAt(TH.VaultScopeGiven)?.isPresent).to.be.true
  })

  it("stays open through a lock, which does not stop a deletion", async () => {
    const { bank, gating } = await shownFor()
    act(() => { bank.lock() })
    expect(gating.isOpen).to.be.true
    TH.submitDeletion(TH.Passphrase)
  })
})
