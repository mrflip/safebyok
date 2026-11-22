// A demonstration of a row in notes/wontfix.md (STYLE.md, *Tests*): it asserts the behaviour the row leaves as it is.
// It mocks and injects nothing. To reopen the row, bring something this test does not already show.
// If it fails, the behaviour has changed: invert it into a promise, move it beside useDraft's tests, and delete the row.
/** The row "A form's reset makes a draft forget what was typed into its inputs outside that form". */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as LeanTH from 'safebyok/testing'
import { describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'

/** Text typed into the draft's fields, obvious fakes. */
const TypedKey = 'sk-test-typed-4242'
const TypedOrg = 'org-test-4242'

const RowChanged = 'notes/wontfix.md, "A form\'s reset makes a draft forget what was typed into its inputs outside that form": the behaviour has changed. Invert this test, move it, and delete the row'

describe("wontfix: a draft with one input in a form and one outside it", () => {
  it("empties both inputs when the form is reset", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    function SplitEditor() {
      const draft = world.Bank.useDraft(TH.JokesPath)
      return (
        <>
          <form>
            <input aria-label="Key" {...draft.whisperField('apiKey')} />
            <button type="reset">Reset</button>
          </form>
          <input aria-label="Org" {...draft.whisperField('orgId')} />
          <p>{draft.isDirty ? 'Dirty' : 'Clean'}</p>
        </>
      )
    }
    render(TH.providerTreeOf(world, <SplitEditor />, { userid: TH.ProviderUser }))
    const device = await waitFor(() => world._cheat_device())
    await act(async () => {
      await device.hello()
      await device.bank!.gate.unlock({ passphraseCleartext: LeanTH.TestPassphrase })
    })
    const keyInput = await screen.findByLabelText<HTMLInputElement>('Key')
    const org = screen.getByLabelText<HTMLInputElement>('Org')
    fireEvent.change(keyInput, { target: { value: TypedKey } })
    fireEvent.change(org, { target: { value: TypedOrg } })
    await screen.findByText('Dirty')
    act(() => { screen.getByText('Reset').click() })
    // The form's own reset empties the key's input; the org's is emptied by the draft alone.
    expect([keyInput.value, org.value], RowChanged).to.deep.equal(['', ''])
    await screen.findByText('Clean')
  })
})
