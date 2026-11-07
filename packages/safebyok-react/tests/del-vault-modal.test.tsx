import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DelVaultModal } from '../src/del-vault-modal'
import type { DialogAnswer } from '../src/modal'
import { Messages } from '../src/messages'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

/** A del_vault gating on a vault built under {@link TH.Passphrase}, shown in a DelVaultModal whose answers the test reads, closed by the first. */
const shownFor = async () => {
  const world = TH.makeBankWorld()
  await TH.makeBankWithVault(world)
  const held = await TH.heldGatingOf(world, TH.deleting)
  const answers: DialogAnswer[] = []
  const onDone = (answer: DialogAnswer) => { answers.push(answer); held.close() }
  render(<DelVaultModal gating={TH.gatingOfKind(held.gating, 'del_vault')} onDone={onDone} />)
  return { ...held, answers }
}

const alertText = () => screen.getByRole('alert').textContent

describe("DelVaultModal", () => {
  it("deletes the vault on its passphrase, filed under the user and the vault, and answers deleted", async () => {
    const { bank, raising, answers } = await shownFor()
    expect(screen.getByText(Messages.delVaultTitle)).to.exist
    expect(screen.getByDisplayValue('u1 (main vault)')).to.exist
    TH.submitDeletion(TH.Passphrase)
    await waitFor(() => { expect(answers).to.deep.equal(['deleted']) })
    expect(await raising).to.include({ ok: true })
    expect(bank.vaultAt(TH.VaultScopeGiven)?.isPresent).to.not.be.true
  })

  it("shows a wrong passphrase in place, deleting nothing, and deletes on the right one", async () => {
    const { bank, gating, raising, answers } = await shownFor()
    TH.submitDeletion('not the passphrase')
    await waitFor(() => { expect(alertText()).to.not.eq('') })
    expect(gating.isOpen).to.be.true
    expect(bank.vaultAt(TH.VaultScopeGiven)?.isPresent).to.be.true
    TH.submitDeletion(TH.Passphrase)
    await waitFor(() => { expect(answers).to.deep.equal(['deleted']) })
    expect(await raising).to.include({ ok: true })
  })

  it("answers declined on Cancel, and the vault stays", async () => {
    const { bank, raising, answers } = await shownFor()
    fireEvent.click(screen.getByText(Messages.cancelButton))
    expect(answers).to.deep.equal(['declined'])
    expect(await raising).to.include({ ok: false })
    expect(bank.vaultAt(TH.VaultScopeGiven)?.isPresent).to.be.true
  })

  it("stays open through a lock, which does not stop a deletion", async () => {
    const { bank, gating, answers } = await shownFor()
    act(() => { bank.lock() })
    expect(gating.isOpen).to.be.true
    TH.submitDeletion(TH.Passphrase)
    await waitFor(() => { expect(answers).to.deep.equal(['deleted']) })
  })
})
