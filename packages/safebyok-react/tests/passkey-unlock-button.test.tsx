import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Gating, VaultError } from 'safebyok'
import { Messages } from '../src/helpers/messages'
import { createPasskey } from '../src/helpers/passkey'
import { PasskeyUnlockButton } from '../src/components/passkey-unlock-button'
import { PassphraseModal } from '../src/modals/passphrase-modal'
import type { DialogAnswer } from '../src/shapes'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

/** An unlock_vault gating, kept open on another device, for a vault with a passkey the fake authenticator has; and the authenticator. */
const passkeyedUnlock = async () => {
  const authenticator = TH.installFakeAuthenticator()
  const world = TH.makeBankWorld()
  const { vault } = await TH.makeBankWithVault(world)
  await TH.addPasskeyTo(world, vault, await createPasskey(TH.PasskeyMaking))
  const opened = await TH.openGatingOf(world, TH.unlocking)
  return { ...opened, gating: TH.gatingOfKind(opened.gating, 'unlock_vault'), authenticator, world }
}

/** The button for `gating`, what it told `onDone` and `onGripe`, and what React reported. */
const buttonFor = (gating: Gating<'unlock_vault'>, extra: { takesFocus?: boolean } = {}) => {
  const answers: string[] = []
  const gripes: (string | null)[] = []
  const ui = <PasskeyUnlockButton gating={gating} onDone={(answer) => { answers.push(answer) }} onGripe={(gripe) => { gripes.push(gripe) }} {...extra} />
  return { ...TH.renderReporting(ui), ui, answers, gripes }
}

/** The button's aria-disabled, 'true' while the browser asks. */
const asking = () => screen.getByText(Messages.passkeyButton).getAttribute('aria-disabled')

/** A refusal for the gating's attempt to answer with, as the core would. */
const refusingAttempts = (err: unknown) => vi.spyOn(Gating.prototype, 'attempt').mockResolvedValue({ ok: false, err } as never)

describe("PasskeyUnlockButton", () => {
  it("unlocks the vault with the passkey the user touches", async () => {
    const { gating, raising } = await passkeyedUnlock()
    const { answers } = buttonFor(gating)
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await waitFor(() => { expect(answers).to.deep.equal(['unlocked']) })
    expect(await raising).to.include({ ok: true })
  })

  it("is not there in a browser without WebAuthn, nor for a vault with no passkey", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    const { gating } = await TH.openGatingOf(world, TH.unlocking)
    buttonFor(TH.gatingOfKind(gating, 'unlock_vault'))
    expect(screen.queryByText(Messages.passkeyButton)).to.be.null
    TH.installFakeAuthenticator()
    buttonFor(TH.gatingOfKind(gating, 'unlock_vault'))
    expect(screen.queryByText(Messages.passkeyButton)).to.be.null
  })

  it("says only that its last word no longer stands when the user dismisses the prompt, and takes a press again", async () => {
    const { gating, authenticator } = await passkeyedUnlock()
    const { answers, gripes } = buttonFor(gating)
    authenticator.refuseNext('NotAllowedError')
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await waitFor(() => { expect(asking()).to.eq('false') })
    expect(gripes).to.deep.equal([null])
    expect(answers).to.deep.equal([])
  })

  it("stays focusable while the browser asks", async () => {
    const { gating, authenticator } = await passkeyedUnlock()
    buttonFor(gating, { takesFocus: true })
    const button = screen.getByText(Messages.passkeyButton)
    const touching = TH.makePending()
    authenticator.answerNextAfter(touching.promise)
    authenticator.refuseNext('NotAllowedError')
    fireEvent.click(button)
    await waitFor(() => { expect(asking()).to.eq('true') })
    // jsdom keeps the focus on a disabled button, as browsers do not: that it is not disabled is the check.
    expect(button).to.have.property('disabled', false)
    fireEvent.click(button)
    expect(document.activeElement).to.equal(button)
    await act(async () => { touching.resolve(undefined); await TH.wakeupAtNextTick() })
    await waitFor(() => { expect(asking()).to.eq('false') })
    expect(document.activeElement).to.equal(button)
    expect(authenticator.calls.get).to.have.lengthOf(1)
  })

  it("takes the focus when asked to, as a dialog's first choice", async () => {
    const { gating } = await passkeyedUnlock()
    buttonFor(gating, { takesFocus: true })
    expect(document.activeElement).to.equal(screen.getByText(Messages.passkeyButton))
  })

  it("hands a browser's failure to onGripe in calm words, and a refusal that closes the dialog to onDone", async () => {
    const { gating, authenticator } = await passkeyedUnlock()
    const { answers, gripes } = buttonFor(gating)
    authenticator.refuseNext('UnknownError')
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await waitFor(() => { expect(gripes).to.deep.equal([null, Messages.passkeyAskFailed]) })
    refusingAttempts(new VaultError('dismissed', 'dismissed'))
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await waitFor(() => { expect(answers).to.deep.equal(['dismissed']) })
  })

  it("leaves an attempt under way to answer when pressed during it", async () => {
    const { gating } = await passkeyedUnlock()
    const { answers, gripes } = buttonFor(gating)
    refusingAttempts(new VaultError('attempt_in_flight', 'busy'))
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await waitFor(() => { expect(asking()).to.eq('false') })
    expect(answers).to.deep.equal([])
    expect(gripes).to.deep.equal([null])
  })

  it("meets misuse by taking itself away and pointing to the passphrase, reporting the very error to React", async () => {
    const { gating } = await passkeyedUnlock()
    const misuse = new VaultError('bad_option', 'misused')
    refusingAttempts(misuse)
    const { gripes, reported } = buttonFor(gating)
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await waitFor(() => { expect(screen.queryByText(Messages.passkeyButton)).to.be.null })
    expect(gripes).to.deep.equal([null, Messages.passkeyTrouble])
    expect(reported).to.deep.equal([misuse])
  })

  it("never tries a passkey the user touched while an Activity hid it, zeroing its answer: once shown again, a press unlocks", async () => {
    const { gating, authenticator, raising } = await passkeyedUnlock()
    const attempts = vi.spyOn(Gating.prototype, 'attempt')
    const touching = TH.makePending()
    authenticator.answerNextAfter(touching.promise)
    const { ui, answers, rerender } = buttonFor(gating)
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    rerender(TH.inActivity('hidden', ui))
    await act(async () => { touching.resolve(undefined); await TH.wakeupAtNextTick() })
    await waitFor(() => { expect(authenticator.answersHanded()).to.have.lengthOf(2) })
    expect(attempts).not.toHaveBeenCalled()
    rerender(TH.inActivity('visible', ui))
    await waitFor(() => { expect(asking()).to.eq('false') })
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await waitFor(() => { expect(answers).to.deep.equal(['unlocked']) })
    expect(await raising).to.include({ ok: true })
  })
})

/** The unlock dialog for a vault with a passkey, and its answers. */
const dialogFor = async () => {
  const opened = await passkeyedUnlock()
  const answers: DialogAnswer[] = []
  render(<PassphraseModal gating={opened.gating} onDone={(answer) => { answers.push(answer); opened.close() }} />)
  return { ...opened, answers }
}

describe("PassphraseModal, for a vault with a passkey", () => {
  it("offers the passkey first, with the focus, and closes unlocked when it is used", async () => {
    const { answers, raising } = await dialogFor()
    const button = screen.getByText(Messages.passkeyButton)
    expect(document.activeElement).to.equal(button)
    expect(button.compareDocumentPosition(screen.getByPlaceholderText('vault passphrase')) & Node.DOCUMENT_POSITION_FOLLOWING).to.not.equal(0)
    fireEvent.click(button)
    await waitFor(() => { expect(answers).to.deep.equal(['unlocked']) })
    expect(await raising).to.include({ ok: true })
  })

  it("keeps the passkey's word while the user types the passphrase, until they submit", async () => {
    const { authenticator } = await dialogFor()
    authenticator.refuseNext('UnknownError')
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await screen.findByText(Messages.passkeyAskFailed)
    fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'wrong' } })
    expect(screen.getByText(Messages.passkeyAskFailed)).to.exist
    TH.submitPassphrase('wrong passphrase')
    await waitFor(() => { expect(screen.queryByText(Messages.passkeyAskFailed)).to.be.null })
  })

  it("keeps the passphrase when the passkey meets misuse: the button goes, and the dialog says why", async () => {
    const { answers } = await dialogFor()
    refusingAttempts(new VaultError('bad_option', 'misused'))
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await screen.findByText(Messages.passkeyTrouble)
    expect(screen.queryByText(Messages.passkeyButton)).to.be.null
    expect(document.activeElement).to.equal(screen.getByPlaceholderText('vault passphrase'))
    expect(answers).to.deep.equal([])
  })

  it("offers no passkey to a user choosing the vault's first passphrase", async () => {
    TH.installFakeAuthenticator()
    const { gating } = await TH.openGatingOf(TH.makeBankWorld(), TH.building)
    render(<PassphraseModal gating={TH.passphraseGatingOf(gating)} onDone={() => undefined} />)
    expect(screen.queryByText(Messages.passkeyButton)).to.be.null
  })
})
