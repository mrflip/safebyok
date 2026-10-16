import { useId, useState, type InputHTMLAttributes } from 'react'
import { WhisperFieldAttributes } from 'safebyok/utils'
import { Messages } from './messages'

/**
 * A field for the user to type or paste a whisper into -- an API key, say -- hidden as they type,
 * with a Show / Hide button beside it to check what they typed. Password managers and the
 * browser's own helpers are asked to leave it alone (`WhisperFieldAttributes`, from
 * `safebyok/utils`): it is named `whisper_text`, offers nothing saved to fill it, and is never
 * capitalized, corrected or spell-checked. Unstyled, under the `whisper-field` class name; the
 * button carries `aria-pressed`, true while the whisper shows.
 *
 * It holds what is typed only as the host's own state does (`value`, `onChange`), and shows no
 * placeholder unless given one. Any other attribute of an input (`id`, `aria-label`,
 * `disabled`, `onKeyDown`) passes through to it; its `type`, `name` and the attributes above are
 * the field's own.
 *
 * @example <WhisperField value={keyText} onChange={setKeyText} aria-label="Anthropic API key" />
 * @example <WhisperField value={keyText} onChange={setKeyText} placeholder="sk-ant-…" aria-label="Anthropic API key" />
 */
export const WhisperField = ({ onChange, ...passed }: WhisperFieldProps) => {
  const [shown, setShown] = useState(false)
  const ownId = useId()
  const fieldId = passed.id ?? ownId
  return (
    <span className="whisper-field">
      <input
        {...passed}
        id={fieldId}
        type={shown ? 'text' : 'password'}
        name="whisper_text"
        {...WhisperFieldAttributes}
        onChange={(evt) => { onChange(evt.target.value) }}
      />
      <button type="button" aria-controls={fieldId} aria-pressed={shown} onClick={() => { setShown((prev) => ! prev) }}>
        {shown ? Messages.hideWhisper : Messages.showWhisper}
      </button>
    </span>
  )
}

/** What a WhisperField is handed: the text so far and where each change goes, and any other input attribute. */
export type WhisperFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'name' | 'value' | 'onChange' | keyof typeof WhisperFieldAttributes> & {
  /** The whisper as typed so far. */
  value:    string
  /** Hears the whole text after each change. */
  onChange: (whisperText: string) => void
}
