import { useActionState } from 'react'
import { mask } from 'safebyok'
import type { PutBoxActionResult } from 'safebyok-react-lean'
import { WhisperInput, WhisperMask } from 'safebyok-react-lean/parts'
import { Dojo } from '../../lib/dojo'
import { formTextOf } from '../../lib/form-text'
import { MirrorCell, ResultCell } from '../forms/RowParts'

/** The labelpath of the box the form writes: none is stored there in the fixture. */
export const ApiKeyLabelpath = 'scenario_apikey'

// The sidecar keeps a mask showing none of the key's tail, for WhisperMask to show on a locked bank.
/** The form's action, writing the title and the key. */
const savePut = Dojo.putBoxAction(ApiKeyLabelpath, {
  whisperOf:        (form) => ({ apiKey: formTextOf(form, 'apiKey') }),
  sidecarOf:        (whisper, form) => ({ title: formTextOf(form, 'title'), mask: mask(String(whisper['apiKey']), { tail: 0 }) }),
  secretFieldnames: ['apiKey'],
})

/** The title kept in `sidecar`, or nothing where it holds no string. */
function titleOf(sidecar: Readonly<Record<string, unknown>>): string {
  const { title } = sidecar
  return (typeof title === 'string') ? title : ''
}

/** A form for a new API key, with the box stored shown beneath it, its key masked.
 * A refused save keeps what was typed.
 */
export function ApiKeyForm() {
  const [put, putAction, isPutting] = useActionState(async (prior: (PutBoxActionResult & { at: number }) | null, form: FormData) => {
    const saved = await savePut(prior, form)
    return { ...saved, at: Date.now() }
  }, null)
  const stored = Dojo.useBox(ApiKeyLabelpath).data
  return (
    <>
      <form className="row apikey" aria-label="API key" action={putAction} onReset={(event) => { if (put?.err) { event.preventDefault() } }}>
        <input name="title" aria-label="Title" placeholder="Title" autoComplete="off" />
        <WhisperInput name="apiKey" aria-label="API key" placeholder="API key" data-secret="" />
        <button type="submit" disabled={isPutting}>Save</button>
        <MirrorCell />
        <ResultCell isPending={isPutting} outcome={put && { at: put.at, err: put.err }} />
      </form>
      <p aria-label="Stored key">
        Stored: {(stored === undefined) && '…'}{(stored === null) && 'nothing yet'}
        {(stored !== undefined) && (stored !== null) && <><b>{titleOf(stored.sidecar)}</b> <WhisperMask labelpath={ApiKeyLabelpath} field="apiKey" tail={4} /></>}
      </p>
    </>
  )
}
