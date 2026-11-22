/** `useWhisperField`, the behaviour of a whisper's field without its markup: Show / Hide, and the attributes that keep password managers away. */

import { WhisperFieldAttributes } from 'safebyok'
import { type RevealToggleOpts, type RevealToggleProps, useRevealToggle } from './reveal-toggle'

// == [Types]: WhisperFieldOpts, WhisperField, WhisperFieldInputProps

/** What {@link useWhisperField} takes: the input's id, and whether a form that submits from a handler is pending. */
export type WhisperFieldOpts = RevealToggleOpts

/** What {@link useWhisperField} answers: the props of the input and of its Show / Hide button. */
export type WhisperField = Readonly<{
  /** The props of the whisper's `<input>`, beside its `name`. Never a `value`: the input stays uncontrolled. */
  inputProps:  WhisperFieldInputProps
  /** The props of the Show / Hide button, beside its words. */
  toggleProps: RevealToggleProps
  /** True while the whisper shows in the input. */
  isRevealed:  boolean
}>

/** The props {@link useWhisperField} gives its input: its id and `type`, and the attributes that keep password managers away. */
export type WhisperFieldInputProps = typeof WhisperFieldAttributes & Readonly<{
  id:   string
  type: 'text' | 'password'
}>
// --

// == [The hook]: useWhisperField

/** A field for typing or pasting a whisper, as props to spread onto an uncontrolled `<input>` and a `<button>` of your own.
 * Each submit of the form it is in hides it again, so whatever the field holds next starts out masked. Read the whisper in the form's action, from the `FormData`.
 * Name the input for what it holds (`apiKey`), never `password` or `token`, which password managers look for.
 * @example
 *   const field = useWhisperField()
 *   <input name="apiKey" aria-label="API key" {...field.inputProps} />
 *   <button {...field.toggleProps}>{field.isRevealed ? 'Hide' : 'Show'}</button>
 */
export function useWhisperField(opts: WhisperFieldOpts = {}): WhisperField {
  const reveal = useRevealToggle(opts)
  return {
    inputProps:  { ...WhisperFieldAttributes, id: reveal.fieldId, type: reveal.fieldType },
    toggleProps: reveal.toggleProps,
    isRevealed:  reveal.isRevealed,
  }
}
// --
