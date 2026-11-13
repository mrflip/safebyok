import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Messages } from '../src/helpers/messages'
import { DelBankModal } from '../src/modals/del-bank-modal'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

/** Open a del_bank gating on a bank built with {@link TH.Passphrase}, a vault in it, and render it in a DelBankModal. */
async function shownFor() {
  const world = TH.makeBankWorld()
  await TH.makeBankWithVault(world)
  const opened = await TH.openGatingOf(world, TH.deleting)
  render(<DelBankModal gating={TH.gatingOfKind(opened.gating, 'del_bank')} />)
  return { ...opened, world }
}

/** True when the world's bankDB still has a live bank: a device that dismisses every dialog brings it up. */
async function isBankStored(world: TH.BankWorld) {
  const ensured = await world.deviceOnAnotherDevice({ requestCleartext: () => undefined }).tryEnsureBank()
  return ensured.ok
}

function alertText() { return screen.getByRole('alert').textContent }

describe("DelBankModal", () => {
  it("deletes the bank on the passphrase, naming the user and the bank, and the gating concludes", async () => {
    const { world, device, raising } = await shownFor()
    expect(screen.getByText(Messages.delBankTitle)).to.exist
    expect(screen.getByDisplayValue('u1 (acme vault)')).to.exist
    TH.submitBankDeletion(TH.Passphrase)
    expect(await raising).to.include({ ok: true })
    expect(device.bank).to.be.null
    expect(await isBankStored(world)).to.be.false
  })

  it("shows a wrong passphrase in place, deleting nothing, and deletes on the right one", async () => {
    const { world, gating, raising } = await shownFor()
    TH.submitBankDeletion('not the passphrase')
    await waitFor(() => { expect(alertText()).to.not.eq('') })
    expect(gating.isOpen).to.be.true
    expect(await isBankStored(world)).to.be.true
    TH.submitBankDeletion(TH.Passphrase)
    expect(await raising).to.include({ ok: true })
  })

  it("dismisses the gating on Cancel, and the bank stays", async () => {
    const { world, raising } = await shownFor()
    fireEvent.click(screen.getByText('Cancel'))
    expect(await raising).to.include({ ok: false })
    expect(await isBankStored(world)).to.be.true
  })
})
