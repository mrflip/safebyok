import { fireEvent, within } from '@testing-library/react'
import { mask } from 'safebyok/utils'
import { describe, expect, it } from 'vitest'
import { PasteLabelpath } from '../../../src/components/practice/PasteCard'
import * as TH from '../../test-helpers'
import * as World from './world'

// The paste card, today, for Hero, signed in and unlocked, over the fixture. A test records what the library stores now:
// a change here is news for whiteboard/20261123-dojo/dojo-findings.md. A single-line input drops a newline itself, as
// HTML says it does, so the spaces are what the trim removes.

/** The paste card on a fresh page. */
async function shownCard(): Promise<HTMLElement> {
  return World.card(await World.practiceTab('hero', true), 'Let a key be pasted, and trim it where the whisper is made')
}

describe("the paste card, today", () => {
  it("a key pasted with spaces and a newline around it is stored trimmed", async () => {
    const shown = World.example(await shownCard(), 'Do: paste allowed, the whisper trimmed')
    TH.fill(shown, { 'API key': `  ${World.ApiKey} \n` })
    fireEvent.click(within(shown).getByRole('button', { name: 'Save' }))
    await TH.expectTextSoon(() => within(shown).getByRole('status').textContent, `Stored the key ${mask(World.ApiKey)}.`)
    const { Dojo } = await import('../../../src/lib/dojo')
    expect(await Dojo.withWhisper(PasteLabelpath, (whisper) => String(whisper['apiKey']))).to.eq(World.ApiKey)
  })

  it("a paste into the paste-blocked field is cancelled, and one into the library's field is not", async () => {
    const shown = await shownCard()
    expect(fireEvent.paste(within(shown).getByLabelText('Paste-blocked API key'))).to.eq(false)
    expect(fireEvent.paste(within(shown).getByLabelText('API key'))).to.eq(true)
  })
})
