import { render, screen } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { VaultError } from 'safebyok'
import { KitPhrases, KitPhrasesProvider, refusalTextOf, useKitPhrases } from '../../src/kit'
import { PartsPhrasesProvider, PassphraseInput } from '../../src/parts'
import * as TH from '../test-helpers'

/** The unlock button's word, as the nearest provider gives it. */
function UnlockWord() {
  return <p>{useKitPhrases().unlockButton}</p>
}

describe("refusalTextOf", () => {
  // refusalTextOf @example
  it("is reachable from the kit's entry, and answers anything that is no refusal as trouble", () => {
    const nonRefusals = [undefined, null, 'wrong_passphrase', 42, {}, { family: 'condition', refusalkind: 'wrong_passphrase' }, new Error('The key field is missing')]
    expect(nonRefusals.map((val) => refusalTextOf(val))).to.deep.equal(nonRefusals.map(() => 'Something went wrong. Please try again later.'))
  })

  it("answers in the words it is handed", () => {
    const phrases = { ...KitPhrases, wrongPassphrase: 'Mauvaise phrase secrète.', troubled: 'Un problème est survenu.' }
    expect(refusalTextOf(new VaultError('wrong_passphrase', 'The passphrase is wrong'), phrases)).to.eq('Mauvaise phrase secrète.')
    expect(refusalTextOf(new Error('The key field is missing'), phrases)).to.eq('Un problème est survenu.')
  })
})

describe("KitPhrasesProvider", () => {
  it("puts the host's words in place of the English ones, for the kit and the parts inside it", () => {
    // KitPhrasesProvider @example
    render(
      <KitPhrasesProvider phrases={{ unlockButton: 'Déverrouiller', showButton: 'Afficher' }}>
        <UnlockWord />
        <PassphraseInput name="passphrase" aria-label="Passphrase" />
      </KitPhrasesProvider>,
    )
    expect(screen.getByText('Déverrouiller')).to.exist
    expect(screen.getByRole('button', { name: 'Afficher' })).to.exist
  })

  it("keeps the word the provider above gives for each word left out", () => {
    render(
      <KitPhrasesProvider phrases={{ unlockButton: 'Déverrouiller', showButton: 'Afficher' }}>
        <KitPhrasesProvider phrases={{ cancelButton: 'Annuler' }}>
          <UnlockWord />
          <PassphraseInput name="passphrase" aria-label="Passphrase" />
        </KitPhrasesProvider>
      </KitPhrasesProvider>,
    )
    expect(screen.getByText('Déverrouiller')).to.exist
    expect(screen.getByRole('button', { name: 'Afficher' })).to.exist
  })

  it("keeps the parts' words of a PartsPhrasesProvider above it", () => {
    render(
      <PartsPhrasesProvider phrases={{ showButton: 'Afficher' }}>
        <KitPhrasesProvider phrases={{ unlockButton: 'Déverrouiller' }}>
          <UnlockWord />
          <PassphraseInput name="passphrase" aria-label="Passphrase" />
        </KitPhrasesProvider>
      </PartsPhrasesProvider>,
    )
    expect(screen.getByText('Déverrouiller')).to.exist
    expect(screen.getByRole('button', { name: 'Afficher' })).to.exist
  })

  it("refuses a misspelt word", () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    onTestFinished(() => { vi.restoreAllMocks() })
    const sloppy = { unlockButon: 'Déverrouiller' } as Partial<KitPhrases>
    TH.expectSyncRefusal(() => render(<KitPhrasesProvider phrases={sloppy}><UnlockWord /></KitPhrasesProvider>), 'bad_record')
  })
})
