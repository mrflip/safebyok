import { BankProvider } from 'safebyok-react'
import { KnockKnockExposed } from './components/KnockKnockExposed'
import { KnockKnockFields } from './components/KnockKnockFields'
import { OutageSwitch } from './components/OutageSwitch'
import { SessionBar } from './components/SessionBar'
import { TroubleBoundary } from './components/TroubleBoundary'
import { useSession } from './hooks/useSession'
import { createAuth, type Session } from './lib/auth'
import { Applabel, bankOpts, dbStore, deviceStore, vaultDB } from './lib/stores'

// The demo's fake auth; a real app has its own (Google, Clerk, Convex...). All the vault needs
// from it is a stable user_id.
const auth = createAuth({ applabel: Applabel, dbStore, deviceStore })

/** The app: the account strip, the knock-knock machines side by side, and the developer's tools below them. */
const Page = ({ session }: { session: Session | null }) => (
  <main>
    <header className="app-header">
      <h1>Knock-Knock Machine</h1>
      <p className="quiet">
        Bring your own Anthropic API key and Claude finishes your knock-knock jokes. The key is
        encrypted on this device, in a vault only your passphrase opens.
      </p>
      <SessionBar auth={auth} session={session} />
    </header>
    {session === null
      ? <p className="quiet">Sign in to keep a key and knock.</p>
      : (
        <div className="flows">
          <KnockKnockFields />
          <KnockKnockExposed />
        </div>
      )}
    <aside className="dev-tools" aria-label="Developer tools">
      <h2>Behind the scenes</h2>
      <OutageSwitch vaultDB={vaultDB} />
    </aside>
  </main>
)

export const App = () => {
  const session = useSession(auth)
  const user_id = session?.user_id ?? null
  return (
    <TroubleBoundary key={user_id ?? 'signed-out'}>
      <BankProvider {...bankOpts} user_id={user_id}>
        <Page session={session} />
      </BankProvider>
    </TroubleBoundary>
  )
}
