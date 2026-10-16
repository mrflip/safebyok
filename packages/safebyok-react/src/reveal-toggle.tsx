import { useState } from 'react'

/**
 * Whether a secret field shows what is typed, and the Show / Hide button that flips it: the
 * field's `type` is `password` while hidden, `text` while shown. Only the type changes, so a
 * field the browser holds the text of (an uncontrolled one) keeps what is typed either way.
 *
 * @returns `fieldType` for the input, and `button(fieldId)`, the button that controls it, with
 *   `aria-pressed` true while the text shows.
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
