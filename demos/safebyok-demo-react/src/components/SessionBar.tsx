import { useState } from 'react'
import type { Auth, Session } from '../lib/auth'
import { keepStorage } from '../lib/persist-storage'
import { AccountMenu } from './AccountMenu'

/** The app's sign-in strip while signed out, and the signed-in user's account menu after.
 * Typing a username signs you in (or up); there is no password, because the demo's point is that
 * the vault passphrase is a separate thing from signing in. Signing in asks the browser to keep
 * this site's storage, on the user's gesture.
 */
export const SessionBar = ({ auth, session }: { auth: Auth, session: Session | null }) => {
  const [userlabelText, setUserlabelText] = useState('')
  const [gripe, setGripe] = useState<string | null>(null)

  if (session !== null) { return <AccountMenu auth={auth} session={session} /> }

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

  return (
    <div className="session-bar">
      <input
        placeholder="username"
        aria-label="username"
        value={userlabelText}
        onChange={(evt) => { setUserlabelText(evt.target.value) }}
        onKeyDown={(evt) => { if (evt.key === 'Enter') { void signIn() } }}
      />
      <button onClick={() => { void signIn() }}>Sign in</button>
      {gripe !== null && <span className="gripe">{gripe}</span>}
    </div>
  )
}
