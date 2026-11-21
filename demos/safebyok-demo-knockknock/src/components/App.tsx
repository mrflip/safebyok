import { QueryClientProvider } from '@tanstack/react-query'
import { useSession } from '../hooks/useSession'
import { SOK, queryClient } from '../lib/sok'
import { KnockKnock } from './KnockKnock'
import { SessionBar } from './SessionBar'

/** The Knock-Knock Machine: the host's QueryClient, the giver's provider told who is signed in, and the page. */
export function App() {
  const session = useSession()
  return (
    <QueryClientProvider client={queryClient}>
      <SOK.Provider userid={session?.userid}>
        <main>
          <header>
            <h1>Knock-Knock Machine</h1>
            <SessionBar session={session} />
          </header>
          <KnockKnock username={session?.username} />
        </main>
      </SOK.Provider>
    </QueryClientProvider>
  )
}
