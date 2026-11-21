/** `SubmitButton`, a form's submit, disabled while the form's action runs. */

import type { ComponentPropsWithRef, ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

// == [The button]: SubmitButtonProps, SubmitButton

/** The props of a {@link SubmitButton}: what it says while the action runs, and any `<button>` attribute but its type. */
export type SubmitButtonProps = Omit<ComponentPropsWithRef<'button'>, 'type'> & {
  /** What the button shows while the form's action runs, in place of its children. */
  whilePending?: ReactNode
}

/** The submit button of the form it is in, disabled while that form's action runs, and while `disabled`.
 * An action that awaits its work keeps the button disabled until the work settles, so a double press submits once.
 * @example
 *   <SubmitButton whilePending="Unlocking…">Unlock</SubmitButton>
 *   <SubmitButton disabled={! strength.verdict?.strong}>Create vault</SubmitButton>
 */
export function SubmitButton({ whilePending, disabled = false, children, ...passed }: SubmitButtonProps) {
  const { pending } = useFormStatus()
  return <button {...passed} type="submit" disabled={pending || disabled}>{(pending && (whilePending !== undefined)) ? whilePending : children}</button>
}
// --
