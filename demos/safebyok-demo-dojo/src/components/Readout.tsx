import { type RefObject, useLayoutEffect, useState } from 'react'

/** One press of a scenario button, once its outcome has landed: the button's title, and a count that tells two presses apart. */
export type Outcome = Readonly<{ title: string, seq: number }>

/** What the readout shows of one outcome. */
type Reading = Readonly<{ title: string, texted: readonly (readonly [fieldname: string, hasText: boolean])[], message: string, refusalkind: string }>

/** The props of a {@link Readout}. */
type ReadoutProps = Readonly<{
  /** The form read: its alert, `role="alert"`, is the message shown, and its `data-refusalkind` the refusal's kind. */
  formRef:    RefObject<HTMLFormElement | null>
  fieldnames: readonly string[]
  outcome:    Outcome | null
}>

/** After each outcome, whether each field of the form still has text, and the message the form shows. It reads only whether a field is empty, never its text. */
export function Readout({ formRef, fieldnames, outcome }: ReadoutProps) {
  const [reading, setReading] = useState<Reading | null>(null)
  // Read once React has committed the outcome, and with it any reset of the form: React applies the reset before layout effects run.
  useLayoutEffect(() => {
    const form = formRef.current
    if ((outcome === null) || (form === null)) { return }
    setReading(readingOf(form, fieldnames, outcome))
  }, [formRef, fieldnames, outcome])
  if (reading === null) { return <p className="quiet">Press a button: the readout shows what the form kept.</p> }
  return (
    <table aria-label="Readout" className="readout">
      <caption>After {reading.title}</caption>
      <tbody>
        {reading.texted.map(([fieldname, isTexted]) => (
          <tr key={fieldname}><th scope="row">{fieldname}</th><td>{isTexted ? 'has text' : 'empty'}</td></tr>
        ))}
        <tr><th scope="row">message</th><td>{reading.message || '(none)'}</td></tr>
        <tr><th scope="row">refusal</th><td>{reading.refusalkind || '(none)'}</td></tr>
      </tbody>
    </table>
  )
}

/** What `form` shows after `outcome`. */
function readingOf(form: HTMLFormElement, fieldnames: readonly string[], outcome: Outcome): Reading {
  const alert = form.querySelector<HTMLElement>('[role="alert"]')
  return {
    title:       outcome.title,
    texted:      fieldnames.map((fieldname) => [fieldname, hasText(form, fieldname)]),
    message:     alert?.textContent ?? '',
    refusalkind: alert?.dataset['refusalkind'] ?? '',
  }
}

/** True while the field `fieldname` of `form` has text in it. */
function hasText(form: HTMLFormElement, fieldname: string): boolean {
  const field = form.elements.namedItem(fieldname)
  return (field instanceof HTMLInputElement) && (field.value.length > 0)
}
