import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { BankOpts } from 'safebyok'
import { ReplacePassphraseModal } from '../src/modals/replace-passphrase-modal'
import { Messages } from '../src/helpers/messages'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

const NextPassphrase = 'a whole new passphrase for the vault'

/** A strength checker that calls any passphrase under 12 characters weak. */
const underTwelveWeak = (typed: string) => (typed.length < 12 ? { strong: false as const, reason: 'Make it longer.' } : { strong: true as const })

/** Open a replace_passphrase gating on a vault built with {@link TH.Passphrase}, and render it in a ReplacePassphraseModal. */
const shownFor = async (opts: { bankOpts?: Partial<BankOpts> } = {}) => {
  const world = TH.makeBankWorld()
  await TH.makeBankWithVault(world)
  const opened = await TH.openGatingOf(world, TH.replacing, opts.bankOpts)
  render(<ReplacePassphraseModal gating={TH.gatingOfKind(opened.gating, 'replace_passphrase')} />)
  return { ...opened, world }
}

/** True when `passphrase` unlocks the world's vault from a device that has no lease for it. */
const unlocksWith = async (world: TH.BankWorld, passphrase: string): Promise<boolean> => {
  const bank = world.bankOnAnotherDevice({ device_tok: '00000000-0000-4000-8000-0000000000b3', requestCleartext: async (gating) => { await gating.attempt({ passphraseClear: passphrase }) } })
  await bank.hello()
  const vault = await bank.ensureVault(TH.VaultScopeGiven)
  const unlocked = await vault.tryEnsureUnlocked()
  return unlocked.ok
}

const alertText = () => screen.getByRole('alert').textContent

describe("ReplacePassphraseModal", () => {
  it("replaces the passphrase, naming the user and the vault, and the gating concludes", async () => {
    const { world, raising } = await shownFor()
    expect(screen.getByText(Messages.changeTitle)).to.exist
    expect(screen.getByDisplayValue('u1 (main vault)')).to.exist
    await TH.submitReplacement(TH.Passphrase, NextPassphrase)
    expect(await raising).to.include({ ok: true })
    expect(await unlocksWith(world, NextPassphrase)).to.be.true
    expect(await unlocksWith(world, TH.Passphrase)).to.be.false
  })

  it("keeps the button disabled while the confirmation differs, naming the field", async () => {
    const { gating } = await shownFor()
    fireEvent.change(screen.getByPlaceholderText('new passphrase'), { target: { value: NextPassphrase } })
    fireEvent.change(screen.getByPlaceholderText('confirm new passphrase'), { target: { value: 'a whole new passphrase for the vualt' } })
    expect(screen.getByText(Messages.passphrasesDiffer)).to.exist
    expect(screen.getByPlaceholderText('confirm new passphrase').getAttribute('aria-invalid')).to.eq('true')
    expect(screen.getByText<HTMLButtonElement>(Messages.changeButton).disabled).to.be.true
    expect(gating.isOpen).to.be.true
  })

  it("names its three fields apart", async () => {
    await shownFor()
    const names = ['current passphrase', 'new passphrase', 'confirm new passphrase'].map((placeholder) => screen.getByPlaceholderText<HTMLInputElement>(placeholder).name)
    expect(names).to.deep.equal(['current-password', 'new-password', 'confirm-password'])
  })

  const InPlaceCases = [
    ["not the passphrase", NextPassphrase, 'current passphrase', 'shows a wrong current passphrase in place, at its field'],
    [TH.Passphrase,        TH.Passphrase,  'new passphrase',     'shows a new passphrase that is the current one in place, at its field'],
  ] as const

  for (const [antePassphrase, nextPassphrase, faulted, blurb] of InPlaceCases) {
    it(blurb, async () => {
      const { world, gating } = await shownFor()
      await TH.submitReplacement(antePassphrase, nextPassphrase)
      await waitFor(() => { expect(alertText()).to.not.eq('') })
      expect(gating.isOpen).to.be.true
      expect(screen.getByPlaceholderText(faulted).getAttribute('aria-invalid')).to.eq('true')
      expect(document.activeElement).to.equal(screen.getByPlaceholderText(faulted))
      gating.dismiss()
      expect(await unlocksWith(world, TH.Passphrase)).to.be.true
    })
  }

  it("shows the strength checker's reason as the user types the new passphrase, the button disabled", async () => {
    const { gating } = await shownFor({ bankOpts: { strengthChecker: underTwelveWeak } })
    fireEvent.change(screen.getByPlaceholderText('new passphrase'), { target: { value: 'short' } })
    fireEvent.change(screen.getByPlaceholderText('confirm new passphrase'), { target: { value: 'short' } })
    await screen.findByText('Make it longer.')
    expect(screen.getByText<HTMLButtonElement>(Messages.changeButton).disabled).to.be.true
    expect(gating.isOpen).to.be.true
  })

  it("never gives the current passphrase to the strength checker", async () => {
    const heard: string[] = []
    await shownFor({ bankOpts: { strengthChecker: (typed: string) => { heard.push(typed); return { strong: true as const } } } })
    fireEvent.change(screen.getByPlaceholderText('current passphrase'), { target: { value: TH.Passphrase } })
    fireEvent.change(screen.getByPlaceholderText('new passphrase'), { target: { value: NextPassphrase } })
    await waitFor(() => { expect(heard).to.deep.equal([NextPassphrase]) })
  })

  it("dismisses the gating on Cancel", async () => {
    const { world, raising } = await shownFor()
    fireEvent.click(screen.getByText(Messages.cancelButton))
    expect(await raising).to.include({ ok: false })
    expect(await unlocksWith(world, TH.Passphrase)).to.be.true
  })
})
