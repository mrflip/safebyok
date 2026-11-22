/** `formActionOf`, the form action every kit form submits through. Private to the kit. */

import type { FormMutationResult } from '../giver/react-giver'
import { popField } from '../giver/pop-field'

// == [The action]: formActionOf

// React hands one FormData to the action and to `useFormStatus().data` in every component inside the form, and
// keeps it after the action ends: as the form's pending status, and in the action's queued update. A field
// removed before the action's first await is in neither.
/** A form action that pops the text of `fieldnames` from the form's `FormData`, then runs `mutation` with the gating of `cleartextsOf(texts)`.
 * Every field in `fieldnames` is deleted before anything is awaited: list each one that holds a secret, used or not.
 * It resolves once the mutation settles, so a `SubmitButton` stays disabled until then: true if it succeeded, false if it
 * refused, its refusal showing as the mutation's `error`. What `cleartextsOf` throws, and a gating made at the wrong stage, reject it.
 * Where `cleartextsOf` resolves null, as for a passkey prompt the user dismissed, nothing runs and it resolves true.
 * @example
 *   const unlock = Knock.useUnlock()
 *   const unlockAction = formActionOf(unlock, ['passphrase'], ({ passphrase }) => ({ passphraseCleartext: passphrase }))
 *   <form action={async (form) => { if (! await unlockAction(form)) { fieldRef.current?.focus() } }}>
 */
export function formActionOf<CleartextsT, FieldnameT extends string>(
  mutation:     FormMutationResult<CleartextsT>,
  fieldnames:   readonly FieldnameT[],
  cleartextsOf: (texts: Readonly<Record<FieldnameT, string>>) => CleartextsT | null | Promise<CleartextsT | null>,
): (form: FormData) => Promise<boolean> {
  return async (form) => {
    const texts = Object.fromEntries(fieldnames.map((fieldname) => [fieldname, popField(form, fieldname)])) as Record<FieldnameT, string>
    const cleartexts = await cleartextsOf(texts)
    if (cleartexts === null) { return true }
    const gating = mutation.gating(cleartexts)
    try {
      await mutation.mutateAsync(gating)
      return true
    } catch {
      return false
    }
  }
}
// --
