import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ForeverMillis, MinuteMillis, VaultError } from 'safebyok'
import { PassphraseModal } from '../src/modals/passphrase-modal'
import { Messages } from '../src/helpers/messages'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

const WeekMillis = 7 * 24 * 60 * MinuteMillis

/** A strength checker that calls any passphrase under 12 characters weak. */
const underTwelveWeak = (typed: string) => (typed.length < 12 ? { strong: false as const, reason: 'Make it longer.' } : { strong: true as const })

/** Open a gating with `raise`, and render it in a PassphraseModal. */
const shownFor = async (raise: typeof TH.building, opts: { built?: boolean, bankOpts?: Parameters<typeof TH.openGatingOf>[2], leaseMillis?: number } = {}) => {
  const world = TH.makeBankWorld()
  if (opts.built === true) { await TH.makeBankWithVault(world) }
  const opened = await TH.openGatingOf(world, raise, opts.bankOpts)
  return { ...opened, ...render(<PassphraseModal gating={TH.passphraseGatingOf(opened.gating)} leaseMillis={opts.leaseMillis} />) }
}

const alertText = () => screen.getByRole('alert').textContent

const field = (placeholder: string) => screen.getByPlaceholderText<HTMLInputElement>(placeholder)
const typeIn = (placeholder: string, typed: string) => { fireEvent.change(field(placeholder), { target: { value: typed } }) }
const submitButton = (word: string) => screen.getByText<HTMLButtonElement>(word)

describe("PassphraseModal, building a vault", () => {
  it("chooses the first passphrase, naming the user and the vault", async () => {
    const { raising } = await shownFor(TH.building)
    expect(screen.getByText(Messages.chooseTitle)).to.exist
    expect(screen.getByDisplayValue('u1 (main vault)')).to.exist
    await TH.submitNewPassphrase(TH.Passphrase)
    expect(await raising).to.include({ ok: true })
  })

  it("gives its two fields distinct names for password managers", async () => {
    await shownFor(TH.building)
    expect(field('vault passphrase').name).to.eq('new-password')
    expect(field('confirm vault passphrase').name).to.eq('confirm-password')
    expect(field('confirm vault passphrase').autocomplete).to.eq('new-password')
  })

  it("says live whether the confirmation matches, marking it invalid while it differs", async () => {
    await shownFor(TH.building)
    typeIn('vault passphrase', TH.Passphrase)
    expect(screen.queryByText(Messages.passphrasesDiffer)).to.be.null
    typeIn('confirm vault passphrase', 'correct horse')
    expect(screen.getByText(Messages.passphrasesDiffer)).to.exist
    expect(field('confirm vault passphrase').getAttribute('aria-invalid')).to.eq('true')
    typeIn('confirm vault passphrase', TH.Passphrase)
    expect(screen.getByText(Messages.passphrasesMatch)).to.exist
    expect(field('confirm vault passphrase').getAttribute('aria-invalid')).to.be.null
  })

  it("keeps the button disabled until the passphrase is strong and confirmed, showing the checker's reason", async () => {
    await shownFor(TH.building, { bankOpts: { strengthChecker: underTwelveWeak } })
    expect(submitButton(Messages.createButton).disabled).to.be.true
    typeIn('vault passphrase', 'short')
    typeIn('confirm vault passphrase', 'short')
    await screen.findByText('Make it longer.')
    expect(submitButton(Messages.createButton).disabled).to.be.true
    typeIn('vault passphrase', TH.Passphrase)
    typeIn('confirm vault passphrase', TH.Passphrase)
    await waitFor(() => { expect(submitButton(Messages.createButton).disabled).to.be.false })
    expect(screen.queryByText('Make it longer.')).to.be.null
  })

  it("holds the button disabled from each keystroke until the verdict on it is in", async () => {
    const answering = TH.makePending()
    let isHeld = false
    const heldChecker = async (typed: string) => {
      if (isHeld) { await answering.promise }
      return underTwelveWeak(typed)
    }
    await shownFor(TH.building, { bankOpts: { strengthChecker: heldChecker } })
    typeIn('vault passphrase', TH.Passphrase)
    typeIn('confirm vault passphrase', TH.Passphrase)
    await waitFor(() => { expect(submitButton(Messages.createButton).disabled).to.be.false })
    isHeld = true
    typeIn('vault passphrase', 'short')
    typeIn('confirm vault passphrase', 'short')
    expect(submitButton(Messages.createButton).disabled).to.be.true
    await act(async () => { answering.resolve(undefined); await TH.wakeupAtNextTick() })
    expect(submitButton(Messages.createButton).disabled).to.be.true
  })

  it("forgets both verdicts once React has emptied the fields after a refused attempt", async () => {
    const { gating } = await shownFor(TH.building)
    TH.attemptsOf(gating).mockResolvedValue({ ok: false, err: new VaultError('weak_passphrase', 'Too guessable.') } as never)
    await TH.submitNewPassphrase(TH.Passphrase)
    await screen.findByText('Too guessable.')
    expect(field('vault passphrase').value).to.eq('')
    expect(screen.queryByText(Messages.passphrasesMatch)).to.be.null
    expect(submitButton(Messages.createButton).disabled).to.be.true
    expect(gating.isOpen).to.be.true
  })
})

describe("PassphraseModal, unlocking a vault", () => {
  it("shows a wrong passphrase in place, the gating still open, and concludes on the right one", async () => {
    const { gating, raising } = await shownFor(TH.unlocking, { built: true })
    expect(screen.getByText(Messages.unlockTitle)).to.exist
    TH.submitPassphrase('not the passphrase')
    await waitFor(() => { expect(alertText()).to.not.eq('') })
    expect(gating.isOpen).to.be.true
    TH.submitPassphrase(TH.Passphrase)
    expect(await raising).to.include({ ok: true })
  })

  it("after a wrong passphrase empties the field, marks it invalid and gives it the focus", async () => {
    await shownFor(TH.unlocking, { built: true })
    TH.submitPassphrase('not the passphrase')
    await waitFor(() => { expect(alertText()).to.not.eq('') })
    const typedIn = field('vault passphrase')
    expect(typedIn.value).to.eq('')
    expect(typedIn.getAttribute('aria-invalid')).to.eq('true')
    expect(document.activeElement).to.equal(typedIn)
  })

  it("says what it is doing and takes no second submit while an attempt runs", async () => {
    const { gating } = await shownFor(TH.unlocking, { built: true })
    const running = TH.makePending()
    const attempts = TH.attemptsOf(gating).mockImplementation(async () => {
      await running.promise
      return { ok: false, err: new VaultError('wrong_passphrase', 'Not that one.') } as never
    })
    TH.submitPassphrase(TH.Passphrase)
    const pending = await screen.findByText(Messages.unlockingButton)
    expect((pending as HTMLButtonElement).disabled).to.be.true
    fireEvent.click(pending)
    await act(async () => { running.resolve(undefined); await TH.wakeupAtNextTick() })
    await screen.findByText('Not that one.')
    expect(attempts).toHaveBeenCalledTimes(1)
    expect(submitButton(Messages.unlockButton).disabled).to.be.false
  })

  it("masks a shown passphrase again at submit", async () => {
    await shownFor(TH.unlocking, { built: true })
    fireEvent.click(screen.getByText(Messages.showPassphrase))
    expect(field('vault passphrase').type).to.eq('text')
    TH.submitPassphrase('not the passphrase')
    await waitFor(() => { expect(field('vault passphrase').type).to.eq('password') })
  })

  it("refuses an empty submit, attempting nothing", async () => {
    const { gating } = await shownFor(TH.unlocking, { built: true })
    const attempts = TH.attemptsOf(gating)
    fireEvent.click(submitButton(Messages.unlockButton))
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(attempts).not.toHaveBeenCalled()
  })

  it("warns while Caps Lock is on, until the field loses the focus", async () => {
    await shownFor(TH.unlocking, { built: true })
    fireEvent.keyDown(field('vault passphrase'), { key: 'A', modifierCapsLock: true })
    expect(screen.getByText(Messages.capsLockOn)).to.exist
    fireEvent.keyUp(field('vault passphrase'), { key: 'A', modifierCapsLock: false })
    expect(screen.queryByText(Messages.capsLockOn)).to.be.null
    fireEvent.keyDown(field('vault passphrase'), { key: 'A', modifierCapsLock: true })
    fireEvent.blur(field('vault passphrase'))
    expect(screen.queryByText(Messages.capsLockOn)).to.be.null
  })

  const CloseCases = [
    ['Cancel', () => { fireEvent.click(screen.getByText(Messages.cancelButton)) }],
    ['Escape', () => { fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })) }],
  ] as const

  for (const [how, closeIt] of CloseCases) {
    it(`dismisses the gating on ${how}, the dialog staying up until the gating's owner takes it down`, async () => {
      const { raising } = await shownFor(TH.unlocking, { built: true })
      closeIt()
      expect(await raising).to.include({ ok: false })
      expect(screen.getByRole<HTMLDialogElement>('dialog').open).to.be.true
    })
  }

  it("opens as a modal, and shuts when unmounted", async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    const shut = vi.spyOn(HTMLDialogElement.prototype, 'close')
    const { unmount } = await shownFor(TH.unlocking, { built: true })
    expect(showModal).toHaveBeenCalledTimes(1)
    unmount()
    expect(shut).toHaveBeenCalledTimes(1)
  })
})

describe("PassphraseModal over a later gating", () => {
  it("starts its form empty, nothing typed carrying over", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    const first = await TH.openGatingOf(world, TH.unlocking)
    const second = await TH.openGatingOf(world, TH.unlocking)
    const ui = (gating: typeof first.gating) => <PassphraseModal gating={TH.passphraseGatingOf(gating)} />
    const { rerender } = render(ui(first.gating))
    fireEvent.change(screen.getByLabelText(Messages.passphraseField), { target: { value: TH.Passphrase } })
    rerender(ui(second.gating))
    expect(screen.getByLabelText<HTMLInputElement>(Messages.passphraseField).value).to.eq('')
  })
})

describe("PassphraseModal's footnote", () => {
  const FootnoteCases = [
    [TH.building,  WeekMillis,    "Locks on this device in 7 days.",       'says when a vault built now locks'],
    [TH.unlocking, WeekMillis,    "Locks again on this device in 7 days.", 'says when an unlock lapses'],
    [TH.unlocking, ForeverMillis, Messages.staysUnlocked,                  'says an endless lease stays unlocked'],
  ] as const

  for (const [raise, leaseMillis, footnote, blurb] of FootnoteCases) {
    it(blurb, async () => {
      await shownFor(raise, { built: raise === TH.unlocking, leaseMillis })
      expect(screen.getByText(footnote)).to.exist
    })
  }

  it("says nothing of the lease when not handed it", async () => {
    await shownFor(TH.unlocking, { built: true })
    expect(screen.queryByText(/Locks|Stays/)).to.be.null
  })
})
