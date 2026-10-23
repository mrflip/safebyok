import { useState } from 'react'
import { passkeysAvailable, useVault, useVaultSnapshot } from 'safebyok-react'

/**
 * The vault's two ways in -- its one passphrase, and its passkey if it has one, shown even while
 * locked -- and the buttons that change them. Each raises its gating, which the app's
 * `requestCleartext` answers with the passphrase: `vault.putWayin('passphrase')`, which removes
 * the passkey with the old passphrase; `vault.putWayin('passkey')`, which replaces the passkey the
 * vault had; and `vault.delWayin('passkey')`, which removes it. `BankProvider`'s own dialog answers
 * only unlocks for now, so here each change is declined until the dialogs for them land. With a
 * passkey, the passphrase dialog offers "Use a passkey".
 */
export const WaysIn = () => {
  const vault = useVault('main')?.vault ?? null
  const snapshot = useVaultSnapshot('main')
  const [gripe, setGripe] = useState<string | null>(null)

  if (vault === null || snapshot === null) { return null }
  // Null until a read finds the vault: there is nothing to change yet.
  const { passphrase, passkey } = snapshot
  if (passphrase === null) { return null }

  /** Runs `change`; a refusal shows as the gripe. */
  const press = async (change: () => Promise<unknown>) => {
    setGripe(null)
    try {
      await change()
    } catch (err) {
      setGripe(err instanceof Error ? err.message : 'Could not make that change.')
    }
  }

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
