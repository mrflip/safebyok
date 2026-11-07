import { useId, useSyncExternalStore, type ComponentPropsWithoutRef } from 'react'
import type { Box } from 'safebyok'
import { BoxFields } from 'safebyok/dom'
import { WhisperFieldAttributes } from 'safebyok/utils'
import { Messages } from './messages'
import { useRevealToggle } from './reveal-toggle'

/** A field showing the text at dotted `path` in the whisper of `box`, blank and read-only while it will not show; `BoxFields.of(box).save()` stores an edit.
 *
 * @example
 *   <BoxWhisperField box={box} path="apiKey" aria-label="Anthropic API key" />
 *   <button onClick={async () => { await vault.ensureUnlocked(); await box.expose() }}>Edit</button>
 *   <button onClick={() => BoxFields.of(box).save()}>Save</button>
 */
export const BoxWhisperField = ({ box, path, readOnly, ...passed }: BoxWhisperFieldProps) => {
  const isShowing = useSyncExternalStore(box.subscribe, () => box.isShowing)
  const reveal = useRevealToggle(Messages.showWhisper, Messages.hideWhisper, isShowing)
  const ownId = useId()
  const fieldId = passed.id ?? ownId
  return (
    <span className="box-whisper-field">
      <input
        {...passed}
        id={fieldId}
        // The ref BoxFields answers keeps one identity per path: a new one at each render would
        // unbind the old, and the last unbind unexposes.
        ref={BoxFields.of(box).bind(path)}
        type={reveal.fieldType}
        readOnly={(readOnly === true) || (! isShowing)}
        // Uncontrolled and unnamed whatever a host slips past the types: React writes no whisper
        // into the page, and a form submitted natively sends none.
        value={undefined}
        defaultValue={undefined}
        name={undefined}
        {...WhisperFieldAttributes}
      />
      {reveal.button(fieldId)}
    </span>
  )
}

/** What a BoxWhisperField is handed: the box, the dotted path of the text in its whisper, and any other input attribute but a ref, a name, a value or a change handler. */
export type BoxWhisperFieldProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'name' | 'value' | 'defaultValue' | 'onChange' | keyof typeof WhisperFieldAttributes> & {
  box:  Box
  path: string
}
