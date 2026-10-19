import { useRef, useState, type SubmitEvent } from 'react'
import { createPasskey, passkeysAvailable, useVault, useVaultSnapshot } from 'safebyok-react'

/**
 * The vault's ways in -- its passphrases and passkeys, listed even while locked -- and an "Add
 * fingerprint" form. The line that matters is `vault.addPasskey(passphrase, makePasskey, ...)`:
 * the passphrase is the proof every change to the ways in asks for, even unlocked, and only once
 * it holds does the vault call `makePasskey`, `createPasskey()`. Once added, the passphrase dialog
 * offers "Use a passkey".
 */
export const WaysIn = () => {
  const vault = useVault()
  const snapshot = useVaultSnapshot()
  // The passphrase field is uncontrolled, so React never writes it into the page, and read at
  // submit, so a password manager's autofill counts even when it sends no input event.
  const formRef = useRef<HTMLFormElement>(null)
  const passphraseRef = useRef<HTMLInputElement>(null)
  const [wayinlabel, setWayinlabel] = useState('laptop_fingerprint')
  const [gripe, setGripe] = useState<string | null>(null)

  if (vault === null || snapshot === null || snapshot.wayins.length === 0) { return null }

  const addFingerprint = async (evt: SubmitEvent) => {
    evt.preventDefault()
    setGripe(null)
    try {
      const makePasskey = () => createPasskey({ rp: { name: 'safebyok playground' }, user: { name: snapshot.user_id, displayName: snapshot.user_id } })
      const wayinId = await vault.addPasskey(passphraseRef.current?.value ?? '', makePasskey, { wayinlabel })
      if (wayinId === null) { return }
      formRef.current?.reset()
    } catch (err) {
      setGripe(err instanceof Error ? err.message : 'Could not add that passkey.')
    }
  }

  return (
    <section className="ways-in">
      <h2>Ways in</h2>
      <ul>
        {snapshot.wayins.map((wayin) => (
          <li key={wayin.wayin_id}><code>{wayin.wayinlabel}</code> <span className="quiet">{wayin.wayinkind}</span></li>
        ))}
      </ul>
      {passkeysAvailable()
        ? (
          <form ref={formRef} className="box-form" onSubmit={(evt) => { void addFingerprint(evt) }}>
            {/* What a password manager files the passphrase under, as the passphrase dialog names it. */}
            <input type="text" name="username" autoComplete="username" value={`${snapshot.user_id} (${snapshot.vaultlabel} vault)`} readOnly hidden style={{ display: 'none' }} />
            <label>
              your passphrase <span className="quiet">(the proof any change to the ways in asks for)</span>
              <input ref={passphraseRef} type="password" name="current-password" autoComplete="current-password" />
            </label>
            <label>
              label
              <input value={wayinlabel} onChange={(evt) => { setWayinlabel(evt.target.value) }} />
            </label>
            {gripe !== null && <p className="gripe">{gripe}</p>}
            <div className="row">
              <button type="submit">Add fingerprint</button>
            </div>
          </form>
        )
        : <p className="quiet">This browser offers no passkeys, so no fingerprint unlock here.</p>}
    </section>
  )
}
