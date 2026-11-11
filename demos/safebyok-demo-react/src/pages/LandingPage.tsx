import { DemoShell } from '../components/DemoShell'
import { KnockKnockWidget } from '../components/KnockKnockWidget'

/** The landing page: the knock-knock machine as an app would ship it, with no developer tools. */
export const LandingPage = () => (
  <DemoShell otherPage={<a href="labs.html">The labs: three ways to build this, with control panels</a>}>
    <div className="flows">
      <KnockKnockWidget />
    </div>
  </DemoShell>
)
