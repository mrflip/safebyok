import { browserOpts } from 'safebyok/browser'
import { BankProvider } from 'safebyok-react'
import { KnockKnock } from './components/KnockKnock'
import { SessionBar } from './components/SessionBar'
import { TroubleBoundary } from './components/TroubleBoundary'
import { VaultDashboard } from './components/VaultDashboard'
import { WaysIn } from './components/WaysIn'
import { DeviceDBInspectionPanel } from './components/inspection/DeviceDBInspectionPanel'
import { VaultDBInspectionPanel } from './components/inspection/VaultDBInspectionPanel'
import { createAuth } from './lib/auth'
import { Applabel, dbStore, deviceStore, vaultDB } from './lib/stores'
import { useSession } from './hooks/useSession'

// The demo's fake auth; a real app has its own (Google, Clerk, Convex...). All the vault needs
// from it is a stable userId.
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
      {session !== null && (
        <>
          <KnockKnock />
          <VaultDashboard />
          <WaysIn />
        </>
      )}

      <hr />
      {/* Demo-only inspection panels. To remove them: delete the two components below (and
          their imports), then delete src/components/inspection/. Nothing else references it. */}
      <VaultDBInspectionPanel />
      <DeviceDBInspectionPanel />
    </main>
  )
}

// A user who forgets the passphrase is to be offered a new vault from the dialog (allowStartOver),
// as a real app would once it has said a forgotten passphrase cannot be recovered. The provider
// takes it, and offers nothing yet.
export const App = () => {
  const session = useSession(auth)
  const userId = session?.userId ?? null
  return (
    <TroubleBoundary key={userId ?? 'signed-out'}>
      <BankProvider
        {...browserOpts({ dbName: Applabel })}
        applabel={Applabel}
        userId={userId}
        vaultDB={vaultDB}
        allowStartOver
      >
        <Page />
      </BankProvider>
    </TroubleBoundary>
  )
}
