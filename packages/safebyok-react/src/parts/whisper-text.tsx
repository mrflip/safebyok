/** `WhisperText`, a field of a box's whisper, masked until the user asks to see it. */

import { type ReactNode, useRef } from 'react'
import { sanitizeForeignError } from 'safebyok/storage'
import { useGivenBank } from '../giver/giver-context'
import type { BankGiver } from '../giver/react-giver'
import { useReveal } from '../giver/use-reveal'
import { PartsPhrases } from './phrases-parts'

// == [The text]: WhisperTextProps, WhisperText

/** The props of a {@link WhisperText}. */
export interface WhisperTextProps {
  /** The giver's bank, `SOK.bank(banklabel)`: the provider's, when left out. */
  bank?:     Pick<BankGiver, 'useBank' | 'withWhisper'> | undefined
  /** The box's labelpath, as the bank's other hooks take it. */
  labelpath: string
  /** The field of the box's whisper to show. */
  field:     string
  /** What shows in place of the text while it is hidden. */
  masked?:   ReactNode
  /** Called with the refusal when the whisper cannot be shown, such as `dismissed` when the user closes the unlock form. The text stays hidden. */
  onError?:  ((err: Error) => void) | undefined
}

/** One field of a box's whisper, masked, with a Show / Hide button. Show writes the text into the page, never into React's state, and asks for the unlock form first on a locked bank.
 * Locking the bank hides it again.
 * @example
 *   <WhisperText labelpath="openai" field="apiKey" />
 */
export function WhisperText(props: Readonly<WhisperTextProps>) {
  // Keyed by what it shows, so another box or field starts masked, with its own Show button.
  return <WhisperTextOf key={JSON.stringify([props.labelpath, props.field])} {...props} />
}

/** The stateful part of {@link WhisperText}, for one box and field. */
function WhisperTextOf({ bank: bankProp, labelpath, field, masked = PartsPhrases.masked, onError }: Readonly<WhisperTextProps>) {
  const bank = useGivenBank(bankProp)
  const reveal = useReveal(bank, labelpath)
  const textRef = useRef<HTMLSpanElement>(null)
  const isRevealing = (reveal.fieldname !== null) && (! reveal.isRevealed)

  /** Show the text, written into its element inside the bank's callback. */
  async function show() {
    try {
      await reveal.showWhisper(field, (text) => { if (textRef.current !== null) { textRef.current.textContent = text } })
    } catch (err) {
      onError?.(sanitizeForeignError(err))
    }
  }

  // The shown text lives in an element React renders empty and unmounts on Hide, taking the text with it. The two keys
  // keep React from reusing that element for the mask, which would leave the text beside a `masked` that is an element.
  return (
    <span className="whisper-text">
      {reveal.isRevealed ? <span key="text" ref={textRef} /> : <span key="masked">{masked}</span>}
      <button
        type="button"
        aria-pressed={reveal.isRevealed}
        disabled={isRevealing}
        onClick={() => { if (reveal.isRevealed) { reveal.mask() } else { void show() } }}
      >
        {reveal.isRevealed ? PartsPhrases.hideButton : PartsPhrases.showButton}
      </button>
    </span>
  )
}
// --
