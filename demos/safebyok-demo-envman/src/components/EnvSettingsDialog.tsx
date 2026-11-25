import { type SyntheticEvent, useId, useState } from 'react'
import { ModalDialog } from 'safebyok-react/kit'
import { type EnvFields, envFieldsOf } from '../lib/env-form'
import { DayMs, type EnvSidecar, dayValueOf } from '../lib/env-sidecar'

/** The gear's dialog: an env's title, description, rotation period and last-rotated day. Done hands them to `onApply`, for the row's Save to write. */
export function EnvSettingsDialog({ title, env, onApply, onCancel }: Readonly<{
  title:    string
  env:      EnvSidecar
  onApply:  (fields: EnvFields) => void
  onCancel: () => void
}>) {
  const titleId = useId()
  const [gripe, setGripe] = useState<string | null>(null)
  /** Hand the fields typed to `onApply`, or say why they will not do. */
  // An onSubmit, not a form action: React resets a form's fields after an action, and a refused entry should stay for the user to mend.
  const onSubmit = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>): void => {
    event.preventDefault()
    try {
      onApply(envFieldsOf(new FormData(event.currentTarget), env.last_rotated_at))
    } catch (err) {
      setGripe((err as Error).message)
    }
  }
  return (
    <ModalDialog labelledBy={titleId} onCancel={onCancel}>
      <h3 id={titleId}>Settings of {title}</h3>
      <form onSubmit={onSubmit}>
        <label>Title <input name="title" defaultValue={env.title} required /></label>
        <label>Description <input name="description" defaultValue={env.description} /></label>
        <label>Rotate every <input name="rotation_days" type="number" min={1} step={1} defaultValue={Math.round(env.rotation_period_ms / DayMs)} aria-label="Rotation period in days" /> days</label>
        <label>Last rotated <input name="last_rotated_day" type="date" defaultValue={dayValueOf(env.last_rotated_at)} aria-label="Last rotated" /></label>
        <p className="row">
          <button type="submit">Done</button>
          <button type="button" onClick={onCancel}>Cancel</button>
        </p>
        {(gripe !== null) && <span role="alert" className="gripe">{gripe}</span>}
      </form>
    </ModalDialog>
  )
}
