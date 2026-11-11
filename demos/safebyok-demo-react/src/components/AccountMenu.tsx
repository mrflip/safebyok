import { useState } from 'react'
import { useBank, useVault, VaultLockControl } from 'safebyok-react'
import type { Auth, Session } from '../lib/auth'
import { isQuietRefusal } from '../lib/refusals'
import { WaysIn } from './WaysIn'

/** The signed-in user's account menu: who is signed in, the vault's lock control, its ways in, and buttons to sign out or delete the account. */
export const AccountMenu = ({ auth, session }: { auth: Auth, session: Session }) => {
  const bank = useBank()
  const { stage, vault } = useVault('main')
  const [gripe, setGripe] = useState<string | null>(null)

  // Signing out locks the user's vaults on this device. Nothing stored is deleted.
  const signOut = () => {
    bank?.lock()
    auth.signOut()
  }

  const deleteAccount = async () => {
    setGripe(null)
    // Until the bank has loaded from storage, we can't tell whether there is a vault to delete.
    if (stage === 'waiting') { setGripe('Your vault is still loading: try again in a moment.'); return }
    if (stage === 'present') {
      // The vault's own dialog is the confirmation, because it asks for the passphrase. Don't put a confirm()
      // before it: the click's user activation could expire while confirm() waits, and the dialog would
      // then be dismissed without asking the user.
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
