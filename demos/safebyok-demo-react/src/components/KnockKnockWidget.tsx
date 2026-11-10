import { useId, useState, type SyntheticEvent } from 'react'
import { useBank, useBox, useVault, WhisperField } from 'safebyok-react'
import { isQuietRefusal } from '../lib/refusals'
import { ApiKeyVaultlabel, WidgetApiKeyBoxlabel, extractSavedApiKey } from '../lib/saved-api-key'
import { KnockForm } from './KnockForm'

/** The widget form: the knock-knock machine whose API key is only ever typed and sealed, never exposed: the form reads it back only to knock. */
export const KnockKnockWidget = () => {
  const bank = useBank()
  const { stage, vault } = useVault(ApiKeyVaultlabel)
  const box = useBox(ApiKeyVaultlabel, WidgetApiKeyBoxlabel)
  const fieldId = useId()
  const [gripe, setGripe] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  const isReady = (bank !== null) && (stage !== 'waiting')

  // Each dialog opens on the click: building the vault, unlocking it.
  const save = async (evt: SyntheticEvent<HTMLFormElement>) => {
    evt.preventDefault()
    const form = evt.currentTarget
    const apiKey = new FormData(form).get('whisper_text')
    setGripe(null)
    setIsSaved(false)
    if ((typeof apiKey !== 'string') || (apiKey === '')) { setGripe('Type your key first.'); return }
    try {
      if (bank === null) { return }
      const vaultNow = await bank.ensureVault({ vaultlabel: ApiKeyVaultlabel })
      await vaultNow.ensureUnlocked()
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
          <button type="submit" disabled={! isReady}>Save</button>
          {isSaved && <span className="quiet">Saved.</span>}
          {(! isSaved) && <span className="quiet">{box === null ? 'No key saved yet.' : 'A key is saved.'}</span>}
        </div>
      </form>
      {gripe !== null && <p className="gripe">{gripe}</p>}
      <KnockForm extractApiKey={() => extractSavedApiKey(vault, WidgetApiKeyBoxlabel)} isReady={isReady} />
    </section>
  )
}
