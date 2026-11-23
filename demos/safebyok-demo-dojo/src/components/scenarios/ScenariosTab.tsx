import { useState } from 'react'
import { vaultDB } from '../../lib/dojo'
import { ApiKeyForm } from './ApiKeyForm'
import { ApiKeyClaims, type Claim, EnvmanClaims } from './claims'
import { EnvmanForm } from './EnvmanForm'

/** What each verdict reads as on the page. */
const VerdictTitles = { works: 'works', odd: 'works, with something odd', cannot: 'cannot today' } as const

/** The checklist beside a form: each claim of the Coach's, and what the dojo found of it today. */
function Checklist({ title, claims }: Readonly<{ title: string, claims: readonly Claim[] }>) {
  return (
    <table className="readout checklist" aria-label={title}>
      <thead><tr><th>Claim</th><th>Today</th><th>What was found</th></tr></thead>
      <tbody>
        {claims.map(({ claim, verdict, found }) => (
          <tr key={claim}><td>{claim}</td><td className={(verdict === 'works') ? undefined : 'gripe'}>{VerdictTitles[verdict]}</td><td>{found}</td></tr>
        ))}
      </tbody>
    </table>
  )
}

/** The Scenarios tab: two whole forms, each beside a checklist of the Coach's claims about it. */
export function ScenariosTab() {
  const [isSavedOnBlur, setIsSavedOnBlur] = useState(false)
  return (
    <section aria-labelledby="scenarios-title" className="card">
      <h2 id="scenarios-title">Scenarios: two forms as a user meets them</h2>
      <p className="quiet">
        Sign in as Hero. Each form&apos;s mirror is written by a script that is not React (<code>src/lib/mirror.ts</code>): what the secret input&apos;s
        {' '}<code>value</code> holds right now, and its <code>value</code> attribute. The page&apos;s unlock dialog opens when a reveal or a save waits for the passphrase.
        Each checklist is asserted under jsdom; nobody has yet looked at these forms in a real browser.
      </p>
      <p className="row">
        <button type="button" onClick={() => { vaultDB.holdNextWrite() }}>Hold the next write 6 s</button>
        <button type="button" onClick={() => { vaultDB.refuseNextWrite() }}>Refuse the next write</button>
        <span className="quiet">Each arms the dojo&apos;s vaultDB once, for whichever form writes next.</span>
      </p>

      <h3>Envman: an editor for a stored box</h3>
      <p className="quiet">
        Hero&apos;s box <code>github</code>, on <code>useDraft</code>: its username in the sidecar, its password in the whisper.
      </p>
      <label className="row">
        <input type="checkbox" checked={isSavedOnBlur} onChange={(event) => { setIsSavedOnBlur(event.target.checked) }} />
        Save when either field loses focus, in place of the Save button
      </label>
      <EnvmanForm isSavedOnBlur={isSavedOnBlur} />
      <Checklist title="Envman claims" claims={EnvmanClaims} />

      <h3>API key: a form for a new secret</h3>
      <p className="quiet">
        A new box, <code>scenario_apikey</code>, on <code>putBoxAction</code> and <code>WhisperInput</code>, as the Forms tab recommends; the box
        stored shows beneath it by <code>WhisperMask</code>.
      </p>
      <ApiKeyForm />
      <Checklist title="API key claims" claims={ApiKeyClaims} />
    </section>
  )
}
