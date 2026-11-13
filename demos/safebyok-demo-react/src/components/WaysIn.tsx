import { useState, useSyncExternalStore } from 'react'
import type { Gate, Outcome } from 'safebyok'
import { passkeysAvailable, useBank } from 'safebyok-react'
import { isQuietRefusal } from '../lib/refusals'

function unsubscribeFromNothing(): void { /* nothing to unsubscribe from */ }
function subscribeToNothing(): () => void { return unsubscribeFromNothing }
function getNothing(): null { return null }

/** The bank's ways in (its passphrase, and its passkey if it has one), with buttons to change them. */
export const WaysIn = () => {
  const bank = useBank()
  // The ways in are the bank's: its main gate holds the passphrase, and the passkey where there is one.
  const gate = bank?.gateListing.at({ ...bank.scope, gatelabel: 'main' }) ?? null
  const maingate = useSyncExternalStore(gate?.subscribe ?? subscribeToNothing, gate?.getSnapshot ?? getNothing)
  const [gripe, setGripe] = useState<string | null>(null)

  if ((bank === null) || (maingate === null)) { return null }
  const { main: passphrase_wayin, passkey0: passkey_wayin = null } = maingate.wayins

  // Each button calls a method of the bank's main gate, and the provider shows that method's dialog. The bank is unlocked afterwards.
  const prompt = async (verb: () => Promise<Outcome<Gate>>) => {
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
        <button type="button" onClick={() => { void prompt(() => bank.maingate.tryReplacePassphrasePrompt()) }}>Change passphrase</button>
        {/* The bank has one passkey at most: to replace it, the user removes it and adds another. */}
        {passkeysAvailable() && passkey_wayin === null && (
          <button type="button" onClick={() => { void prompt(() => bank.maingate.tryAddPasskeyPrompt()) }}>Add fingerprint</button>
        )}
        {passkeysAvailable() && passkey_wayin !== null && (
          <button type="button" onClick={() => { void prompt(() => bank.maingate.tryRevokePasskeyPrompt()) }}>Remove fingerprint</button>
        )}
      </div>
    </section>
  )
}
