/** `SubmitButton`, a form's submit, disabled while the form's action runs or the host says it is pending. */

import type { ComponentPropsWithRef, ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

// == [The button]: SubmitButtonProps, SubmitButton

/** The props of a {@link SubmitButton}: what it says while the form is pending, and any `<button>` attribute but its type. */
export type SubmitButtonProps = Omit<ComponentPropsWithRef<'button'>, 'type'> & {
  /** What the button shows while the form is pending, in place of its children. */
  whilePending?: ReactNode
  /** True while a form that submits from an `onSubmit` handler, not a form action, is submitting: it disables the button and shows `whilePending`, as a form action's submit does. */
  isPending?:    boolean | undefined
}

/** The submit button of the form it is in, disabled while that form's action runs, and while `disabled`.
 * An action that awaits its work keeps the button disabled until the work settles, so a double press submits once.
 * A form that is submitted by a mutation or a handler, not a form action, says when it is pending with `isPending`.
 * @example
 *   <SubmitButton whilePending="Unlocking…">Unlock</SubmitButton>
 *   <SubmitButton disabled={! strength.verdict?.strong}>Create vault</SubmitButton>
 *   <SubmitButton isPending={put.isPending} whilePending="Saving…">Save</SubmitButton>
 */
export function SubmitButton({ whilePending, isPending = false, disabled = false, children, ...passed }: SubmitButtonProps) {
  const { pending: isFormPending } = useFormStatus()
  const pending = isFormPending || isPending
  return <button {...passed} type="submit" disabled={pending || disabled}>{(pending && (whilePending !== undefined)) ? whilePending : children}</button>
}
// --
