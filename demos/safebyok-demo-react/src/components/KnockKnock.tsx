import { useEffect, useState } from 'react'
import { isVaultError, type BoxDamaged } from 'safebyok'
import { WhisperField, useVault, useVaultSnapshot } from 'safebyok-react'
import { gripeForJokeErr, tellKnockKnockJoke } from '../lib/anthropic'

/**
 * The "app": a knock-knock machine powered by the user's own Anthropic key. This is what using
 * the library day-to-day looks like -- one box holding the key, the vault asking for the
 * passphrase through the provider's dialog whenever a call needs it, and `vault.useWhisper()` scoping
 * the decrypted key to the API call. A dialog the user dismissed is refused 'vault_locked': nothing
 * to say.
 */

/** The box the knock-knock machine keeps its key in. */
const ApiKeyBoxlabel = 'anthropic_api_key'

/** The key, as the slot below stores it: text. Anything else was put there some other way. */
const apiKeyOf = (whisper: unknown): string => {
  if (typeof whisper !== 'string') { throw new TypeError('The stored Anthropic key is not text: replace it.') }
  return whisper
}

export const KnockKnock = () => {
  const vault = useVault('main')
  const snapshot = useVaultSnapshot('main')
  const [whosThere, setWhosThere] = useState('')
  const [joke, setJoke] = useState<string | null>(null)
  const [telling, setTelling] = useState(false)
  const [gripe, setGripe] = useState<string | null>(null)

  // No Vault object until its birth has read storage, and with it the boxes it lists.
  if (vault === null || snapshot === null) { return null }
  const keyBox = snapshot.boxes.find((box) => box.boxlabel === ApiKeyBoxlabel)
  const damagedKeyBox = snapshot.damagedBoxes.find((box) => box.boxlabel === ApiKeyBoxlabel)
  // The button and the Enter key alike: a sound key, someone at the door, and no joke underway.
  const canKnock = ! telling && whosThere.trim() !== '' && keyBox !== undefined

  const knock = async () => {
    setTelling(true)
    setJoke(null)
    setGripe(null)
    try {
      setJoke(await vault.useWhisper(ApiKeyBoxlabel, (whisper) => tellKnockKnockJoke(apiKeyOf(whisper), whosThere.trim())))
    } catch (err) {
      if (! isVaultError(err, 'vault_locked')) { setGripe(gripeForJokeErr(err)) }
    } finally {
      setTelling(false)
    }
  }

  return (
    <section className="knock-knock">
      <h2>The Knock-Knock Machine</h2>
      <p className="quiet">
        Jokes by Claude, paid for with <em>your</em> Anthropic key -- which lives in your vault and
        is decrypted only on this device, only for the moment of the request.
      </p>
      <div className="knock-row">
        <span className="knock-line">Knock! Knock!</span>
        <span className="knock-line">Who&apos;s there?</span>
        <input
          placeholder="Banana"
          value={whosThere}
          onChange={(evt) => { setWhosThere(evt.target.value) }}
          onKeyDown={(evt) => { if (canKnock && evt.key === 'Enter') { void knock() } }}
        />
        <button disabled={! canKnock} onClick={() => { void knock() }}>
          (( {whosThere.trim() || '…'} Who? ))
        </button>
      </div>
      {telling && <p className="quiet">Claude is clearing its throat…</p>}
      {joke !== null && <blockquote className="joke">{joke}</blockquote>}
      {gripe !== null && <p className="gripe">{gripe}</p>}
      <ApiKeySlot haveKeyBox={keyBox !== undefined || damagedKeyBox !== undefined} damage={damagedKeyBox?.damage ?? null} replaceable={damagedKeyBox?.revision_tok !== null} savedAt={keyBox?.written_at} />
    </section>
  )
}

/** How long the slot says "saved" after a save, before it relaxes to when the key was last saved. */
export const SavedFlashMillis = 2000

/**
 * The facility for entering (or replacing) the Anthropic API key, stored as a box. A damaged
 * key box -- its stored record unreadable -- is offered for replacing while it names its
 * revision: storing over it writes it afresh. One damaged beyond naming, which putBox() refuses,
 * is offered for removing instead, and then for adding anew. One a newer version of the app
 * wrote is offered for neither: the app is the one to update, as the dashboard says.
 * A save flashes "saved" a moment, then relaxes to when the key was last saved -- any save, the
 * same key saved again included.
 */
const ApiKeySlot = ({ haveKeyBox, damage, replaceable, savedAt }: { haveKeyBox: boolean, damage: BoxDamaged['damage'] | null, replaceable: boolean, savedAt?: number | undefined }) => {
  const vault = useVault('main')
  const [editing, setEditing] = useState(false)
  const [keyText, setKeyText] = useState('')
  const [gripe, setGripe] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (! justSaved) { return }
    const relax = setTimeout(() => { setJustSaved(false) }, SavedFlashMillis)
    return () => { clearTimeout(relax) }
  }, [justSaved])

  if (vault === null) { return null }

  if (! haveKeyBox && ! editing) {
    return (
      <p className="api-key-slot quiet">
        No Anthropic API key yet -- the machine won&apos;t knock without one.{' '}
        <button className="mini" onClick={() => { setEditing(true) }}>add your key</button>
      </p>
    )
  }
  if (damage === 'newer_format') {
    return <p className="api-key-slot gripe">{"The stored Anthropic key was written by a newer version of this app: update the app to read it."}</p>
  }
  const remove = async () => {
    setGripe(null)
    try {
      await vault.delBox(ApiKeyBoxlabel)
    } catch (err) {
      if (! isVaultError(err, 'vault_locked')) { setGripe(err instanceof Error ? err.message : 'Could not remove that key.') }
    }
  }

  if (damage === 'damaged' && ! editing) {
    return (
      <p className="api-key-slot gripe">
        {"The stored Anthropic key is damaged and can't be read."}{' '}
        {replaceable
          ? <button className="mini" onClick={() => { setEditing(true) }}>replace it</button>
          : <button className="mini danger" onClick={() => { void remove() }}>remove it</button>}
        {gripe !== null && <span> {gripe}</span>}
      </p>
    )
  }
  if (! editing) {
    return (
      <p className="api-key-slot quiet">
        ✓ Anthropic key {justSaved ? 'saved' : 'in the vault'}{! justSaved && savedAt !== undefined && ` (saved ${new Date(savedAt).toLocaleString()})`}.{' '}
        <button className="mini" onClick={() => { setEditing(true) }}>replace it</button>
      </p>
    )
  }

  const save = async () => {
    setGripe(null)
    try {
      await vault.putBox({ boxlabel: ApiKeyBoxlabel, sidecar: { note: 'feeds the knock-knock machine' } }, keyText.trim())
      setEditing(false)
      setKeyText('')
      setJustSaved(true)
    } catch (err) {
      if (! isVaultError(err, 'vault_locked')) { setGripe(err instanceof Error ? err.message : 'Could not save that key.') }
    }
  }

  return (
    <div className="api-key-slot">
      <WhisperField onChange={setKeyText} placeholder="sk-ant-…" aria-label="Anthropic API key" />
      <button disabled={! keyText.trim()} onClick={() => { void save() }}>Save key</button>
      <button onClick={() => { setEditing(false); setKeyText(''); setGripe(null) }}>Cancel</button>
      {gripe !== null && <span className="gripe">{gripe}</span>}
    </div>
  )
}
