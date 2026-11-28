import type { BankStage } from 'safebyok'
import { CreateVaultForm, UnlockDialog, UnlockForm } from 'safebyok-react/kit'
import { Envman } from '../lib/sok'
import { AddEnvForm } from './AddEnvForm'
import { EnvList } from './EnvList'

/** The page below the header, by the bank's stage. The unlock dialog is mounted at every stage, and opens while a value waits for the passphrase. */
export function EnvmanPage({ username }: Readonly<{ username: string | undefined }>) {
  const bank = Envman.useBank()
  return (
    <>
      {screenOf(bank.stage, username, bank.lastErr?.message)}
      <UnlockDialog username={username} />
    </>
  )
}

/** What the page shows at `stage`. */
function screenOf(stage: BankStage, username: string | undefined, failure: string | undefined) {
  switch (stage) {
  case 'signed_out': { return <p className="quiet">Sign in to start. Any username will do: there is no password.</p> }
  case 'starting': {   return <p role="status" className="quiet">Opening your vault…</p> }
  case 'unborn': {     return <CreateVault username={username} /> }
  case 'locked': {     return <Opened isLocked username={username} /> }
  case 'unlocked': {   return <Opened isLocked={false} username={username} /> }
  case 'failed': {     return <p role="alert" className="gripe">Your vault could not be opened: {failure}</p> }
  case 'disabled': {   return <p className="quiet">Reload the page to start again.</p> }
  }
}

/** The first visit: choose a passphrase, and the vault is made. */
function CreateVault({ username }: Readonly<{ username: string | undefined }>) {
  return (
    <section aria-labelledby="create-title">
      <h2 id="create-title">Create your vault</h2>
      <CreateVaultForm username={username} />
    </section>
  )
}

// One component for both stages, so a row waiting on the unlock dialog keeps its draft, and the list stays mounted.
/** The vault is stored: the list, at either stage. Locked, unlock it here, or focus a value and the unlock dialog asks; unlocked, Lock, and the add form. */
function Opened({ isLocked, username }: Readonly<{ isLocked: boolean, username: string | undefined }>) {
  return (
    <>
      {isLocked ? <LockedPanel username={username} /> : <UnlockedBar />}
      <EnvList />
      {! isLocked && <AddEnvForm />}
    </>
  )
}

/** The unlock form. */
function LockedPanel({ username }: Readonly<{ username: string | undefined }>) {
  return (
    <section aria-labelledby="locked-title" className="card">
      <h2 id="locked-title">Your vault is locked</h2>
      <UnlockForm username={username} />
    </section>
  )
}

/** Says the vault is unlocked, with Lock. */
function UnlockedBar() {
  return (
    <p className="row">
      Your vault is unlocked.
      <button type="button" onClick={Envman.lock}>Lock</button>
    </p>
  )
}
