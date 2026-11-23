import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Dojo } from '../../lib/dojo'
import { type RowOutcome, outcomeNow } from '../../lib/form-outcomes'
import { MirrorCell, OutcomeButtons, ResultCell, type RowProps, VariablesCell } from './RowParts'

/** The labelpath of the box this row saves. */
const Labelpath = 'form_hook_form'

/** A form built with react-hook-form, the way its docs show: `register` on each input, `handleSubmit` around an async save, `isSubmitting` for pending, and `reset` once the box is stored. */
export function HookFormRow({ title, userid, secretType }: RowProps) {
  /** The fields react-hook-form keeps for this row. */
  type HookFields = { username: string, password: string }
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<HookFields>({ defaultValues: { username: '', password: '' } })
  const [outcome, setOutcome] = useState<RowOutcome | null>(null)

  /** Save the box from the fields react-hook-form hands over, and reset the form once it is stored. */
  const save = async ({ username, password }: HookFields): Promise<void> => {
    try {
      await Dojo.putBoxOnce(Labelpath, { sidecar: { username } }, { whisper: { password } })
      reset()
      setOutcome(outcomeNow())
    } catch (err) {
      setOutcome(outcomeNow(err))
    }
  }

  return (
    <form className="formrow" aria-label={title} onSubmit={(event) => { void handleSubmit(save)(event) }}>
      <input {...register('username')} aria-label="Username" placeholder="Username" autoComplete="off" />
      <input {...register('password')} aria-label="Password" placeholder="Password" autoComplete="off" type={secretType} data-secret="" />
      <OutcomeButtons userid={userid} labelpath={Labelpath} isPending={isSubmitting} />
      <MirrorCell />
      <VariablesCell />
      <ResultCell isPending={isSubmitting} outcome={outcome} />
    </form>
  )
}
