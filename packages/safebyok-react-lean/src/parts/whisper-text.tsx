/** `WhisperText`, a field of a box's whisper, masked until the user asks to see it. */

import type { ReactNode } from 'react'
import { PartsPhrases } from './phrases-parts'
import { type WhisperTextOpts, useWhisperText } from './use-whisper-text'

// == [The text]: WhisperTextProps, WhisperText

/** The props of a {@link WhisperText}. */
export type WhisperTextProps = WhisperTextOpts & Readonly<{
  /** The box's labelpath, as the bank's other hooks take it. */
  labelpath: string
  /** The field of the box's whisper to show. */
  field:     string
  /** What shows in place of the text while it is hidden. */
  masked?:   ReactNode
}>

/** One field of a box's whisper, masked, with a Show / Hide button. Show writes the text into the page, never into React's state, and asks for the unlock form first on a locked bank.
 * Locking the bank hides it again.
 * @example
 *   <WhisperText labelpath="openai" field="apiKey" />
 */
export function WhisperText(props: Readonly<WhisperTextProps>) {
  // Keyed by what it shows, so a Show still on its way for another box or field lands in an element no longer in the page.
  return <WhisperTextOf key={JSON.stringify([props.labelpath, props.field])} {...props} />
}

/** The markup of {@link WhisperText}, for one box and field. */
function WhisperTextOf({ labelpath, field, masked = PartsPhrases.masked, ...opts }: Readonly<WhisperTextProps>) {
  const { textRef, isRevealed, toggleProps } = useWhisperText(labelpath, field, opts)
  // The text lives in an element React renders empty and unmounts on Hide. The two keys keep React from reusing that
  // element for the mask, which would leave the text beside a `masked` that is an element.
  return (
    <span className="whisper-text">
      {isRevealed ? <span key="text" ref={textRef} /> : <span key="masked">{masked}</span>}
      <button {...toggleProps}>{isRevealed ? PartsPhrases.hideButton : PartsPhrases.showButton}</button>
    </span>
  )
}
// --
