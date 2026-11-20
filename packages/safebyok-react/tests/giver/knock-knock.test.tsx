import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useActionState } from 'react'
import { describe, expect, it, onTestFinished } from 'vitest'
import * as LeanTH from 'safebyok/testing'
import { makeReactGiver } from '../../src/giver/react-giver'
import * as TH from '../test-helpers'

// Hue sits down at the knock-knock app, and the vault is locked. Hue types a line and hits enter; the app asks the joke
// service with the key in the vault, which first needs Hue's passphrase. These tests drive that path against the real core.

const Passphrase = LeanTH.TestPassphrase

/** A passphrase one letter off Hue's. */
const WrongPassphrase = 'correct horse battery stable'

/** Hue's app over `world`, as a host would write it beside its Device: the joke form, the unlock dialog, and every line the joke service heard with its key. */
function makeKnockKnockApp(world: TH.KnockKnockWorld) {
  /** What the unlock form keeps between attempts: the refusal kind of the last, never what was typed. */
  type UnlockState = Readonly<{ refusalkind: string | null }> | null

  const { bank, vault } = world
  const Giver = makeReactGiver(world.giverDevice)
  const Acme  = Giver.forBank(world.device.banklabel)
  const heard: string[] = []

  /** The joke service: it answers a line sent with its key. */
  function tellJoke(apiKey: unknown, line: string): string {
    if (apiKey !== TH.JokesKey) { throw new Error('The joke service refused the key') }
    heard.push(line)
    return `${line}? Who's there?`
  }

  /** A form that sends a line to the joke service, and shows the reply. */
  function JokeForm() {
    const ask = useMutation({
      mutationFn: (line: string) => vault.withWhisper(TH.JokesPath, ({ whisper }) => tellJoke(whisper['apiKey'], line)),
    })
    return (
      <form action={(form) => { ask.mutate(takeText(form, 'line')) }}>
        <input name="line" aria-label="Line" />
        <button>Tell</button>
        <output aria-label="Reply">{ask.data}</output>
      </form>
    )
  }

  /** Unlock the bank with the passphrase in `form`, answering the unlock gating open. */
  async function unlockAction(_prior: UnlockState, form: FormData): Promise<UnlockState> {
    const outcome = await bank.attemptUnlock({ passphraseClear: takeText(form, 'passphrase') })
    return { refusalkind: outcome.ok ? null : outcome.err.refusalkind }
  }

  /** The passphrase form of one gating. */
  function UnlockForm({ isAttempting }: Readonly<{ isAttempting: boolean }>) {
    const [unlockState, unlock, isUnlocking] = useActionState(unlockAction, null)
    return (
      <form action={unlock}>
        <input name="passphrase" type="password" autoComplete="current-password" aria-label="Passphrase" />
        <button disabled={isUnlocking || isAttempting}>Unlock</button>
        {(unlockState?.refusalkind === 'wrong_passphrase') && <p role="alert">That is not the passphrase.</p>}
      </form>
    )
  }

  /** The dialog for an unlock gating, while one is open. */
  function UnlockDialog() {
    const gating = Giver.useGating()
    if (gating?.gatingkind !== 'unlock_bank') { return null }
    return <dialog open aria-label="Unlock"><UnlockForm key={gating.gatingseq} isAttempting={gating.isAttempting} /></dialog>
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

// React keeps the FormData a form action is handed after the action ends: as the form's pending status, and in the
// action's queued update. A field taken out before the first await is never in either.
/** Take the text of `form`'s field `fieldname` out of it, or '' for none. */
function takeText(form: FormData, fieldname: string): string {
  const val = form.get(fieldname)
  form.delete(fieldname)
  return (typeof val === 'string') ? val : ''
}

/** Hue's app over a fresh world, rendered under the test's own QueryClient. */
async function renderKnockKnock() {
  const world  = await TH.makeKnockKnockWorld()
  const app    = makeKnockKnockApp(world)
  const client = new QueryClient()
  onTestFinished(() => { client.clear() })
  const { container } = render(<QueryClientProvider client={client}><app.App /></QueryClientProvider>)
  const derivedBefore = world.deriver.heard
  /** Assert `passphrase` is in no snapshot the Device has published, in nothing React holds of the tree, and in no entry of the host's React Query. */
  function expectUnheld(passphrase: string): void {
    expect(world.snapshots.filter((snap) => TH.holdsText(snap, passphrase))).to.have.lengthOf(0)
    expect(TH.holdsText(TH.reactTreeOf(container), passphrase)).to.eq(false)
    const entries = [...client.getQueryCache().getAll(), ...client.getMutationCache().getAll()]
    expect(TH.holdsText(entries.map((entry) => entry.state), passphrase)).to.eq(false)
  }
  /** How many passphrases the key deriver has heard since the app was rendered. */
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

/** The unlock gatings the Device's snapshots have shown open, by gatingseq. */
function unlockGatingseqsOf(world: TH.KnockKnockWorld): number[] {
  const seqs = world.snapshots.filter((snap) => snap.gating?.gatingkind === 'unlock_bank').map((snap) => snap.gating?.gatingseq)
  return [...new Set(seqs)] as number[]
}

describe("the knock-knock app", () => {
  it("asks for the passphrase when a line needs the locked vault's key, and tells the joke once unlocked", async () => {
    const { world, heard, expectUnheld } = await renderKnockKnock()
    expect(screen.getByText('Locked')).to.exist
    await screen.findByText('Key stored')
    tell('Knock knock')
    await screen.findByRole('dialog', { name: 'Unlock' })
    expect(heard).to.deep.equal([])

    const release = world.deriver.hold()
    typePassphrase(Passphrase)
    await waitFor(() => { expect(world.device.getSnapshot().gating?.isAttempting).to.eq(true) })
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
    expect(unlockGatingseqsOf(world)).to.have.lengthOf(1)
    expect(derivations()).to.eq(1)
  })

  it("keeps the dialog open after a wrong passphrase, empties the field, and unlocks on the next try", async () => {
    const { world, heard, expectUnheld } = await renderKnockKnock()
    tell('Knock knock')
    await screen.findByRole('dialog', { name: 'Unlock' })
    typePassphrase(WrongPassphrase)
    await screen.findByRole('alert')
    expect(screen.getByLabelText<HTMLInputElement>('Passphrase').value).to.eq('')
    expect(screen.getByText('Locked')).to.exist
    expect(heard).to.deep.equal([])
    expectUnheld(WrongPassphrase)

    typePassphrase(Passphrase)
    await waitFor(() => { expect(heard).to.deep.equal(['Knock knock']) })
    expect(unlockGatingseqsOf(world)).to.have.lengthOf(1)
    expectUnheld(Passphrase)
  })

  it("joins a second line sent while the dialog is open to the same unlock, and answers both", async () => {
    const { world, heard, derivations, expectUnheld } = await renderKnockKnock()
    tell('Knock knock')
    await screen.findByRole('dialog', { name: 'Unlock' })
    tell('Boo')
    await waitFor(() => { expect(screen.getAllByRole('dialog')).to.have.lengthOf(1) })
    typePassphrase(Passphrase)
    await waitFor(() => { expect(heard).to.have.members(['Knock knock', 'Boo']) })
    expect(unlockGatingseqsOf(world)).to.have.lengthOf(1)
    expect(derivations()).to.eq(1)
    expectUnheld(Passphrase)
  })
})
