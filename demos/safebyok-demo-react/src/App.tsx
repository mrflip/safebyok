import { BankProvider } from 'safebyok-react'
import { SessionBar } from './components/SessionBar'
import { TroubleBoundary } from './components/TroubleBoundary'
import { WaysIn } from './components/WaysIn'
import { createAuth } from './lib/auth'
import { Applabel, dbStore, deviceDB, deviceStore, device_id, keyDeriver, strengthChecker, vaultDB } from './lib/stores'
import { useSession } from './hooks/useSession'

// The demo's fake auth; a real app has its own (Google, Clerk, Convex...). All the vault needs
// from it is a stable user_id.
const auth = createAuth({ applabel: Applabel, dbStore, deviceStore })

const Page = () => {
  const session = useSession(auth)
  return (
    <main>
      <h1>safebyok playground</h1>
      <p className="quiet">
        A pretend app whose users bring their own API keys. Secrets live in boxes inside a
        per-user vault; the backend holds only what the vault writes through it.
      </p>
      <SessionBar auth={auth} />
      {session !== null && <WaysIn />}
    </main>
  )
}

export const App = () => {
  const session = useSession(auth)
  const user_id = session?.user_id ?? null
  return (
    <TroubleBoundary key={user_id ?? 'signed-out'}>
      <BankProvider
        applabel={Applabel}
        user_id={user_id}
        device_id={device_id}
        vaultDB={vaultDB}
        deviceDB={deviceDB}
        keyDeriver={keyDeriver}
        strengthChecker={strengthChecker}
      >
        <Page />
      </BankProvider>
    </TroubleBoundary>
  )
}
