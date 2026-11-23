import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TestKeyCard } from '../../../src/components/practice/TestKeyCard'
import * as TH from '../../test-helpers'
import * as World from './world'

// The test-a-key card alone, today, over the dojo's made-up service. A change here is news for
// whiteboard/20261123-dojo/dojo-findings.md.

/** The card's example, its field holding `apiKey`, its Test button pressed. */
function tested(apiKey: string): HTMLElement {
  render(<TestKeyCard />)
  const shown = World.example(document.body, 'Do: a Test button beside the field')
  fireEvent.change(within(shown).getByLabelText('API key'), { target: { value: apiKey } })
  fireEvent.click(within(shown).getByRole('button', { name: 'Test key' }))
  return shown
}

describe("the test-a-key card, today", () => {
  it("a key of the dojo's shape is accepted, and stays in its field", async () => {
    const shown = tested(World.ApiKey)
    await TH.expectTextSoon(() => within(shown).getByLabelText('Test result').textContent, 'The service accepted the key.')
    expect(within(shown).getByLabelText<HTMLInputElement>('API key').value).to.eq(World.ApiKey)
  })

  it("a key of another shape is refused", async () => {
    const shown = tested('sk-wrong-made-up-0001')
    await TH.expectTextSoon(() => within(shown).getByLabelText('Test result').textContent, 'The service refused the key.')
    expect(within(shown).getByLabelText<HTMLInputElement>('API key').value).to.eq('sk-wrong-made-up-0001')
  })

  it("the button is disabled while the test runs, and the key reaches no React state", async () => {
    const shown = tested(World.ApiKey)
    expect(within(shown).getByRole('button', { name: 'Testing…' })).to.have.property('disabled', true)
    expect(TH.fiberHolds(shown, World.ApiKey)).to.eq(false)
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Test key' })).to.have.property('disabled', false) })
    expect(TH.fiberHolds(shown, World.ApiKey)).to.eq(false)
  })
})
