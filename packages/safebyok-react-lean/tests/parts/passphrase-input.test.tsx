import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PassphraseInput, SubmitButton } from '../../src/parts'

/** A form with a `PassphraseInput`, whose action waits on `settled`. */
function PassphraseForm({ settled }: Readonly<{ settled: Promise<void> }>) {
  return (
    <form action={async (form) => { form.delete('passphrase'); await settled }}>
      <PassphraseInput name="passphrase" aria-label="Passphrase" />
      <SubmitButton whilePending="Unlocking…">Unlock</SubmitButton>
    </form>
  )
}

describe("PassphraseInput", () => {
  it("takes the current passphrase, masked, unless told it takes a new one", () => {
    render(<><PassphraseInput name="passphrase" aria-label="Passphrase" /><PassphraseInput name="next" aria-label="Next" autoComplete="new-password" /></>)
    const field = screen.getByLabelText<HTMLInputElement>('Passphrase')
    expect(field.type).to.eq('password')
    expect(field.autocomplete).to.eq('current-password')
    expect(screen.getByLabelText<HTMLInputElement>('Next').autocomplete).to.eq('new-password')
  })

  it("hides the passphrase again when the form is submitted", async () => {
    let settle!: () => void
    render(<PassphraseForm settled={new Promise((resolve) => { settle = resolve })} />)
    const field = screen.getByLabelText<HTMLInputElement>('Passphrase')
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(field.type).to.eq('text')
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await screen.findByRole('button', { name: 'Unlocking…' })
    expect(field.type).to.eq('password')
    settle()
    await screen.findByRole('button', { name: 'Unlock' })
    expect(field.type).to.eq('password')
  })

  it("hides the passphrase again while isPending, for a form that submits from a handler", () => {
    const { rerender } = render(<PassphraseInput name="passphrase" aria-label="Passphrase" />)
    const field = screen.getByLabelText<HTMLInputElement>('Passphrase')
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(field.type).to.eq('text')
    rerender(<PassphraseInput name="passphrase" aria-label="Passphrase" isPending />)
    expect(field.type).to.eq('password')
    rerender(<PassphraseInput name="passphrase" aria-label="Passphrase" />)
    expect(field.type).to.eq('password')
    expect(field.hasAttribute('ispending')).to.eq(false)
  })

  it("warns while Caps Lock is on, and still hands the host its key and blur handlers", () => {
    const onKeyDown = vi.fn()
    const onBlur = vi.fn()
    render(<PassphraseInput name="passphrase" aria-label="Passphrase" onKeyDown={onKeyDown} onBlur={onBlur} />)
    const field = screen.getByLabelText('Passphrase')
    fireEvent.keyDown(field, { key: 'A', modifierCapsLock: true })
    expect(screen.getByRole('status').textContent).to.eq('Caps Lock is on')
    expect(onKeyDown).toHaveBeenCalledOnce()
    fireEvent.blur(field)
    expect(screen.getByRole('status').textContent).to.eq('')
    expect(onBlur).toHaveBeenCalledOnce()
  })
})
