import { within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'

// What the New Box form keeps and clears after each of its buttons, today, for Hero, signed in and unlocked. Each test
// drives the real app, its giver and the core, over the IndexedDB stores (fake-indexeddb) loaded with the fixture. A test
// records what the library does now: a change here is news for the readout table, not a regression by definition.

/** A password the dojo's checker finds strong, an obvious fake. */
const Password = 'correct horse battery staple violet'

/** A fresh page with Hero signed in and unlocked, and the New Box form filled in: the form's section. */
async function filledBox(): Promise<HTMLElement> {
  await TH.loadPage('hero')
  await TH.unlock(TH.passphraseOf('hero'))
  const box = TH.showTab('New Box', 'New Box: a login')
  await within(box).findByText(/none stored yet/u)
  TH.fill(box, { 'Username': 'hero_at_site', 'Password': Password, 'Confirm password': Password })
  await within(box).findByText('Strong enough')
  return box
}

/** The readout of a refused put: the username put back from the action's texts, both passwords emptied. */
function usernameKept(message: string, refusal: string) {
  return { username: 'has text', boxPassword: 'empty', boxConfirmation: 'empty', message, refusal }
}

describe('the New Box form, today', () => {
  it('Save: puts the box, and every field is emptied', async () => {
    const box = await filledBox()
    expect(await TH.press(box, 'Save')).to.deep.equal({ username: 'empty', boxPassword: 'empty', boxConfirmation: 'empty', message: 'Saved the box.', refusal: '(none)' })
    await within(box).findByText(/one stored, for "hero_at_site"/u)
  })

  it("Weak: the host's own check refuses before the put, the username is kept, and both passwords are emptied", async () => {
    expect(await TH.press(await filledBox(), 'Weak')).to.deep.equal(usernameKept('That password is too easy to guess: the verdict beside it must say strong.', '(not a refusal)'))
  })

  it('Exists: refuses stale_write, whose message is its kind, the username is kept, and both passwords are emptied', async () => {
    expect(await TH.press(await filledBox(), 'Exists')).to.deep.equal(usernameKept('stale_write', 'stale_write'))
  })

  it('Failed: refuses storage_unavailable, the username is kept, and both passwords are emptied', async () => {
    expect(await TH.press(await filledBox(), 'Failed')).to.deep.equal(usernameKept('The dojo told its vaultDB to refuse this write.', 'storage_unavailable'))
  })

  it('Dismiss: on a bank locked before the submit, refuses bank_locked with no unlock prompt, the username is kept, and both passwords are emptied', async () => {
    const reading = await TH.press(await filledBox(), 'Dismiss')
    expect(reading).to.deep.include({ username: 'has text', boxPassword: 'empty', boxConfirmation: 'empty', refusal: 'bank_locked' })
    expect(reading['message']).to.match(/^The bank is locked, so nothing was read or written/u)
    await TH.stageShown('locked')
  })
})
