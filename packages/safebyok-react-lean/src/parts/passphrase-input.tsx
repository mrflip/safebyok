/** `PassphraseInput`, the field a user types a passphrase into. */

import type { ComponentPropsWithRef } from 'react'
import { PartsPhrases } from './phrases-parts'
import { type PassphraseFieldOpts, usePassphraseField } from './use-passphrase-field'

// == [The input]: PassphraseInputProps, PassphraseInput

/** The props of a {@link PassphraseInput}: its `name` in the form, whether it takes the current passphrase or a new one, and any `<input>` attribute but its value and type. */
export type PassphraseInputProps = Omit<ComponentPropsWithRef<'input'>, 'name' | 'type' | 'value' | 'defaultValue' | 'autoComplete'> & PassphraseFieldOpts & {
  /** The field's name in the form's `FormData`, for the form's action to read. */
  name: string
}

/** A masked, uncontrolled input for a passphrase, with a Show / Hide button and a Caps Lock warning. Read it in the form's action, from the `FormData`.
 * Each submit hides it again, so a password manager sees a password field.
 * @example
 *   <form action={unlockAction}><PassphraseInput name="passphrase" aria-label="Passphrase" /><SubmitButton>Unlock</SubmitButton></form>
 */
export function PassphraseInput({ id, autoComplete, isPending, onKeyDown, onKeyUp, onBlur, ...passed }: PassphraseInputProps) {
  const field = usePassphraseField({ id, autoComplete, isPending, onKeyDown, onKeyUp, onBlur })
  // `type`, `value` and `defaultValue` come last, so a host that gets any past the types still leaves the input uncontrolled and masked.
  return (
    <>
      <span className="passphrase-input">
        <input {...field.inputProps} {...passed} type={field.inputProps.type} value={undefined} defaultValue={undefined} />
        <button {...field.toggleProps}>{field.isRevealed ? PartsPhrases.hideButton : PartsPhrases.showButton}</button>
      </span>
      <span role="status">{field.isCapsLockOn && PartsPhrases.capsLockOn}</span>
    </>
  )
}
// --
