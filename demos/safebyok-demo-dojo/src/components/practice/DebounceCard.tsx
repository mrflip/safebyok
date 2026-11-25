import { debounce } from 'es-toolkit'
import { type SubmitEvent, useMemo, useState } from 'react'
import { WhisperInput } from 'safebyok-react/parts'
import { isKeyAccepted, saveMadeUp } from '../../lib/made-up-service'
import { Example, PracticeCard } from './PracticeCard'

/** How long each debounce waits after the last keystroke, or the last press, before it acts. */
export const WaitMs = 800

/** Why a debounce is the wrong tool, shown with es-toolkit's: a debounced check, a debounced submit, and the submit disabled while pending beside them. */
export function DebounceCard() {
  const [isFormShown, setIsFormShown] = useState(true)
  const [heard, setHeard] = useState('')
  return (
    <PracticeCard
      title="Don't debounce a secret's check or its submit"
      why={<>
        <p>A debounced call holds its last arguments, the key among them, in a timer&apos;s closure until it fires or is cancelled, out of sight of anything that inspects the page. It fires after the field is cleared or the form is gone, unless something remembers to cancel it. As a guard against a double submit it merges only the presses within its wait: one after it, while the save is still pending, starts a second save.</p>
        <p>Instead: disable the submit while its save is pending. Test a key when the user asks (below), not as they type, which sends every prefix of it to the service. A check that must run as the user types runs on each change and keeps only the latest answer, as the library&apos;s strength hook does.</p>
        <p className="quiet">The service and the save here are the dojo&apos;s stand-ins: they call nothing.</p>
      </>}
    >
      <Example isWrongWay caption="a debounced check as the user types">
        {isFormShown ? <DebouncedCheckForm onFired={setHeard} /> : <p>The form is gone.</p>}
        <button type="button" onClick={() => { setIsFormShown((prior) => ! prior) }}>{isFormShown ? 'Remove the form' : 'Bring the form back'}</button>
        <p role="status" aria-label="Debounced check">{heard}</p>
      </Example>
      <Example isWrongWay caption="a debounced submit"><DebouncedSubmitForm /></Example>
      <Example caption="the submit disabled while pending"><GuardedSubmitForm /></Example>
    </PracticeCard>
  )
}

/** The wrong way: a key field whose check runs once the user pauses typing, and tells `onFired` what it was handed. */
function DebouncedCheckForm({ onFired }: Readonly<{ onFired: (heard: string) => void }>) {
  const checkSoon = useMemo(() => debounce((apiKey: string, field: HTMLInputElement) => {
    const fieldNow = field.isConnected ? `the field held ${String(field.value.length)} characters` : 'the form was gone'
    onFired(`The check ran with a ${String(apiKey.length)}-character key; ${fieldNow}.`)
    void isKeyAccepted(apiKey)
  }, WaitMs), [onFired])
  return (
    <form aria-label="Checked once typing pauses" onSubmit={(event) => { event.preventDefault() }}>
      <WhisperInput name="apiKey" aria-label="API key" placeholder="API key" onChange={(event) => { checkSoon(event.target.value, event.target) }} />
      <button type="reset">Clear</button>
    </form>
  )
}

/** The wrong way: a submit put off until the presses pause, handing a made-up save the form. */
function DebouncedSubmitForm() {
  const [startedCount, setStartedCount] = useState(0)
  const [endedCount, setEndedCount] = useState(0)
  const saveSoon = useMemo(() => debounce((form: FormData) => {
    setStartedCount((prior) => prior + 1)
    void saveMadeUp(form).then(() => { setEndedCount((prior) => prior + 1) })
  }, WaitMs), [])
  return (
    <form aria-label="Debounced submit" method="post" onSubmit={(event) => { event.preventDefault(); saveSoon(new FormData(event.currentTarget)) }}>
      <WhisperInput name="apiKey" aria-label="API key" placeholder="API key" />
      <button type="submit">Save</button>
      <p role="status" aria-label="Saves">Saves started: {startedCount}, ended: {endedCount}</p>
    </form>
  )
}

/** The right way: a submit disabled from the press until the made-up save ends. */
function GuardedSubmitForm() {
  const [isSaving, setIsSaving] = useState(false)
  const [startedCount, setStartedCount] = useState(0)
  const [endedCount, setEndedCount] = useState(0)
  /** Save the form, disabling the submit until the save ends. */
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setStartedCount((prior) => prior + 1)
    try {
      await saveMadeUp(new FormData(event.currentTarget))
      setEndedCount((prior) => prior + 1)
    } finally {
      setIsSaving(false)
    }
  }
  return (
    <form aria-label="Disabled while pending" method="post" onSubmit={(event) => { void save(event) }}>
      <WhisperInput name="apiKey" aria-label="API key" placeholder="API key" />
      <button type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save'}</button>
      <p role="status" aria-label="Saves">Saves started: {startedCount}, ended: {endedCount}</p>
    </form>
  )
}
