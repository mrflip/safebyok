import { useState } from 'react'
import { BankLockControl, CreateVaultButton, useBank, useDevice, useVault } from 'safebyok-react'
import type { Auth, Session } from '../lib/auth'
import { isQuietRefusal } from '../lib/refusals'
import { WaysIn } from './WaysIn'

/** The signed-in user's account menu: who is signed in, the bank's lock control, its ways in, and buttons to sign out or delete the account. */
export const AccountMenu = ({ auth, session }: { auth: Auth, session: Session }) => {
  const device = useDevice()
  const bank = useBank()
  const { stage } = useVault('main')
  const [gripe, setGripe] = useState<string | null>(null)

  // Signing out vacates the device: the bank locks, and this device forgets its unlock. Nothing stored is deleted.
  const signOut = () => {
    void device?.vacate()
    auth.signOut()
  }

  const deleteAccount = async () => {
    setGripe(null)
    if (bank === null) {
      if (! globalThis.confirm('Delete this account? It has no vault, so nothing else is lost.')) { return }
      await auth.deleteAccount()
      return
    }
    // The provider's dialog asks for the passphrase, which deletes the bank, every vault in it and their boxes.
    const deleted = await bank.tryDelPrompt()
    if (! deleted.ok) {
      if (! isQuietRefusal(deleted.err)) { setGripe(deleted.err.message) }
      return
    }
    await auth.deleteAccount()
  }

  return (
    <section className="account-menu" aria-label="Account">
      <div className="session-bar">
        <span>Signed in as <strong>{session.userlabel}</strong> <code className="quiet">({session.user_id})</code></span>
        <BankLockControl />
        {stage === 'absent' && <CreateVaultButton vaultlabel="main" />}
        <button onClick={signOut}>Sign out</button>
        <button className="danger" onClick={() => { void deleteAccount() }}>Delete account</button>
        {gripe !== null && <span className="gripe">{gripe}</span>}
      </div>
      <WaysIn />
    </section>
  )
}
