// A demonstration of a row in notes/wontfix.md (STYLE.md, *Tests*): it asserts the behaviour the row leaves as it is.
// It mocks and injects nothing. To reopen the row, bring something this test does not already show.
// If it fails, the behaviour has changed: invert it into a promise, move it beside useDraft's tests, and delete the row.
/** The row "A form reset that the host cancels still makes a draft in that form forget what was typed". */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as LeanTH from 'safebyok/testing'
import { describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'

/** A key typed into the draft's field, an obvious fake. */
const TypedKey = 'sk-test-typed-4242'

const RowChanged = 'notes/wontfix.md, "A form reset that the host cancels still makes a draft in that form forget what was typed": the behaviour has changed. Invert this test, move it, and delete the row'

describe("wontfix: a form whose reset the host cancels, with a draft's input in it", () => {
  it("empties the draft's field and leaves the host's own input as typed", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    function ResetEditor() {
      const draft = world.Bank.useDraft(TH.JokesPath)
      return (
        <form onReset={(event) => { event.preventDefault() }}>
          <input aria-label="Key" {...draft.whisperField('apiKey')} />
          <input aria-label="Note" />
          <p>{draft.isDirty ? 'Dirty' : 'Clean'}</p>
          <button type="reset">Reset</button>
        </form>
      )
    }
    render(TH.providerTreeOf(world, <ResetEditor />, { userid: TH.ProviderUser }))
    const device = await waitFor(() => world._cheat_device())
    await act(async () => {
      await device.hello()
      await device.bank!.gate.unlock({ passphraseCleartext: LeanTH.TestPassphrase })
    })
    const keyInput = await screen.findByLabelText<HTMLInputElement>('Key')
    const note = screen.getByLabelText<HTMLInputElement>('Note')
    fireEvent.change(keyInput, { target: { value: TypedKey } })
    fireEvent.change(note, { target: { value: 'a note' } })
    await screen.findByText('Dirty')
    act(() => { screen.getByText('Reset').click() })
    expect(note.value, RowChanged).to.eq('a note')
    expect(keyInput.value, RowChanged).to.eq('')
    await screen.findByText('Clean')
  })
})
