/** `WhisperMask`, the mask of a field of a box's whisper, showing its tail while the bank is unlocked. */

import { useEffect, useRef } from 'react'
import { type BoxRecord, type LiveOf, mask } from 'safebyok'
import { useEffectEvent } from 'use-effect-event'
import { useGivenBank } from '../giver/giver-context'
import type { BankGiver, WithLockableWhisperOpts } from '../giver/react-giver'
import { whisperTextOf } from '../giver/use-reveal'

// == [The mask]: WhisperMaskProps, WhisperMask, storedMaskOf

/** The props of a {@link WhisperMask}. */
export interface WhisperMaskProps {
  /** The giver's bank, `SOK.bank(banklabel)`: the provider's, when left out. */
  bank?:     Pick<BankGiver, 'useBank' | 'useBox' | 'withLockableWhisper'> | undefined
  /** The box's labelpath, as the bank's other hooks take it. */
  labelpath: string
  /** The field of the box's whisper to mask. */
  field:     string
  /** Characters shown from the end of the field while the bank is unlocked: `mask`'s own choice, when left out. */
  tail?:     number | undefined
  /** The mask to show while the bank is locked, from the box's stored record: its sidecar's `mask` field, when left out. */
  ifLocked?: WithLockableWhisperOpts<string>['ifLocked'] | undefined
  /** Called with the refusal when the mask cannot be shown. The element stays empty. */
  onError?:  ((err: unknown) => void) | undefined
}

/** A field of a box's whisper, masked: its last `tail` characters while the bank is unlocked, the stored mask while it is locked.
 * The mask is written into the page, never into React's state, and again on a lock, an unlock or a `putBox`.
 * @example
 *   <WhisperMask labelpath="openai" field="apiKey" tail={4} />
 */
export function WhisperMask({ bank: bankProp, labelpath, field, tail, ifLocked = storedMaskOf, onError }: Readonly<WhisperMaskProps>) {
  const bank = useGivenBank(bankProp)
  const stage = bank.useBank((snap) => snap.stage)
  const revtok = bank.useBox(labelpath).data?.revtok
  const maskRef = useRef<HTMLElement>(null)

  /** Write the mask of the box at its revision into `el`, or leave it empty, unless `isCurrent()` has gone false meanwhile. */
  const writeMask = useEffectEvent(async (el: HTMLElement, isCurrent: () => boolean) => {
    el.textContent = ''
    if (revtok === undefined) { return }
    try {
      const shown = await bank.withLockableWhisper(labelpath, (whisper) => mask(whisperTextOf(whisper[field]), (tail === undefined) ? {} : { tail }), { ifLocked })
      if (isCurrent()) { el.textContent = shown }
    } catch (err) {
      if (isCurrent()) { onError?.(err) }
    }
  })
  // React's stale-result flag: an answer that lands after the next stage, revision or prop is dropped, so a live mask
  // never lands over the stored one written after a lock.
  useEffect(() => {
    const el = maskRef.current
    if (el === null) { return }
    let isCurrent = true
    void writeMask(el, () => isCurrent)
    return () => { isCurrent = false }
  }, [stage, revtok, labelpath, field, tail])

  // React renders the element empty and never touches its text, so the mask lives in the page alone.
  return <code ref={maskRef} className="whisper-mask" />
}

/** The `mask` field of the box's sidecar, or nothing. */
function storedMaskOf(box: LiveOf<BoxRecord>): string {
  const stored = box.sidecar['mask']
  return (typeof stored === 'string') ? stored : ''
}
// --
