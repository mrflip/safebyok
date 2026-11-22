/** `takeField`, a form action's way to read a secret field and leave none of it in the `FormData`. */

import { Checkers } from 'safebyok'

// == [Take]: takeField

/** Take the text of `form`'s field `fieldname` out of `form`: its text, or '' for none or a file.
 * Call it before anything is awaited: React keeps the `FormData` after the action ends, as the form's pending status and in its queued update, and the secret must not be in it.
 * @example
 *   <form action={(form) => { unlock.mutate(unlock.gating({ passphraseCleartext: takeField(form, 'passphrase') })) }}>
 */
export function takeField(form: FormData, fieldname: string): string {
  Checks.takeFieldArgs.parse({ form, fieldname }, { where: "In takeField's arguments" })
  const val = form.get(fieldname)
  form.delete(fieldname)
  return (typeof val === 'string') ? val : ''
}

/** The checks of what a host hands `takeField`. */
const Checks = Checkers('bad_record', ({ obj, str, custom }) => ({
  takeFieldArgs: obj({
    form:      custom<FormData>((val) => val instanceof FormData, 'Expected the FormData a form action is handed'),
    fieldname: str.min(1),
  }),
}))
// --
