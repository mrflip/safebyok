import { useState } from 'react'

export const useRevealToggle = (showWord: string, hideWord: string, isFieldShowing = true) => {
  const [shown, setShown] = useState(false)
  // Reset in render, never by remounting the input: whatever the field shows next must arrive masked.
  if (shown && (! isFieldShowing)) { setShown(false) }
  const button = (fieldId: string) => (
    <button type="button" aria-controls={fieldId} aria-pressed={shown} onClick={() => { setShown((prev) => ! prev) }}>
      {shown ? hideWord : showWord}
    </button>
  )
  return { fieldType: shown ? 'text' : 'password', button }
}
