import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { BankOpts } from 'safebyok'
import { ReplacePassphraseModal } from '../src/modals/replace-passphrase-modal'
import { Messages } from '../src/helpers/messages'
import type { DialogAnswer } from '../src/shapes'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

const NextPassphrase = 'a whole new passphrase for the vault'

/** A strength checker that finds a passphrase under 12 characters weak. */
const underTwelveWeak = (typed: string) => (typed.length < 12 ? { strong: false as const, reason: 'Make it longer.' } : { strong: true as const })

/** A replace_passphrase gating on a vault built under {@link TH.Passphrase}, shown in a ReplacePassphraseModal whose answers the test reads, closed by the first. */
const shownFor = async (opts: { bankOpts?: Partial<BankOpts> } = {}) => {
  const world = TH.makeBankWorld()
  await TH.makeBankWithVault(world)
  const held = await TH.heldGatingOf(world, TH.replacing, opts.bankOpts)
  const answers: DialogAnswer[] = []
  const onDone = (answer: DialogAnswer) => { answers.push(answer); held.close() }
  render(<ReplacePassphraseModal gating={TH.gatingOfKind(held.gating, 'replace_passphrase')} onDone={onDone} />)
  return { ...held, world, answers }
}

/** Whether `passphrase` unlocks the world's vault, asked from a device that holds no lease on it. */
const unlocksWith = async (world: TH.BankWorld, passphrase: string): Promise<boolean> => {
  const bank = world.bankOnAnotherDevice({ device_id: '00000000-0000-4000-8000-0000000000b3', requestCleartext: async (gating) => { await gating.attempt({ passphraseClear: passphrase }) } })
  await bank.hello()
  const vault = await bank.ensureVault(TH.VaultScopeGiven)
  const unlocked = await vault.tryEnsureUnlocked()
  return unlocked.ok
}

const alertText = () => screen.getByRole('alert').textContent

describe("ReplacePassphraseModal", () => {
  it("replaces the passphrase, filed under the user and the vault, and answers unlocked", async () => {
    const { world, raising, answers } = await shownFor()
    expect(screen.getByText(Messages.changeTitle)).to.exist
    expect(screen.getByDisplayValue('u1 (main vault)')).to.exist
    TH.submitReplacement(TH.Passphrase, NextPassphrase)
    await waitFor(() => { expect(answers).to.deep.equal(['unlocked']) })
    expect(await raising).to.include({ ok: true })
    expect(await unlocksWith(world, NextPassphrase)).to.be.true
    expect(await unlocksWith(world, TH.Passphrase)).to.be.false
  })

  it("refuses a confirmation that differs, attempting nothing, and lets the user try again", async () => {
    const { gating, raising, answers } = await shownFor()
    TH.submitReplacement(TH.Passphrase, NextPassphrase, 'a whole new passphrase for the vualt')
    expect(alertText()).to.eq(Messages.passphrasesDiffer)
    expect(screen.getByPlaceholderText('confirm new passphrase').getAttribute('aria-invalid')).to.eq('true')
    expect(gating.isOpen).to.be.true
    TH.submitReplacement(TH.Passphrase, NextPassphrase)
    await waitFor(() => { expect(answers).to.deep.equal(['unlocked']) })
    expect(await raising).to.include({ ok: true })
  })

  const InPlaceCases = [
    ["not the passphrase", NextPassphrase, 'shows a wrong current passphrase in place'],
    [TH.Passphrase,        TH.Passphrase,  'shows a new passphrase that is the current one in place'],
  ] as const

  for (const [antePassphrase, nextPassphrase, blurb] of InPlaceCases) {
    it(blurb, async () => {
      const { world, gating, answers } = await shownFor()
      TH.submitReplacement(antePassphrase, nextPassphrase)
      await waitFor(() => { expect(alertText()).to.not.eq('') })
      expect(gating.isOpen).to.be.true
      expect(answers).to.deep.equal([])
      gating.dismiss()
      expect(await unlocksWith(world, TH.Passphrase)).to.be.true
    })
  }

  it("shows the strength checker's reason as the user types the new passphrase, and a weak one's refusal in place", async () => {
    const { gating, answers } = await shownFor({ bankOpts: { strengthChecker: underTwelveWeak } })
    fireEvent.change(screen.getByPlaceholderText('new passphrase'), { target: { value: 'short' } })
    await waitFor(() => { expect(screen.queryByText('Make it longer.')).to.not.be.null })
    TH.submitReplacement(TH.Passphrase, 'short')
    await waitFor(() => { expect(alertText()).to.eq('Make it longer.') })
    expect(gating.isOpen).to.be.true
    expect(answers).to.deep.equal([])
  })

  it("never gives the current passphrase to the strength checker", async () => {
    const heard: string[] = []
    await shownFor({ bankOpts: { strengthChecker: (typed: string) => { heard.push(typed); return { strong: true as const } } } })
    fireEvent.change(screen.getByPlaceholderText('current passphrase'), { target: { value: TH.Passphrase } })
    fireEvent.change(screen.getByPlaceholderText('new passphrase'), { target: { value: NextPassphrase } })
    await waitFor(() => { expect(heard).to.deep.equal([NextPassphrase]) })
  })

  it("answers dismissed on Cancel, and the gating is dismissed", async () => {
    const { world, raising, answers } = await shownFor()
    fireEvent.click(screen.getByText(Messages.cancelButton))
    expect(answers).to.deep.equal(['dismissed'])
    expect(await raising).to.include({ ok: false })
    expect(await unlocksWith(world, TH.Passphrase)).to.be.true
  })
})
