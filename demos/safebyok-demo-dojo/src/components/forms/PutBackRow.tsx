import { type SubmitEvent, useRef, useState } from 'react'
import { Dojo } from '../../lib/dojo'
import { type RowOutcome, outcomeNow } from '../../lib/form-outcomes'
import { formTextOf } from '../../lib/form-text'
import { MirrorCell, OutcomeButtons, ResultCell, type RowProps, VariablesCell } from './RowParts'

/** The labelpath of the box this row saves. */
const Labelpath = 'form_put_back'

// The password is read into a local and its input emptied before the form is read, so the FormData never has it; the
// local and the save's arguments hold it until the save ends, and nothing else does.
/** A form that submits from `onSubmit` and empties the password's input while the save runs: a refusal puts the password back as typed, and a stored box empties the form. */
export function PutBackRow({ title, userid, secretType }: RowProps) {
  const secretRef = useRef<HTMLInputElement>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [outcome, setOutcome] = useState<RowOutcome | null>(null)

  /** Take the password out of its input, save the box, and put the password back if the save is refused. */
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const secretInput = secretRef.current
    const password = secretInput?.value ?? ''
    if (secretInput) { secretInput.value = '' }
    const form = new FormData(formElement)
    setIsSaving(true)
    try {
      await Dojo.putBoxOnce(Labelpath, { sidecar: { username: formTextOf(form, 'username') } }, { whisper: { password } })
      formElement.reset()
      setOutcome(outcomeNow())
    } catch (err) {
      if (secretInput) { secretInput.value = password }
      setOutcome(outcomeNow(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="formrow" aria-label={title} onSubmit={(event) => { void save(event) }}>
      <input name="username" aria-label="Username" placeholder="Username" autoComplete="off" />
      <input ref={secretRef} name="password" aria-label="Password" placeholder="Password" autoComplete="off" type={secretType} data-secret="" />
      <OutcomeButtons userid={userid} labelpath={Labelpath} isPending={isSaving} />
      <MirrorCell />
      <VariablesCell />
      <ResultCell isPending={isSaving} outcome={outcome} />
    </form>
  )
}
