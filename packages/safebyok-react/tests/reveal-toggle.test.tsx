import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useRevealToggle } from '../src/hooks/reveal-toggle'

/** Its example: an input, and the button that reveals it. */
const Revealed = () => {
  const reveal = useRevealToggle('Show', 'Hide')
  return <><input id="secret_field" aria-label="secret" type={reveal.fieldType} />{reveal.button('secret_field')}</>
}

/** Its second example: a field that shows only while `isFieldShowing`. */
const RevealedWhile = ({ isFieldShowing }: { isFieldShowing: boolean }) => {
  const reveal = useRevealToggle('Show', 'Hide', isFieldShowing)
  return <><input id="secret_field" aria-label="secret" type={reveal.fieldType} />{reveal.button('secret_field')}</>
}

describe("useRevealToggle", () => {
  it("starts hidden, and the button flips the field's type, saying which way it is set", () => {
    render(<Revealed />)
    const field = screen.getByLabelText<HTMLInputElement>('secret')
    expect(field.type).to.eq('password')
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(field.type).to.eq('text')
    expect(screen.getByRole('button', { name: 'Hide' }).getAttribute('aria-pressed')).to.eq('true')
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(field.type).to.eq('password')
  })

  it("names the field it controls, and never submits a form it sits in", () => {
    render(<Revealed />)
    const toggle = screen.getByRole('button', { name: 'Show' })
    expect(toggle.getAttribute('aria-controls')).to.eq('secret_field')
    expect(toggle.getAttribute('type')).to.eq('button')
    expect(toggle.getAttribute('aria-pressed')).to.eq('false')
  })

  it("goes back to hidden when its field hides, and stays hidden when it shows again", () => {
    // useRevealToggle @example 2
    const { rerender } = render(<RevealedWhile isFieldShowing />)
    const field = screen.getByLabelText<HTMLInputElement>('secret')
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(field.type).to.eq('text')
    rerender(<RevealedWhile isFieldShowing={false} />)
    expect(field.type).to.eq('password')
    rerender(<RevealedWhile isFieldShowing />)
    expect(field.type).to.eq('password')
    expect(screen.getByRole('button', { name: 'Show' }).getAttribute('aria-pressed')).to.eq('false')
  })
})
