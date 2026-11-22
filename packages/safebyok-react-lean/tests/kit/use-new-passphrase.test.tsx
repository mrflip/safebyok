import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { type PassphraseVerdict, useNewPassphrase } from '../../src/kit'
import * as TH from '../test-helpers'

/** A new passphrase, an obvious fake, that the world's strength checker finds strong. */
const NewPassphrase = 'a fake new passphrase'

/** The new passphrase and its confirmation in the host's own markup, with words of the host's own for the verdict and the match. */
function HostChooser({ world }: Readonly<{ world: TH.ProviderWorld }>) {
  const newPassphrase = useNewPassphrase(world.SOK)
  const { verdict, match } = newPassphrase
  return (
    <>
      <input {...newPassphrase.field} aria-label="Pick one" />
      <input {...newPassphrase.confirmField} aria-label="Again" />
      <p data-testid="verdict">{verdictWordsOf(verdict)}</p>
      <p data-testid="match">{match}</p>
    </>
  )
}

/** The host's words for `verdict`. */
function verdictWordsOf(verdict: PassphraseVerdict | null): string {
  if (verdict === null) { return 'none yet' }
  return verdict.strong ? 'fine' : `weak: ${verdict.reason}`
}

/** A world with nothing stored, its chooser rendered under the provider. */
async function renderChooser() {
  const world = await TH.buildProviderWorld({ stored: 'none' })
  const { container } = render(TH.providerTreeOf(world, <HostChooser world={world} />, { userid: TH.ProviderUser }))
  return { world, container }
}

/** Type `typed` into the field labelled `label`. */
function typeInto(label: string, typed: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value: typed } })
}

describe("useNewPassphrase", () => {
  it("answers the checker's verdict unworded, null until the field is typed in and the verdict lands", async () => {
    const { world, container } = await renderChooser()
    expect(screen.getByTestId('verdict').textContent).to.eq('none yet')
    const release = world.checker.hold()
    typeInto('Pick one', 'short')
    expect(screen.getByTestId('verdict').textContent).to.eq('none yet')
    release()
    await screen.findByText('weak: Twelve characters or more, please.')
    typeInto('Pick one', NewPassphrase)
    await screen.findByText('fine')
    typeInto('Pick one', '')
    expect(screen.getByTestId('verdict').textContent).to.eq('none yet')
    TH.expectTextUnheld(NewPassphrase, container, world.client)
  })

  it("answers whether the confirmation matches: untyped while it is empty, then differs or matches", async () => {
    await renderChooser()
    expect(screen.getByTestId('match').textContent).to.eq('untyped')
    typeInto('Pick one', NewPassphrase)
    typeInto('Again', 'a fake')
    expect(screen.getByTestId('match').textContent).to.eq('differs')
    typeInto('Again', NewPassphrase)
    expect(screen.getByTestId('match').textContent).to.eq('matches')
    typeInto('Again', '')
    expect(screen.getByTestId('match').textContent).to.eq('untyped')
  })

  it("gives each field an id of its own, for a label", async () => {
    await renderChooser()
    const ids = [screen.getByLabelText('Pick one').id, screen.getByLabelText('Again').id]
    expect(ids.every((id) => id !== '')).to.eq(true)
    expect(ids[0]).to.not.eq(ids[1])
  })
})
