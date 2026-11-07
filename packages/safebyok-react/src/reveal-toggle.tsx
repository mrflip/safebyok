import { useState } from 'react'

/**
 * A Show / Hide button for a secret field, and the `type` the field takes while shown or hidden.
 *
 * @example
 *   const reveal = useRevealToggle(Messages.showWhisper, Messages.hideWhisper)
 *   <input id={fieldId} type={reveal.fieldType} />{reveal.button(fieldId)}
 */
export const useRevealToggle = (showWord: string, hideWord: string) => {
  const [shown, setShown] = useState(false)
  const button = (fieldId: string) => (
    <button type="button" aria-controls={fieldId} aria-pressed={shown} onClick={() => { setShown((prev) => ! prev) }}>
      {shown ? hideWord : showWord}
    </button>
  )
  return { fieldType: shown ? 'text' : 'password', button }
}
