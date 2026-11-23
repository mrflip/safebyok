import { useActionState } from 'react'
import type { PutBoxActionResult } from 'safebyok-react-lean'
import { Dojo } from '../../lib/dojo'
import { formTextOf } from '../../lib/form-text'
import { MirrorCell, OutcomeButtons, ResultCell, type RowProps, VariablesCell } from './RowParts'

/** The labelpath of the box this row saves. */
const Labelpath = 'form_action'

/** The library's form action, made once, at module scope, as its doc block says. */
const savePut = Dojo.putBoxAction(Labelpath, {
  whisperOf:        (form) => ({ password: formTextOf(form, 'password') }),
  sidecarOf:        (_whisper, form) => ({ username: formTextOf(form, 'username') }),
  secretFieldnames: ['password'],
})

/** A form Action through `putBoxAction`, the way its docs show: React resets every field once the action ends, and the username comes back from the result's `texts`. */
export function ActionRow({ title, userid, secretType }: RowProps) {
  const [put, putAction, isPutting] = useActionState(async (prior: (PutBoxActionResult & { at: number }) | null, form: FormData) => {
    return { ...await savePut(prior, form), at: Date.now() }
  }, null)
  return (
    <form className="formrow" aria-label={title} action={putAction}>
      <input name="username" aria-label="Username" placeholder="Username" autoComplete="off" defaultValue={put?.texts['username']} />
      <input name="password" aria-label="Password" placeholder="Password" autoComplete="off" type={secretType} data-secret="" />
      <OutcomeButtons userid={userid} labelpath={Labelpath} isPending={isPutting} />
      <MirrorCell />
      <VariablesCell />
      <ResultCell isPending={isPutting} outcome={put && { at: put.at, err: put.err }} />
    </form>
  )
}
