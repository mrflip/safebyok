import { useActionState } from 'react'
import type { PutBoxActionResult } from 'safebyok-react-lean'
import { SubmitButton, WhisperInput } from 'safebyok-react-lean/parts'
import { mask } from 'safebyok/utils'
import { Dojo } from '../../lib/dojo'
import { formTextOf } from '../../lib/form-text'
import { messageOf } from '../../lib/messages'
import { Example, PracticeCard } from './PracticeCard'

/** The labelpath of the box the right way saves. */
export const PasteLabelpath = 'practice_paste'

// The key is trimmed where the whisper is made: a key pasted with a newline or spaces around it is stored without them.
/** The form action that saves the box at {@link PasteLabelpath}. */
const savePut = Dojo.putBoxAction(PasteLabelpath, {
  whisperOf:        (form) => ({ apiKey: formTextOf(form, 'apiKey').trim() }),
  sidecarOf:        (whisper) => ({ mask: mask(String(whisper['apiKey'])) }),
  secretFieldnames: ['apiKey'],
})

/** Let a key be pasted, and trim it where the whisper is made: the right way beside a field that blocks paste. */
export function PasteCard() {
  const [put, putAction] = useActionState(savePut, null)
  return (
    <PracticeCard
      title="Let a key be pasted, and trim it where the whisper is made"
      why={<>
        <p>A key is copied from a provider&apos;s page, often with a newline or spaces around it. Trim it as the form makes the whisper; blocking paste only makes the user type forty characters by hand, or keep the key somewhere easier to copy from.</p>
        <p>Never trim a passphrase: the library takes one as typed, so trimming it would quietly make it another passphrase.</p>
      </>}
    >
      <Example caption="paste allowed, the whisper trimmed">
        <form aria-label="Trimmed where the whisper is made" action={putAction} onReset={(event) => { if (put?.err) { event.preventDefault() } }}>
          <WhisperInput name="apiKey" aria-label="API key" placeholder="API key" />
          <SubmitButton whilePending="Saving…">Save</SubmitButton>
          <p role="status">{put?.err ? messageOf(put.err) : (put?.box && `Stored the key ${maskOf(put.box)}.`)}</p>
        </form>
      </Example>
      <Example isWrongWay caption="paste blocked">
        <input name="apiKey" aria-label="Paste-blocked API key" placeholder="API key" type="password" onPaste={(event) => { event.preventDefault() }} />
      </Example>
    </PracticeCard>
  )
}

/** The mask a stored box's sidecar shows for its key. */
function maskOf(box: NonNullable<PutBoxActionResult['box']>): string {
  const shown = box.sidecar['mask']
  return (typeof shown === 'string') ? shown : ''
}
