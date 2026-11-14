import { describe, expect, it } from 'vitest'
import { WhisperFieldAttributes } from '../../src/helpers/whisper-field'

describe("WhisperFieldAttributes", () => {
  it("carries each major password manager's flag to ignore the field", () => {
    const flags = Object.keys(WhisperFieldAttributes).filter((attrname) => attrname.startsWith('data-'))
    expect(flags).to.have.members([
      'data-1p-ignore', 'data-lpignore', 'data-bwignore', 'data-dashlane-ignore',
      'data-rf-ignore', 'data-keeper-ignore', 'data-nordpass-ignore', 'data-zoho-ignore',
    ])
  })

  it("turns off autocomplete, capitalization, correction and spell-checking", () => {
    expect(WhisperFieldAttributes.autoComplete).to.eq('off')
    expect(WhisperFieldAttributes.autoCapitalize).to.eq('none')
    expect(WhisperFieldAttributes.autoCorrect).to.eq('off')
    expect(WhisperFieldAttributes.spellCheck).to.eq('false')
  })

  it("has only string values", () => {
    // WhisperFieldAttributes @example 2
    const set: Record<string, string> = {}
    const field = { setAttribute: (attrname: string, attrval: string) => { set[attrname.toLowerCase()] = attrval } }
    for (const [attrname, attrval] of Object.entries(WhisperFieldAttributes)) { field.setAttribute(attrname, attrval) }
    expect(Object.values(WhisperFieldAttributes).every((attrval) => typeof attrval === 'string')).to.be.true
    expect(set).to.include({ 'data-1p-ignore': 'true', 'autocomplete': 'off', 'spellcheck': 'false' })
  })
})
