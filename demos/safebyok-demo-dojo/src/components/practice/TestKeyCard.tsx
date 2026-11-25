import { useRef, useState } from 'react'
import { WhisperInput } from 'safebyok-react/parts'
import { isKeyAccepted } from '../../lib/made-up-service'
import { Example, PracticeCard } from './PracticeCard'

/** Test a key when the user presses a button: the handler reads the field and awaits the check, and the key stays where it was typed. */
export function TestKeyCard() {
  const fieldRef = useRef<HTMLInputElement>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [verdict, setVerdict] = useState('')

  /** Ask the service whether it accepts the key in the field, and show its answer. */
  async function test() {
    setIsTesting(true)
    setVerdict('')
    try {
      setVerdict(await isKeyAccepted(fieldRef.current?.value.trim() ?? '') ? 'The service accepted the key.' : 'The service refused the key.')
    } catch {
      // What a real service's call throws may quote the request, the key in it: show none of it.
      setVerdict('The service could not be reached. Try again.')
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <PracticeCard
      title="Test a key with a button the user presses"
      why={<>
        <p>Not as a step of saving, where a slow or failing service would hold up or lose the save, and not as the user types, which sends every prefix of the key to the service. The handler reads the field when pressed and awaits the check; the key stays in its field, and only the answer goes into state.</p>
        <p className="quiet">The service here is the dojo&apos;s stand-in: it accepts a key that starts <code>sk-dojo-</code> and has 20 characters or more, and calls nothing.</p>
      </>}
    >
      <Example caption="a Test button beside the field">
        <WhisperInput ref={fieldRef} name="apiKey" aria-label="API key" placeholder="API key" />
        <button type="button" disabled={isTesting} onClick={() => { void test() }}>{isTesting ? 'Testing…' : 'Test key'}</button>
        <p role="status" aria-label="Test result">{verdict}</p>
      </Example>
    </PracticeCard>
  )
}
