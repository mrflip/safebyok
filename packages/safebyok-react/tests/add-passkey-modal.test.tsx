import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Gating, type Bank } from 'safebyok'
import { AddPasskeyModal } from '../src/add-passkey-modal'
import type { DialogAnswer } from '../src/modal'
import { Messages } from '../src/messages'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

/** An add_passkey gating on a vault built under {@link TH.Passphrase}, shown in an AddPasskeyModal whose answers the test reads, closed by the first; and the fake authenticator. */
const shownFor = async (opts: TH.FakeAuthenticatorOpts = {}) => {
  const authenticator = TH.installFakeAuthenticator(opts)
  const world = TH.makeBankWorld()
  await TH.makeBankWithVault(world)
  const held = await TH.heldGatingOf(world, TH.addingPasskey)
  const answers: DialogAnswer[] = []
  const onDone = (answer: DialogAnswer) => { answers.push(answer); held.close() }
  const ui = <AddPasskeyModal gating={TH.gatingOfKind(held.gating, 'add_passkey')} onDone={onDone} />
  return { ...held, ...render(ui), ui, answers, authenticator }
}

/** The credential id of the passkey the vault in `bank` holds, or null. */
const passkeyHeld = (bank: Bank) => {
  const wayin = bank.vaultAt(TH.VaultScopeGiven)?.gate.toJSON().passkey_wayin
  return wayin?.wayinkind === 'passkey' ? wayin.credential_id : null
}

const alertText = () => screen.getByRole('alert').textContent

describe("AddPasskeyModal", () => {
  it("makes a passkey under the app's name and the user's, adds it on the passphrase, and answers unlocked", async () => {
    const { bank, gating, raising, answers, authenticator } = await shownFor()
    expect(screen.getByText(Messages.addPasskeyTitle)).to.exist
    TH.submitPasskeyAdd(TH.Passphrase)
    await waitFor(() => { expect(answers).to.deep.equal(['unlocked']) })
    expect(await raising).to.include({ ok: true })
    expect(passkeyHeld(bank)).to.equal(authenticator.credentialIds()[0])
    const [call] = authenticator.calls.create
    expect(call?.publicKey?.rp.name).to.equal(gating.applabel)
    expect(call?.publicKey?.user).to.include({ name: 'u1 (main vault)' })
  })

  it("shows a wrong passphrase in place, adding nothing, and adds a passkey made anew on the right one", async () => {
    const { bank, gating, raising, answers, authenticator } = await shownFor()
    TH.submitPasskeyAdd('not the passphrase')
    await waitFor(() => { expect(alertText()).to.not.eq('') })
    expect(gating.isOpen).to.be.true
    expect(passkeyHeld(bank)).to.be.null
    TH.submitPasskeyAdd(TH.Passphrase)
    await waitFor(() => { expect(answers).to.deep.equal(['unlocked']) })
    expect(await raising).to.include({ ok: true })
    expect(passkeyHeld(bank)).to.equal(authenticator.credentialIds()[1])
  })

  it("does nothing when the user dismisses the browser's prompt: the gating stays open", async () => {
    const { gating, answers, authenticator } = await shownFor()
    const attempts = vi.spyOn(Gating.prototype, 'attempt')
    authenticator.refuseNext('NotAllowedError')
    TH.submitPasskeyAdd(TH.Passphrase)
    await waitFor(() => { expect(authenticator.calls.create).to.have.lengthOf(1) })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(attempts).not.toHaveBeenCalled()
    expect(answers).to.deep.equal([])
    expect(gating.isOpen).to.be.true
  })

  it("says in place that an authenticator without PRF cannot make a vault's passkey", async () => {
    const { gating } = await shownFor({ prf: false })
    TH.submitPasskeyAdd(TH.Passphrase)
    await screen.findByText(Messages.noPrf)
    expect(gating.isOpen).to.be.true
  })

  it("asks the browser for one passkey at a time, however often the user submits", async () => {
    const { answers, authenticator } = await shownFor()
    const touching = TH.held()
    authenticator.holdNext(touching.promise)
    TH.submitPasskeyAdd(TH.Passphrase)
    fireEvent.click(screen.getByText(Messages.addPasskeyButton))
    await act(async () => { touching.resolve(undefined); await TH.wakeupAtNextTick() })
    await waitFor(() => { expect(answers).to.deep.equal(['unlocked']) })
    expect(authenticator.calls.create).to.have.lengthOf(1)
  })

  it("answers declined on Cancel, and the vault holds no passkey", async () => {
    const { bank, raising, answers } = await shownFor()
    fireEvent.click(screen.getByText('Cancel'))
    expect(answers).to.deep.equal(['declined'])
    expect(await raising).to.include({ ok: false })
    expect(passkeyHeld(bank)).to.be.null
  })

  it("never adds a passkey made while an Activity hid the dialog, zeroing its answer untried", async () => {
    const { gating, ui, rerender, authenticator } = await shownFor()
    const attempts = vi.spyOn(Gating.prototype, 'attempt')
    const touching = TH.held()
    authenticator.holdNext(touching.promise)
    TH.submitPasskeyAdd(TH.Passphrase)
    rerender(TH.inActivity('hidden', ui))
    await act(async () => { touching.resolve(undefined); await TH.wakeupAtNextTick() })
    await waitFor(() => { expect(authenticator.answersHanded()).to.have.lengthOf(1) })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(attempts).not.toHaveBeenCalled()
    expect(gating.isOpen).to.be.true
  })
})
