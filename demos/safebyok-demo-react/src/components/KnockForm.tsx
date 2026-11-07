import { useId, useState } from 'react'
import { isVaultError } from 'safebyok'
import { gripeForJokeErr, tellKnockKnockJoke } from '../lib/anthropic'
import { isQuietRefusal } from '../lib/refusals'

/** What a KnockForm is handed: how its flow fetches the API key at each knock, null where none is saved; and whether the flow can yet. */
export type KnockFormProps = { apiKeyOf: () => Promise<string | null>, isReady: boolean }

/** The knock-knock half of a flow: who's there, a Knock button, and Claude's punchline, told with the key the flow hands over. */
export const KnockForm = ({ apiKeyOf, isReady }: KnockFormProps) => {
  const fieldId = useId()
  const [whosThereText, setWhosThereText] = useState('')
  const [joke, setJoke] = useState<string | null>(null)
  const [gripe, setGripe] = useState<string | null>(null)
  const [isKnocking, setIsKnocking] = useState(false)

  const knock = async () => {
    const whosThere = whosThereText.trim()
    if (whosThere === '') { setGripe("Say who's there first."); return }
    setGripe(null)
    setIsKnocking(true)
    try {
      const apiKey = await apiKeyOf()
      if (apiKey === null) { setGripe('Save your Anthropic API key first.'); return }
      setJoke(await tellKnockKnockJoke(apiKey, whosThere))
    } catch (err) {
      if (isQuietRefusal(err)) { return }
      setGripe(isVaultError(err) ? err.message : gripeForJokeErr(err))
    } finally {
      setIsKnocking(false)
    }
  }

  return (
    <div className="knock-form">
      <div className="knock-row">
        <span className="knock-line">Knock, knock!</span>
        <label htmlFor={fieldId} className="quiet">Who&apos;s there?</label>
        <input
          id={fieldId}
          value={whosThereText}
          placeholder="Banana"
          onChange={(evt) => { setWhosThereText(evt.target.value) }}
          onKeyDown={(evt) => { if (isReady && (! isKnocking) && (evt.key === 'Enter')) { void knock() } }}
        />
        <button type="button" disabled={(! isReady) || isKnocking} onClick={() => { void knock() }}>Knock</button>
      </div>
      {gripe !== null && <p className="gripe">{gripe}</p>}
      {joke !== null && <p className="joke">{joke}</p>}
    </div>
  )
}
