import { useState } from 'react'
import { useVault, useVaultSnapshot } from 'safebyok-react'
import { gripeForJokeErr, tellKnockKnockJoke } from '../lib/anthropic'

/**
 * The "app": a knock-knock machine powered by the user's own Anthropic key. This is what using
 * the library day-to-day looks like -- one lockbox holding the key, `withUnlockedVault()` around
 * anything that needs it, and `vault.use()` scoping the decrypted key to the API call.
 */

/** The lockbox the knock-knock machine keeps its key in. */
const ApiKeyBoxlabel = 'anthropic_api_key'

/** The key, as the slot below stores it: text. Anything else was put there some other way. */
const apiKeyOf = (whisper: unknown): string => {
  if (typeof whisper !== 'string') { throw new TypeError('The stored Anthropic key is not text: replace it.') }
  return whisper
}

export const KnockKnock = () => {
  const { vault, withUnlockedVault } = useVault()
  const snapshot = useVaultSnapshot()
  const [whosThere, setWhosThere] = useState('')
  const [joke, setJoke] = useState<string | null>(null)
  const [telling, setTelling] = useState(false)
  const [gripe, setGripe] = useState<string | null>(null)

  if (vault === null) { return null }
  const keyBox = snapshot.boxes.find((box) => box.boxlabel === ApiKeyBoxlabel)
  // The button and the Enter key alike: a sound key, someone at the door, and no joke underway.
  const canKnock = ! telling && whosThere.trim() !== '' && keyBox !== undefined && ! keyBox.damaged

  const knock = async () => {
    setTelling(true)
    setJoke(null)
    setGripe(null)
    try {
      const told = await withUnlockedVault(() => vault.use(ApiKeyBoxlabel, (whisper) => tellKnockKnockJoke(apiKeyOf(whisper), whosThere.trim())))
      if (told !== null) { setJoke(told) }
    } catch (err) {
      setGripe(gripeForJokeErr(err))
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
      <ApiKeySlot haveKeyBox={keyBox !== undefined} damaged={keyBox?.damaged === true} changedAt={keyBox?.damaged === false ? keyBox.changed_at : undefined} />
    </section>
  )
}

/**
 * The facility for entering (or replacing) the Anthropic API key, stored as a lockbox. A damaged
 * key lockbox -- its stored record unreadable -- is offered for replacing: storing over it writes it afresh.
 */
const ApiKeySlot = ({ haveKeyBox, damaged, changedAt }: { haveKeyBox: boolean, damaged: boolean, changedAt?: number | undefined }) => {
  const { vault, withUnlockedVault } = useVault()
  const [editing, setEditing] = useState(false)
  const [keyText, setKeyText] = useState('')
  const [gripe, setGripe] = useState<string | null>(null)

  if (vault === null) { return null }

  if (! haveKeyBox && ! editing) {
    return (
      <p className="api-key-slot quiet">
        No Anthropic API key yet -- the machine won&apos;t knock without one.{' '}
        <button className="mini" onClick={() => { setEditing(true) }}>add your key</button>
      </p>
    )
  }
  if (damaged && ! editing) {
    return (
      <p className="api-key-slot gripe">
        {"The stored Anthropic key is damaged and can't be read."}{' '}
        <button className="mini" onClick={() => { setEditing(true) }}>replace it</button>
      </p>
    )
  }
  if (! editing) {
    return (
      <p className="api-key-slot quiet">
        ✓ Anthropic key in the vault{changedAt !== undefined && ` (changed ${new Date(changedAt).toLocaleString()})`}.{' '}
        <button className="mini" onClick={() => { setEditing(true) }}>replace it</button>
      </p>
    )
  }

  const save = async () => {
    setGripe(null)
    try {
      const saved = await withUnlockedVault(async () => {
        await vault.store(ApiKeyBoxlabel, keyText.trim(), { public: { note: 'feeds the knock-knock machine' } })
        return true
      })
      if (saved !== null) {
        setEditing(false)
        setKeyText('')
      }
    } catch (err) {
      setGripe(err instanceof Error ? err.message : 'Could not save that key.')
    }
  }

  return (
    <div className="api-key-slot">
      <input
        type="password"
        placeholder="sk-ant-…"
        value={keyText}
        onChange={(evt) => { setKeyText(evt.target.value) }}
      />
      <button disabled={! keyText.trim()} onClick={() => { void save() }}>Save key</button>
      <button onClick={() => { setEditing(false); setKeyText(''); setGripe(null) }}>Cancel</button>
      {gripe !== null && <span className="gripe">{gripe}</span>}
    </div>
  )
}
