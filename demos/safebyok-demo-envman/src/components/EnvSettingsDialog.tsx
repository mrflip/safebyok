import { useActionState, useId } from 'react'
import { sanitizeForeignError } from 'safebyok'
import { ModalDialog } from 'safebyok-react-lean/kit'
import { SubmitButton } from 'safebyok-react-lean/parts'
import { type EnvFields, type EnvTexts, envFieldsOf, envTextsOfEnv, envTextsOfForm } from '../lib/env-form'
import type { EnvSidecar } from '../lib/env-sidecar'

/** The gear's dialog: an env's title, description, rotation period and last-rotated day. Done hands them to `onApply`, for the row's Save to write. */
export function EnvSettingsDialog({ title, env, onApply, onCancel }: Readonly<{
  title:    string
  env:      EnvSidecar
  onApply:  (fields: EnvFields) => void
  onCancel: () => void
}>) {
  /** The settings form's next state: why the fields will not do, or null, and the texts to show again. */
  type ApplyResult = Readonly<{ err: Error | null, texts: EnvTexts }>
  const titleId = useId()
  // React empties the form after its action: a refused form shows again what was typed, for the user to mend.
  /** Hand the fields typed to `onApply`, or say why they will not do. */
  const applyAction = (_prior: ApplyResult, form: FormData): ApplyResult => {
    try {
      onApply(envFieldsOf(form, env.last_rotated_at))
      return { err: null, texts: envTextsOfForm(form) }
    } catch (err) {
      return { err: sanitizeForeignError(err), texts: envTextsOfForm(form) }
    }
  }
  const [applied, formAction] = useActionState(applyAction, { err: null, texts: envTextsOfEnv(env) })
  const { texts } = applied
  return (
    <ModalDialog labelledBy={titleId} onCancel={onCancel}>
      <h3 id={titleId}>Settings of {title}</h3>
      <form action={formAction}>
        <label>Title <input name="title" defaultValue={texts.title} required /></label>
        <label>Description <input name="description" defaultValue={texts.description} /></label>
        <label>Rotate every <input name="rotation_days" type="number" min={1} step={1} defaultValue={texts.rotation_days} aria-label="Rotation period in days" /> days</label>
        <label>Last rotated <input name="last_rotated_day" type="date" defaultValue={texts.last_rotated_day} aria-label="Last rotated" /></label>
        <p className="row">
          <SubmitButton>Done</SubmitButton>
          <button type="button" onClick={onCancel}>Cancel</button>
        </p>
        {(applied.err !== null) && <span role="alert" className="gripe">{applied.err.message}</span>}
      </form>
    </ModalDialog>
  )
}
