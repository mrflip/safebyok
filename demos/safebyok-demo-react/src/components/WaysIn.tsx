import { useRef, useState } from 'react'
import { createPasskey, passkeysAvailable, useVault, useVaultSnapshot } from 'safebyok-react'

/**
 * The vault's two ways in -- its one passphrase, and its passkey if it has one, shown even while
 * locked -- and a form to change them. Every change takes the passphrase as it stands as its
 * proof, even unlocked: `vault.changePassphrase(passphrase, newPassphrase)`;
 * `vault.addPasskey(passphrase, makePasskey)`, which checks the passphrase before it calls
 * `makePasskey`, `createPasskey()`, and replaces the passkey the vault had; and
 * `vault.delWayin(passphrase)`, which removes it. With a passkey, the passphrase dialog offers
 * "Use a passkey".
 */
export const WaysIn = () => {
  const vault = useVault()
  const snapshot = useVaultSnapshot()
  // The passphrase fields are uncontrolled, so React never writes them into the page, and read at
  // the press, so a password manager's autofill counts even when it sends no input event.
  const formRef = useRef<HTMLFormElement>(null)
  const passphraseRef = useRef<HTMLInputElement>(null)
  const newPassphraseRef = useRef<HTMLInputElement>(null)
  const [gripe, setGripe] = useState<string | null>(null)

  if (vault === null || snapshot === null) { return null }
  // Null until a read finds the vault: there is nothing to change yet.
  const { passphrase, passkey } = snapshot
  if (passphrase === null) { return null }

  /** Runs `change` with the passphrase as typed, then empties the form; a refusal shows as the gripe, the fields kept. */
  const press = async (change: (standing: string) => Promise<unknown>) => {
    setGripe(null)
    try {
      // addPasskey resolves false when the user dismissed the prompt: nothing changed, so the fields stay.
      if (await change(passphraseRef.current?.value ?? '') === false) { return }
      formRef.current?.reset()
    } catch (err) {
      setGripe(err instanceof Error ? err.message : 'Could not make that change.')
    }
  }
  const changePassphrase = () => press((standing) => vault.changePassphrase(standing, newPassphraseRef.current?.value ?? ''))
  const makePasskey = () => createPasskey({ rp: { name: 'safebyok playground' }, user: { name: snapshot.user_id, displayName: snapshot.user_id } })
  const addFingerprint = () => press((standing) => vault.addPasskey(standing, makePasskey))
  const removeFingerprint = () => press((standing) => vault.delWayin(standing))

  return (
    <section className="ways-in">
      <h2>Ways in</h2>
      <ul>
        <li>passphrase <span className="quiet">set {new Date(passphrase.registered_at).toLocaleString()}</span></li>
        <li>
          {passkey === null
            ? <span className="quiet">no passkey</span>
            : <>passkey <span className="quiet">added {new Date(passkey.registered_at).toLocaleString()}</span></>}
        </li>
      </ul>
      <form ref={formRef} className="box-form" onSubmit={(evt) => { evt.preventDefault() }}>
        {/* What a password manager files the passphrase under, as the passphrase dialog names it. */}
        <input type="text" name="username" autoComplete="username" value={`${snapshot.user_id} (${snapshot.vaultlabel} vault)`} readOnly hidden style={{ display: 'none' }} />
        <label>
          your passphrase <span className="quiet">(the proof any change here asks for)</span>
          <input ref={passphraseRef} type="password" name="current-password" autoComplete="current-password" />
        </label>
        <label>
          new passphrase <span className="quiet">(to change it)</span>
          <input ref={newPassphraseRef} type="password" name="new-password" autoComplete="new-password" />
        </label>
        {gripe !== null && <p className="gripe">{gripe}</p>}
        <div className="row">
          <button type="button" onClick={() => { void changePassphrase() }}>Change passphrase</button>
          {passkeysAvailable() && (
            <button type="button" onClick={() => { void addFingerprint() }}>{passkey === null ? 'Add fingerprint' : 'Replace fingerprint'}</button>
          )}
          {passkey !== null && <button type="button" onClick={() => { void removeFingerprint() }}>Remove fingerprint</button>}
        </div>
        {! passkeysAvailable() && <p className="quiet">This browser offers no passkeys, so no fingerprint unlock here.</p>}
      </form>
    </section>
  )
}
