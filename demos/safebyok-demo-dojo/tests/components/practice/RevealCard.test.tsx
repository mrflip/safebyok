import { fireEvent, render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RevealCard } from '../../../src/components/practice/RevealCard'
import * as World from './world'

// The reveal card alone, today. jsdom shows what each field carries once revealed; what a browser or a keyboard does
// with it is read, not run. A change here is news for whiteboard/20261123-dojo/dojo-findings.md.

/** The `type` of `field` and the three helpers' attributes it carries. */
function helpersOf(field: HTMLElement): readonly (string | null)[] {
  return ['type', 'spellcheck', 'autocorrect', 'autocapitalize'].map((attrname) => field.getAttribute(attrname))
}

describe("the reveal card, today", () => {
  it("a hand-made field shown as text carries no spellcheck, autocorrect or autocapitalize", () => {
    render(<RevealCard />)
    const shown = World.example(document.body, "Don't: a hand-made Show button, and nothing else")
    fireEvent.click(within(shown).getByRole('button', { name: 'Show' }))
    expect(helpersOf(within(shown).getByLabelText('Hand-made API key'))).to.deep.equal(['text', null, null, null])
  })

  for (const fieldlabel of ['API key', 'Passphrase']) {
    it(`the library's ${fieldlabel} field shown as text keeps spellcheck, autocorrect and autocapitalize off`, () => {
      render(<RevealCard />)
      const shown = World.example(document.body, "Do: the library's parts")
      const field = within(shown).getByLabelText(fieldlabel)
      fireEvent.click(within(field.parentElement ?? shown).getByRole('button', { name: 'Show' }))
      expect(helpersOf(field)).to.deep.equal(['text', 'false', 'off', 'none'])
    })
  }
})
