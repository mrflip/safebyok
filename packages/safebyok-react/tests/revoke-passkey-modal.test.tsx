import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Bank } from 'safebyok'
import { Messages } from '../src/helpers/messages'
import { RevokePasskeyModal } from '../src/modals/revoke-passkey-modal'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

/** Open a revoke_passkey gating on a vault built with {@link TH.Passphrase} that has a passkey, and render it in a RevokePasskeyModal. */
const shownFor = async () => {
  const world = TH.makeBankWorld()
  const { vault } = await TH.makeBankWithVault(world)
  await TH.addPasskeyTo(world, vault)
  const opened = await TH.openGatingOf(world, TH.revokingPasskey)
  render(<RevokePasskeyModal gating={TH.gatingOfKind(opened.gating, 'revoke_passkey')} />)
  return { ...opened }
}

/** True when `bank`'s vault has a passkey. */
const hasPasskey = (bank: Bank) => bank.vaultAt(TH.VaultScopeGiven)?.gate.toJSON().passkey_wayin != null

const alertText = () => screen.getByRole('alert').textContent

describe("RevokePasskeyModal", () => {
  it("removes the passkey on the passphrase, naming the user and the vault, and the gating concludes", async () => {
    const { bank, raising } = await shownFor()
    expect(screen.getByText(Messages.revokePasskeyTitle)).to.exist
    expect(screen.getByDisplayValue('u1 (main vault)')).to.exist
    TH.submitPasskeyRevoke(TH.Passphrase)
    expect(await raising).to.include({ ok: true })
    expect(hasPasskey(bank)).to.be.false
  })

  it("shows a wrong passphrase in place, removing nothing, and removes on the right one", async () => {
    const { bank, gating, raising } = await shownFor()
    TH.submitPasskeyRevoke('not the passphrase')
    await waitFor(() => { expect(alertText()).to.not.eq('') })
    expect(gating.isOpen).to.be.true
    expect(hasPasskey(bank)).to.be.true
    TH.submitPasskeyRevoke(TH.Passphrase)
    expect(await raising).to.include({ ok: true })
  })

  it("dismisses the gating on Cancel, and the passkey stays", async () => {
    const { bank, raising } = await shownFor()
    fireEvent.click(screen.getByText('Cancel'))
    expect(await raising).to.include({ ok: false })
    expect(hasPasskey(bank)).to.be.true
  })
})
