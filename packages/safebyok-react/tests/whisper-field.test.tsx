import { fireEvent, render, screen } from '@testing-library/react'
import { createRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { WhisperFieldAttributes } from 'safebyok/utils'
import { WhisperField } from '../src/whisper-field'

/** A host hearing the whisper as typed through onChange, as the field's first examples do, and showing how long it is. */
const Host = ({ placeholder }: { placeholder?: string }) => {
  const [keyText, setKeyText] = useState('')
  return (
    <>
      {placeholder === undefined
        ? <WhisperField onChange={setKeyText} aria-label="Anthropic API key" />
        : <WhisperField onChange={setKeyText} placeholder={placeholder} aria-label="Anthropic API key" />}
      <output>{keyText.length}</output>
    </>
  )
}

/** The field itself, found by the name its examples give it. */
const theField = () => screen.getByLabelText<HTMLInputElement>('Anthropic API key')

/** An obvious fake whisper. */
const FakeWhisper = 'sk-ant-fake'

/** Types the fake whisper into the field, as a user's keystrokes leave it. */
const typeWhisper = () => { fireEvent.change(theField(), { target: { value: FakeWhisper } }) }

describe("WhisperField", () => {
  it("hides what is typed, and hands the host the whole text at each change", () => {
    render(<Host />)
    typeWhisper()
    expect(theField().type).to.eq('password')
    expect(theField().value).to.eq('sk-ant-fake')
    expect(screen.getByRole('status').textContent).to.eq('11')
  })

  it("shows the whisper while Show is pressed, and hides it again, keeping what was typed", () => {
    render(<Host />)
    typeWhisper()
    const toggle = screen.getByRole('button', { name: 'Show' })
    expect(toggle.getAttribute('aria-pressed')).to.eq('false')
    expect(toggle.getAttribute('aria-controls')).to.eq(theField().id)
    fireEvent.click(toggle)
    expect(theField().type).to.eq('text')
    expect(theField().value).to.eq('sk-ant-fake')
    expect(screen.getByRole('button', { name: 'Hide' }).getAttribute('aria-pressed')).to.eq('true')
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(theField().type).to.eq('password')
    expect(theField().value).to.eq('sk-ant-fake')
  })

  it("is named for a whisper and carries every attribute that turns password managers and autofill away", () => {
    render(<Host />)
    expect(theField().name).to.eq('whisper_text')
    const flags = Object.keys(WhisperFieldAttributes).filter((candidate) => candidate.startsWith('data-'))
    expect(flags.map((attrname) => theField().getAttribute(attrname))).to.deep.equal(flags.map(() => 'true'))
    expect(theField().getAttribute('autocomplete')).to.eq('off')
    expect(theField().getAttribute('autocapitalize')).to.eq('none')
    expect(theField().getAttribute('autocorrect')).to.eq('off')
    expect(theField().getAttribute('spellcheck')).to.eq('false')
  })

  describe("keeps the whisper out of the page's markup", () => {
    it("writes no value attribute as the user types, hidden or shown", () => {
      render(<Host />)
      typeWhisper()
      expect(theField().hasAttribute('value')).to.be.false
      fireEvent.click(screen.getByRole('button', { name: 'Show' }))
      expect(theField().hasAttribute('value')).to.be.false
      expect(document.body.outerHTML).to.not.include('sk-ant-fake')
    })

    it("stays uncontrolled for a value a host slips past the types", () => {
      const slipped = { value: 'sk-ant-slipped', defaultValue: 'sk-ant-slipped' } as object
      render(<WhisperField aria-label="Anthropic API key" {...slipped} />)
      expect(theField().value).to.eq('')
      expect(document.body.outerHTML).to.not.include('sk-ant-slipped')
      typeWhisper()
      expect(theField().value).to.eq('sk-ant-fake')
    })
  })

  it("matches its form example: the form reads the whisper under the field's name", () => {
    const saved: unknown[] = []
    render(
      <form onSubmit={(evt) => { evt.preventDefault(); saved.push(new FormData(evt.currentTarget).get('whisper_text')) }}>
        <WhisperField aria-label="Anthropic API key" /> <button>Save</button>
      </form>,
    )
    typeWhisper()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(saved).to.deep.equal(['sk-ant-fake'])
  })

  it("hands a ref the input, to read or empty", () => {
    const fieldRef = createRef<HTMLInputElement>()
    render(<WhisperField ref={fieldRef} aria-label="Anthropic API key" />)
    typeWhisper()
    expect(fieldRef.current?.value).to.eq('sk-ant-fake')
    expect(fieldRef.current).to.eq(theField())
  })

  it("shows no placeholder unless the host gives one", () => {
    const { unmount } = render(<Host />)
    expect(theField().hasAttribute('placeholder')).to.be.false
    unmount()
    render(<Host placeholder="sk-ant-…" />)
    expect(theField().getAttribute('placeholder')).to.eq('sk-ant-…')
  })

  it("keeps its own name and attributes whatever the host passes, and its id when the host gives one", () => {
    const sneaky = { name: 'api_key', autoComplete: 'on', type: 'text' } as object
    render(<WhisperField id="anthropic_whisper" aria-label="Anthropic API key" {...sneaky} />)
    expect(theField().name).to.eq('whisper_text')
    expect(theField().getAttribute('autocomplete')).to.eq('off')
    expect(theField().type).to.eq('password')
    expect(theField().id).to.eq('anthropic_whisper')
  })
})
