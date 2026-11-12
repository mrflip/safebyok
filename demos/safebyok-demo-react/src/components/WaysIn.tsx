import { useState } from 'react'
import type { Outcome, Vault } from 'safebyok'
import { passkeysAvailable, useBankSnapshot, useVault } from 'safebyok-react'
import { isQuietRefusal } from '../lib/refusals'

/** The main vault's ways in (its passphrase, and its passkey if it has one), with buttons to change them. */
export const WaysIn = () => {
  const { stage, vault } = useVault('main')
  // The ways in are the bank's: its main gate holds the passphrase, and the passkey where there is one.
  const maingate = useBankSnapshot()?.maingate ?? null
  const [gripe, setGripe] = useState<string | null>(null)

  if (stage !== 'present' || maingate === null) { return null }
  const { main: passphrase_wayin, passkey0: passkey_wayin = null } = maingate.wayins

  // Each button calls a vault method, and the provider shows that method's dialog. The vault stays unlocked afterwards.
  const prompt = async (verb: () => Promise<Outcome<Vault>>) => {
    setGripe(null)
    const prompted = await verb()
    if (prompted.ok) { return }
    if (! isQuietRefusal(prompted.err)) { setGripe(prompted.err.message) }
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
        {/* The vault has one passkey at most: to replace it, the user removes it and adds another. */}
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
