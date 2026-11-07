import { useId, type ComponentPropsWithRef } from 'react'
import { WhisperFieldAttributes } from 'safebyok/utils'
import { Messages } from './messages'
import { useRevealToggle } from './reveal-toggle'

/**
 * A field for the user to type or paste a whisper into -- an API key, say -- hidden as they type,
 * with a Show / Hide button beside it to check what they typed. A whisper is no credential, so
 * password managers and the browser's own helpers are asked to leave it alone
 * (`WhisperFieldAttributes`, from `safebyok/utils`): it is named `whisper_text`, turns autofill
 * away (`autocomplete="off"`: nothing saved fills it, and nothing is generated for it), and is
 * never capitalized, corrected or spell-checked. Unstyled, under the `whisper-field` class name;
 * the button carries `aria-pressed`, true while the whisper shows.
 *
 * It is uncontrolled: the browser holds what is typed, and React never writes it into the page,
 * where a controlled input's value would sit in its `value` attribute for any extension or
 * session recorder to read. There is no `value` or `defaultValue` to give it. Read the text when
 * you need it: from `onChange`, which hears the whole text after each change; from the form it
 * sits in, under its name (`new FormData(form).get('whisper_text')`); or through a `ref` to the
 * input. To empty it, reset its form, or give it a new `key`. It shows no placeholder unless given
 * one. Any other attribute of an input (`id`, `aria-label`, `disabled`, `onKeyDown`) passes
 * through to it; its `type`, `name` and the attributes above are the field's own.
 *
 * @example <WhisperField onChange={setKeyText} aria-label="Anthropic API key" />
 * @example <WhisperField onChange={setKeyText} placeholder="sk-ant-…" aria-label="Anthropic API key" />
 * @example
 *   <form onSubmit={(evt) => { evt.preventDefault(); void save(new FormData(evt.currentTarget).get('whisper_text')) }}>
 *     <WhisperField aria-label="Anthropic API key" /> <button>Save</button>
 *   </form>
 */
export const WhisperField = ({ onChange, ...passed }: WhisperFieldProps) => {
  const reveal = useRevealToggle(Messages.showWhisper, Messages.hideWhisper)
  const ownId = useId()
  const fieldId = passed.id ?? ownId
  return (
    <span className="whisper-field">
      <input
        {...passed}
        id={fieldId}
        type={reveal.fieldType}
        name="whisper_text"
        // Uncontrolled whatever a host slips past the types: React writes no whisper into the page.
        value={undefined}
        defaultValue={undefined}
        {...WhisperFieldAttributes}
        onChange={(evt) => { onChange?.(evt.target.value) }}
      />
      {reveal.button(fieldId)}
    </span>
  )
}

/**
 * What a WhisperField is handed: where each change goes, if anywhere, and any other input
 * attribute, `ref` among them. Never a value: the field is uncontrolled.
 */
export type WhisperFieldProps = Omit<ComponentPropsWithRef<'input'>, 'type' | 'name' | 'value' | 'defaultValue' | 'onChange' | keyof typeof WhisperFieldAttributes> & {
  /** Hears the whole text after each change. */
  onChange?: ((whisperText: string) => void) | undefined
}
