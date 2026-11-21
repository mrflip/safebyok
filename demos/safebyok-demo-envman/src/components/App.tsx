import { QueryClientProvider } from '@tanstack/react-query'
import { useSession } from '../hooks/useSession'
import { SOK, queryClient } from '../lib/sok'
import { EnvmanPage } from './EnvmanPage'
import { SessionBar } from './SessionBar'

/** Envman: the host's QueryClient, the giver's provider told who is signed in, and the page. */
export function App() {
  const session = useSession()
  return (
    <QueryClientProvider client={queryClient}>
      <SOK.Provider userid={session?.userid}>
        <main>
          <header>
            <h1>Envman</h1>
            <SessionBar session={session} />
          </header>
          <EnvmanPage username={session?.username} />
        </main>
      </SOK.Provider>
    </QueryClientProvider>
  )
}
