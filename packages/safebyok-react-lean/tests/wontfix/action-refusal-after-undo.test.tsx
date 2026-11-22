// A demonstration of a row in notes/wontfix.md (STYLE.md, *Tests*): it asserts the behaviour the row leaves as it is.
// It mocks and injects nothing, but writes the row's host itself: no demo in this package has a form Action over a draft.
// To reopen the row, bring something this test does not already show.
// If it fails, the behaviour has changed: invert it into a promise, move it beside useDraft's tests, and delete the row.
/** The row "A refusal shown from a form Action's result outlives an Undo". */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useActionState } from 'react'
import { isVaultError } from 'safebyok'
import * as LeanTH from 'safebyok/testing'
import { describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'

/** A key typed into the draft's field, an obvious fake. */
const TypedKey = 'sk-test-typed-4242'

const RowChanged = 'notes/wontfix.md, "A refusal shown from a form Action\'s result outlives an Undo": the behaviour has changed. Invert this test, move it, and delete the row'

describe("wontfix: a draft's form Action that resolves its refusal as the Action's state", () => {
  it("shows the refusal still after Undo makes the draft clean again", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const seen: { putErr: Error | null } = { putErr: null }
    function RefusingEditor() {
      const draft = world.Bank.useDraft(TH.JokesPath)
      async function putDraft(): Promise<Error | null> {
        try {
          await draft.put()
          return null
        } catch (err) {
          seen.putErr = err as Error
          return err as Error
        }
      }
      const [putErr, putAction] = useActionState(putDraft, null)
      return (
        <>
          <form action={putAction}>
            <input aria-label="Key" {...draft.whisperField('apiKey')} />
            <button type="submit">Save</button>
          </form>
          <button type="button" onClick={() => { draft.setSidecar({ ...draft.sidecar, tier: 'pro' }) }}>Go pro</button>
          <button type="button" onClick={draft.discard}>Undo</button>
          <p>{draft.isDirty ? 'Dirty' : 'Clean'}{draft.isBehind ? ' and behind' : ''}</p>
          {(putErr !== null) && <p role="alert">{putErr.message}</p>}
        </>
      )
    }
    render(TH.providerTreeOf(world, <RefusingEditor />, { userid: TH.ProviderUser }))
    const device = await waitFor(() => world._cheat_device())
    await act(async () => {
      await device.signIn(TH.ProviderUser)
      await device.bank!.gate.unlock({ passphraseCleartext: LeanTH.TestPassphrase })
    })
    const keyInput = await screen.findByLabelText<HTMLInputElement>('Key')
    act(() => { screen.getByText('Go pro').click() })
    fireEvent.change(keyInput, { target: { value: TypedKey } })
    await act(() => world._cheat_otherVault!.putBoxOnce(`box/${TH.JokesPath}`, { sidecar: { service: 'jokes', tier: 'max' } }, { whisper: LeanTH.Whisper }))
    await screen.findByText('Dirty and behind')
    act(() => { screen.getByText('Save').click() })
    const refusalNode = await screen.findByRole('alert')
    const refusal = refusalNode.textContent
    expect(isVaultError(seen.putErr) && seen.putErr.refusalkind).to.eq('stale_write')
    expect(refusal).to.eq(seen.putErr?.message)
    await screen.findByText('Dirty and behind')
    act(() => { screen.getByText('Undo').click() })
    await screen.findByText('Clean')
    expect(screen.queryByRole('alert')?.textContent, RowChanged).to.eq(refusal)
  })
})
