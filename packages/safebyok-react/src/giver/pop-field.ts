/** `popField`, a form action's way to read a secret field and leave none of it in the `FormData`. */

import { Checkers } from 'safebyok'

// == [Pop]: popField

// React shows the form's FormData to the components inside it, through `useFormStatus().data`, while the action is
// pending, and keeps it after the action ends: as the form's pending status, and in the action's queued update.
/** Read the text of `form`'s field `fieldname` and delete the field from `form`. Returns '' when the field is missing or is a file.
 * Call it before the action's first `await`, so that no render sees the secret in the `FormData`.
 * @example
 *   async function addPasskeyAction(form: FormData) {
 *     const passphrase = popField(form, 'passphrase')
 *     const nextPasskeyAnswer = await createPasskey(passkeyOpts)
 *     if (nextPasskeyAnswer !== null) { await addPasskey.attempt({ passphrase, nextPasskeyAnswer }) }
 *   }
 */
export function popField(form: FormData, fieldname: string): string {
  Checks.popFieldArgs.parse({ form, fieldname }, { where: "In popField's arguments" })
  const val = form.get(fieldname)
  form.delete(fieldname)
  return (typeof val === 'string') ? val : ''
}

/** The checks of what a host hands `popField`. */
const Checks = Checkers('bad_record', ({ obj, str, custom }) => ({
  popFieldArgs: obj({
    form:      custom<FormData>((val) => val instanceof FormData, 'Expected the FormData a form action is handed'),
    fieldname: str.min(1),
  }),
}))
// --
