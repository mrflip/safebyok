import { fireEvent, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as TH from '../../test-helpers'
import * as World from './world'

// The refusal card, today, for Hero, signed in and unlocked, over the fixture; stale's newer box is written by a second
// device while the dojo's vaultDB holds the save. A change here is news for whiteboard/20261123-dojo/dojo-findings.md.

/** The refusal card's example on a fresh page, its key typed, and its button `title` pressed. */
async function pressed(title: string): Promise<HTMLElement> {
  const tab = await World.practiceTab('hero', true)
  const shown = World.example(World.card(tab, 'After a refusal, focus the field and say what to do'), 'Do: focus, an alert, and words a user can act on')
  TH.fill(shown, { 'API key': World.ApiKey })
  fireEvent.click(within(shown).getByRole('button', { name: title }))
  return shown
}

describe("the refusal card, today", () => {
  it("a refused save keeps the key, focuses its field, and says what happened in an alert the field is described by", async () => {
    const shown = await pressed('Save, refused')
    expect(within(shown).getByRole('button', { name: 'Saving…' })).to.have.property('disabled', true)
    const alert = within(shown).getByRole('alert')
    await TH.expectTextSoon(() => alert.textContent, 'The dojo told its vaultDB to refuse this write.')
    const field = within(shown).getByLabelText<HTMLInputElement>('API key')
    await waitFor(() => { expect(document.activeElement).to.eq(field) })
    expect([field.value, field.getAttribute('aria-describedby'), field.getAttribute('aria-invalid')]).to.deep.equal([World.ApiKey, alert.id, 'true'])
  })

  it("a stale save says in the form's own words what to do", async () => {
    const shown = await pressed('Save, stale')
    await TH.expectTextSoon(() => within(shown).getByRole('alert').textContent, 'This key was changed on another device meanwhile. Save again to replace that one with this.')
    expect(within(shown).getByLabelText<HTMLInputElement>('API key').value).to.eq(World.ApiKey)
  })

  it("a save after a refusal lands, and empties the form", async () => {
    const shown = await pressed('Save, refused')
    await TH.expectTextSoon(() => within(shown).getByRole('alert').textContent, 'The dojo told its vaultDB to refuse this write.')
    fireEvent.click(within(shown).getByRole('button', { name: 'Save' }))
    await TH.expectTextSoon(() => within(shown).getByRole('status').textContent, 'Saved the key.')
    expect([within(shown).getByRole('alert').textContent, within(shown).getByLabelText<HTMLInputElement>('API key').value]).to.deep.equal(['', ''])
  })
})
