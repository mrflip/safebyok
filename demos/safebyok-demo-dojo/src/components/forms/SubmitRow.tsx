import { type SubmitEvent, useState } from 'react'
import { Dojo } from '../../lib/dojo'
import { type RowOutcome, outcomeNow } from '../../lib/form-outcomes'
import { formTextOf } from '../../lib/form-text'
import { MirrorCell, OutcomeButtons, ResultCell, type RowProps, VariablesCell } from './RowParts'

/** The labelpath of the box this row saves. */
const Labelpath = 'form_submit'

/** A form that submits from `onSubmit` with `preventDefault`, awaiting `putBoxOnce`, with its own pending state: React never resets it, so it resets itself once the box is stored. */
export function SubmitRow({ title, userid, secretType }: RowProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [outcome, setOutcome] = useState<RowOutcome | null>(null)

  /** Save the box from the form's fields, and empty the form once it is stored. */
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
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
      <input name="password" aria-label="Password" placeholder="Password" autoComplete="off" type={secretType} data-secret="" />
      <OutcomeButtons userid={userid} labelpath={Labelpath} isPending={isSaving} />
      <MirrorCell />
      <VariablesCell />
      <ResultCell isPending={isSaving} outcome={outcome} />
    </form>
  )
}
