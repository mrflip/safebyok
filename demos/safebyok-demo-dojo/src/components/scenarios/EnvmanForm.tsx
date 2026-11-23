import { type SubmitEvent, useRef, useState } from 'react'
import type { Sidecar } from 'safebyok'
import { Dojo } from '../../lib/dojo'
import { type RowOutcome, outcomeNow } from '../../lib/form-outcomes'
import { messageOf } from '../../lib/messages'
import { MirrorCell } from '../forms/RowParts'
import { SaveLog } from './SaveLog'

/** The labelpath of the box the editor edits: Hero's, from the fixture. */
export const EnvmanLabelpath = 'github'

/** The text of the sidecar's field `fieldname`, or nothing where it holds no string. */
function sidecarTextOf(sidecar: Sidecar, fieldname: string): string {
  const val = sidecar[fieldname]
  return (typeof val === 'string') ? val : ''
}

/** How many saves the log keeps, newest first. */
const KeptOutcomes = 4

/** `outcomes` with `outcome` added first, the oldest past {@link KeptOutcomes} dropped. */
function loggedOutcomes(outcomes: readonly RowOutcome[], outcome: RowOutcome): readonly RowOutcome[] {
  return [outcome, ...outcomes].slice(0, KeptOutcomes)
}

// useDraft gives the whisper's field its focus, blur and change handlers, and reveals the field on focus, with no other
// call to reveal it. So the eye and the quill reach that reveal through the focus, and each keeps the focus where it is
// as it is pressed, so the press never blurs, and so masks, the field first.
/** An environment-variables manager's editor of a stored box: its username and its password, masked.
 * Where `isSavedOnBlur`, leaving either field with an edit saves the box, and there is no Save button.
 */
export function EnvmanForm({ isSavedOnBlur }: Readonly<{ isSavedOnBlur: boolean }>) {
  const draft = Dojo.useDraft(EnvmanLabelpath)
  const field = draft.whisperField('password')
  const inputRef = useRef<HTMLInputElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [outcomes, setOutcomes] = useState<readonly RowOutcome[]>([])
  const isRevealed = (field.type === 'text')

  /** Write the draft, the username and the password, logging how it ended. */
  async function save(): Promise<void> {
    setPendingCount((prior) => prior + 1)
    try {
      await draft.put()
      setOutcomes((prior) => loggedOutcomes(prior, outcomeNow()))
    } catch (err) {
      setOutcomes((prior) => loggedOutcomes(prior, outcomeNow(err)))
    } finally {
      setPendingCount((prior) => prior - 1)
    }
  }

  /** Save, where saving on blur is chosen and the draft has an edit. */
  function saveOnBlur(): void { if (isSavedOnBlur && draft.isDirty) { void save() } }

  return (
    <form className="row envman" aria-label="Envman" onSubmit={(event: SubmitEvent<HTMLFormElement>) => { event.preventDefault(); void save() }}>
      <input
        aria-label="Username"
        autoComplete="off"
        value={sidecarTextOf(draft.sidecar, 'username')}
        onChange={(event) => { draft.setSidecar({ ...draft.sidecar, username: event.target.value }) }}
        onBlur={saveOnBlur}
      />
      <input
        {...field}
        ref={(input) => {
          inputRef.current = input
          return field.ref(input)
        }}
        aria-label="Password"
        data-secret=""
        readOnly={field.readOnly || (! isEditing)}
        onDoubleClick={() => { setIsEditing(true) }}
        onBlur={(event) => {
          field.onBlur(event)
          setIsEditing(false)
          saveOnBlur()
        }}
      />
      <button
        type="button"
        aria-label={isRevealed ? 'Hide password' : 'Show password'}
        aria-pressed={isRevealed}
        onMouseDown={(event) => { event.preventDefault() }}
        onClick={() => { if (isRevealed) { inputRef.current?.blur() } else { inputRef.current?.focus() } }}
      >
        👁
      </button>
      <button
        type="button"
        aria-label="Edit password"
        onMouseDown={(event) => { event.preventDefault() }}
        onClick={() => {
          setIsEditing(true)
          inputRef.current?.focus()
        }}
      >
        🪶
      </button>
      {(! isSavedOnBlur) && <button type="submit" disabled={! draft.isDirty}>Save</button>}
      <MirrorCell />
      <SaveLog pendingCount={pendingCount} outcomes={outcomes} />
      {(draft.lastErr !== null) && <span className="gripe">{messageOf(draft.lastErr)}</span>}
    </form>
  )
}
