import { useState } from 'react'
import { isVaultError } from 'safebyok'
import { passkeysAvailable, useVault, useVaultSnapshot } from 'safebyok-react'

/**
 * The vault's two ways in -- its one passphrase, and its passkey if it has one, shown even while
 * locked, under the heading "Vault unlockers", as the user is shown them -- and the buttons that
 * change them. Each launches its gating, which the provider's own
 * dialog answers, proven by the passphrase: `vault.putWayin('passphrase')` asks for the current
 * passphrase and the next (typed twice), and removes the passkey with the old one; `vault.putWayin('passkey')`
 * asks for the passphrase, then has the browser make a passkey, which replaces the one the vault
 * had; and `vault.delWayin('passkey')` asks for the passphrase to remove it. A change the user
 * cancels refuses 'vault_locked', and changes nothing: nothing to say. With a passkey, the
 * passphrase dialog offers "Use a passkey".
 */
export const WaysIn = () => {
  const vault = useVault('main')
  const snapshot = useVaultSnapshot('main')
  const [gripe, setGripe] = useState<string | null>(null)

  // No gate until the first passphrase is set: there is nothing to change yet.
  const gate = snapshot?.gate ?? null
  if (vault === null || gate === null) { return null }
  const { passphrase, passkey } = gate

  /** Runs `change`; a refusal shows as the gripe, but for a dialog the user cancelled. */
  const press = async (change: () => Promise<unknown>) => {
    setGripe(null)
    try {
      await change()
    } catch (err) {
      if (isVaultError(err, 'vault_locked')) { return }
      setGripe(err instanceof Error ? err.message : 'Could not make that change.')
    }
  }

  return (
    <section className="ways-in">
      <h2>Vault unlockers</h2>
      <ul>
        <li>passphrase <span className="quiet">set {new Date(passphrase.registered_at).toLocaleString()}</span></li>
        <li>
          {passkey === null
            ? <span className="quiet">no passkey</span>
            : <>passkey <span className="quiet">added {new Date(passkey.registered_at).toLocaleString()}</span></>}
        </li>
      </ul>
      {gripe !== null && <p className="gripe">{gripe}</p>}
      <div className="row">
        <button type="button" onClick={() => { void press(async () => await vault.putWayin('passphrase')) }}>Change passphrase</button>
        {passkeysAvailable() && (
          <button type="button" onClick={() => { void press(async () => await vault.putWayin('passkey')) }}>{passkey === null ? 'Add fingerprint' : 'Replace fingerprint'}</button>
        )}
        {passkey !== null && <button type="button" onClick={() => { void press(async () => await vault.delWayin('passkey')) }}>Remove fingerprint</button>}
      </div>
      {! passkeysAvailable() && <p className="quiet">This browser offers no passkeys, so no fingerprint unlock here.</p>}
    </section>
  )
}
