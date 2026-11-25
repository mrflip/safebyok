import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { isVaultError } from 'safebyok'
import { WhisperMask } from 'safebyok-react/parts'
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
  // A new value is a rotation: Save stamps it, and stores the new value's mask.
  const save = useMutation({
    mutationFn: () => draft.put({
      sidecarOf: (whisper, sidecar) => (draft.isWhisperDirty ? { ...sidecar, last_rotated_at: Date.now(), mask: valMaskOf(String(whisper['val'])) } : sidecar),
    }),
  })
  // The library leaves an open draft alone on a lock: this demo empties it, so a value typed in stays nowhere once locked.
  Envman.useStageChange((stage) => {
    if (stage !== 'locked') { return }
    save.reset()
    draft.discard()
  })
  const env = envSidecarOf(draft.sidecar)
  const isOverdue = isOverdueAt(env, shownAt)
  const title = env.title || labelpath

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
      <p className="row">
        <WhisperMask labelpath={labelpath} field="val" tail={4} />
        <input {...draft.whisperField('val')} aria-label={`Value of ${title}`} />
        <button type="button" disabled={(! draft.isDirty) || save.isPending} onClick={() => { save.mutate() }}>Save</button>
        <button type="button" disabled={! draft.isDirty} onClick={() => { save.reset(); draft.discard() }}>Undo</button>
      </p>
      {draft.isBehind && <p role="status" className="gripe">Changed elsewhere since you started: Undo to see it.</p>}
      {(save.error !== null) && ! isVaultError(save.error, 'dismissed') && <p role="alert" className="gripe">{save.error.message}</p>}
      {(draft.lastErr !== null) && ! isVaultError(draft.lastErr, 'dismissed') && <p role="alert" className="gripe">{draft.lastErr.message}</p>}
      {isSetting && <EnvSettingsDialog title={title} env={env} onApply={applySettings} onCancel={() => { setIsSetting(false) }} />}
    </li>
  )
}
