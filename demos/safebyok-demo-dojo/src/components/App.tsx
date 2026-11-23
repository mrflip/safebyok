import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { SOK, hostQueryClient } from '../lib/dojo'
import { sessionUserid } from '../lib/session'
import { Header } from './Header'
import { InspectTab } from './InspectTab'
import { LoginTab } from './LoginTab'
import { NewBoxTab } from './NewBoxTab'

/** The tabs, in order, with their titles. */
const TabTitles = { login: 'Login', box: 'New Box', inspect: 'Inspect' } as const

/** One of the tabs. */
type Tabkind = keyof typeof TabTitles

/** The localStorage key of the tab shown, kept across the reload each change of user makes. */
const TabCkey = 'dojo:tab'

/** The tab shown when the page loads: the one shown before the reload, or Login. */
function initialTab(): Tabkind {
  const saved = localStorage.getItem(TabCkey)
  return ((saved !== null) && Object.hasOwn(TabTitles, saved)) ? saved as Tabkind : 'login'
}

/** The dojo: the host's QueryClient, the giver's provider told who is signed in, the header, and the tabs. Each tab stays mounted while hidden, so a form keeps what it showed. */
export function App() {
  const userid = sessionUserid()
  const [tab, setTab] = useState<Tabkind>(initialTab)
  /** Show `nextTab`, and remember it across reloads. */
  function show(nextTab: Tabkind) {
    localStorage.setItem(TabCkey, nextTab)
    setTab(nextTab)
  }
  return (
    <QueryClientProvider client={hostQueryClient}>
      <SOK.Provider userid={userid}>
        <main>
          <Header userid={userid} />
          <nav className="row" aria-label="Tabs">
            {(Object.keys(TabTitles) as Tabkind[]).map((tabkind) => (
              <button key={tabkind} type="button" aria-pressed={tab === tabkind} onClick={() => { show(tabkind) }}>{TabTitles[tabkind]}</button>
            ))}
          </nav>
          <div hidden={tab !== 'login'}><LoginTab userid={userid} /></div>
          <div hidden={tab !== 'box'}><NewBoxTab userid={userid} /></div>
          <div hidden={tab !== 'inspect'}><InspectTab isShown={tab === 'inspect'} /></div>
        </main>
      </SOK.Provider>
    </QueryClientProvider>
  )
}
