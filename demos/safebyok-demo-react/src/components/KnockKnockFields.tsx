import { useId, useState, useSyncExternalStore } from 'react'
import type { Box } from 'safebyok'
import { BoxFields } from 'safebyok/dom'
import { BoxWhisperField, useBank, useBox, useVault } from 'safebyok-react'
import { isQuietRefusal } from '../lib/refusals'
import { KnockForm } from './KnockForm'

const Vaultlabel = 'main'
const Boxlabel = 'anthropic_api_key'

const unsubscribeFromNothing = () => { /* nothing was heard */ }
const subscribeToNothing = () => unsubscribeFromNothing

/** Whether `box` shows its whisper, read live; false for no box. */
const useIsShowing = (box: Box | null): boolean => (
  useSyncExternalStore(box?.subscribe ?? subscribeToNothing, () => box?.isShowing ?? false)
)

/** The knock-knock machine with its API key in a field safebyok fills and reads, so the key never passes through React. */
export const KnockKnockFields = () => {
  const bank = useBank()
  const { stage } = useVault(Vaultlabel)
  const box = useBox(Vaultlabel, Boxlabel)
  const isShowing = useIsShowing(box)
  const fieldId = useId()
  const [gripe, setGripe] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  const isReady = (bank !== null) && (stage !== 'waiting')

  /** Runs a button's work, saying what refused unless the user cancelled. */
  const perform = async (work: () => Promise<unknown>) => {
    setGripe(null)
    setIsSaved(false)
    try {
      await work()
    } catch (err) {
      if (! isQuietRefusal(err)) { setGripe(err instanceof Error ? err.message : 'That did not work: try again.') }
    }
  }

  // Each dialog opens on the click: building the vault, unlocking it.
  const edit = () => perform(async () => {
    if (bank === null) { return }
    const vault = await bank.ensureVault({ vaultlabel: Vaultlabel })
    await vault.ensureUnlocked()
    const editing = await vault.putBox({ boxlabel: Boxlabel, whisper: {} }, { ifPresent: 'get', ifAbsent: 'add' })
    // Exposed before a lock, it holds what was typed: an unlock alone brings the edit back.
    if (! editing.snapshot.exposed) { await editing.expose() }
  })

  const save = () => perform(async () => {
    if (box === null) { return }
    await BoxFields.of(box).save()
    setIsSaved(true)
  })

  // What the knock reads is the whisper as saved, not an edit still in the field.
  const apiKeyOf = async (): Promise<string | null> => {
    if (bank === null) { return null }
    const vault = await bank.ensureVault({ vaultlabel: Vaultlabel })
    await vault.ensureUnlocked()
    const stored = await vault.getBox(Boxlabel, { ifAbsent: 'nil' })
    if (stored === null) { return null }
    if (! stored.snapshot.exposed) { await stored.expose() }
    const { apiKey } = stored.whisper
    return ((typeof apiKey === 'string') && (apiKey !== '')) ? apiKey : null
  }

  return (
    <section className="flow knock-knock" aria-labelledby={`${fieldId}-title`}>
      <h2 id={`${fieldId}-title`}>Knock-knock, with managed fields</h2>
      <p className="quiet">Your key sits in a field safebyok fills and reads, so it never passes through React.</p>
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
              <button type="button" onClick={() => { box.unexpose() }}>Done</button>
            </>
          )
          : <button type="button" disabled={! isReady} onClick={() => { void edit() }}>{box === null ? 'Add key' : 'Edit key'}</button>}
        {isSaved && <span className="quiet">Saved.</span>}
      </div>
      {gripe !== null && <p className="gripe">{gripe}</p>}
      <KnockForm apiKeyOf={apiKeyOf} isReady={isReady} />
    </section>
  )
}
