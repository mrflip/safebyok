import { useActionState } from 'react'
import type { Whisper } from 'safebyok'
import type { PutBoxActionOpts } from 'safebyok-react-lean'
import { SubmitButton, WhisperInput } from 'safebyok-react-lean/parts'
import { type EnvTexts, NewEnvTexts, envFieldsOf, envTextsOfForm } from '../lib/env-form'
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
}

/** What the add form's action resolves: why the env was refused, or null, and the fields the form shows next. */
type AddEnvResult = Readonly<{ err: Error | null, texts: EnvTexts }>

// React resets the form's inputs on the page once its action ends: a refused form shows again what was typed, all but
// the value, which the user types again. `putBoxAction` deletes every field from the `FormData` it is handed, so the
// fields to show again are read from it first.
// Each new env is a box of its own, under a label minted at submit, so the put action is made per submit, not once.
/** Write the add form's fields as a new env, never rejecting. */
async function addEnvAction(_prior: AddEnvResult, form: FormData): Promise<AddEnvResult> {
  const texts = envTextsOfForm(form)
  const { err } = await Envman.putBoxAction(newEnvLabel(), AddEnvOpts)(null, form)
  return { err, texts: (err === null) ? NewEnvTexts : texts }
}

/** The form that adds an env: its title, description, rotation period, the day it was last rotated, and its value. */
export function AddEnvForm() {
  const [added, addAction] = useActionState(addEnvAction, { err: null, texts: NewEnvTexts })
  const { texts } = added
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
        {(added.err !== null) && <span role="alert" className="gripe">{added.err.message}</span>}
      </form>
    </section>
  )
}
