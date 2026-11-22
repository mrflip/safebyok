import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UnlockDialog } from '../../src/kit'
import { useWhisperText } from '../../src/parts'
import * as TH from '../test-helpers'

/** A field of the joke service's whisper in the host's own markup, its element always in the page, and the unlock dialog. */
function HostText({ world, field }: Readonly<{ world: TH.ProviderWorld, field: string }>) {
  const stage = world.Bank.useBank((snap) => snap.stage)
  const { textRef, isRevealed, isRevealing, toggleProps } = useWhisperText(TH.JokesPath, field)
  return (
    <>
      <p>{stage}</p>
      <p>{isRevealing ? 'revealing' : 'idle'}</p>
      <output ref={textRef} data-testid="host-text" />
      <button data-testid="host-toggle" {...toggleProps}>{isRevealed ? 'Hide' : 'Show'}</button>
      <UnlockDialog />
    </>
  )
}

/** A world with the joke service's key stored, its `apiKey` rendered under the provider, once it shows the bank locked. */
async function renderText() {
  const world = await TH.buildProviderWorld({ stored: 'jokes' })
  const tree = (shown: string) => TH.providerTreeOf(world, <HostText world={world} field={shown} />, { userid: TH.ProviderUser })
  const { container, rerender } = render(tree('apiKey'))
  await screen.findByText('locked')
  return { world, container, el: screen.getByTestId('host-text'), rerenderWith: (shown: string) => { rerender(tree(shown)) } }
}

/** The host's Show / Hide button. */
function toggleOf(): HTMLButtonElement {
  return screen.getByTestId<HTMLButtonElement>('host-toggle')
}

/** Press Show, and unlock the dialog it opens with the stored passphrase, once `el` shows the key. */
async function showAndUnlock(el: HTMLElement): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Show' }))
  await screen.findByRole('dialog')
  expect(screen.getByText('revealing')).to.exist
  expect(toggleOf().disabled).to.eq(true)
  fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: TH.TestPassphrase } })
  fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
  await waitFor(() => { expect(el.textContent).to.eq(TH.JokesKey) })
}

describe("useWhisperText", () => {
  it("writes the field into the host's element on Show, after the unlock, holding it nowhere, and empties it on Hide", async () => {
    // useWhisperText @example
    const { world, container, el } = await renderText()
    expect(el.textContent).to.eq('')
    await showAndUnlock(el)
    expect(screen.getByText('idle')).to.exist
    expect(toggleOf().getAttribute('aria-pressed')).to.eq('true')
    TH.expectTextUnheld(TH.JokesKey, container, world.client)
    fireEvent.click(toggleOf())
    expect(el.textContent).to.eq('')
    expect(toggleOf().textContent).to.eq('Show')
  })

  it("empties the host's element when the bank locks", async () => {
    const { world, el } = await renderText()
    await showAndUnlock(el)
    act(() => { world.Bank.lock() })
    expect(el.textContent).to.eq('')
    expect(toggleOf().textContent).to.eq('Show')
  })

  it("empties the host's element, and starts masked, when handed another field", async () => {
    const { el, rerenderWith } = await renderText()
    await showAndUnlock(el)
    rerenderWith('orgId')
    expect(el.textContent).to.eq('')
    expect(toggleOf().getAttribute('aria-pressed')).to.eq('false')
  })
})
