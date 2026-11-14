import { useId } from 'react'
import { BoxFields } from 'safebyok-big/dom'
import { WhisperFieldAttributes } from 'safebyok-big/utils'
import { Messages } from '../helpers/messages'
import { useBoxIsShowing } from '../hooks/hooks'
import { useRevealToggle } from '../hooks/reveal-toggle'
import type { BoxWhisperFieldProps } from '../shapes'

/** Render an input bound to the text at dotted `path` in `box`'s whisper. It is blank and read-only while the whisper is hidden.
 * @example
 *   <BoxWhisperField box={box} path="apiKey" aria-label="Anthropic API key" />
 *   <button onClick={async () => { await bank.ensureUnlocked(); await box.expose() }}>Edit</button>
 *   <button onClick={() => BoxFields.of(box).put()}>Save</button>
 */
export const BoxWhisperField = ({ box, path, readOnly, ...passed }: BoxWhisperFieldProps) => {
  const isShowing = useBoxIsShowing(box)
  const reveal = useRevealToggle(Messages.showWhisper, Messages.hideWhisper, isShowing)
  const ownId = useId()
  const fieldId = passed.id ?? ownId
  return (
    <span className="box-whisper-field">
      <input
        {...passed}
        id={fieldId}
        // BoxFields returns the same ref for a path at every render. A new ref each render would unbind
        // the old one, and the last unbind unexposes the box.
        ref={BoxFields.of(box).bind(path)}
        type={reveal.fieldType}
        readOnly={(readOnly === true) || (! isShowing)}
        // Force the input to be uncontrolled and unnamed, even if a host gets these props past the types.
        // React then never writes the whisper into the page, and a native form submit never sends it.
        value={undefined}
        defaultValue={undefined}
        name={undefined}
        {...WhisperFieldAttributes}
      />
      {reveal.button(fieldId)}
    </span>
  )
}
