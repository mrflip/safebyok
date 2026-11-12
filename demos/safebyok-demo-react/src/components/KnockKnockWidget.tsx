import { useId, useState, type SyntheticEvent } from 'react'
import { useBox, useDevice, useVault, WhisperField } from 'safebyok-react'
import { isQuietRefusal } from '../lib/refusals'
import { ApiKeyVaultlabel, WidgetApiKeyBoxlabel, extractSavedApiKey } from '../lib/saved-api-key'
import { KnockForm } from './KnockForm'

/** The widget form: a knock-knock machine built from safebyok-react's ready-made pieces.
 * Its API key is typed in and sealed, and never exposed. The form reads it back only to tell a joke.
 */
export const KnockKnockWidget = () => {
  const device = useDevice()
  const { stage, vault } = useVault(ApiKeyVaultlabel)
  const box = useBox(ApiKeyVaultlabel, WidgetApiKeyBoxlabel)
  const fieldId = useId()
  const [gripe, setGripe] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  // A key is read once the bank is up; Save brings the bank up itself, building it where none is.
  const isReady = (stage === 'absent') || (stage === 'present')

  // The dialog that builds or unlocks the bank opens from this click.
  const save = async (evt: SyntheticEvent<HTMLFormElement>) => {
    evt.preventDefault()
    const form = evt.currentTarget
    const apiKey = new FormData(form).get('whisper_text')
    setGripe(null)
    setIsSaved(false)
    if ((typeof apiKey !== 'string') || (apiKey === '')) { setGripe('Type your key first.'); return }
    try {
      if (device === null) { return }
      // A user who cancelled the bank's dialog at sign-in is asked again here. A vault is put only in an unlocked bank.
      const bank = await device.ensureBank()
      await bank.ensureUnlocked()
      const vaultNow = await bank.ensureVault({ vaultlabel: ApiKeyVaultlabel })
      await vaultNow.putBox({ boxlabel: WidgetApiKeyBoxlabel, whisper: { apiKey } }, { ifAbsent: 'add', ifPresent: 'repl' })
      form.reset()
      setIsSaved(true)
    } catch (err) {
      if (! isQuietRefusal(err)) { setGripe(err instanceof Error ? err.message : 'That did not work: try again.') }
    }
  }

  return (
    <section className="flow knock-knock" aria-labelledby={`${fieldId}-title`}>
      <h2 id={`${fieldId}-title`}>Widget form</h2>
      <p className="quiet">Preassembled pieces from safebyok-react, landed in place. Your key goes in, and comes out only to knock.</p>
      <form className="api-key-slot" onSubmit={(evt) => { void save(evt) }}>
        <label htmlFor={fieldId}>Anthropic API key</label>
        <WhisperField id={fieldId} placeholder="sk-ant-…" />
        <div className="row">
          <button type="submit" disabled={device === null}>Save</button>
          {isSaved && <span className="quiet">Saved.</span>}
          {(! isSaved) && <span className="quiet">{box === null ? 'No key saved yet.' : 'A key is saved.'}</span>}
        </div>
      </form>
      {gripe !== null && <p className="gripe">{gripe}</p>}
      <KnockForm extractApiKey={() => extractSavedApiKey(vault, WidgetApiKeyBoxlabel)} isReady={isReady} />
    </section>
  )
}
