import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, onTestFinished } from 'vitest'
import { cloak, isVaultError } from 'safebyok'
import * as LeanTH from 'safebyok/testing'
import { makeReactGiver } from '../../src/giver/react-giver'
import * as TH from '../test-helpers'

// Hue sits down at the knock-knock app, and the vault is locked. Hue types a line and hits enter; the app asks the joke
// service with the key in the vault, which first needs Hue's passphrase. These tests drive that path against the real core.

const Passphrase = LeanTH.TestPassphrase

/** A passphrase one letter off Hue's. */
const WrongPassphrase = 'correct horse battery stable'

/** Hue's app over `world`, as a host would write it beside its Device: the joke form, the unlock dialog, and every line sent to the joke service with its key. */
function makeKnockKnockApp(world: TH.KnockKnockWorld) {
  const { vault } = world
  const Giver = makeReactGiver(world.giverDevice)
  const Acme  = Giver.forBank(world.device.banklabel)
  const heard: string[] = []

  /** The joke service: it answers a line sent with its key. */
  function tellJoke(apiKey: unknown, line: string): string {
    if (apiKey !== TH.JokesKey) { throw new Error('The joke service refused the key') }
    heard.push(line)
    return `${line}? Who's there?`
  }

  /** A form that sends a line to the joke service, and shows the reply, or the refusal kind of a call that failed. */
  function JokeForm() {
    const ask = useMutation({
      mutationFn: (line: string) => vault.withWhisper(TH.JokesPath, ({ whisper }) => tellJoke(whisper['apiKey'], line)),
    })
    return (
      <form action={(form) => { ask.mutate(takeText(form, 'line')) }}>
        <input name="line" aria-label="Line" />
        <button>Tell</button>
        <output aria-label="Reply">{ask.data}</output>
        {isVaultError(ask.error) && <p aria-label="Refused">{ask.error.refusalkind}</p>}
      </form>
    )
  }

  /** The passphrase form: it submits through the unlock mutation, says why the last try failed, and cancels the wait. */
  function UnlockForm() {
    const unlock = Acme.useUnlock()
    return (
      <form action={(form) => { unlock.mutate(cloak({ passphraseCleartext: takeText(form, 'passphrase') })) }}>
        <input name="passphrase" type="password" autoComplete="current-password" aria-label="Passphrase" />
        <button disabled={unlock.isPending}>Unlock</button>
        <button type="button" onClick={() => { void Acme.dismissUnlock() }}>Cancel</button>
        {(unlock.error !== null) && <p role="alert">{unlockAlertOf(unlock.error)}</p>}
      </form>
    )
  }

  /** The unlock dialog, open while a call waits for the bank to be unlocked. */
  function UnlockDialog() {
    const isUnlockWanted = Acme.useBankSnapshot((snap) => snap.isUnlockWanted)
    if (! isUnlockWanted) { return null }
    return <dialog open aria-label="Unlock"><UnlockForm /></dialog>
  }

  /** The app: whether the vault is locked, whether its key is stored, the joke form and the unlock dialog. */
  function App() {
    Giver.useBridge()
    const isLocked = Acme.useBankSnapshot((snap) => snap.isLocked)
    const { data: record } = Acme.useBoxRecord(TH.JokesPath)
    return (
      <main>
        <p>{isLocked ? 'Locked' : 'Unlocked'}</p>
        <p>{record ? 'Key stored' : 'No key yet'}</p>
        <JokeForm />
        <UnlockDialog />
      </main>
    )
  }

  return { App, heard }
}

/** The unlock form's alert for `err`, its last refusal: a condition the user can mend at the field, anything else as a banner. */
function unlockAlertOf(err: unknown): string {
  if (! isVaultError(err) || (err.family !== 'condition')) { return 'Something went wrong. Please try again later.' }
  return (err.refusalkind === 'wrong_passphrase') ? 'That is not the passphrase.' : err.message
}

// React retains the FormData a form action is handed after the action ends: as the form's pending status, and in the
// action's queued update. A field removed before the first await is never in either.
/** Take the text of `form`'s field `fieldname` out of it, or '' for none. */
function takeText(form: FormData, fieldname: string): string {
  const val = form.get(fieldname)
  form.delete(fieldname)
  return (typeof val === 'string') ? val : ''
}

/** Hue's app over a fresh world, rendered under the test's own QueryClient. */
async function renderKnockKnock() {
  const world  = await TH.buildKnockKnockWorld()
  const app    = makeKnockKnockApp(world)
  const client = new QueryClient()
  onTestFinished(() => { client.clear() })
  const { container } = render(<QueryClientProvider client={client}><app.App /></QueryClientProvider>)
  const derivedBefore = world.deriver.heard
  /** Assert `passphrase` is in no snapshot the Device has published, in nothing React has of the tree, and in no item or mutation of the host's React Query. */
  function expectUnheld(passphrase: string): void {
    expect(world.snapshots.filter((snap) => TH.holdsText(snap, passphrase))).to.have.lengthOf(0)
    expect(TH.holdsText(TH.reactTreeOf(container), passphrase)).to.eq(false)
    const entries = [...client.getQueryCache().getAll(), ...client.getMutationCache().getAll()]
    expect(TH.holdsText(entries.map((entry) => entry.state), passphrase)).to.eq(false)
  }
  /** How many passphrases the key deriver has been given since the app was rendered. */
  function derivations(): number { return world.deriver.heard - derivedBefore }
  return { world, heard: app.heard, derivations, expectUnheld }
}

/** Send `line` from the joke form, as Hue typing it and pressing Tell. */
function tell(line: string): void {
  fireEvent.change(screen.getByLabelText('Line'), { target: { value: line } })
  fireEvent.click(screen.getByRole('button', { name: 'Tell' }))
}

/** Type `passphrase` into the open dialog and press Unlock. */
function typePassphrase(passphrase: string): void {
  fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
}

/** How many times the Device's snapshots have shown a call waiting for an `unlock` gating: each rise of `isUnlockWanted`. */
function unlockAsksOf(world: TH.KnockKnockWorld): number {
  let asks = 0
  let wasWanted = false
  for (const snap of world.snapshots) {
    if (! wasWanted && snap.bank.isUnlockWanted) { asks += 1 }
    wasWanted = snap.bank.isUnlockWanted
  }
  return asks
}

describe("the knock-knock app", () => {
  it("asks for the passphrase before telling a joke that needs the locked vault's key", async () => {
    const { world, heard, derivations, expectUnheld } = await renderKnockKnock()
    expect(screen.getByText('Locked')).to.exist
    await screen.findByText('Key stored')
    tell('Knock knock')
    await screen.findByRole('dialog', { name: 'Unlock' })
    expect(heard).to.deep.equal([])

    const release = world.deriver.hold()
    typePassphrase(Passphrase)
    await waitFor(() => { expect(derivations()).to.eq(1) })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Unlock' }).disabled).to.eq(true)
    expectUnheld(Passphrase)
    release()

    await waitFor(() => { expect(screen.getByLabelText('Reply').textContent).to.eq("Knock knock? Who's there?") })
    expect(screen.queryByRole('dialog')).to.be.null
    expect(screen.getByText('Unlocked')).to.exist
    expect(heard).to.deep.equal(['Knock knock'])
    expectUnheld(Passphrase)
  })

  it("tells the next line without asking again while the vault stays unlocked", async () => {
    const { world, heard, derivations } = await renderKnockKnock()
    tell('Knock knock')
    await screen.findByRole('dialog', { name: 'Unlock' })
    typePassphrase(Passphrase)
    await waitFor(() => { expect(heard).to.deep.equal(['Knock knock']) })
    tell('Lettuce')
    await waitFor(() => { expect(screen.getByLabelText('Reply').textContent).to.eq("Lettuce? Who's there?") })
    expect(unlockAsksOf(world)).to.eq(1)
    expect(derivations()).to.eq(1)
  })

  it("keeps the dialog open for another try after a wrong passphrase", async () => {
    const { world, heard, expectUnheld } = await renderKnockKnock()
    tell('Knock knock')
    await screen.findByRole('dialog', { name: 'Unlock' })
    typePassphrase(WrongPassphrase)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).to.eq('That is not the passphrase.')
    expect(screen.getByLabelText<HTMLInputElement>('Passphrase').value).to.eq('')
    expect(screen.getByText('Locked')).to.exist
    expect(heard).to.deep.equal([])
    expectUnheld(WrongPassphrase)

    typePassphrase(Passphrase)
    await waitFor(() => { expect(heard).to.deep.equal(['Knock knock']) })
    expect(unlockAsksOf(world)).to.eq(1)
    expectUnheld(Passphrase)
  })

  it("answers a second line sent while the dialog is open with the same unlock", async () => {
    const { world, heard, derivations, expectUnheld } = await renderKnockKnock()
    tell('Knock knock')
    await screen.findByRole('dialog', { name: 'Unlock' })
    tell('Boo')
    await waitFor(() => { expect(screen.getAllByRole('dialog')).to.have.lengthOf(1) })
    typePassphrase(Passphrase)
    await waitFor(() => { expect(heard).to.have.members(['Knock knock', 'Boo']) })
    expect(unlockAsksOf(world)).to.eq(1)
    expect(derivations()).to.eq(1)
    expectUnheld(Passphrase)
  })

  it("refuses the joke as dismissed when Hue cancels the dialog, and leaves the vault locked", async () => {
    const { heard, derivations } = await renderKnockKnock()
    tell('Knock knock')
    await screen.findByRole('dialog', { name: 'Unlock' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(screen.getByLabelText('Refused').textContent).to.eq('dismissed') })
    expect(screen.queryByRole('dialog')).to.be.null
    expect(screen.getByText('Locked')).to.exist
    expect(heard).to.deep.equal([])
    expect(derivations()).to.eq(0)
  })
})
