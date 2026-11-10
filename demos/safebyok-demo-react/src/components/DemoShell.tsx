import type { ReactNode } from 'react'
import { BankProvider } from 'safebyok-react'
import { useSession } from '../hooks/useSession'
import { createAuth } from '../lib/auth'
import { Applabel, bankOpts, dbStorage, deviceStorage } from '../lib/storage'
import { SessionBar } from './SessionBar'
import { TroubleBoundary } from './TroubleBoundary'

// The demo's fake auth; a real app has its own (Google, Clerk, Convex...). All the vault needs
// from it is a stable user_id.
const auth = createAuth({ applabel: Applabel, dbStorage, deviceStorage })

/** What a page hands the shell: the link to the other page, what a signed-in user sees, and anything below that. */
export type DemoShellProps = { otherPage: ReactNode, children: ReactNode, below?: ReactNode }

/** A demo page's frame: the bank, the header with its sign-in strip, and the page's own content once somebody is signed in. */
export const DemoShell = ({ otherPage, children, below }: DemoShellProps) => {
  const session = useSession(auth)
  const user_id = session?.user_id ?? null
  return (
    <TroubleBoundary key={user_id ?? 'signed-out'}>
      <BankProvider {...bankOpts} user_id={user_id}>
        <main>
          <header className="app-header">
            <h1>Knock-Knock Machine</h1>
            <p className="quiet">
              Bring your own Anthropic API key and Claude finishes your knock-knock jokes. The key is
              encrypted on this device, in a vault only your passphrase opens.
            </p>
            <SessionBar auth={auth} session={session} />
            <p>{otherPage}</p>
          </header>
          {session === null ? <p className="quiet">Sign in to keep a key and knock.</p> : children}
          {below}
        </main>
      </BankProvider>
    </TroubleBoundary>
  )
}
