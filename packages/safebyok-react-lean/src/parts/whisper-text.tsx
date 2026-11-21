/** `WhisperText`, a field of a box's whisper, masked until the user asks to see it. */

import { type ReactNode, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useGivenBank } from '../giver/giver-context'
import type { BankGiver } from '../giver/react-giver'
import { whisperTextOf } from '../giver/use-draft'
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
  onError?:  ((err: unknown) => void) | undefined
}

/** One field of a box's whisper, masked, with a Show / Hide button. Show writes the text into the page, never into React's state, and asks for the unlock form first on a locked bank.
 * Locking the bank hides it again.
 * @example
 *   <WhisperText labelpath="openai" field="apiKey" />
 */
export function WhisperText({ bank: bankProp, labelpath, field, masked = PartsPhrases.masked, onError }: Readonly<WhisperTextProps>) {
  const bank = useGivenBank(bankProp)
  const isLocked = bank.useBank((snap) => snap.isLocked)
  const [reveal, setReveal] = useState<'hidden' | 'revealing' | 'shown'>('hidden')
  const textRef = useRef<HTMLSpanElement>(null)
  if (isLocked && (reveal === 'shown')) { setReveal('hidden') }

  /** Show the text: mount its element, then write the field into it, inside the bank's callback. */
  async function show() {
    setReveal('revealing')
    try {
      await bank.withWhisper(labelpath, (whisper) => {
        flushSync(() => { setReveal('shown') })
        if (textRef.current !== null) { textRef.current.textContent = whisperTextOf(whisper[field]) }
      })
    } catch (err) {
      setReveal('hidden')
      onError?.(err)
    }
  }

  // The shown text lives in an element React renders empty and unmounts on Hide, taking the text with it.
  return (
    <span className="whisper-text">
      {(reveal === 'shown') ? <span ref={textRef} /> : <span>{masked}</span>}
      <button
        type="button"
        aria-pressed={reveal === 'shown'}
        disabled={reveal === 'revealing'}
        onClick={() => { if (reveal === 'shown') { setReveal('hidden') } else { void show() } }}
      >
        {(reveal === 'shown') ? PartsPhrases.hideButton : PartsPhrases.showButton}
      </button>
    </span>
  )
}
// --
