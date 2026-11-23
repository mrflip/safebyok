import { useMutation } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Dojo } from '../../lib/dojo'
import { type RowOutcome, outcomeNow } from '../../lib/form-outcomes'
import { formTextOf } from '../../lib/form-text'
import { MirrorCell, OutcomeButtons, ResultCell, type RowProps, VariablesCell } from './RowParts'

/** The labelpath of the box this row saves. */
const Labelpath = 'form_mutation'

/** A TanStack mutation made from `putBoxMutationOptions` and handed the form as its variables, the way its docs show: the library deletes the password from that form before it writes.
 * The action hands the mutation the form and returns at once, so React resets the form as the save starts.
 */
export function MutationFormRow({ title, userid, secretType }: RowProps) {
  const put = useMutation(useMemo(() => Dojo.putBoxMutationOptions(Labelpath, {
    whisperOf:        (form) => ({ password: formTextOf(form, 'password') }),
    sidecarOf:        (_whisper, form) => ({ username: formTextOf(form, 'username') }),
    secretFieldnames: ['password'],
  }), []))
  const [outcome, setOutcome] = useState<RowOutcome | null>(null)
  return (
    <form className="formrow" aria-label={title} action={(form) => {
      put.mutate(form, { onSuccess: () => { setOutcome(outcomeNow()) }, onError: (err) => { setOutcome(outcomeNow(err)) } })
    }}>
      <input name="username" aria-label="Username" placeholder="Username" autoComplete="off" />
      <input name="password" aria-label="Password" placeholder="Password" autoComplete="off" type={secretType} data-secret="" />
      <OutcomeButtons userid={userid} labelpath={Labelpath} isPending={put.isPending} />
      <MirrorCell />
      <VariablesCell />
      <ResultCell isPending={put.isPending} outcome={outcome} />
    </form>
  )
}
