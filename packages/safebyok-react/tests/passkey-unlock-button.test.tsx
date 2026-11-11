import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Gating, VaultError } from 'safebyok'
import { Messages } from '../src/helpers/messages'
import { createPasskey } from '../src/helpers/passkey'
import { PasskeyUnlockButton } from '../src/components/passkey-unlock-button'
import { PassphraseModal } from '../src/modals/passphrase-modal'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

/** Open an unlock_vault gating on another device, for a vault with a passkey the fake authenticator has. Also returns the authenticator and the world. */
const passkeyedUnlock = async () => {
  const authenticator = TH.installFakeAuthenticator()
  const world = TH.makeBankWorld()
  const { vault } = await TH.makeBankWithVault(world)
  await TH.addPasskeyTo(world, vault, await createPasskey(TH.PasskeyMaking))
  const opened = await TH.openGatingOf(world, TH.unlocking)
  return { ...opened, gating: TH.gatingOfKind(opened.gating, 'unlock_vault'), authenticator, world }
}

/** Render the button for `gating`. Returns the gripes it passed to `onGripe`, and the errors React reported. */
const buttonFor = (gating: Gating<'unlock_vault'>, extra: { takesFocus?: boolean } = {}) => {
  const gripes: (string | null)[] = []
  const ui = <PasskeyUnlockButton gating={gating} onGripe={(gripe) => { gripes.push(gripe) }} {...extra} />
  return { ...TH.renderReporting(ui), ui, gripes }
}

/** Return the button's aria-disabled value. It is 'true' while the browser is asking for the passkey. */
const asking = () => screen.getByText(Messages.passkeyButton).getAttribute('aria-disabled')

/** Make every gating attempt resolve with the refusal `err`, as the core would. */
const refusingAttempts = (err: unknown) => vi.spyOn(Gating.prototype, 'attempt').mockResolvedValue({ ok: false, err } as never)

describe("PasskeyUnlockButton", () => {
  it("unlocks the vault with the passkey the user touches", async () => {
    const { gating, raising } = await passkeyedUnlock()
    buttonFor(gating)
    fireEvent.click(screen.getByText(Messages.passkeyButton))
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

  it("clears its message when the user dismisses the prompt, and can be pressed again", async () => {
    const { gating, authenticator } = await passkeyedUnlock()
    const { gripes } = buttonFor(gating)
    authenticator.refuseNext('NotAllowedError')
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await waitFor(() => { expect(asking()).to.eq('false') })
    expect(gripes).to.deep.equal([null])
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
    // jsdom keeps focus on a disabled button, and browsers do not. So the real check is that the button is not disabled.
    expect(button).to.have.property('disabled', false)
    fireEvent.click(button)
    expect(document.activeElement).to.equal(button)
    await act(async () => { touching.resolve(undefined); await TH.wakeupAtNextTick() })
    await waitFor(() => { expect(asking()).to.eq('false') })
    expect(document.activeElement).to.equal(button)
    expect(authenticator.calls.get).to.have.lengthOf(1)
  })

  it("takes the focus when asked to", async () => {
    const { gating } = await passkeyedUnlock()
    buttonFor(gating, { takesFocus: true })
    expect(document.activeElement).to.equal(screen.getByText(Messages.passkeyButton))
  })

  it("reports a browser failure to onGripe in calm words, and nothing once the gating has concluded", async () => {
    const { gating, authenticator } = await passkeyedUnlock()
    const { gripes } = buttonFor(gating)
    authenticator.refuseNext('UnknownError')
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await waitFor(() => { expect(gripes).to.deep.equal([null, Messages.passkeyAskFailed]) })
    gating.dismiss()
    refusingAttempts(new VaultError('dismissed', 'dismissed'))
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await waitFor(() => { expect(gripes).to.deep.equal([null, Messages.passkeyAskFailed, null]) })
    await waitFor(() => { expect(asking()).to.eq('false') })
    expect(gripes).to.have.lengthOf(3)
  })

  it("says nothing when pressed while an attempt is running", async () => {
    const { gating } = await passkeyedUnlock()
    const { gripes } = buttonFor(gating)
    refusingAttempts(new VaultError('attempt_in_flight', 'busy'))
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await waitFor(() => { expect(asking()).to.eq('false') })
    expect(gripes).to.deep.equal([null])
  })

  it("on misuse, hides itself, points to the passphrase, and reports the error to React", async () => {
    const { gating } = await passkeyedUnlock()
    const misuse = new VaultError('bad_option', 'misused')
    refusingAttempts(misuse)
    const { gripes, reported } = buttonFor(gating)
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await waitFor(() => { expect(screen.queryByText(Messages.passkeyButton)).to.be.null })
    expect(gripes).to.deep.equal([null, Messages.passkeyTrouble])
    expect(reported).to.deep.equal([misuse])
  })

  it("tries a passkey the user touched while an Activity hid it", async () => {
    const { gating, authenticator, raising } = await passkeyedUnlock()
    const touching = TH.makePending()
    authenticator.answerNextAfter(touching.promise)
    const { ui, rerender } = buttonFor(gating)
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    rerender(TH.inActivity('hidden', ui))
    await act(async () => { touching.resolve(undefined); await TH.wakeupAtNextTick() })
    expect(await raising).to.include({ ok: true })
  })
})

/** Render the unlock dialog for a vault that has a passkey. */
const dialogFor = async () => {
  const opened = await passkeyedUnlock()
  render(<PassphraseModal gating={opened.gating} />)
  return opened
}

describe("PassphraseModal, for a vault with a passkey", () => {
  it("offers the passkey first, with the focus, and closes unlocked when it is used", async () => {
    const { raising } = await dialogFor()
    const button = screen.getByText(Messages.passkeyButton)
    expect(document.activeElement).to.equal(button)
    expect(button.compareDocumentPosition(screen.getByPlaceholderText('vault passphrase')) & Node.DOCUMENT_POSITION_FOLLOWING).to.not.equal(0)
    fireEvent.click(button)
    expect(await raising).to.include({ ok: true })
  })

  it("takes no press while a passphrase attempt runs", async () => {
    const { authenticator } = await dialogFor()
    const running = TH.makePending()
    vi.spyOn(Gating.prototype, 'attempt').mockImplementation(async () => {
      await running.promise
      return { ok: false, err: new VaultError('wrong_passphrase', 'Not that one.') } as never
    })
    TH.submitPassphrase(TH.Passphrase)
    await screen.findByText(Messages.unlockingButton)
    expect(asking()).to.eq('true')
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    expect(authenticator.calls.get).to.have.lengthOf(0)
    await act(async () => { running.resolve(undefined); await TH.wakeupAtNextTick() })
    await waitFor(() => { expect(asking()).to.eq('false') })
  })

  it("keeps the passkey's message while the user types the passphrase, until they submit", async () => {
    const { authenticator } = await dialogFor()
    authenticator.refuseNext('UnknownError')
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await screen.findByText(Messages.passkeyAskFailed)
    fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'wrong' } })
    expect(screen.getByText(Messages.passkeyAskFailed)).to.exist
    const running = TH.makePending()
    vi.spyOn(Gating.prototype, 'attempt').mockImplementation(async () => {
      await running.promise
      return { ok: false, err: new VaultError('wrong_passphrase', 'Not that one.') } as never
    })
    TH.submitPassphrase('wrong passphrase')
    await screen.findByText(Messages.unlockingButton)
    expect(screen.queryByText(Messages.passkeyAskFailed)).to.be.null
    await act(async () => { running.resolve(undefined); await TH.wakeupAtNextTick() })
    await waitFor(() => { expect(screen.getByText(Messages.unlockButton)).to.exist })
    expect(screen.queryByText(Messages.passkeyAskFailed)).to.be.null
  })

  it("keeps the passphrase when the passkey meets misuse: the button goes, and the dialog says why", async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { /* React reports what its Boundary caught */ })
    await dialogFor()
    refusingAttempts(new VaultError('bad_option', 'misused'))
    fireEvent.click(screen.getByText(Messages.passkeyButton))
    await screen.findByText(Messages.passkeyTrouble)
    expect(screen.queryByText(Messages.passkeyButton)).to.be.null
    expect(document.activeElement).to.equal(screen.getByPlaceholderText('vault passphrase'))
    expect(consoleError).toHaveBeenCalled()
  })

  it("offers no passkey to a user choosing the vault's first passphrase", async () => {
    TH.installFakeAuthenticator()
    const { gating } = await TH.openGatingOf(TH.makeBankWorld(), TH.building)
    render(<PassphraseModal gating={TH.passphraseGatingOf(gating)} />)
    expect(screen.queryByText(Messages.passkeyButton)).to.be.null
  })
})
