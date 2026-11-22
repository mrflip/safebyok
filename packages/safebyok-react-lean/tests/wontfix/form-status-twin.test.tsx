// A demonstration of a row in notes/wontfix.md (STYLE.md, *Tests*): it asserts the behaviour the row leaves as it is.
// It mocks and injects nothing. To reopen the row, bring something this test does not already show.
// If it fails, the behaviour has changed: invert it into a promise, move it beside putBoxMutationOptions' tests, and delete the row.
/** The row "A component inside a form that hands `mutate` its `FormData` can read the secret for one render". */
import { useMutation } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useMemo } from 'react'
import { useFormStatus } from 'react-dom'
import * as LeanTH from 'safebyok/testing'
import { describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'

/** A key typed into the form, an obvious fake. */
const TypedKey = 'sk-test-typed-4242'

const RowChanged = 'notes/wontfix.md, "A component inside a form that hands `mutate` its `FormData` can read the secret for one render": the behaviour has changed. Invert this test, move it, and delete the row'

describe("wontfix: the form status of a form that hands mutate its FormData", () => {
  it("shows the typed secret to one render of a component inside the form", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const keysRead: (string | null)[] = []
    function StatusReader() {
      const apiKey = useFormStatus().data?.get('apiKey')
      keysRead.push((typeof apiKey === 'string') ? apiKey : null)
      return null
    }
    function KeyEditor() {
      const options = useMemo(() => world.Bank.putBoxMutationOptions(TH.JokesPath, {
        whisperOf: (form) => ({ apiKey: form.get('apiKey') as string }),
        sidecarOf: ()     => ({ service: 'jokes' }),
      }), [])
      const put = useMutation(options)
      return (
        <form action={(form) => { put.mutate(form) }}>
          <input name="apiKey" type="password" aria-label="Key" />
          <button>Save</button>
          <StatusReader />
          {put.isSuccess && <output>Saved</output>}
        </form>
      )
    }
    render(TH.providerTreeOf(world, <KeyEditor />, { userid: TH.ProviderUser }))
    const device = await waitFor(() => world._cheat_device())
    await act(async () => {
      await device.signIn(TH.ProviderUser)
      await device.bank!.gate.unlock({ passphraseCleartext: LeanTH.TestPassphrase })
    })
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: TypedKey } })
    fireEvent.click(screen.getByText('Save'))
    await screen.findByText('Saved')
    expect(keysRead.filter((apiKey) => apiKey === TypedKey), RowChanged).to.have.lengthOf(1)
    expect(keysRead.at(-1), RowChanged).to.be.null
  })
})
