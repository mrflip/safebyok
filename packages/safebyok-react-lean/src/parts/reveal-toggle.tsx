/** A Show / Hide button for a secret field, and the `type` that field takes. */

import { type ReactElement, useState } from 'react'
import { PartsPhrases } from './phrases-parts'

// == [The toggle]: RevealToggle, useRevealToggle

/** What {@link useRevealToggle} gives: the field's input `type`, and the button that toggles it. */
export interface RevealToggle {
  fieldType: 'text' | 'password'
  /** The Show / Hide button of the field whose id is `fieldId`. */
  button:    (fieldId: string) => ReactElement
}

/** A Show / Hide button for a secret field, starting hidden. While `isAllowed` is false the field is hidden, and stays hidden until shown again. */
export function useRevealToggle(isAllowed = true): RevealToggle {
  const [isRevealed, setIsRevealed] = useState(false)
  // Reset during render, not by remounting the field, so whatever the field holds next starts out masked.
  if (isRevealed && (! isAllowed)) { setIsRevealed(false) }
  function button(fieldId: string) {
    return (
      <button type="button" aria-controls={fieldId} aria-pressed={isRevealed} onClick={() => { setIsRevealed((prior) => ! prior) }}>
        {isRevealed ? PartsPhrases.hideButton : PartsPhrases.showButton}
      </button>
    )
  }
  return { fieldType: isRevealed ? 'text' : 'password', button }
}
// --
