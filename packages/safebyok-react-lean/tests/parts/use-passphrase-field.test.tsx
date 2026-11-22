import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { type PassphraseFieldOpts, SubmitButton, usePassphraseField } from '../../src/parts'

/** A passphrase field in the host's own markup: a label, the input, a Show / Hide button and a Caps Lock line. */
function HostField(opts: PassphraseFieldOpts) {
  const field = usePassphraseField(opts)
  return (
    <>
      <label htmlFor={field.inputProps.id}>Passphrase</label>
      <input name="passphrase" {...field.inputProps} />
      <button {...field.toggleProps}>{field.isRevealed ? 'Hide' : 'Show'}</button>
      <p role="status">{field.isCapsLockOn ? 'Caps Lock is on' : ''}</p>
    </>
  )
}

describe("usePassphraseField", () => {
  it("dresses an input of the host's own as a masked, uncontrolled passphrase field its label names", () => {
    // usePassphraseField @example
    render(<HostField />)
    const field = screen.getByLabelText<HTMLInputElement>('Passphrase')
    expect(field.type).to.eq('password')
    expect(field.autocomplete).to.eq('current-password')
    expect(field.getAttribute('autocapitalize')).to.eq('none')
    expect(field.getAttribute('spellcheck')).to.eq('false')
    fireEvent.change(field, { target: { value: 'typed' } })
    expect(field.value).to.eq('typed')
  })

  it("takes the id and autoComplete it is handed", () => {
    render(<HostField id="next-passphrase" autoComplete="new-password" />)
    const field = screen.getByLabelText<HTMLInputElement>('Passphrase')
    expect(field.id).to.eq('next-passphrase')
    expect(field.autocomplete).to.eq('new-password')
  })

  it("shows and hides the passphrase from a button that names the input it controls", () => {
    render(<HostField />)
    const field = screen.getByLabelText<HTMLInputElement>('Passphrase')
    const toggle = screen.getByRole('button', { name: 'Show' })
    expect(toggle.getAttribute('aria-controls')).to.eq(field.id)
    expect(toggle.getAttribute('aria-pressed')).to.eq('false')
    fireEvent.click(toggle)
    expect(field.type).to.eq('text')
    expect(screen.getByRole('button', { name: 'Hide' }).getAttribute('aria-pressed')).to.eq('true')
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(field.type).to.eq('password')
  })

  it("hides the passphrase again when its form is submitted", async () => {
    let settle!: () => void
    const settled = new Promise<void>((resolve) => { settle = resolve })
    render(<form action={async (form) => { form.delete('passphrase'); await settled }}><HostField /><SubmitButton whilePending="Unlocking…">Unlock</SubmitButton></form>)
    const field = screen.getByLabelText<HTMLInputElement>('Passphrase')
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await screen.findByRole('button', { name: 'Unlocking…' })
    expect(field.type).to.eq('password')
    settle()
    await screen.findByRole('button', { name: 'Unlock' })
    expect(field.type).to.eq('password')
  })

  it("hides the passphrase again while isPending, for a form that submits from a handler", () => {
    const { rerender } = render(<HostField />)
    const field = screen.getByLabelText<HTMLInputElement>('Passphrase')
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(field.type).to.eq('text')
    rerender(<HostField isPending />)
    expect(field.type).to.eq('password')
  })

  it("warns while Caps Lock is on, until the field loses focus, and still hands the host its own handlers", () => {
    const onKeyDown = vi.fn()
    const onKeyUp = vi.fn()
    const onBlur = vi.fn()
    render(<HostField onKeyDown={onKeyDown} onKeyUp={onKeyUp} onBlur={onBlur} />)
    const field = screen.getByLabelText('Passphrase')
    fireEvent.keyDown(field, { key: 'A', modifierCapsLock: true })
    expect(screen.getByRole('status').textContent).to.eq('Caps Lock is on')
    fireEvent.keyUp(field, { key: 'a', modifierCapsLock: false })
    expect(screen.getByRole('status').textContent).to.eq('')
    fireEvent.keyDown(field, { key: 'A', modifierCapsLock: true })
    fireEvent.blur(field)
    expect(screen.getByRole('status').textContent).to.eq('')
    expect([ onKeyDown.mock.calls.length, onKeyUp.mock.calls.length, onBlur.mock.calls.length ]).to.deep.equal([2, 1, 1])
  })
})
