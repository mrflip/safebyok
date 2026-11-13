import { useEffect, useId, useState } from 'react'
import { useBox, useDevice, useVault, useWhisper } from 'safebyok-react'
import { useIsShowing } from '../hooks/useIsShowing'
import { isQuietRefusal } from '../lib/refusals'
import { ApiKeyVaultlabel, ToolkitApiKeyBoxlabel, ensureApiKeyBoxExposed, extractSavedApiKey } from '../lib/saved-api-key'
import { KnockForm } from './KnockForm'

/** The toolkit form: a knock-knock machine assembled by hand from safebyok-react's hooks.
 * Its API key is an exposed whisper: safebyok holds the working copy, and the form only displays it.
 */
export const KnockKnockToolkit = () => {
  const device = useDevice()
  const { stage, vault } = useVault(ApiKeyVaultlabel)
  const box = useBox(ApiKeyVaultlabel, ToolkitApiKeyBoxlabel)
  const { apiKey } = useWhisper(box)
  const isShowing = useIsShowing(box)
  const fieldId = useId()
  const [gripe, setGripe] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  // A key is read once the bank is up; the Edit button brings the bank up itself, building it where none is.
  const isReady = (stage === 'absent') || (stage === 'present')

  // Unexpose the box when the form unmounts, which drops the working copy. Clicking Edit exposes it again.
  useEffect(() => () => { box?.unexpose() }, [box])

  /** Run a button's action, and show the error message unless the user cancelled. */
  const perform = async (work: () => unknown) => {
    setGripe(null)
    setIsSaved(false)
    try {
      await work()
    } catch (err) {
      if (! isQuietRefusal(err)) { setGripe(err instanceof Error ? err.message : 'That did not work: try again.') }
    }
  }

  const edit = () => perform(async () => { if (device !== null) { await ensureApiKeyBoxExposed(device, ToolkitApiKeyBoxlabel) } })
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
          : <button type="button" disabled={device === null} onClick={() => { void edit() }}>{box === null ? 'Add key' : 'Edit key'}</button>}
        {isSaved && <span className="quiet">Saved.</span>}
      </div>
      {gripe !== null && <p className="gripe">{gripe}</p>}
      <KnockForm extractApiKey={() => extractSavedApiKey(vault, ToolkitApiKeyBoxlabel)} isReady={isReady} />
    </section>
  )
}
