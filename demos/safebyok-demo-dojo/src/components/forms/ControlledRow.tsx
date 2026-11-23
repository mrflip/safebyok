import { type SubmitEvent, useState } from 'react'
import { Dojo } from '../../lib/dojo'
import { type RowOutcome, outcomeNow } from '../../lib/form-outcomes'
import { MirrorCell, OutcomeButtons, ResultCell, type RowProps, VariablesCell } from './RowParts'

/** The labelpath of the box this row saves. */
const Labelpath = 'form_controlled'

/** A form of controlled inputs, each field's text in `useState`, the password's too: it submits from `onSubmit`, and empties both once the box is stored. */
export function ControlledRow({ title, userid, secretType }: RowProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [outcome, setOutcome] = useState<RowOutcome | null>(null)

  /** Save the box from what the state holds, and empty both fields once it is stored. */
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    try {
      await Dojo.putBoxOnce(Labelpath, { sidecar: { username } }, { whisper: { password } })
      setUsername('')
      setPassword('')
      setOutcome(outcomeNow())
    } catch (err) {
      setOutcome(outcomeNow(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="formrow" aria-label={title} onSubmit={(event) => { void save(event) }}>
      <input name="username" aria-label="Username" placeholder="Username" autoComplete="off" value={username} onChange={(event) => { setUsername(event.target.value) }} />
      <input name="password" aria-label="Password" placeholder="Password" autoComplete="off" type={secretType} data-secret="" value={password} onChange={(event) => { setPassword(event.target.value) }} />
      <OutcomeButtons userid={userid} labelpath={Labelpath} isPending={isSaving} />
      <MirrorCell />
      <VariablesCell />
      <ResultCell isPending={isSaving} outcome={outcome} />
    </form>
  )
}
