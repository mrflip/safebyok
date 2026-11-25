import { useId, useState } from 'react'
import { ModalDialog, UnlockForm } from 'safebyok-react/kit'
import { Dojo } from '../lib/dojo'
import { Fixture } from '../lib/fixture'
import { resetStores, signinAs, signOut } from '../lib/session'

/** Who is signed in and the bank's stage, Lock/Unlock, Sign out, Reset, and a button for each fixture user, with their passphrase. */
export function Header({ userid }: Readonly<{ userid: string | null }>) {
  const world = Dojo.useWorld()
  return (
    <header>
      <h1>Dojo</h1>
      <p className="row">
        {(userid === null) ? 'Nobody is signed in.' : <>Signed in as <strong>{userid}</strong></>}
        <span>Stage: <strong>{world.stage}</strong></span>
        {(world.lastErr !== null) && <span className="gripe">{world.lastErr.message}</span>}
      </p>
      <div className="row">
        <LockButton />
        <button type="button" onClick={signOut}>Sign out</button>
        <button type="button" onClick={resetStores}>Reset</button>
      </div>
      <ul className="users">
        {Fixture.users.map((user) => (
          <li key={user.userid}>
            <button type="button" onClick={() => { signinAs(user.userid) }}>{user.title}</button>
            {' '}<span className="quiet">{user.blurb} Passphrase: <code>{user.passphrase}</code></span>
          </li>
        ))}
      </ul>
    </header>
  )
}

/** Lock an unlocked bank; on a locked one, ask for the passphrase in a dialog, with the kit's unlock form. */
function LockButton() {
  const stage = Dojo.useWorld((snap) => snap.stage)
  const [isAsking, setIsAsking] = useState(false)
  const titleId = useId()
  Dojo.useStageChange((nextStage) => { if (nextStage !== 'locked') { setIsAsking(false) } })
  if (stage === 'unlocked') { return <button type="button" onClick={Dojo.lock}>Lock</button> }
  return (
    <>
      <button type="button" disabled={stage !== 'locked'} onClick={() => { setIsAsking(true) }}>Unlock</button>
      {isAsking && (stage === 'locked') && (
        <ModalDialog labelledBy={titleId} onCancel={() => { setIsAsking(false) }}>
          <h2 id={titleId}>Unlock</h2>
          <UnlockForm onCancel={() => { setIsAsking(false) }} />
        </ModalDialog>
      )}
    </>
  )
}
