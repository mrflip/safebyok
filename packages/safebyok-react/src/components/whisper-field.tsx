import { useId } from 'react'
import { WhisperFieldAttributes } from 'safebyok/utils'
import { Messages } from '../helpers/messages'
import { useRevealToggle } from '../hooks/reveal-toggle'
import type { WhisperFieldProps } from '../shapes'

/** A field for the user to type or paste a whisper into, hidden as they type, with a Show / Hide button. */
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
