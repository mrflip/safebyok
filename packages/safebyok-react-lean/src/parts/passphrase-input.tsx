/** `PassphraseInput`, the field a user types a passphrase into. */

import { type ComponentPropsWithRef, type KeyboardEvent, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { PartsPhrases } from './phrases-parts'
import { useRevealToggle } from './reveal-toggle'

// == [The input]: PassphraseInputProps, PassphraseInput

/** The props of a {@link PassphraseInput}: its `name` in the form, whether it takes the current passphrase or a new one, and any `<input>` attribute but its value and type. */
export type PassphraseInputProps = Omit<ComponentPropsWithRef<'input'>, 'name' | 'type' | 'value' | 'defaultValue' | 'autoComplete'> & {
  /** The field's name in the form's `FormData`, for the form's action to read. */
  name:          string
  /** `current-password` (the default) for the passphrase the user has, `new-password` for one being chosen, so a password manager offers or saves it. */
  autoComplete?: 'current-password' | 'new-password' | undefined
  /** True while a form that submits from an `onSubmit` handler, not a form action, is submitting: it hides the field again, as a form action's submit does. */
  isPending?:    boolean | undefined
}

/** A masked, uncontrolled input for a passphrase, with a Show / Hide button and a Caps Lock warning. Read it in the form's action, from the `FormData`.
 * Each submit hides it again, so a password manager sees a password field.
 * @example
 *   <form action={unlockAction}><PassphraseInput name="passphrase" aria-label="Passphrase" /><SubmitButton>Unlock</SubmitButton></form>
 */
export function PassphraseInput({ id, autoComplete = 'current-password', isPending = false, onKeyDown, onKeyUp, onBlur, ...passed }: PassphraseInputProps) {
  const { pending } = useFormStatus()
  const reveal = useRevealToggle(! (pending || isPending))
  const [isCapsOn, setIsCapsOn] = useState(false)
  const ownId = useId()
  const fieldId = id ?? ownId
  /** Note whether Caps Lock is on, as of `event`. */
  function watchCaps(event: KeyboardEvent<HTMLInputElement>) { setIsCapsOn(event.getModifierState('CapsLock')) }
  return (
    <>
      <span className="passphrase-input">
        <input
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          {...passed}
          id={fieldId}
          type={reveal.fieldType}
          autoComplete={autoComplete}
          // Last, so a host that gets either past the types still leaves the input uncontrolled.
          value={undefined}
          defaultValue={undefined}
          onKeyDown={(event) => { watchCaps(event); onKeyDown?.(event) }}
          onKeyUp={(event) => { watchCaps(event); onKeyUp?.(event) }}
          onBlur={(event) => { setIsCapsOn(false); onBlur?.(event) }}
        />
        {reveal.button(fieldId)}
      </span>
      <span role="status">{isCapsOn && PartsPhrases.capsLockOn}</span>
    </>
  )
}
// --
