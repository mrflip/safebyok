import { useState } from 'react'
import { useBank, useVault, VaultLockControl } from 'safebyok-react'
import type { Auth, Session } from '../lib/auth'
import { isQuietRefusal } from '../lib/refusals'
import { WaysIn } from './WaysIn'

/** The signed-in user's account menu: who is signed in, the vault's lock and its ways in, sign-out and account deletion. */
export const AccountMenu = ({ auth, session }: { auth: Auth, session: Session }) => {
  const bank = useBank()
  const { stage, vault } = useVault('main')
  const [gripe, setGripe] = useState<string | null>(null)

  // Signing out locks the user's vaults on this device, and leaves them stored.
  const signOut = () => {
    bank?.lock()
    auth.signOut()
  }

  const deleteAccount = async () => {
    setGripe(null)
    // Until the bank has heard from storage, nobody knows whether a vault is there to delete.
    if (stage === 'waiting') { setGripe('Your vault is still loading: try again in a moment.'); return }
    if (stage === 'present') {
      // The vault's own dialog is the confirmation: it asks for the passphrase. A confirm() before
      // it could outlast the click's activation, and the dialog would then be dismissed unasked.
      const deleted = await vault.tryDelVaultPrompt()
      if (! deleted.ok) {
        if (! isQuietRefusal(deleted.err)) { setGripe(deleted.err.message) }
        return
      }
    } else if (! globalThis.confirm('Delete this account? It has no vault, so nothing else is lost.')) {
      return
    }
    await auth.deleteAccount()
  }

  return (
    <section className="account-menu" aria-label="Account">
      <div className="session-bar">
        <span>Signed in as <strong>{session.userlabel}</strong> <code className="quiet">({session.user_id})</code></span>
        <VaultLockControl vaultlabel="main" />
        <button onClick={signOut}>Sign out</button>
        <button className="danger" onClick={() => { void deleteAccount() }}>Delete account</button>
        {gripe !== null && <span className="gripe">{gripe}</span>}
      </div>
      <WaysIn />
    </section>
  )
}
