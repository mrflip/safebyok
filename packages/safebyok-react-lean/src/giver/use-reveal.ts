/** `useReveal`, which field of a box's whisper the page shows, and the call that writes it in. */

import { useState } from 'react'
import { flushSync } from 'react-dom'
import type { WorldSnapshot, BoxUnsealed, Whisper } from 'safebyok'

// == [Types]: Reveal, RevealFriend

/** What {@link useReveal} answers: the field shown or on its way, and the calls that show and mask it. */
export type Reveal = Readonly<{
  /** The field shown, or on its way while `isRevealed` is false, or null for none. */
  fieldname:  string | null
  /** True while the field `fieldname` shows in the page. */
  isRevealed: boolean
  /** Show the field `fieldname` of the box's whisper: `write` puts its text into the page, inside `withWhisper`, once the field is marked shown.
   * On a locked bank it waits for the unlock form first. It rejects with the refusal, and masks the field.
   */
  showWhisper: (fieldname: string, write: (text: string) => void) => Promise<void>
  /** Mark the field `fieldname` shown with what the page already holds, such as text typed into it. */
  showTyped:   (fieldname: string) => void
  /** Mark no field shown. Emptying the page of the field's text is the caller's. */
  mask:        () => void
}>

/** What a reveal reads of its bank's giver. */
export type RevealFriend = Readonly<{
  useWorld:     <SelT>(select: (snap: WorldSnapshot) => SelT) => SelT
  withWhisper: <ResultT>(labelpath: string, fn: (whisper: Whisper, box: BoxUnsealed) => ResultT | Promise<ResultT>) => Promise<ResultT>
}>
// --

// == [The hook]: useReveal, whisperTextOf

/** Which field of the whisper of the box at `labelpath` the page shows, never its text. Locking the bank masks it. */
export function useReveal(bank: RevealFriend, labelpath: string): Reveal {
  const isLocked = bank.useWorld((snap) => snap.isLocked)
  const [shown, setShown] = useState<Readonly<{ fieldname: string, isRevealed: boolean }> | null>(null)
  if (isLocked && (shown?.isRevealed === true)) { setShown(null) }

  // The field is marked shown before `write` runs, so an element rendered only while it shows is in the page to write into.
  async function showWhisper(fieldname: string, write: (text: string) => void): Promise<void> {
    setShown({ fieldname, isRevealed: false })
    try {
      await bank.withWhisper(labelpath, (whisper) => {
        flushSync(() => { setShown({ fieldname, isRevealed: true }) })
        write(whisperTextOf(whisper[fieldname]))
      })
    } catch (err) {
      setShown(null)
      throw err
    }
  }

  return {
    fieldname:   shown?.fieldname ?? null,
    isRevealed:  shown?.isRevealed ?? false,
    showWhisper,
    showTyped:   (fieldname) => { setShown({ fieldname, isRevealed: true }) },
    mask:        () => { setShown(null) },
  }
}

/** The text of a whisper's field `val`: a string as it is, nothing for none, and anything else as JSON. */
export function whisperTextOf(val: unknown): string {
  if (typeof val === 'string') { return val }
  return (val === undefined) ? '' : JSON.stringify(val)
}
// --
