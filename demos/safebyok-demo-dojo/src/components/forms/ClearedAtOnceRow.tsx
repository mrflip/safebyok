import { type SubmitEvent, useRef, useState } from 'react'
import { Dojo } from '../../lib/dojo'
import { type RowOutcome, outcomeNow } from '../../lib/form-outcomes'
import { formTextOf } from '../../lib/form-text'
import { MirrorCell, OutcomeButtons, ResultCell, type RowProps, VariablesCell } from './RowParts'

/** The labelpath of the box this row saves. */
const Labelpath = 'form_cleared_at_once'

// Not a form Action: React keeps the FormData it hands a form Action, password and all, as the form's status (what
// useFormStatus reads) until the action ends, unless the action deletes the field first. Here React never has the form's
// FormData, and the password leaves its input before the save begins; the save itself still holds it in its arguments.
/** A form that submits from `onSubmit`, reads its fields, and empties the password's input before the save begins: a refusal leaves the username as typed, and the password to type again. */
export function ClearedAtOnceRow({ title, userid, secretType }: RowProps) {
  const secretRef = useRef<HTMLInputElement>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [outcome, setOutcome] = useState<RowOutcome | null>(null)

  /** Read the form, empty the password's input, then save the box, and empty the form once it is stored. */
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    if (secretRef.current) { secretRef.current.value = '' }
    setIsSaving(true)
    try {
      await Dojo.putBoxOnce(Labelpath, { sidecar: { username: formTextOf(form, 'username') } }, { whisper: { password: formTextOf(form, 'password') } })
      formElement.reset()
      setOutcome(outcomeNow())
    } catch (err) {
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
