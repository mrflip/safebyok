import { useMutation } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { type BankSnapshot, isVaultError } from 'safebyok'
import * as LeanTH from 'safebyok/testing'
import { popField } from '../../src/index'
import * as TH from '../test-helpers'

// Hue sits down at the knock-knock app. The first time, there is no vault yet: Hue creates one with a new passphrase, and
// locks it. Later the vault is locked, with the joke service's key in it. Hue types a line and hits enter; the app asks the
// joke service with the key, which first needs Hue's passphrase. These tests drive that path against the real core,
// through the real giver and its provider.

const Passphrase = LeanTH.TestPassphrase

/** A passphrase one letter off Hue's. */
const WrongPassphrase = 'correct horse battery stable'

/** A new passphrase, an obvious fake, that the world's strength checker finds strong. */
const NewPassphrase = 'a fake new passphrase'

/** Hue's app over `world`'s giver, as a host would write it at module scope: the stage switch, the create-vault form, the joke form, the unlock dialog, and every line sent to the joke service with its key. */
function makeKnockKnockApp(world: TH.ProviderWorld) {
  const { SOK, Bank: Knock } = world
  const heard: string[] = []
  /** Every bank snapshot the app rendered with. */
  const shown: BankSnapshot[] = []

  /** The joke service: it answers a line sent with its key. */
  function tellJoke(apiKey: unknown, line: string): string {
    if (apiKey !== TH.JokesKey) { throw new Error('The joke service refused the key') }
    heard.push(line)
    return `${line}? Who's there?`
  }

  /** The form that creates the vault with a new passphrase, its submit disabled until the passphrase is strong. */
  function CreateVaultForm() {
    const birth = Knock.useBirth()
    const strength = SOK.useStrengthVerdict()
    return (
      <form action={birth.attempt}>
        <input name="passphrase" type="password" autoComplete="new-password" aria-label="New passphrase" onChange={(event) => { void strength.judge(event.target.value) }} />
        <button disabled={birth.isPending || ! strength.verdict?.strong}>Create</button>
      </form>
    )
  }

  /** A form that sends a line to the joke service, and shows the reply, or the refusal kind of a call that failed. */
  function JokeForm() {
    const ask = useMutation({
      mutationFn: (line: string) => Knock.withWhisper(TH.JokesPath, ({ apiKey }) => tellJoke(apiKey, line)),
    })
    return (
      <form action={(form) => { ask.mutate(popField(form, 'line')) }}>
        <input name="line" aria-label="Line" />
        <button>Tell</button>
        <output aria-label="Reply">{ask.data}</output>
        {isVaultError(ask.error) && <p aria-label="Refused">{ask.error.refusalkind}</p>}
      </form>
    )
  }

  /** The passphrase form: it submits through the unlock mutation, says why the last try failed, and cancels the wait. */
  function UnlockForm() {
    const unlock = Knock.useUnlock()
    return (
      <form action={unlock.attempt}>
        <input name="passphrase" type="password" autoComplete="current-password" aria-label="Passphrase" />
        <button disabled={unlock.isPending}>Unlock</button>
        <button type="button" onClick={() => { Knock.dismissUnlock() }}>Cancel</button>
        {(unlock.error !== null) && <p role="alert">{unlockAlertOf(unlock.error)}</p>}
      </form>
    )
  }

  /** The unlock dialog, open while a call waits for the bank to be unlocked. */
  function UnlockDialog() {
    const isUnlockWanted = Knock.useBank((snap) => snap.isUnlockWanted)
    if (! isUnlockWanted) { return null }
    return <dialog open aria-label="Unlock"><UnlockForm /></dialog>
  }

  /** The app once the vault exists: whether it is locked, whether its key is stored, the joke form, Lock, and the unlock dialog. */
  function Vault({ isLocked }: Readonly<{ isLocked: boolean }>) {
    const { data: record } = Knock.useBox(TH.JokesPath)
    return (
      <main>
        <p>{isLocked ? 'Locked' : 'Unlocked'}</p>
        <p>{record ? 'Key stored' : 'No key yet'}</p>
        <button type="button" onClick={() => { Knock.lock() }}>Lock</button>
        <JokeForm />
        <UnlockDialog />
      </main>
    )
  }

  /** The app: one screen for each stage of the bank. */
  function App() {
    const snap = Knock.useBank()
    shown.push(snap)
    switch (snap.stage) {
    case 'signed_out': { return <p>Signed out</p> }
    case 'starting':   { return <p>Starting</p> }
    case 'unborn':     { return <CreateVaultForm /> }
    case 'failed':     { return <p role="alert">{snap.lastErr?.message}</p> }
    default:           { return <Vault isLocked={snap.isLocked} /> }
    }
  }

  return { App, heard, shown }
}

/** The unlock form's alert for `err`, its last refusal: a condition the user can mend at the field, anything else as a banner. */
function unlockAlertOf(err: unknown): string {
  if (! isVaultError(err) || (err.family !== 'condition')) { return 'Something went wrong. Please try again later.' }
  return (err.refusalkind === 'wrong_passphrase') ? 'That is not the passphrase.' : err.message
}

/** Hue's app over a fresh world storing `stored`, rendered under the giver's provider, signed in as Hue: with the jokes stored, once it shows the vault locked. */
async function renderKnockKnock(stored: 'none' | 'jokes' = 'jokes') {
  const world = await TH.buildProviderWorld({ stored })
  const app   = makeKnockKnockApp(world)
  const { container } = render(TH.providerTreeOf(world, <app.App />, { userid: TH.ProviderUser }))
  if (stored === 'jokes') { await screen.findByText('Locked') }
  const derivedBefore = world.deriver.heard
  /** Assert `passphrase` is in no bank snapshot the app rendered with, in nothing React has of the tree, and in no query or mutation of the host's QueryClient or the giver's. */
  function expectUnheld(passphrase: string): void {
    expect(app.shown.filter((snap) => TH.holdsText(snap, passphrase))).to.have.lengthOf(0)
    expect(TH.holdsText(TH.reactTreeOf(container), passphrase)).to.eq(false)
    const entries = world.clients().flatMap((client) => [...client.getQueryCache().getAll(), ...client.getMutationCache().getAll()])
    expect(TH.holdsText(entries.map((entry) => entry.state), passphrase)).to.eq(false)
  }
  /** How many passphrases the key deriver has been given since the app was rendered. */
  function derivations(): number { return world.deriver.heard - derivedBefore }
  /** How many times the app has shown a call waiting for an `unlock` gating: each rise of `isUnlockWanted`. */
  function unlockAsks(): number {
    let asks = 0
    let wasWanted = false
    for (const snap of app.shown) {
      if (! wasWanted && snap.isUnlockWanted) { asks += 1 }
      wasWanted = snap.isUnlockWanted
    }
    return asks
  }
  return { world, heard: app.heard, derivations, unlockAsks, expectUnheld }
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

describe("the knock-knock app", () => {
  it("creates a vault, locks it, and asks for the passphrase before a joke once its key is stored", async () => {
    const { world, heard, expectUnheld } = await renderKnockKnock('none')
    expect(screen.getByText('Starting')).to.exist
    const field = await screen.findByLabelText('New passphrase')
    fireEvent.change(field, { target: { value: 'short' } })
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Create' }).disabled).to.eq(true) })
    fireEvent.change(field, { target: { value: NewPassphrase } })
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Create' }).disabled).to.eq(false) })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await screen.findByText('Unlocked')
    expect(screen.getByText('No key yet')).to.exist
    expectUnheld(NewPassphrase)

    await world._cheat_putJokesKey(NewPassphrase)
    await screen.findByText('Key stored')
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    await screen.findByText('Locked')
    tell('Knock knock')
    await screen.findByRole('dialog', { name: 'Unlock' })
    expect(heard).to.deep.equal([])

    typePassphrase(NewPassphrase)
    await waitFor(() => { expect(screen.getByLabelText('Reply').textContent).to.eq("Knock knock? Who's there?") })
    expect(screen.getByText('Unlocked')).to.exist
    expectUnheld(NewPassphrase)
  })

  it("asks for the passphrase before telling a joke that needs the locked vault's key", async () => {
    const { world, heard, derivations, expectUnheld } = await renderKnockKnock()
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
    const { heard, derivations, unlockAsks } = await renderKnockKnock()
    tell('Knock knock')
    await screen.findByRole('dialog', { name: 'Unlock' })
    typePassphrase(Passphrase)
    await waitFor(() => { expect(heard).to.deep.equal(['Knock knock']) })
    tell('Lettuce')
    await waitFor(() => { expect(screen.getByLabelText('Reply').textContent).to.eq("Lettuce? Who's there?") })
    expect(unlockAsks()).to.eq(1)
    expect(derivations()).to.eq(1)
  })

  it("keeps the dialog open for another try after a wrong passphrase", async () => {
    const { heard, unlockAsks, expectUnheld } = await renderKnockKnock()
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
    expect(unlockAsks()).to.eq(1)
    expectUnheld(Passphrase)
  })

  it("answers a second line sent while the dialog is open with the same unlock", async () => {
    const { heard, derivations, unlockAsks, expectUnheld } = await renderKnockKnock()
    tell('Knock knock')
    await screen.findByRole('dialog', { name: 'Unlock' })
    tell('Boo')
    await waitFor(() => { expect(screen.getAllByRole('dialog')).to.have.lengthOf(1) })
    typePassphrase(Passphrase)
    await waitFor(() => { expect(heard).to.have.members(['Knock knock', 'Boo']) })
    expect(unlockAsks()).to.eq(1)
    expect(derivations()).to.eq(1)
    expectUnheld(Passphrase)
  })

  it("refuses the joke without unlocking when Hue cancels the dialog", async () => {
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
