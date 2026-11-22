import { useActionState } from 'react'
import type { Whisper } from 'safebyok'
import type { PutBoxActionOpts, PutBoxActionResult } from 'safebyok-react-lean'
import { SubmitButton, WhisperInput } from 'safebyok-react-lean/parts'
import { type EnvTexts, NewEnvTexts, envFieldsOf } from '../lib/env-form'
import { newEnvLabel, valMaskOf } from '../lib/env-sidecar'
import { formTextOf } from '../lib/form-text'
import { Envman } from '../lib/sok'

/** How the add form's fields become a box: the value its whisper, the rest and the value's mask its sidecar, last rotated now unless a day is given. */
const AddEnvOpts: PutBoxActionOpts = {
  whisperOf: (form): Whisper => {
    const val = formTextOf(form, 'val')
    if (val === '') { throw new Error('Type the value first.') }
    return { val }
  },
  sidecarOf: (whisper, form) => ({ ...envFieldsOf(form, Date.now()), mask: valMaskOf(String(whisper['val'])) }),
  // Only the value is deleted from the form: a refusal hands back what else was typed, for the form to show again.
  secretFieldnames: ['val'],
}

// Each new env is a box of its own, under a label minted at submit.
/** Write the add form's fields as a new env, never rejecting. */
function addEnvAction(prior: PutBoxActionResult | null, form: FormData): Promise<PutBoxActionResult> {
  return Envman.putBoxAction(newEnvLabel(), AddEnvOpts)(prior, form)
}

/** The form that adds an env: its title, description, rotation period, the day it was last rotated, and its value. */
export function AddEnvForm() {
  const [added, addAction] = useActionState(addEnvAction, null)
  // React resets the form's inputs once its action ends: a refused form shows again what was typed, all but the value.
  const texts: EnvTexts = { ...NewEnvTexts, ...added?.texts }
  return (
    <section aria-labelledby="add-title" className="card">
      <h2 id="add-title">Add a secret</h2>
      <form action={addAction}>
        <input name="title" defaultValue={texts.title} aria-label="Title" placeholder="Title, such as OPENAI_API_KEY" required />
        <input name="description" defaultValue={texts.description} aria-label="Description" placeholder="Description" />
        <label>Rotate every <input name="rotation_days" type="number" min={1} step={1} defaultValue={texts.rotation_days} aria-label="Rotation period in days" /> days</label>
        <label>Last rotated <input name="last_rotated_day" type="date" defaultValue={texts.last_rotated_day} aria-label="Last rotated" /> (blank for today)</label>
        <WhisperInput name="val" aria-label="Value" placeholder="Value" required />
        <SubmitButton whilePending="Adding…">Add</SubmitButton>
        {added?.err && <span role="alert" className="gripe">{added.err.message}</span>}
      </form>
    </section>
  )
}
