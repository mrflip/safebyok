import { useState } from 'react'
import { useVault, useVaultSnapshot } from 'safebyok-react'

/** The main vault's ways in -- its passphrase, and its passkey if it has one -- and the button that changes the passphrase. */
export const WaysIn = () => {
  const { stage, vault } = useVault('main')
  // Heard for its changes: a replaced passphrase is a new revision, and the gate is read anew.
  useVaultSnapshot('main')
  const [gripe, setGripe] = useState<string | null>(null)

  if (stage !== 'present') { return null }
  const { passphrase_wayin, passkey_wayin } = vault.gate.toJSON()

  const changePassphrase = async () => {
    setGripe(null)
    // The provider's dialog asks for the passphrase in use and the next; the vault is left unlocked.
    const replaced = await vault.tryReplacePassphrasePrompt()
    if (replaced.ok) { return }
    // A dialog the user cancelled, or a lock closed, has nothing to say.
    const { refusalkind, message } = replaced.err
    if (refusalkind !== 'declined' && refusalkind !== 'locked_while_asking') { setGripe(message) }
  }

  return (
    <section className="ways-in">
      <h2>Vault unlockers</h2>
      <ul>
        <li>passphrase <span className="quiet">set {new Date(passphrase_wayin.registered_at).toLocaleString()}</span></li>
        <li>
          {passkey_wayin === null
            ? <span className="quiet">no passkey</span>
            : <>passkey <span className="quiet">added {new Date(passkey_wayin.registered_at).toLocaleString()}</span></>}
        </li>
      </ul>
      {gripe !== null && <p className="gripe">{gripe}</p>}
      <div className="row">
        <button type="button" onClick={() => { void changePassphrase() }}>Change passphrase</button>
      </div>
    </section>
  )
}
