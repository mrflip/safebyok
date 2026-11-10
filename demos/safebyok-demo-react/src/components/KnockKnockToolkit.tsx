import { useEffect, useId, useState } from 'react'
import { useBank, useBox, useVault, useWhisper } from 'safebyok-react'
import { useIsShowing } from '../hooks/useIsShowing'
import { isQuietRefusal } from '../lib/refusals'
import { ApiKeyVaultlabel, ToolkitApiKeyBoxlabel, ensureApiKeyBoxExposed, extractSavedApiKey } from '../lib/saved-api-key'
import { KnockForm } from './KnockForm'

/** The toolkit form: the knock-knock machine with its API key as an exposed whisper: safebyok keeps the working copy, the form just shows it. */
export const KnockKnockToolkit = () => {
  const bank = useBank()
  const { stage, vault } = useVault(ApiKeyVaultlabel)
  const box = useBox(ApiKeyVaultlabel, ToolkitApiKeyBoxlabel)
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

  const edit = () => perform(async () => { if (bank !== null) { await ensureApiKeyBoxExposed(bank, ToolkitApiKeyBoxlabel) } })
  const save = () => perform(async () => { await box?.putExposed(); setIsSaved(true) })
  const done = () => perform(() => box?.unexpose())

  return (
    <section className="flow knock-knock" aria-labelledby={`${fieldId}-title`}>
      <h2 id={`${fieldId}-title`}>Toolkit form</h2>
      <p className="quiet">The components and hooks the widgets are made of, assembled by hand: your layout, your styling.</p>
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
      <KnockForm extractApiKey={() => extractSavedApiKey(vault, ToolkitApiKeyBoxlabel)} isReady={isReady} />
    </section>
  )
}
