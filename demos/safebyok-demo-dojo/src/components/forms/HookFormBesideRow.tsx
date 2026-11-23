import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Dojo } from '../../lib/dojo'
import { type RowOutcome, outcomeNow } from '../../lib/form-outcomes'
import { MirrorCell, OutcomeButtons, ResultCell, type RowProps, VariablesCell } from './RowParts'

/** The labelpath of the box this row saves. */
const Labelpath = 'form_hook_form_beside'

/** A form built with react-hook-form for every field but the password, whose input is not registered: the save reads it from the input when the form submits, and empties it with the rest once the box is stored. */
export function HookFormBesideRow({ title, userid, secretType }: RowProps) {
  /** The fields react-hook-form keeps for this row: all but the password. */
  type HookFields = { username: string }
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<HookFields>({ defaultValues: { username: '' } })
  const secretRef = useRef<HTMLInputElement>(null)
  const [outcome, setOutcome] = useState<RowOutcome | null>(null)

  /** Save the box from the username react-hook-form hands over and the password in its input, and empty both once it is stored. */
  const save = async ({ username }: HookFields): Promise<void> => {
    const password = secretRef.current?.value ?? ''
    try {
      await Dojo.putBoxOnce(Labelpath, { sidecar: { username } }, { whisper: { password } })
      reset()
      if (secretRef.current) { secretRef.current.value = '' }
      setOutcome(outcomeNow())
    } catch (err) {
      setOutcome(outcomeNow(err))
    }
  }

  return (
    <form className="formrow" aria-label={title} onSubmit={(event) => { void handleSubmit(save)(event) }}>
      <input {...register('username')} aria-label="Username" placeholder="Username" autoComplete="off" />
      <input ref={secretRef} name="password" aria-label="Password" placeholder="Password" autoComplete="off" type={secretType} data-secret="" />
      <OutcomeButtons userid={userid} labelpath={Labelpath} isPending={isSubmitting} />
      <MirrorCell />
      <VariablesCell />
      <ResultCell isPending={isSubmitting} outcome={outcome} />
    </form>
  )
}
