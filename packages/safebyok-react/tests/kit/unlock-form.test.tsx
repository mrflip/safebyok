import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useActionState, useState, useTransition } from 'react'
import { type Root, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { UnlockDialog, UnlockForm } from '../../src/kit'
import * as TH from '../test-helpers'

const Passphrase = TH.TestPassphrase

/** A passphrase one letter off the stored one. */
const WrongPassphrase = 'correct horse battery stable'

/** The bank's stage as a line of text, with the unlock form while it is locked. */
function StageScreen({ world }: Readonly<{ world: TH.ProviderWorld }>) {
  const stage = world.Bank.useBank((snap) => snap.stage)
  return (stage === 'locked') ? <UnlockForm username="hue@example.com" /> : <p>{stage}</p>
}

/** The bank's stage as a line of text. */
function StageLine({ world }: Readonly<{ world: TH.ProviderWorld }>) {
  return <p>{world.Bank.useBank((snap) => snap.stage)}</p>
}

/** The bank's stage as a line of text, beside the unlock dialog. */
function DialogScreen({ world }: Readonly<{ world: TH.ProviderWorld }>) {
  const stage = world.Bank.useBank((snap) => snap.stage)
  return <><p>{stage}</p><UnlockDialog /></>
}

/** A host whose Action awaits the stored key through `withWhisper`, started by `startTransition` or as a form Action, beside the unlock dialog. */
function AwaitingHost({ world, kind }: Readonly<{ world: TH.ProviderWorld, kind: 'transition' | 'formAction' }>) {
  const [isPending, startTransition] = useTransition()
  const [transitionKey, setTransitionKey] = useState('none')
  const [formKey, formAction, isFormPending] = useActionState(fetchKey, 'none')
  async function fetchKey() { return await world.Bank.withWhisper(TH.JokesPath, ({ apiKey }) => apiKey as string) }
  function startFetch() {
    startTransition(async () => {
      const apiKey = await fetchKey()
      startTransition(() => { setTransitionKey(apiKey) })
    })
  }
  const shown = (kind === 'transition') ? transitionKey : formKey
  return (
    <>
      <p>{(isPending || isFormPending) ? 'Fetching' : `Key ${shown}`}</p>
      {(kind === 'transition') && <button type="button" onClick={startFetch}>Fetch</button>}
      {(kind === 'formAction') && <form action={formAction}><button type="submit">Fetch</button></form>}
      <UnlockDialog />
    </>
  )
}

/** A world with a bank stored, rendered with `children` under its provider, once it shows `shown`. */
async function renderWorld(children: (world: TH.ProviderWorld) => React.ReactNode, shown: string) {
  const world = await TH.buildProviderWorld({ stored: 'jokes' })
  const { container } = render(TH.providerTreeOf(world, children(world), { userid: TH.ProviderUser }))
  await screen.findByText(shown)
  return { world, container }
}

/** Type `passphrase` into the passphrase field and press Unlock. */
function typePassphrase(passphrase: string): void {
  fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
}

describe("UnlockForm", () => {
  it("unlocks the bank by its passphrase, holding it nowhere", async () => {
    const { world, container } = await renderWorld((world) => <StageScreen world={world} />, 'Unlock')
    typePassphrase(Passphrase)
    await screen.findByText('unlocked')
    TH.expectTextUnheld(Passphrase, container, world.clients())
  })

  it("keeps Unlock disabled and the passphrase hidden while the unlock runs, unlocking once for a double press", async () => {
    const { world, container } = await renderWorld((world) => <StageScreen world={world} />, 'Unlock')
    const release = world.deriver.hold()
    const field = screen.getByLabelText<HTMLInputElement>('Passphrase')
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(field.type).to.eq('text')
    typePassphrase(Passphrase)
    const pending = await screen.findByRole<HTMLButtonElement>('button', { name: 'Unlocking…' })
    expect([pending.disabled, field.type]).to.deep.equal([true, 'password'])
    fireEvent.click(pending)
    TH.expectTextUnheld(Passphrase, container, world.clients())
    release()
    await screen.findByText('unlocked')
    expect(world.deriver.heard).to.eq(1)
  })

  it("says a wrong passphrase is wrong, empties the field and hands it focus", async () => {
    const { world, container } = await renderWorld((world) => <StageScreen world={world} />, 'Unlock')
    typePassphrase(WrongPassphrase)
    const alert = await screen.findByRole('alert')
    await waitFor(() => { expect(alert.textContent).to.eq('That is not the passphrase.') })
    const field = screen.getByLabelText<HTMLInputElement>('Passphrase')
    await waitFor(() => { expect(field.value).to.eq('') })
    expect(document.activeElement).to.eq(field)
    expect(field.getAttribute('aria-invalid')).to.eq('true')
    TH.expectTextUnheld(WrongPassphrase, container, world.clients())

    typePassphrase(Passphrase)
    await screen.findByText('unlocked')
  })

  it("carries the username for a password manager, and no Cancel unless given one", async () => {
    const { container } = await renderWorld((world) => <StageScreen world={world} />, 'Unlock')
    const username = container.querySelector<HTMLInputElement>('input[name="username"]')
    expect(username?.value).to.eq('hue@example.com')
    expect(username?.autocomplete).to.eq('username')
    expect(screen.queryByRole('button', { name: 'Cancel' })).to.be.null
  })

  it("posts, so a form submitted before React attaches keeps the passphrase out of the URL, and has no username field without a username", async () => {
    const { container } = await renderWorld(() => <UnlockForm />, 'Unlock')
    expect(container.querySelector('form')?.getAttribute('method')).to.eq('post')
    expect(container.querySelector('input[name="username"]')).to.be.null
  })

  it("keeps Unlock disabled in a server render until it is hydrated, so the passphrase is never submitted before React attaches", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const tree = TH.providerTreeOf(world, <><StageLine world={world} /><UnlockForm /></>, { userid: TH.ProviderUser })
    const container = document.createElement('div')
    container.innerHTML = renderToString(tree)
    document.body.append(container)
    // Whether React had cancelled each submit by the time it reached the document; cancelled here, as jsdom submits nothing.
    const submits: boolean[] = []
    function hearSubmit(event: SubmitEvent) { submits.push(event.defaultPrevented); event.preventDefault() }
    document.addEventListener('submit', hearSubmit)
    let root: Root | null = null
    onTestFinished(() => { document.removeEventListener('submit', hearSubmit); act(() => { root?.unmount() }); container.remove() })
    const unlockButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Unlock' })
    screen.getByLabelText<HTMLInputElement>('Passphrase').value = Passphrase
    expect(unlockButton().disabled).to.eq(true)
    unlockButton().click()
    expect(submits).to.be.empty

    const mismatches: unknown[] = []
    act(() => { root = hydrateRoot(container, tree, { onRecoverableError: (err) => { mismatches.push(err) } }) })
    await screen.findByText('locked')
    expect([unlockButton().disabled, mismatches]).to.deep.equal([false, []])
    typePassphrase(Passphrase)
    await screen.findByText('unlocked')
    expect(submits).to.deep.equal([true])
  })

  it("uses the bank handed to it over the provider's", async () => {
    const heard: string[] = []
    const { world } = await renderWorld((world) => {
      const bank = { useUnlock: () => { heard.push('useUnlock'); return world.Bank.useUnlock() } }
      return <UnlockForm bank={bank} />
    }, 'Unlock')
    expect(heard).to.not.be.empty
    typePassphrase(Passphrase)
    await waitFor(() => { expect(world._cheat_device().bank.isUnlocked).to.eq(true) })
  })

  it("refuses to render outside every provider with no bank handed to it", () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    onTestFinished(() => { vi.restoreAllMocks() })
    TH.expectSyncRefusal(() => render(<UnlockForm />), 'bad_record')
  })
})

describe("UnlockDialog", () => {
  it("opens while a withWhisper waits, and resumes it once unlocked", async () => {
    const { world, container } = await renderWorld((world) => <DialogScreen world={world} />, 'locked')
    expect(screen.queryByRole('dialog')).to.be.null
    const asked = world.Bank.withWhisper(TH.JokesPath, ({ apiKey }) => apiKey as string)
    await screen.findByRole('dialog', { name: 'Unlock your vault' })
    typePassphrase(Passphrase)
    expect(await asked).to.eq(TH.JokesKey)
    await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
    expect(screen.getByText('unlocked')).to.exist
    TH.expectTextUnheld(Passphrase, container, world.clients())
  })

  for (const kind of ['transition', 'formAction'] as const) {
    it(`takes another try after a wrong passphrase while a host's ${kind} waits on it, and resumes it once unlocked`, async () => {
      const { world, container } = await renderWorld((world) => <AwaitingHost world={world} kind={kind} />, 'Key none')
      fireEvent.click(screen.getByRole('button', { name: 'Fetch' }))
      await screen.findByRole('dialog', { name: 'Unlock your vault' })
      await screen.findByText('Fetching')
      typePassphrase(WrongPassphrase)
      const alert = await screen.findByRole('alert')
      await waitFor(() => { expect(alert.textContent).to.eq('That is not the passphrase.') })
      const unlockButton = await screen.findByRole<HTMLButtonElement>('button', { name: 'Unlock' })
      await waitFor(() => { expect(unlockButton.disabled).to.eq(false) })
      typePassphrase(Passphrase)
      await screen.findByText(`Key ${TH.JokesKey}`)
      expect(screen.queryByRole('dialog')).to.be.null
      TH.expectTextUnheld(Passphrase, container, world.clients())
      TH.expectTextUnheld(WrongPassphrase, container, world.clients())
    })
  }

  for (const [closer, blurb] of [["Cancel", 'dismisses the wait on Cancel'], ["Escape", 'dismisses the wait on Escape']] as const) {
    it(blurb, async () => {
      const { world } = await renderWorld((world) => <DialogScreen world={world} />, 'locked')
      const asked = world.Bank.withWhisper(TH.JokesPath, ({ apiKey }) => apiKey as string)
      const dialog = await screen.findByRole('dialog', { name: 'Unlock your vault' })
      if (closer === 'Cancel') { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })) } else { fireEvent(dialog, new Event('cancel', { cancelable: true })) }
      await expect(asked).rejects.toThrow(expect.objectContaining({ refusalkind: 'dismissed' }))
      await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
      expect(screen.getByText('locked')).to.exist
      expect(world.deriver.heard).to.eq(0)
    })
  }
})
