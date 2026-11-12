import { DevBoxInspector, DevDeviceDBInspector } from 'safebyok-react/devmode'
import { DemoShell } from '../components/DemoShell'
import { KnockKnockWidget } from '../components/KnockKnockWidget'
import { KnockKnockToolkit } from '../components/KnockKnockToolkit'
import { KnockKnockDom } from '../components/KnockKnockDom'
import { OutageSwitch } from '../components/OutageSwitch'
import { bankDB, bankOpts } from '../lib/storage'

/** The labs page: the three ways to build the machine side by side, with developer control panels below them. */
export const LabsPage = () => (
  <DemoShell
    otherPage={<a href="./">Back to the app</a>}
    below={(
      <aside className="dev-tools" aria-label="Developer tools">
        <h2>Behind the scenes</h2>
        <OutageSwitch bankDB={bankDB} />
        <DevBoxInspector defaultBoxlabel="anthropic_api_key" />
        <DevDeviceDBInspector deviceDB={bankOpts.deviceDB} />
      </aside>
    )}
  >
    <div className="flows">
      <KnockKnockWidget />
      <KnockKnockToolkit />
      <KnockKnockDom />
    </div>
  </DemoShell>
)
