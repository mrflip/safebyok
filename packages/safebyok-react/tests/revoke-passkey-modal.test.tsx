import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Bank } from 'safebyok'
import { Messages } from '../src/helpers/messages'
import { RevokePasskeyModal } from '../src/modals/revoke-passkey-modal'
import type { DialogAnswer } from '../src/shapes'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

/** A revoke_passkey gating on a vault built under {@link TH.Passphrase} and holding a passkey, shown in a RevokePasskeyModal whose answers the test reads, closed by the first. */
const shownFor = async () => {
  const world = TH.makeBankWorld()
  const { vault } = await TH.makeBankWithVault(world)
  await TH.addPasskeyTo(world, vault)
  const held = await TH.heldGatingOf(world, TH.revokingPasskey)
  const answers: DialogAnswer[] = []
  const onDone = (answer: DialogAnswer) => { answers.push(answer); held.close() }
  render(<RevokePasskeyModal gating={TH.gatingOfKind(held.gating, 'revoke_passkey')} onDone={onDone} />)
  return { ...held, answers }
}

/** Whether the vault in `bank` holds a passkey. */
const holdsPasskey = (bank: Bank) => bank.vaultAt(TH.VaultScopeGiven)?.gate.toJSON().passkey_wayin != null

const alertText = () => screen.getByRole('alert').textContent

describe("RevokePasskeyModal", () => {
  it("removes the passkey on the passphrase, filed under the user and the vault, and answers unlocked", async () => {
    const { bank, raising, answers } = await shownFor()
    expect(screen.getByText(Messages.revokePasskeyTitle)).to.exist
    expect(screen.getByDisplayValue('u1 (main vault)')).to.exist
    TH.submitPasskeyRevoke(TH.Passphrase)
    await waitFor(() => { expect(answers).to.deep.equal(['unlocked']) })
    expect(await raising).to.include({ ok: true })
    expect(holdsPasskey(bank)).to.be.false
  })

  it("shows a wrong passphrase in place, removing nothing, and removes on the right one", async () => {
    const { bank, gating, raising, answers } = await shownFor()
    TH.submitPasskeyRevoke('not the passphrase')
    await waitFor(() => { expect(alertText()).to.not.eq('') })
    expect(gating.isOpen).to.be.true
    expect(holdsPasskey(bank)).to.be.true
    TH.submitPasskeyRevoke(TH.Passphrase)
    await waitFor(() => { expect(answers).to.deep.equal(['unlocked']) })
    expect(await raising).to.include({ ok: true })
  })

  it("answers declined on Cancel, and the passkey stays", async () => {
    const { bank, raising, answers } = await shownFor()
    fireEvent.click(screen.getByText('Cancel'))
    expect(answers).to.deep.equal(['declined'])
    expect(await raising).to.include({ ok: false })
    expect(holdsPasskey(bank)).to.be.true
  })
})
