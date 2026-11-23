import { fireEvent, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as TH from '../../test-helpers'
import * as World from './world'

// The double-submit card, today, for Hero, signed in and unlocked, each save held by the dojo's vaultDB. A test records
// what React and the library do now: a change here is news for whiteboard/20261123-dojo/dojo-findings.md.

/** The double-submit card's example `examplename`, on a fresh page, its form filled in. */
async function filledExample(examplename: string): Promise<HTMLElement> {
  const tab = await World.practiceTab('hero', true)
  const shown = World.example(World.card(tab, 'Disable the submit while the save is pending'), examplename)
  TH.fill(shown, { 'Name': 'dojo key', 'API key': World.ApiKey })
  return shown
}

/** What `shown` says of React's form status and of its saves. */
function readingOf(shown: HTMLElement): Readonly<{ status: string, saves: string }> {
  return { status: within(shown).getByLabelText('Form status').textContent, saves: within(shown).getByLabelText('Saves').textContent }
}

describe("the double-submit card, today", () => {
  it("a second press while the save is pending starts nothing, and React's form status never holds the key", async () => {
    const shown = await filledExample('Do: SubmitButton, disabled while pending')
    fireEvent.click(within(shown).getByRole('button', { name: 'Save' }))
    const button = within(shown).getByRole('button', { name: 'Saving…' })
    expect(button).to.have.property('disabled', true)
    fireEvent.click(button)
    expect(readingOf(shown)).to.deep.equal({ status: "React's form status holds: keyname", saves: 'Saves ended: 0' })
    expect(TH.fiberHolds(shown, World.ApiKey)).to.eq(false)
    await waitFor(() => { expect(readingOf(shown).saves).to.eq('Saves ended: 1') })
    // Two holds' time, in which a second save, had one started, would end.
    await new Promise((resolve) => { setTimeout(resolve, 2 * World.HoldMs) })
    expect(readingOf(shown)).to.deep.equal({ status: "React's form status holds: nothing", saves: 'Saves ended: 1' })
  })

  it("a second press on a button left enabled queues a second save, and React's form status holds its key until the first ends", async () => {
    const shown = await filledExample("Don't: a button left enabled")
    const button = within(shown).getByRole('button', { name: 'Save' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(readingOf(shown)).to.deep.equal({ status: "React's form status holds: keyname, apiKey", saves: 'Saves ended: 0' })
    expect(TH.fiberHolds(shown, World.ApiKey)).to.eq(true)
    await waitFor(() => { expect(readingOf(shown).saves).to.eq('Saves ended: 2') })
    expect(TH.fiberHolds(shown, World.ApiKey)).to.eq(false)
  })
})
