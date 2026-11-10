import { useState } from 'react'

/** Return a Show / Hide button for a secret field, and the input `type` to give that field.
 * Pass `isFieldShowing` as false to force the field back to hidden.
 *
 * @example
 *   const reveal = useRevealToggle(Messages.showWhisper, Messages.hideWhisper)
 *   <input id={fieldId} type={reveal.fieldType} />{reveal.button(fieldId)}
 * @example
 *   const reveal = useRevealToggle(Messages.showWhisper, Messages.hideWhisper, box.isShowing)
 */
export const useRevealToggle = (showWord: string, hideWord: string, isFieldShowing = true) => {
  const [shown, setShown] = useState(false)
  // Reset during render, not by remounting the input, so whatever the field shows next starts out masked.
  if (shown && (! isFieldShowing)) { setShown(false) }
  const button = (fieldId: string) => (
    <button type="button" aria-controls={fieldId} aria-pressed={shown} onClick={() => { setShown((prev) => ! prev) }}>
      {shown ? hideWord : showWord}
    </button>
  )
  return { fieldType: shown ? 'text' : 'password', button }
}
