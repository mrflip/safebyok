import { useActionState, useState } from 'react'
import { isVaultError, sanitizeForeignError } from 'safebyok'
import { SubmitButton, WhisperMask } from 'safebyok-react-lean/parts'
import type { EnvFields } from '../lib/env-form'
import { DayMs, dayValueOf, envSidecarOf, isOverdueAt, valMaskOf } from '../lib/env-sidecar'
import { Envman } from '../lib/sok'
import { EnvSettingsDialog } from './EnvSettingsDialog'

/** One env's row: nothing for a deleted box, and its editor once the box arrives. */
export function EnvRow({ labelpath }: Readonly<{ labelpath: string }>) {
  const { data: box } = Envman.useBox(labelpath)
  if (box === null) { return null }
  if (box === undefined) { return <li className="quiet">Loading…</li> }
  return <EnvEditor labelpath={labelpath} />
}

/** An env's editor: its title and details, red when overdue for rotation, its value with Save and Undo, and the gear that opens its settings. */
function EnvEditor({ labelpath }: Readonly<{ labelpath: string }>) {
  const draft = Envman.useDraft(labelpath)
  const [isSetting, setIsSetting] = useState(false)
  // When the row was first shown: a row left open for days does not turn red until the page is reloaded.
  const [shownAt] = useState(Date.now)
  // The library leaves an open draft alone on a lock: this demo empties it, so a value typed in stays nowhere once locked.
  Envman.useStageChange((stage) => {
    if (stage !== 'locked') { return }
    draft.discard()
  })
  const env = envSidecarOf(draft.sidecar)
  const isOverdue = isOverdueAt(env, shownAt)
  const title = env.title || labelpath

  // React empties the form once its action ends, and the draft forgets the value typed: a refused value is typed again,
  // while settings from the gear's dialog stay for the next Save.
  // A new value is a rotation: Save stamps it, and stores the new value's mask.
  /** Write the draft, resolving why it was refused, or null. */
  async function putDraftAction(): Promise<Error | null> {
    try {
      await draft.put({
        sidecarOf: (whisper, sidecar) => (draft.isWhisperDirty ? { ...sidecar, last_rotated_at: Date.now(), mask: valMaskOf(String(whisper['val'])) } : sidecar),
      })
      return null
    } catch (err) {
      return sanitizeForeignError(err)
    }
  }
  const [putErr, putAction] = useActionState(putDraftAction, null)

  function applySettings(fields: EnvFields): void {
    draft.setSidecar({ ...draft.sidecar, ...fields })
    setIsSetting(false)
  }

  return (
    <li aria-label={title} className={isOverdue ? 'card env overdue' : 'card env'}>
      <p className="row">
        <strong>{title}</strong>
        {isOverdue && <span className="gripe">Overdue for rotation</span>}
        <button type="button" aria-label={`Settings of ${title}`} onClick={() => { setIsSetting(true) }}>⚙</button>
      </p>
      {(env.description !== '') && <p className="quiet">{env.description}</p>}
      <p className="quiet">Rotate every {Math.round(env.rotation_period_ms / DayMs)} days. Last rotated {dayValueOf(env.last_rotated_at)}.</p>
      <form action={putAction} className="row">
        <WhisperMask labelpath={labelpath} field="val" tail={4} />
        <input {...draft.whisperField('val')} aria-label={`Value of ${title}`} />
        <SubmitButton disabled={! draft.isDirty}>Save</SubmitButton>
        <button type="button" disabled={! draft.isDirty} onClick={draft.discard}>Undo</button>
      </form>
      {draft.isBehind && <p role="status" className="gripe">Changed elsewhere since you started: Undo to see it.</p>}
      {(putErr !== null) && ! isVaultError(putErr, 'dismissed') && <p role="alert" className="gripe">{putErr.message}</p>}
      {(draft.lastErr !== null) && ! isVaultError(draft.lastErr, 'dismissed') && <p role="alert" className="gripe">{draft.lastErr.message}</p>}
      {isSetting && <EnvSettingsDialog title={title} env={env} onApply={applySettings} onCancel={() => { setIsSetting(false) }} />}
    </li>
  )
}
