/** The Show / Hide toggle of a secret field: whether it shows, the `type` its input takes, and the props of its button. */

import { useId, useState } from 'react'
import { useFormStatus } from 'react-dom'

// == [The toggle]: RevealToggleProps, RevealToggleOpts, RevealToggle, useRevealToggle

/** The props of a secret field's Show / Hide button, to spread onto a `<button>` of your own beside its words. */
export type RevealToggleProps = Readonly<{
  "type":          'button'
  "aria-controls": string
  "aria-pressed":  boolean
  "onClick":       () => void
}>

/** What a secret field's hook takes. */
export type RevealToggleOpts = Readonly<{
  /** The input's id: a fresh one, when left out. */
  id?:        string | undefined
  /** True while the form is submitting, for a form that submits from an `onSubmit` handler or one rendered by the component that calls the hook: it hides the field again, as a form action's submit does. */
  isPending?: boolean | undefined
}>

/** What {@link useRevealToggle} gives: the input's id and `type`, whether it shows, and its button's props. */
type RevealToggle = Readonly<{
  fieldId:     string
  fieldType:   'text' | 'password'
  isRevealed:  boolean
  toggleProps: RevealToggleProps
}>

/** The Show / Hide toggle of a secret field, starting hidden. Each submit of its form, and `isPending`, hides it again. */
export function useRevealToggle({ id, isPending = false }: RevealToggleOpts): RevealToggle {
  const { pending: isFormPending } = useFormStatus()
  const [isRevealed, setIsRevealed] = useState(false)
  const ownId = useId()
  const fieldId = id ?? ownId
  // Reset during render, not by remounting the field, so whatever the field holds next starts out masked.
  if (isRevealed && (isFormPending || isPending)) { setIsRevealed(false) }
  return {
    fieldId,
    fieldType:   isRevealed ? 'text' : 'password',
    isRevealed,
    toggleProps: { "type": 'button', "aria-controls": fieldId, "aria-pressed": isRevealed, "onClick": () => { setIsRevealed((prior) => ! prior) } },
  }
}
// --
