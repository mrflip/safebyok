/** `WhisperInput`, the field a user types or pastes a whisper into. */

import type { ComponentPropsWithRef } from 'react'
import type { WhisperFieldAttributes } from 'safebyok'
import { PartsPhrases } from './phrases-parts'
import { type WhisperFieldOpts, useWhisperField } from './use-whisper-field'

// == [The input]: WhisperInputProps, WhisperInput

/** The props of a {@link WhisperInput}: its `name` in the form, and any `<input>` attribute but its value, its type, and the ones that keep password managers away. */
export type WhisperInputProps = Omit<ComponentPropsWithRef<'input'>, 'name' | 'type' | 'value' | 'defaultValue' | keyof typeof WhisperFieldAttributes> & WhisperFieldOpts & {
  /** The field's name in the form's `FormData`, for the form's action to read. */
  name: string
}

/** A masked input for typing or pasting a whisper, with a Show / Hide button. Uncontrolled: its text stays in the page, for the form's action to read from its `FormData`.
 * Each submit hides it again, so whatever the field holds next starts out masked.
 * Name it for what it holds (`apiKey`), never `password` or `token`, which password managers look for.
 * @example
 *   <form action={putAction}><WhisperInput name="apiKey" aria-label="Anthropic API key" /><SubmitButton>Save</SubmitButton></form>
 */
export function WhisperInput({ id, isPending, ...passed }: WhisperInputProps) {
  const field = useWhisperField({ id, isPending })
  // The hook's props, `value` and `defaultValue` come last, so a host that gets any past the types still leaves the input uncontrolled, and React never writes the whisper into the page.
  return (
    <span className="whisper-input">
      <input {...passed} {...field.inputProps} value={undefined} defaultValue={undefined} />
      <button {...field.toggleProps}>{field.isRevealed ? PartsPhrases.hideButton : PartsPhrases.showButton}</button>
    </span>
  )
}
// --
