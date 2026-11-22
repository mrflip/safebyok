import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { PartsPhrases, PartsPhrasesProvider, PassphraseInput, usePartsPhrases } from '../../src/parts'
import * as TH from '../test-helpers'

/** The show button's word, as the nearest provider gives it. */
function ShowWord() {
  return <p>{usePartsPhrases().showButton}</p>
}

describe("PartsPhrasesProvider", () => {
  it("puts the host's words in place of the English ones, for every part inside it", () => {
    // PartsPhrasesProvider @example
    render(
      <PartsPhrasesProvider phrases={{ showButton: 'Afficher', hideButton: 'Masquer', capsLockOn: 'Verr. Maj. activé' }}>
        <PassphraseInput name="passphrase" aria-label="Passphrase" />
      </PartsPhrasesProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Afficher' }))
    expect(screen.getByRole('button', { name: 'Masquer' })).to.exist
    fireEvent.keyDown(screen.getByLabelText('Passphrase'), { key: 'A', modifierCapsLock: true })
    expect(screen.getByRole('status').textContent).to.eq('Verr. Maj. activé')
  })

  it("keeps the word the provider above gives for each word left out", () => {
    render(
      <PartsPhrasesProvider phrases={{ showButton: 'Afficher', hideButton: 'Masquer' }}>
        <PartsPhrasesProvider phrases={{ hideButton: 'Cacher' }}>
          <PassphraseInput name="passphrase" aria-label="Passphrase" />
        </PartsPhrasesProvider>
      </PartsPhrasesProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Afficher' }))
    expect(screen.getByRole('button', { name: 'Cacher' })).to.exist
  })

  it("gives the English words outside every provider", () => {
    render(<ShowWord />)
    expect(screen.getByText(PartsPhrases.showButton)).to.exist
  })

  const SloppyPhrases = [
    [{ showButon: "Afficher" },  'a misspelt word'],
    [{ showButton: 42 },         'a word that is no string'],
    [{ showButton: undefined },  'a word given as undefined'],
    [null,                       'no words at all'],
  ] as const

  for (const [phrases, blurb] of SloppyPhrases) {
    it(`refuses ${blurb}`, () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      onTestFinished(() => { vi.restoreAllMocks() })
      const sloppy = phrases as unknown as Partial<PartsPhrases>
      TH.expectSyncRefusal(() => render(<PartsPhrasesProvider phrases={sloppy}><ShowWord /></PartsPhrasesProvider>), 'bad_record')
    })
  }
})
