import { useState } from 'react'

/** A Show / Hide button for a secret field, and the `type` the field takes while shown or hidden.
 *
 * @example
 *   const reveal = useRevealToggle(Messages.showWhisper, Messages.hideWhisper)
 *   <input id={fieldId} type={reveal.fieldType} />{reveal.button(fieldId)}
 * @example
 *   const reveal = useRevealToggle(Messages.showWhisper, Messages.hideWhisper, box.isShowing)
 */
export const useRevealToggle = (showWord: string, hideWord: string, isFieldShowing = true) => {
  const [shown, setShown] = useState(false)
  // A field that hides takes its Show with it, so whatever it shows next arrives masked. Reset as
  // React adjusts state to a prop, in render: never by remounting the input.
  if (shown && (! isFieldShowing)) { setShown(false) }
  const button = (fieldId: string) => (
    <button type="button" aria-controls={fieldId} aria-pressed={shown} onClick={() => { setShown((prev) => ! prev) }}>
      {shown ? hideWord : showWord}
    </button>
  )
  return { fieldType: shown ? 'text' : 'password', button }
}
