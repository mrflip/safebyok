import { fireEvent, waitFor, within } from '@testing-library/react'
import { WhisperFieldAttributes } from 'safebyok/utils'
import { describe, expect, it } from 'vitest'
import * as TH from '../../test-helpers'
import * as World from './world'

// The password-manager card, today, for Hero, signed in and locked, over the fixture. A test records what the kit and
// the parts render now: a change here is news for whiteboard/20261123-dojo/dojo-findings.md.

/** The password-manager card's example `examplename`, on a fresh page. */
async function shownExample(examplename: string): Promise<HTMLElement> {
  const tab = await World.practiceTab('hero', false)
  return World.example(World.card(tab, 'Invite a password manager to the passphrase, and disinvite it from a key'), examplename)
}

/** Unlock through the card's form with `passphrase`. */
function unlockWith(shown: HTMLElement, passphrase: string): void {
  fireEvent.change(within(shown).getByLabelText('Passphrase'), { target: { value: passphrase } })
  fireEvent.click(within(shown).getByRole('button', { name: 'Unlock' }))
}

describe("the password-manager card, today", () => {
  it("the passphrase's form gives a password manager a username to file it under and a current password", async () => {
    const shown = await shownExample('Do: the passphrase, for a password manager to save')
    const form = shown.querySelector('form')
    const username = form?.querySelector('input[name="username"]')
    const passphrase = within(shown).getByLabelText('Passphrase')
    expect([username?.getAttribute('autocomplete'), username?.getAttribute('value'), username?.hasAttribute('hidden')]).to.deep.equal(['username', 'hero', true])
    expect([passphrase.getAttribute('name'), passphrase.getAttribute('type'), passphrase.getAttribute('autocomplete')]).to.deep.equal(['passphrase', 'password', 'current-password'])
    expect(passphrase.closest('form')).to.eq(form)
  })

  it("the passphrase's form unlocks the bank", async () => {
    const shown = await shownExample('Do: the passphrase, for a password manager to save')
    unlockWith(shown, TH.passphraseOf('hero'))
    await TH.stageShown('unlocked')
    expect(within(shown).getByRole('alert').textContent).to.eq('')
  })

  it("the passphrase with a space after it is another passphrase, and unlocks nothing", async () => {
    const shown = await shownExample('Do: the passphrase, for a password manager to save')
    unlockWith(shown, `${TH.passphraseOf('hero')} `)
    await waitFor(() => { expect(within(shown).getByRole('alert').textContent).not.to.eq('') })
    await TH.stageShown('locked')
  })

  it("the key's field carries every attribute WhisperFieldAttributes names", async () => {
    const shown = await shownExample('Do: a stored key, kept from password managers')
    const field = within(shown).getByLabelText('API key')
    const carried = Object.fromEntries(Object.keys(WhisperFieldAttributes).map((attrname) => [attrname, field.getAttribute(attrname.toLowerCase())]))
    expect(carried).to.deep.equal(WhisperFieldAttributes)
    expect(field.getAttribute('name')).to.eq('apiKey')
  })
})
