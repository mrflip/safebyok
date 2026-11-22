/** `WhisperText`, a field of a box's whisper, masked until the user asks to see it. */

import type { ComponentPropsWithRef, ReactNode } from 'react'
import { usePartsPhrases } from './phrases-parts'
import { type WhisperTextOpts, useWhisperText } from './use-whisper-text'

// == [The text]: WhisperTextProps, WhisperText

/** The props of a {@link WhisperText}: the box and field, what shows while it is hidden, and any `<span>` attribute but its children. */
export type WhisperTextProps = WhisperTextOpts & Omit<ComponentPropsWithRef<'span'>, 'children' | 'dangerouslySetInnerHTML' | 'onError'> & Readonly<{
  /** The box's labelpath, as the bank's other hooks take it. */
  labelpath: string
  /** The field of the box's whisper to show. */
  field:     string
  /** What shows in place of the text while it is hidden: the parts' `masked` word, when left out. */
  masked?:   ReactNode
}>

/** One field of a box's whisper, masked, with a Show / Hide button. Show writes the text into the page, never into React's state, and asks for the unlock form first on a locked bank.
 * Locking the bank hides it again.
 * `className`, in place of its own class `whisper-text`, and the other attributes go to its outer `<span>`, which carries `data-revealed` while the text shows and `data-pending` while it is on its way.
 * @example
 *   <WhisperText labelpath="openai" field="apiKey" />
 */
export function WhisperText(props: Readonly<WhisperTextProps>) {
  // Keyed by what it shows, so a Show still on its way for another box or field lands in an element no longer in the page.
  return <WhisperTextOf key={JSON.stringify([props.labelpath, props.field])} {...props} />
}

/** The markup of {@link WhisperText}, for one box and field. */
function WhisperTextOf({ labelpath, field, masked, bank, onError, className = 'whisper-text', ...passed }: Readonly<WhisperTextProps>) {
  const { textRef, isRevealed, isRevealing, toggleProps } = useWhisperText(labelpath, field, { bank, onError })
  const phrases = usePartsPhrases()
  // The text lives in an element React renders empty and unmounts on Hide. The two keys keep React from reusing that
  // element for the mask, which would leave the text beside a `masked` that is an element.
  return (
    <span {...passed} className={className} data-revealed={isRevealed || undefined} data-pending={isRevealing || undefined}>
      {isRevealed ? <span key="text" ref={textRef} /> : <span key="masked">{(masked === undefined) ? phrases.masked : masked}</span>}
      <button {...toggleProps}>{isRevealed ? phrases.hideButton : phrases.showButton}</button>
    </span>
  )
}
// --
