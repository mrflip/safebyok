import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ForeverMillis, MinuteMillis } from 'safebyok'
import { PassphraseModal } from '../src/modals/passphrase-modal'
import { Messages } from '../src/helpers/messages'
import type { DialogAnswer } from '../src/shapes'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

const WeekMillis = 7 * 24 * 60 * MinuteMillis

/** A strength checker that finds a passphrase under 12 characters weak. */
const underTwelveWeak = (typed: string) => (typed.length < 12 ? { strong: false as const, reason: 'Make it longer.' } : { strong: true as const })

/** The gating `raise` opens, shown in a PassphraseModal whose answers the test reads, closed by the first. */
const shownFor = async (raise: typeof TH.building, opts: { built?: boolean, bankOpts?: Parameters<typeof TH.openGatingOf>[2], leaseMillis?: number } = {}) => {
  const world = TH.makeBankWorld()
  if (opts.built === true) { await TH.makeBankWithVault(world) }
  const opened = await TH.openGatingOf(world, raise, opts.bankOpts)
  const answers: DialogAnswer[] = []
  const onDone = (answer: DialogAnswer) => { answers.push(answer); opened.close() }
  render(<PassphraseModal gating={TH.passphraseGatingOf(opened.gating)} onDone={onDone} leaseMillis={opts.leaseMillis} />)
  return { ...opened, answers }
}

const alertText = () => screen.getByRole('alert').textContent

describe("PassphraseModal, building a vault", () => {
  it("chooses the first passphrase, filed under the user and the vault, and answers unlocked", async () => {
    const { raising, answers } = await shownFor(TH.building)
    expect(screen.getByText(Messages.chooseTitle)).to.exist
    expect(screen.getByDisplayValue('u1 (main vault)')).to.exist
    TH.submitNewPassphrase(TH.Passphrase)
    await waitFor(() => { expect(answers).to.deep.equal(['unlocked']) })
    expect(await raising).to.include({ ok: true })
  })

  it("refuses a confirmation that differs, attempting nothing, and lets the user try again", async () => {
    const { gating, raising, answers } = await shownFor(TH.building)
    TH.submitNewPassphrase(TH.Passphrase, 'correct horse battery stapel')
    expect(alertText()).to.eq(Messages.passphrasesDiffer)
    expect(gating.isOpen).to.be.true
    TH.submitNewPassphrase(TH.Passphrase)
    await waitFor(() => { expect(answers).to.deep.equal(['unlocked']) })
    expect(await raising).to.include({ ok: true })
  })

  it("shows the strength checker's reason as the user types, and a weak passphrase's refusal in place", async () => {
    const { gating, answers } = await shownFor(TH.building, { bankOpts: { strengthChecker: underTwelveWeak } })
    fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'short' } })
    await waitFor(() => { expect(screen.queryByText('Make it longer.')).to.not.be.null })
    TH.submitNewPassphrase('short')
    await waitFor(() => { expect(alertText()).to.eq('Make it longer.') })
    expect(gating.isOpen).to.be.true
    expect(answers).to.deep.equal([])
  })
})

describe("PassphraseModal, unlocking a vault", () => {
  it("shows a wrong passphrase in place, the gating still open, and answers unlocked on the right one", async () => {
    const { gating, raising, answers } = await shownFor(TH.unlocking, { built: true })
    expect(screen.getByText(Messages.unlockTitle)).to.exist
    TH.submitPassphrase('not the passphrase')
    await waitFor(() => { expect(alertText()).to.not.eq('') })
    expect(gating.isOpen).to.be.true
    TH.submitPassphrase(TH.Passphrase)
    await waitFor(() => { expect(answers).to.deep.equal(['unlocked']) })
    expect(await raising).to.include({ ok: true })
  })

  const CloseCases = [
    ['Cancel', () => { fireEvent.click(screen.getByText(Messages.cancelButton)) }],
    ['Escape', () => { fireEvent.keyDown(screen.getByPlaceholderText('vault passphrase'), { key: 'Escape' }) }],
  ] as const

  for (const [how, closeIt] of CloseCases) {
    it(`answers dismissed on ${how}, and the gating is dismissed`, async () => {
      const { raising, answers } = await shownFor(TH.unlocking, { built: true })
      closeIt()
      expect(answers).to.deep.equal(['dismissed'])
      expect(await raising).to.include({ ok: false })
    })
  }

  it("answers dismissed once its gating concludes with no attempt, as at a sweep", async () => {
    const { bank, answers } = await shownFor(TH.unlocking, { built: true })
    act(() => { bank.sweep() })
    await waitFor(() => { expect(answers).to.deep.equal(['dismissed']) })
  })
})

describe("PassphraseModal over a later gating", () => {
  it("starts its form empty, nothing typed carrying over", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    const first = await TH.openGatingOf(world, TH.unlocking)
    const second = await TH.openGatingOf(world, TH.unlocking)
    const ui = (gating: typeof first.gating) => <PassphraseModal gating={TH.passphraseGatingOf(gating)} onDone={() => undefined} />
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
