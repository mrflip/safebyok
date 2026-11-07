import { useState } from 'react'
import type { Outcome, Vault } from 'safebyok'
import { passkeysAvailable, useVault, useVaultSnapshot } from 'safebyok-react'

/** The main vault's ways in -- its passphrase, and its passkey if it has one -- and the buttons that change them. */
export const WaysIn = () => {
  const { stage, vault } = useVault('main')
  // Heard for its changes: a replaced passphrase or a passkey added is a new revision, and the gate is read anew.
  useVaultSnapshot('main')
  const [gripe, setGripe] = useState<string | null>(null)

  if (stage !== 'present') { return null }
  const { passphrase_wayin, passkey_wayin } = vault.gate.toJSON()

  // Each button calls a vault verb, whose dialog the provider shows; the vault is left unlocked.
  const prompt = async (verb: () => Promise<Outcome<Vault>>) => {
    setGripe(null)
    const prompted = await verb()
    if (prompted.ok) { return }
    // A dialog the user cancelled, or a lock closed, has nothing to say.
    const { refusalkind, message } = prompted.err
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
        <button type="button" onClick={() => { void prompt(() => vault.tryReplacePassphrasePrompt()) }}>Change passphrase</button>
        {/* The vault holds one passkey at most: to replace it, the user removes it and adds another. */}
        {passkeysAvailable() && passkey_wayin === null && (
          <button type="button" onClick={() => { void prompt(() => vault.tryAddPasskeyPrompt()) }}>Add fingerprint</button>
        )}
        {passkeysAvailable() && passkey_wayin !== null && (
          <button type="button" onClick={() => { void prompt(() => vault.tryRevokePasskeyPrompt()) }}>Remove fingerprint</button>
        )}
      </div>
    </section>
  )
}
