import { useEffect, useId, useState } from 'react'
import { useBank, useBox, useVault, useWhisper } from 'safebyok-react'
import { useIsShowing } from '../hooks/useIsShowing'
import { isQuietRefusal } from '../lib/refusals'
import { ApiKeyVaultlabel, ExposedApiKeyBoxlabel, ensureApiKeyBoxExposed, extractSavedApiKey } from '../lib/saved-api-key'
import { KnockForm } from './KnockForm'

/** The knock-knock machine with its API key as an exposed whisper: safebyok keeps the working copy, the form just shows it. */
export const KnockKnockExposed = () => {
  const bank = useBank()
  const { stage, vault } = useVault(ApiKeyVaultlabel)
  const box = useBox(ApiKeyVaultlabel, ExposedApiKeyBoxlabel)
  const { apiKey } = useWhisper(box)
  const isShowing = useIsShowing(box)
  const fieldId = useId()
  const [gripe, setGripe] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  const isReady = (bank !== null) && (stage !== 'waiting')

  // Leaving the form drops the working copy; Edit, on a click, brings it back.
  useEffect(() => () => { box?.unexpose() }, [box])

  /** Runs a button's work, saying what refused unless the user cancelled. */
  const perform = async (work: () => unknown) => {
    setGripe(null)
    setIsSaved(false)
    try {
      await work()
    } catch (err) {
      if (! isQuietRefusal(err)) { setGripe(err instanceof Error ? err.message : 'That did not work: try again.') }
    }
  }

  const edit = () => perform(async () => { if (bank !== null) { await ensureApiKeyBoxExposed(bank, ExposedApiKeyBoxlabel) } })
  const save = () => perform(async () => { await box?.putExposed(); setIsSaved(true) })
  const done = () => perform(() => box?.unexpose())

  return (
    <section className="flow knock-knock" aria-labelledby={`${fieldId}-title`}>
      <h2 id={`${fieldId}-title`}>Knock-knock, with an exposed whisper</h2>
      <p className="quiet">Your key stays open in safebyok while you edit, and put away when you leave.</p>
      <div className="api-key-slot">
        <label htmlFor={fieldId}>Anthropic API key</label>
        {box === null
          ? <span className="quiet">No key saved yet.</span>
          : (
            <input
              id={fieldId} type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…"
              disabled={! isShowing} value={(typeof apiKey === 'string') ? apiKey : ''}
              onChange={(evt) => { box.patchWhisper({ apiKey: evt.target.value }) }}
            />
          )}
      </div>
      <div className="row">
        {isShowing && (box !== null)
          ? (
            <>
              <button type="button" onClick={() => { void save() }}>Save</button>
              <button type="button" onClick={() => { void done() }}>Done</button>
            </>
          )
          : <button type="button" disabled={! isReady} onClick={() => { void edit() }}>{box === null ? 'Add key' : 'Edit key'}</button>}
        {isSaved && <span className="quiet">Saved.</span>}
      </div>
      {gripe !== null && <p className="gripe">{gripe}</p>}
      <KnockForm extractApiKey={() => extractSavedApiKey(vault, ExposedApiKeyBoxlabel)} isReady={isReady} />
    </section>
  )
}
