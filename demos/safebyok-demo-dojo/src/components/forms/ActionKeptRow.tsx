import { useActionState } from 'react'
import type { PutBoxActionResult } from 'safebyok-react-lean'
import { Dojo } from '../../lib/dojo'
import { formTextOf } from '../../lib/form-text'
import { MirrorCell, OutcomeButtons, ResultCell, type RowProps, VariablesCell } from './RowParts'

/** The labelpath of the box this row saves. */
const Labelpath = 'form_action_kept'

/** The library's form action, made once, at module scope, as its doc block says. */
const savePut = Dojo.putBoxAction(Labelpath, {
  whisperOf:        (form) => ({ password: formTextOf(form, 'password') }),
  sidecarOf:        (_whisper, form) => ({ username: formTextOf(form, 'username') }),
  secretFieldnames: ['password'],
})

/** A form Action through `putBoxAction` that cancels React's reset of the form when the save was refused, so every field keeps what was typed. */
export function ActionKeptRow({ title, userid, secretType }: RowProps) {
  const [put, putAction, isPutting] = useActionState(async (prior: (PutBoxActionResult & { at: number }) | null, form: FormData) => {
    const saved = await savePut(prior, form)
    return { ...saved, at: Date.now() }
  }, null)
  return (
    <form className="formrow" aria-label={title} action={putAction} onReset={(event) => { if (put?.err) { event.preventDefault() } }}>
      <input name="username" aria-label="Username" placeholder="Username" autoComplete="off" />
      <input name="password" aria-label="Password" placeholder="Password" autoComplete="off" type={secretType} data-secret="" />
      <OutcomeButtons userid={userid} labelpath={Labelpath} isPending={isPutting} />
      <MirrorCell />
      <VariablesCell />
      <ResultCell isPending={isPutting} outcome={put && { at: put.at, err: put.err }} />
    </form>
  )
}
