import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Gating, type Bank } from 'safebyok'
import { AddPasskeyModal } from '../src/modals/add-passkey-modal'
import { Messages } from '../src/helpers/messages'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

/** Open an add_passkey gating on a vault built with {@link TH.Passphrase}, and render it in an AddPasskeyModal. Also returns the fake authenticator. */
const shownFor = async (opts: TH.FakeAuthenticatorOpts = {}) => {
  const authenticator = TH.installFakeAuthenticator(opts)
  const world = TH.makeBankWorld()
  await TH.makeBankWithVault(world)
  const opened = await TH.openGatingOf(world, TH.addingPasskey)
  const ui = <AddPasskeyModal gating={TH.gatingOfKind(opened.gating, 'add_passkey')} />
  return { ...opened, ...render(ui), ui, authenticator }
}

/** Return the credential id of the passkey on `bank`'s vault, or null when it has none. */
const passkeyOf = (bank: Bank) => {
  const wayin = bank.vaultAt(TH.VaultScopeGiven)?.gate.toJSON().passkey_wayin
  return wayin?.wayinkind === 'passkey' ? wayin.credential_id : null
}

const alertText = () => screen.getByRole('alert').textContent

describe("AddPasskeyModal", () => {
  it("makes a passkey under the app's name and the user's, adds it on the passphrase, and the gating concludes", async () => {
    const { bank, gating, raising, authenticator } = await shownFor()
    expect(screen.getByText(Messages.addPasskeyTitle)).to.exist
    TH.submitPasskeyAdd(TH.Passphrase)
    expect(await raising).to.include({ ok: true })
    expect(passkeyOf(bank)).to.equal(authenticator.credentialIds()[0])
    const [call] = authenticator.calls.create
    expect(call?.publicKey?.rp.name).to.equal(gating.applabel)
    expect(call?.publicKey?.user).to.include({ name: 'u1 (main vault)' })
  })

  it("shows a wrong passphrase in place, adding nothing, and adds a passkey made anew on the right one", async () => {
    const { bank, gating, raising, authenticator } = await shownFor()
    TH.submitPasskeyAdd('not the passphrase')
    await waitFor(() => { expect(alertText()).to.not.eq('') })
    expect(gating.isOpen).to.be.true
    expect(passkeyOf(bank)).to.be.null
    TH.submitPasskeyAdd(TH.Passphrase)
    expect(await raising).to.include({ ok: true })
    expect(passkeyOf(bank)).to.equal(authenticator.credentialIds()[1])
  })

  it("asks for the passphrase before the browser makes a passkey", async () => {
    const { gating, authenticator } = await shownFor()
    fireEvent.click(screen.getByText(Messages.addPasskeyButton))
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(authenticator.calls.create).to.have.lengthOf(0)
    expect(gating.isOpen).to.be.true
  })

  it("does nothing when the user dismisses the browser's prompt: the gating stays open", async () => {
    const { gating, authenticator } = await shownFor()
    const attempts = vi.spyOn(Gating.prototype, 'attempt')
    authenticator.refuseNext('NotAllowedError')
    TH.submitPasskeyAdd(TH.Passphrase)
    await waitFor(() => { expect(authenticator.calls.create).to.have.lengthOf(1) })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(attempts).not.toHaveBeenCalled()
    expect(gating.isOpen).to.be.true
  })

  it("says in place that an authenticator without PRF cannot make a vault's passkey", async () => {
    const { gating } = await shownFor({ prf: false })
    TH.submitPasskeyAdd(TH.Passphrase)
    await screen.findByText(Messages.noPrf)
    expect(gating.isOpen).to.be.true
  })

  it("asks the browser for one passkey at a time, however often the user submits", async () => {
    const { authenticator } = await shownFor()
    const touching = TH.makePending()
    authenticator.answerNextAfter(touching.promise)
    TH.submitPasskeyAdd(TH.Passphrase)
    fireEvent.click(await screen.findByText(Messages.addingPasskeyButton))
    await act(async () => { touching.resolve(undefined); await TH.wakeupAtNextTick() })
    expect(authenticator.calls.create).to.have.lengthOf(1)
  })

  it("dismisses the gating on Cancel, and the vault has no passkey", async () => {
    const { bank, raising } = await shownFor()
    fireEvent.click(screen.getByText('Cancel'))
    expect(await raising).to.include({ ok: false })
    expect(passkeyOf(bank)).to.be.null
  })

  it("adds a passkey the user made while an Activity hid the dialog: the press authorized it", async () => {
    const { raising, ui, rerender, authenticator } = await shownFor()
    const touching = TH.makePending()
    authenticator.answerNextAfter(touching.promise)
    TH.submitPasskeyAdd(TH.Passphrase)
    await waitFor(() => { expect(authenticator.calls.create).to.have.lengthOf(1) })
    rerender(TH.inActivity('hidden', ui))
    await act(async () => { touching.resolve(undefined); await TH.wakeupAtNextTick() })
    expect(await raising).to.include({ ok: true })
  })
})
