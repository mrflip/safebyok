import { useId, useState } from 'react'
import { BoxFields } from 'safebyok/dom'
import { BoxWhisperField, useBox, useDevice, useVault } from 'safebyok-react'
import { useIsShowing } from '../hooks/useIsShowing'
import { isQuietRefusal } from '../lib/refusals'
import { ApiKeyVaultlabel, DomApiKeyBoxlabel, ensureApiKeyBoxExposed, extractSavedApiKey } from '../lib/saved-api-key'
import { KnockForm } from './KnockForm'

/** The DOM form: a knock-knock machine whose API key field is filled and read by safebyok itself, so the key never passes through React. */
export const KnockKnockDom = () => {
  const device = useDevice()
  const { stage, vault } = useVault(ApiKeyVaultlabel)
  const box = useBox(ApiKeyVaultlabel, DomApiKeyBoxlabel)
  const isShowing = useIsShowing(box)
  const fieldId = useId()
  const [gripe, setGripe] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  // A key is read once the bank is up; the Edit button brings the bank up itself, building it where none is.
  const isReady = (stage === 'absent') || (stage === 'present')

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

  // The dialogs that build or unlock the vault open from this click.
  const edit = () => perform(async () => { if (device !== null) { await ensureApiKeyBoxExposed(device, DomApiKeyBoxlabel) } })

  const save = () => perform(async () => {
    if (box === null) { return }
    await BoxFields.of(box).put()
    setIsSaved(true)
  })

  const done = () => perform(() => box?.unexpose())

  return (
    <section className="flow knock-knock" aria-labelledby={`${fieldId}-title`}>
      <h2 id={`${fieldId}-title`}>DOM form</h2>
      <p className="quiet">Fields bound by the safebyok/dom export, so your key never passes through React.</p>
      <div className="api-key-slot">
        <label htmlFor={fieldId}>Anthropic API key</label>
        {box === null
          ? <span className="quiet">No key saved yet.</span>
          : <BoxWhisperField id={fieldId} box={box} path="apiKey" placeholder="sk-ant-…" />}
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
      <KnockForm extractApiKey={() => extractSavedApiKey(vault, DomApiKeyBoxlabel)} isReady={isReady} />
    </section>
  )
}
