/** `useWhisperMask`, the behaviour of a whisper's mask written into the page, without its markup: the element it is written into. */

import { type RefCallback, useCallback, useLayoutEffect, useRef } from 'react'
import { type BoxRecord, type LiveOf, mask } from 'safebyok'
import { sanitizeForeignError } from 'safebyok/storage'
import { useEffectEvent } from 'use-effect-event'
import { useGivenBank } from '../giver/giver-context'
import type { BankGiver, WithLockableWhisperOpts } from '../giver/react-giver'
import { whisperTextOf } from '../giver/use-reveal'

// == [Types]: WhisperMaskOpts, WhisperMaskResult

/** What {@link useWhisperMask} takes beside the box and field. */
export type WhisperMaskOpts = Readonly<{
  /** The giver's bank, `SOK.bank(banklabel)`: the provider's, when left out. */
  bank?:     Pick<BankGiver, 'useBank' | 'useBox' | 'withLockableWhisper'> | undefined
  /** Characters shown from the end of the field while the bank is unlocked: `mask`'s own choice, when left out. */
  tail?:     number | undefined
  /** The mask to show while the bank is locked, from the box's stored record: its sidecar's `mask` field, when left out.
   * One that answers at once, not with a promise, shows from the first paint.
   */
  ifLocked?: WithLockableWhisperOpts<string>['ifLocked'] | undefined
  /** Called with the refusal when the mask cannot be shown. The element is left empty. */
  onError?:  ((err: Error) => void) | undefined
}>

/** What {@link useWhisperMask} answers: the ref of the element the mask is written into. */
export type WhisperMaskResult = Readonly<{
  /** The ref of the element the mask is written into. Render it empty, and give it no children: React never holds the mask. */
  maskRef: RefCallback<HTMLElement>
}>
// --

// == [The hook]: useWhisperMask, storedMaskOf

/** A field of a box's whisper, masked into an element of your own: its last `tail` characters while the bank is unlocked, the stored mask while it is locked.
 * The mask is written into the element, never into React's state, and again on a lock, an unlock or a `putBox`.
 * Destructure what it answers: React's lint takes any other read of an object holding a ref for a read of the ref.
 * @example
 *   const { maskRef } = useWhisperMask('openai', 'apiKey', { tail: 4 })
 *   <code ref={maskRef} />
 */
export function useWhisperMask(labelpath: string, field: string, { bank: bankOpt, tail, ifLocked = storedMaskOf, onError }: WhisperMaskOpts = {}): WhisperMaskResult {
  const bank = useGivenBank(bankOpt)
  const stage = bank.useBank((snap) => snap.stage)
  const box = bank.useBox(labelpath).data
  const maskElRef = useRef<HTMLElement | null>(null)
  const maskRef = useCallback((el: HTMLElement | null) => { maskElRef.current = el }, [])

  // While locked, the mask comes from the record the box's query holds, so a mask `ifLocked` answers at once is written
  // before paint. Unlocked, the field is read from the box opened: until it lands, the element keeps what it showed.
  /** The mask of the box as it now stands, or nothing for a box not stored. */
  function maskOf(): string | Promise<string> {
    if ((box === null) || (box === undefined)) { return '' }
    if (stage === 'locked') { return ifLocked(box) }
    return bank.withLockableWhisper(labelpath, (whisper) => mask(whisperTextOf(whisper[field]), (tail === undefined) ? {} : { tail }), { ifLocked })
  }

  /** Write the mask into `el`, unless `isCurrent()` has gone false meanwhile, or empty it and report the refusal. */
  const writeMask = useEffectEvent(async (el: HTMLElement, isCurrent: () => boolean) => {
    try {
      const shown = maskOf()
      const text = (typeof shown === 'string') ? shown : await shown
      if (isCurrent()) { el.textContent = text }
    } catch (err) {
      if (isCurrent()) {
        el.textContent = ''
        onError?.(sanitizeForeignError(err))
      }
    }
  })
  // React's stale-result flag: an answer that lands after the next stage, revision or prop is dropped, so a live mask
  // never lands over the stored one written after a lock.
  useLayoutEffect(() => {
    const el = maskElRef.current
    if (el === null) { return }
    let isCurrent = true
    void writeMask(el, () => isCurrent)
    return () => { isCurrent = false }
  }, [stage, box?.revtok, labelpath, field, tail])

  return { maskRef }
}

/** The `mask` field of the box's sidecar, or nothing. */
function storedMaskOf(box: LiveOf<BoxRecord>): string {
  const stored = box.sidecar['mask']
  return (typeof stored === 'string') ? stored : ''
}
// --
