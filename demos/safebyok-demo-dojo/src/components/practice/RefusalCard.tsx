import { useActionState, useEffect, useId, useRef } from 'react'
import { isVaultError } from 'safebyok'
import { SubmitButton, WhisperInput } from 'safebyok-react-lean/parts'
import { mask } from 'safebyok/utils'
import { Dojo } from '../../lib/dojo'
import { formTextOf } from '../../lib/form-text'
import { armOutcome } from '../../lib/form-outcomes'
import { messageOf } from '../../lib/messages'
import { Example, PracticeCard } from './PracticeCard'

/** The labelpath of the box the form saves. */
export const RefusalLabelpath = 'practice_refusal'

/** The form action that saves the box at {@link RefusalLabelpath}. */
const savePut = Dojo.putBoxAction(RefusalLabelpath, {
  whisperOf:        (form) => ({ apiKey: formTextOf(form, 'apiKey').trim() }),
  sidecarOf:        (whisper) => ({ mask: mask(String(whisper['apiKey'])) }),
  secretFieldnames: ['apiKey'],
})

// The kit's words for `stale_write` are the kind itself, which tells a user nothing.
/** What the form tells the user of `err`: its own words for a box changed on another device, and the kit's for the rest. */
function wordsOf(err: Error): string {
  if (isVaultError(err) && (err.refusalkind === 'stale_write')) { return 'This key was changed on another device meanwhile. Save again to replace that one with this.' }
  return messageOf(err)
}

/** After a refusal, focus the field to mend and say what happened in an alert: a form Action that keeps what was typed. */
export function RefusalCard({ userid }: Readonly<{ userid: string | null }>) {
  const [put, putAction] = useActionState(savePut, null)
  const fieldRef = useRef<HTMLInputElement>(null)
  const alertId = useId()
  useEffect(() => { if (put?.err) { fieldRef.current?.focus() } }, [put])
  return (
    <PracticeCard
      title="After a refusal, focus the field and say what to do"
      why={<>
        <p>The form keeps what was typed (it cancels React&apos;s reset on a refusal), focus returns to the field, and the message is in a <code>role=&quot;alert&quot;</code> region the field is described by, so a screen reader hears it at once and again on the field.</p>
        <p>Tell the user what to do in words of their own: a refusal&apos;s kind is for code. The kit&apos;s text for <code>stale_write</code> is <code>stale_write</code>, so this form has its own.</p>
      </>}
    >
      <Example caption="focus, an alert, and words a user can act on">
        <form aria-label="Refusal handled" action={putAction} onReset={(event) => { if (put?.err) { event.preventDefault() } }}>
          <WhisperInput ref={fieldRef} name="apiKey" aria-label="API key" placeholder="API key" aria-describedby={alertId} aria-invalid={put?.err ? true : undefined} />
          <SubmitButton whilePending="Saving…">Save</SubmitButton>
          {/* The dojo's, not the example's: each of these arranges its outcome as it is pressed, before the form submits. */}
          <SubmitButton onClick={() => { armOutcome('fail', userid, RefusalLabelpath) }}>Save, refused</SubmitButton>
          <SubmitButton onClick={() => { armOutcome('stale', userid, RefusalLabelpath) }}>Save, stale</SubmitButton>
          <div role="alert" id={alertId} className="gripe">{put?.err && wordsOf(put.err)}</div>
          <p role="status">{put?.box && 'Saved the key.'}</p>
        </form>
      </Example>
    </PracticeCard>
  )
}
