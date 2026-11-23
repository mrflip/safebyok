import { within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as TH from '../../test-helpers'
import * as World from './world'

// The new-passphrase card, today, for Hero, signed in, over the dojo's strength checker (strong at four characters or
// more). A test records what the kit does now: a change here is news for whiteboard/20261123-dojo/dojo-findings.md.

/** A strong passphrase, an obvious fake. */
const Passphrase = 'made-up passphrase'

/** The new-passphrase card's example, on a fresh page. */
async function shownExample(): Promise<HTMLElement> {
  const tab = await World.practiceTab('hero', false)
  return World.example(World.card(tab, "Show a new passphrase's strength as it is typed, and compare its confirmation"), 'Do: useNewPassphrase over two PassphraseInputs')
}

describe("the new-passphrase card, today", () => {
  it("a short passphrase gets the checker's reason, and a longer one is strong enough", async () => {
    const shown = await shownExample()
    const field = within(shown).getByLabelText('New passphrase')
    TH.fill(shown, { 'New passphrase': 'abc' })
    await TH.expectTextSoon(() => TH.describingTextOf(field), 'The dojo takes a passphrase of 4 characters or more.')
    TH.fill(shown, { 'New passphrase': 'abcd' })
    await TH.expectTextSoon(() => TH.describingTextOf(field), 'Strong enough')
  })

  it("a passphrase of only spaces is judged weak", async () => {
    const shown = await shownExample()
    TH.fill(shown, { 'New passphrase': ' '.repeat(6) })
    await TH.expectTextSoon(() => TH.describingTextOf(within(shown).getByLabelText('New passphrase')), "A new passphrase can't be empty or only spaces: a few words together make one that is strong and easy to remember.")
  })

  it("a confirmation that differs is marked invalid, and one that matches makes the form ready", async () => {
    const shown = await shownExample()
    TH.fill(shown, { 'New passphrase': Passphrase, 'Confirm passphrase': `${Passphrase}!` })
    const confirm = within(shown).getByLabelText('Confirm passphrase')
    await TH.expectTextSoon(() => TH.describingTextOf(confirm), 'The passphrases do not match')
    expect(confirm.getAttribute('aria-invalid')).to.eq('true')
    TH.fill(shown, { 'Confirm passphrase': Passphrase })
    await TH.expectTextSoon(() => within(shown).getByLabelText('Ready').textContent, 'Ready: a real form enables its submit now.')
    expect([TH.describingTextOf(confirm), confirm.getAttribute('aria-invalid')]).to.deep.equal(['The passphrases match', null])
  })

  it("neither passphrase reaches React's state", async () => {
    const shown = await shownExample()
    TH.fill(shown, { 'New passphrase': Passphrase, 'Confirm passphrase': Passphrase })
    await TH.expectTextSoon(() => within(shown).getByLabelText('Ready').textContent, 'Ready: a real form enables its submit now.')
    expect(TH.fiberHolds(shown, Passphrase)).to.eq(false)
  })
})
