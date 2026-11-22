/** `WhisperMask`, the mask of a field of a box's whisper, showing its tail while the bank is unlocked. */

import type { ComponentPropsWithoutRef } from 'react'
import { type WhisperMaskOpts, useWhisperMask } from './use-whisper-mask'

// == [The mask]: WhisperMaskProps, WhisperMask

/** The props of a {@link WhisperMask}: the box and field, how much of its tail to show, and any `<code>` attribute but its children. */
export type WhisperMaskProps = WhisperMaskOpts & Omit<ComponentPropsWithoutRef<'code'>, 'children' | 'dangerouslySetInnerHTML' | 'onError'> & Readonly<{
  /** The box's labelpath, as the bank's other hooks take it. */
  labelpath: string
  /** The field of the box's whisper to mask. */
  field:     string
}>

/** A field of a box's whisper, masked: its last `tail` characters while the bank is unlocked, the stored mask while it is locked.
 * The mask is written into the page, never into React's state, and again on a lock, an unlock or a `putBox`.
 * `className`, in place of its own class `whisper-mask`, and the other attributes go to its `<code>`.
 * @example
 *   <WhisperMask labelpath="openai" field="apiKey" tail={4} />
 */
export function WhisperMask({ labelpath, field, bank, tail, ifLocked, onError, className = 'whisper-mask', ...passed }: Readonly<WhisperMaskProps>) {
  const { maskRef } = useWhisperMask(labelpath, field, { bank, tail, ifLocked, onError })
  // React renders the element empty and never touches its text, so the mask lives in the page alone.
  return <code {...passed} ref={maskRef} className={className} />
}
// --
