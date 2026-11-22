/** `usePassphraseField`, the behaviour of a passphrase field without its markup: Show / Hide, the Caps Lock warning, and the password manager's hints. */

import { type FocusEventHandler, type KeyboardEvent, type KeyboardEventHandler, useState } from 'react'
import { type RevealToggleOpts, type RevealToggleProps, useRevealToggle } from './reveal-toggle'

// == [Types]: PassphraseFieldOpts, PassphraseField, PassphraseFieldInputProps

/** What {@link usePassphraseField} takes: the input's id, which passphrase it takes, and any handler of the host's own that the field's handlers stand in for. */
export type PassphraseFieldOpts = RevealToggleOpts & Readonly<{
  /** `current-password` (the default) for the passphrase the user has, `new-password` for one being chosen, so a password manager offers or saves it. */
  autoComplete?: 'current-password' | 'new-password' | undefined
  onKeyDown?:    KeyboardEventHandler<HTMLInputElement> | undefined
  onKeyUp?:      KeyboardEventHandler<HTMLInputElement> | undefined
  onBlur?:       FocusEventHandler<HTMLInputElement> | undefined
}>

/** What {@link usePassphraseField} answers: the props of the input and of its Show / Hide button, and what to show beside them. */
export type PassphraseField = Readonly<{
  /** The props of the passphrase's `<input>`, beside its `name`. Never a `value`: the input stays uncontrolled. */
  inputProps:   PassphraseFieldInputProps
  /** The props of the Show / Hide button, beside its words. */
  toggleProps:  RevealToggleProps
  /** True while the passphrase shows in the input. */
  isRevealed:   boolean
  /** True while Caps Lock is on, as of the last key pressed in the input: show a warning. */
  isCapsLockOn: boolean
}>

/** The props {@link usePassphraseField} gives its input. */
export type PassphraseFieldInputProps = Readonly<{
  id:             string
  type:           'text' | 'password'
  autoComplete:   'current-password' | 'new-password'
  autoCapitalize: 'none'
  autoCorrect:    'off'
  spellCheck:     false
  onKeyDown:      KeyboardEventHandler<HTMLInputElement>
  onKeyUp:        KeyboardEventHandler<HTMLInputElement>
  onBlur:         FocusEventHandler<HTMLInputElement>
}>
// --

// == [The hook]: usePassphraseField

/** A passphrase field's behaviour, as props to spread onto an uncontrolled `<input>` and a `<button>` of your own, and whether to warn of Caps Lock.
 * Each submit of the form it is in hides the passphrase again, so a password manager sees a password field. Called in the component that renders the form, it cannot see the submit: pass `isPending`.
 * Read the passphrase in the form's action, from the `FormData`.
 * @example
 *   const field = usePassphraseField({ autoComplete: 'current-password' })
 *   <input name="passphrase" {...field.inputProps} />
 *   <button {...field.toggleProps}>{field.isRevealed ? 'Hide' : 'Show'}</button>
 *   {field.isCapsLockOn && <p>Caps Lock is on</p>}
 */
export function usePassphraseField({ autoComplete = 'current-password', onKeyDown, onKeyUp, onBlur, ...toggleOpts }: PassphraseFieldOpts = {}): PassphraseField {
  const reveal = useRevealToggle(toggleOpts)
  const [isCapsLockOn, setIsCapsLockOn] = useState(false)
  /** Note whether Caps Lock is on, as of `event`. */
  function watchCaps(event: KeyboardEvent<HTMLInputElement>) { setIsCapsLockOn(event.getModifierState('CapsLock')) }
  return {
    inputProps: {
      id:             reveal.fieldId,
      type:           reveal.fieldType,
      autoComplete,
      autoCapitalize: 'none',
      autoCorrect:    'off',
      spellCheck:     false,
      onKeyDown:      (event) => { watchCaps(event); onKeyDown?.(event) },
      onKeyUp:        (event) => { watchCaps(event); onKeyUp?.(event) },
      onBlur:         (event) => { setIsCapsLockOn(false); onBlur?.(event) },
    },
    toggleProps: reveal.toggleProps,
    isRevealed:  reveal.isRevealed,
    isCapsLockOn,
  }
}
// --
