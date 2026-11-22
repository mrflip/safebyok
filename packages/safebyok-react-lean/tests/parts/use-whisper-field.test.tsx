import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WhisperFieldAttributes } from 'safebyok'
import { useWhisperField, type WhisperFieldOpts } from '../../src/parts'

/** A whisper's field in the host's own markup: a label, the input and a Show / Hide button. */
function HostField(opts: WhisperFieldOpts) {
  const field = useWhisperField(opts)
  return (
    <>
      <label htmlFor={field.inputProps.id}>API key</label>
      <input name="apiKey" {...field.inputProps} />
      <button {...field.toggleProps}>{field.isRevealed ? 'Hide' : 'Show'}</button>
    </>
  )
}

describe("useWhisperField", () => {
  it("dresses an input of the host's own as a masked, uncontrolled field password managers leave alone", () => {
    // useWhisperField @example
    render(<HostField />)
    const field = screen.getByLabelText<HTMLInputElement>('API key')
    expect(field.type).to.eq('password')
    for (const [attr, val] of Object.entries(WhisperFieldAttributes)) {
      expect(field.getAttribute(attr.toLowerCase()), attr).to.eq(val)
    }
    fireEvent.change(field, { target: { value: 'typed' } })
    expect(field.value).to.eq('typed')
  })

  it("shows and hides the whisper, and hides it again while isPending", () => {
    const { rerender } = render(<HostField id="key" />)
    const field = screen.getByLabelText<HTMLInputElement>('API key')
    expect(field.id).to.eq('key')
    expect(screen.getByRole('button', { name: 'Show' }).getAttribute('aria-controls')).to.eq('key')
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(field.type).to.eq('text')
    rerender(<HostField id="key" isPending />)
    expect(field.type).to.eq('password')
  })
})
