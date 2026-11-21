import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WhisperFieldAttributes } from 'safebyok'
import { SubmitButton, WhisperInput } from '../../src/parts'
import * as TH from '../test-helpers'

/** A form with a `WhisperInput` named `apiKey`: its action takes the field out of the form unless `isKept`, and hands it to `onHeard`. */
function KeyForm({ onHeard, isKept = false }: Readonly<{ onHeard: (whisperText: string) => void, isKept?: boolean }>) {
  /** Hear the form's key. */
  function action(form: FormData) {
    const typed = form.get('apiKey')
    onHeard((typeof typed === 'string') ? typed : '')
    if (! isKept) { form.delete('apiKey') }
  }
  return (
    <form action={action}>
      <WhisperInput name="apiKey" aria-label="API key" />
      <SubmitButton>Save</SubmitButton>
    </form>
  )
}

/** Type `whisperText` into the key field and press Save, once the form has taken it. */
async function submitKey(whisperText: string, heard: string[]): Promise<void> {
  fireEvent.change(screen.getByLabelText('API key'), { target: { value: whisperText } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => { expect(heard).to.deep.equal([whisperText]) })
}

describe("WhisperInput", () => {
  it("hands the whisper to the form's action, which leaves it in nothing React holds", async () => {
    const heard: string[] = []
    const { container } = render(<KeyForm onHeard={(whisperText) => { heard.push(whisperText) }} />)
    await submitKey(TH.JokesKey, heard)
    await waitFor(() => { expect(screen.getByLabelText<HTMLInputElement>('API key').value).to.eq('') })
    TH.expectTextUnheld(TH.JokesKey, container)
  })

  // The control for the case above: the search reaches the FormData React retains.
  it("leaves the whisper in React's hands when the action keeps it in the form", async () => {
    const heard: string[] = []
    const { container } = render(<KeyForm onHeard={(whisperText) => { heard.push(whisperText) }} isKept />)
    await submitKey(TH.JokesKey, heard)
    expect(TH.holdsText(TH.reactTreeOf(container), TH.JokesKey)).to.eq(true)
  })

  it("masks the whisper, and shows it on Show", () => {
    render(<WhisperInput name="apiKey" aria-label="API key" />)
    const field = screen.getByLabelText<HTMLInputElement>('API key')
    expect(field.type).to.eq('password')
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(field.type).to.eq('text')
    expect(screen.getByRole('button', { name: 'Hide' }).getAttribute('aria-controls')).to.eq(field.id)
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(field.type).to.eq('password')
  })

  it("hides the whisper again when the form is submitted", async () => {
    let settle!: () => void
    const settled = new Promise<void>((resolve) => { settle = resolve })
    render(
      <form action={async (form) => { form.delete('apiKey'); await settled }}>
        <WhisperInput name="apiKey" aria-label="API key" />
        <SubmitButton whilePending="Saving…">Save</SubmitButton>
      </form>,
    )
    const field = screen.getByLabelText<HTMLInputElement>('API key')
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(field.type).to.eq('text')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('button', { name: 'Saving…' })
    expect(field.type).to.eq('password')
    settle()
    await screen.findByRole('button', { name: 'Save' })
    expect(field.type).to.eq('password')
  })

  it("carries the attributes that keep password managers away", () => {
    render(<WhisperInput name="apiKey" aria-label="API key" />)
    const field = screen.getByLabelText('API key')
    expect(field.dataset['1pIgnore']).to.eq('true')
    expect(field.getAttribute('autocomplete')).to.eq(WhisperFieldAttributes.autoComplete)
    expect(field.getAttribute('spellcheck')).to.eq('false')
  })

  it("stays uncontrolled when a host passes it a value", () => {
    const sloppy = { value: 'from the host' } as object
    render(<WhisperInput name="apiKey" aria-label="API key" {...sloppy} />)
    const field = screen.getByLabelText<HTMLInputElement>('API key')
    expect(field.value).to.eq('')
    fireEvent.change(field, { target: { value: TH.JokesKey } })
    expect(field.value).to.eq(TH.JokesKey)
  })
})
