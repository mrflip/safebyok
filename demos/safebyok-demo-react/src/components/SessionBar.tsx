import { useState } from 'react'
import { useBank } from 'safebyok-react'
import { useSession } from '../hooks/useSession'
import type { Auth } from '../lib/auth'
import { keepStorage } from '../lib/persist-storage'

/** The app's sign-in strip.
 * Typing a username signs you in (or up); there is no password, because
 * the demo's point is that the vault passphrase is a separate thing from signing in. Signing in
 * asks the browser to keep this site's storage, on the user's gesture. Signing out locks the
 * user's vaults on this device.
 */
export const SessionBar = ({ auth }: { auth: Auth }) => {
  const session = useSession(auth)
  const bank = useBank()
  const [userlabelText, setUserlabelText] = useState('')
  const [gripe, setGripe] = useState<string | null>(null)

  const signIn = async () => {
    // The vault lives in this browser's IndexedDB, which the browser may evict unless asked not
    // to: asked here, on the user's own click, since a browser may prompt for it.
    void keepStorage()
    try {
      await auth.signIn(userlabelText.trim())
      setUserlabelText('')
      setGripe(null)
    } catch (err) {
      setGripe(err instanceof Error ? err.message : 'Could not sign in.')
    }
  }

  if (session === null) {
    return (
      <div className="session-bar">
        <input
          placeholder="username"
          value={userlabelText}
          onChange={(evt) => { setUserlabelText(evt.target.value) }}
          onKeyDown={(evt) => { if (evt.key === 'Enter') { void signIn() } }}
        />
        <button onClick={() => { void signIn() }}>Sign in</button>
        {gripe !== null && <span className="gripe">{gripe}</span>}
      </div>
    )
  }

  const signOut = () => {
    bank?.lock()
    auth.signOut()
  }

  return (
    <div className="session-bar">
      <span>Signed in as <strong>{session.userlabel}</strong> <code className="quiet">({session.user_id})</code></span>
      <button onClick={signOut}>Sign out</button>
    </div>
  )
}
