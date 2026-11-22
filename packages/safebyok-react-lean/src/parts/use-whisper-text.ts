/** `useWhisperText`, the behaviour of a whisper's text revealed into the page, without its markup: the element it is written into, and its Show / Hide button. */

import { type RefCallback, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { sanitizeForeignError } from 'safebyok/storage'
import { useGivenBank } from '../giver/giver-context'
import type { BankGiver } from '../giver/react-giver'
import { useReveal } from '../giver/use-reveal'

// == [Types]: WhisperTextOpts, WhisperTextResult, WhisperTextToggleProps

/** What {@link useWhisperText} takes beside the box and field. */
export type WhisperTextOpts = Readonly<{
  /** The giver's bank, `SOK.bank(banklabel)`: the provider's, when left out. */
  bank?:    Pick<BankGiver, 'useBank' | 'withWhisper'> | undefined
  /** Called with the refusal when the whisper cannot be shown, such as `dismissed` when the user closes the unlock form. The text stays hidden. */
  onError?: ((err: Error) => void) | undefined
}>

/** What {@link useWhisperText} answers: the ref of the element the text is written into, whether it shows, and the props of its Show / Hide button. */
export type WhisperTextResult = Readonly<{
  /** The ref of the element the text is written into. Render it empty, and give it no children: React never holds the text. */
  textRef:     RefCallback<HTMLElement>
  /** True while the text shows in the element. */
  isRevealed:  boolean
  /** True from Show until the text shows, while the bank unlocks or the box is opened. */
  isRevealing: boolean
  /** The props of the Show / Hide button, beside its words. */
  toggleProps: WhisperTextToggleProps
}>

/** The props {@link useWhisperText} gives its Show / Hide button: disabled while the text is on its way. */
export type WhisperTextToggleProps = Readonly<{
  "type":         'button'
  "aria-pressed": boolean
  "disabled":     boolean
  "onClick":      () => void
}>
// --

// == [The hook]: useWhisperText

/** One field of a box's whisper, revealed into an element of your own on Show, with props for the Show / Hide button. On a locked bank, Show asks for the unlock form first.
 * The text is written into the element, never into React's state, and taken out again on Hide, on a lock, and when the hook is handed another box or field.
 * Destructure what it answers: React's lint takes any other read of an object holding a ref for a read of the ref.
 * @example
 *   const { textRef, isRevealed, toggleProps } = useWhisperText('openai', 'apiKey')
 *   <code ref={textRef} />
 *   {! isRevealed && <code>{box.sidecar.mask}</code>}
 *   <button {...toggleProps}>{isRevealed ? 'Hide' : 'Show'}</button>
 */
export function useWhisperText(labelpath: string, field: string, { bank: bankOpt, onError }: WhisperTextOpts = {}): WhisperTextResult {
  const bank = useGivenBank(bankOpt)
  const reveal = useReveal(bank, labelpath)
  const textElRef = useRef<HTMLElement | null>(null)
  const textRef = useCallback((el: HTMLElement | null) => { textElRef.current = el }, [])
  const boxField = JSON.stringify([labelpath, field])
  const [priorBoxField, setPriorBoxField] = useState(boxField)
  // Reset during render, so another box or field starts out masked.
  if (priorBoxField !== boxField) {
    setPriorBoxField(boxField)
    reveal.mask()
  }
  const isRevealing = (reveal.fieldname !== null) && (! reveal.isRevealed)
  // React's stale-result flag: a Show that lands after the hook is handed another box or field writes nothing.
  const isCurrentRef = useRef<() => boolean>(() => true)
  useLayoutEffect(() => {
    let isCurrent = true
    isCurrentRef.current = () => isCurrent
    return () => { isCurrent = false }
  }, [boxField])

  // Before paint, so the text never shows a frame past Hide or a lock.
  useLayoutEffect(() => {
    if ((! reveal.isRevealed) && (textElRef.current !== null)) { textElRef.current.textContent = '' }
  }, [reveal.isRevealed])

  /** Show the text, written into its element inside the bank's callback. */
  async function show() {
    const isCurrent = isCurrentRef.current
    try {
      await reveal.showWhisper(field, (text) => { if (isCurrent() && (textElRef.current !== null)) { textElRef.current.textContent = text } })
    } catch (err) {
      onError?.(sanitizeForeignError(err))
    }
  }

  return {
    textRef,
    isRevealed:  reveal.isRevealed,
    isRevealing,
    toggleProps: {
      "type":         'button',
      "aria-pressed": reveal.isRevealed,
      "disabled":     isRevealing,
      "onClick":      () => { if (reveal.isRevealed) { reveal.mask() } else { void show() } },
    },
  }
}
// --
