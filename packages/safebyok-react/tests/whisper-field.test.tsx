import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { WhisperFieldAttributes } from 'safebyok/utils'
import { WhisperField } from '../src/whisper-field'

/** A host holding the whisper as typed in its own state, as the field's examples do, and showing what it holds. */
const Host = ({ placeholder }: { placeholder?: string }) => {
  const [keyText, setKeyText] = useState('')
  return (
    <>
      {placeholder === undefined
        ? <WhisperField value={keyText} onChange={setKeyText} aria-label="Anthropic API key" />
        : <WhisperField value={keyText} onChange={setKeyText} placeholder={placeholder} aria-label="Anthropic API key" />}
      <output>{keyText.length}</output>
    </>
  )
}

/** The field itself, found by the name its examples give it. */
const theField = () => screen.getByLabelText<HTMLInputElement>('Anthropic API key')

describe("WhisperField", () => {
  it("hides what is typed, and hands the host the whole text at each change", () => {
    render(<Host />)
    fireEvent.change(theField(), { target: { value: 'sk-ant-fake' } })
    expect(theField().type).to.eq('password')
    expect(theField().value).to.eq('sk-ant-fake')
    expect(screen.getByRole('status').textContent).to.eq('11')
  })

  it("shows the whisper while Show is pressed, and hides it again", () => {
    render(<Host />)
    const toggle = screen.getByRole('button', { name: 'Show' })
    expect(toggle.getAttribute('aria-pressed')).to.eq('false')
    expect(toggle.getAttribute('aria-controls')).to.eq(theField().id)
    fireEvent.click(toggle)
    expect(theField().type).to.eq('text')
    expect(screen.getByRole('button', { name: 'Hide' }).getAttribute('aria-pressed')).to.eq('true')
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(theField().type).to.eq('password')
  })

  it("is named for a whisper and carries every attribute that asks password managers to leave it alone", () => {
    render(<Host />)
    expect(theField().name).to.eq('whisper_text')
    const flags = Object.keys(WhisperFieldAttributes).filter((candidate) => candidate.startsWith('data-'))
    expect(flags.map((attrname) => theField().getAttribute(attrname))).to.deep.equal(flags.map(() => 'true'))
    expect(theField().getAttribute('autocomplete')).to.eq('new-password')
    expect(theField().getAttribute('autocapitalize')).to.eq('none')
    expect(theField().getAttribute('autocorrect')).to.eq('off')
    expect(theField().getAttribute('spellcheck')).to.eq('false')
  })

  it("carries the whisper as typed in its value attribute, as React keeps a controlled input's: what the README warns of", () => {
    render(<Host />)
    fireEvent.change(theField(), { target: { value: 'sk-ant-fake' } })
    expect(theField().getAttribute('value')).to.eq('sk-ant-fake')
  })

  it("shows no placeholder unless the host gives one", () => {
    const { unmount } = render(<Host />)
    expect(theField().hasAttribute('placeholder')).to.be.false
    unmount()
    render(<Host placeholder="sk-ant-…" />)
    expect(theField().getAttribute('placeholder')).to.eq('sk-ant-…')
  })

  it("keeps its own name and attributes whatever the host passes, and its id when the host gives one", () => {
    const sneaky = { name: 'api_key', autoComplete: 'on' } as object
    render(<WhisperField value="" onChange={() => undefined} id="anthropic_whisper" aria-label="Anthropic API key" {...sneaky} />)
    expect(theField().name).to.eq('whisper_text')
    expect(theField().getAttribute('autocomplete')).to.eq('new-password')
    expect(theField().id).to.eq('anthropic_whisper')
  })
})
