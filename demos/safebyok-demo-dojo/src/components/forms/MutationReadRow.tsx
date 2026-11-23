import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Dojo } from '../../lib/dojo'
import { type RowOutcome, outcomeNow } from '../../lib/form-outcomes'
import { formTextOf } from '../../lib/form-text'
import { MirrorCell, OutcomeButtons, ResultCell, type RowProps, VariablesCell } from './RowParts'

/** The labelpath of the box this row saves. */
const Labelpath = 'form_mutation_read'

/** A TanStack mutation handed nothing, whose `mutationFn` reads the form itself: it submits from `onSubmit`, and empties the form once the box is stored. */
export function MutationReadRow({ title, userid, secretType }: RowProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const put = useMutation({
    mutationFn: async () => {
      const form = new FormData(formRef.current ?? undefined)
      return await Dojo.putBoxOnce(Labelpath, { sidecar: { username: formTextOf(form, 'username') } }, { whisper: { password: formTextOf(form, 'password') } })
    },
  })
  const [outcome, setOutcome] = useState<RowOutcome | null>(null)
  return (
    <form ref={formRef} className="formrow" aria-label={title} onSubmit={(event) => {
      event.preventDefault()
      put.mutate(undefined, {
        onSuccess: () => { formRef.current?.reset(); setOutcome(outcomeNow()) },
        onError:   (err) => { setOutcome(outcomeNow(err)) },
      })
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
