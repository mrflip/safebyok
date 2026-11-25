// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as TH from '../test-helpers'

// Hue opens the Knock-Knock Machine: signs in, creates a vault, saves an Anthropic key, and knocks. Each test drives the
// real app, its giver and the core, over the app's own localStorage vaultDB, with the core's fast test deriver in place of
// Argon2id and a fake of Anthropic's endpoint in place of the network. A reload is a fresh import of the app's modules, so
// a fresh giver, over what localStorage kept.

vi.mock('safebyok/browser', async (importOriginal) => {
  const browser = await importOriginal<typeof import('safebyok/browser')>()
  const { testDeriver } = await import('safebyok/testing')
  return { ...browser, argon2idWebV1Deriver: testDeriver }
})

/** Hue's passphrase, an obvious fake that zxcvbn finds strong. */
const Passphrase = 'gentle otter juggles nine lanterns'

/** Hue's next passphrase, an obvious fake that zxcvbn finds strong. */
const NextPassphrase = 'brave walrus paints seven kites'

/** Hue's Anthropic key, an obvious fake. */
const ApiKey = 'sk-ant-fake-0123456789abcdef'

/** The key's mask as its sidecar stores it, no character of its tail shown: what a locked page shows. */
const StoredMask = 'sk**********************'

/** The key's mask with its last four characters: what an unlocked page shows. */
const LiveMask = 'sk******************cdef'

/** What the fake Anthropic answers. */
const Joke = "Lettuce who? Lettuce in, it's cold out here!"

/** The page as a fresh load finds it: the app's modules imported anew over what localStorage kept, and rendered. */
async function loadPage() {
  cleanup()
  vi.resetModules()
  const { App } = await import('../../src/components/App')
  const { queryClient } = await import('../../src/lib/sok')
  const { container } = render(<StrictMode><App /></StrictMode>)
  return { container, client: queryClient }
}

/** Assert that neither passphrase, nor the key, is in what React or the page's QueryClient holds. */
function expectUnheld(page: Awaited<ReturnType<typeof loadPage>>): void {
  for (const text of [Passphrase, NextPassphrase, ApiKey]) { TH.expectTextUnheld(text, page.container, page.client) }
}

/** The section of the page titled `title`. */
function region(title: string): HTMLElement { return screen.getByRole('region', { name: title }) }

/** Sign in as Hue. */
async function signin(): Promise<void> {
  fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'hue' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

/** Create the vault under {@link Passphrase}, once the create form shows. */
async function createVault(): Promise<void> {
  fireEvent.change(await screen.findByLabelText('New passphrase'), { target: { value: Passphrase } })
  fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: Passphrase } })
  const create = screen.getByRole<HTMLButtonElement>('button', { name: 'Create vault' })
  await waitFor(() => { expect(create.disabled).to.eq(false) })
  fireEvent.click(create)
  await screen.findByText('Your vault is unlocked.')
}

/** Save {@link ApiKey} with the key editor. */
async function saveKey(): Promise<void> {
  const keyPanel = region('Your Anthropic API key')
  fireEvent.change(within(keyPanel).getByLabelText('Anthropic API key'), { target: { value: ApiKey } })
  fireEvent.click(within(keyPanel).getByRole('button', { name: 'Save key' }))
  await within(keyPanel).findByText(LiveMask)
}

/** Knock as Lettuce. */
function knock(): void {
  const knockPanel = region('Knock, knock!')
  fireEvent.change(within(knockPanel).getByLabelText("Who's there?"), { target: { value: 'Lettuce' } })
  fireEvent.click(within(knockPanel).getByRole('button', { name: 'Knock' }))
}

/** A new user, signed in, with a vault and the key saved: the page that did it. */
async function loadWithKey() {
  const page = await loadPage()
  await signin()
  await createVault()
  await saveKey()
  return page
}

/** Unlock with `passphrase` in the form inside `within`. */
function unlockIn(container: HTMLElement, passphrase = Passphrase): void {
  fireEvent.change(within(container).getByLabelText('Passphrase'), { target: { value: passphrase } })
  fireEvent.click(within(container).getByRole('button', { name: 'Unlock' }))
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe("the Knock-Knock Machine", () => {
  it("lets a new user create a vault, save a key, knock and get a joke", async () => {
    const anthropic = TH.fakeAnthropic(200, Joke)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    const page = await loadWithKey()
    expectUnheld(page)
    knock()
    expect(await screen.findByLabelText('Joke')).to.have.property('textContent', Joke)
    expect(anthropic.seen.map((request) => request.apiKey)).to.deep.equal([ApiKey])
    expectUnheld(page)
  })

  it("lands locked after a reload, and asks for the passphrase in the dialog when the user knocks", async () => {
    const anthropic = TH.fakeAnthropic(200, Joke)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    await loadWithKey()
    const page = await loadPage()
    await screen.findByRole('heading', { name: 'Your vault is locked' })
    await within(region('Your Anthropic API key')).findByText(StoredMask)
    knock()
    const dialog = await screen.findByRole('dialog')
    unlockIn(dialog)
    await screen.findByText('Your vault is unlocked.')
    expect(await screen.findByLabelText('Joke')).to.have.property('textContent', Joke)
    expect(screen.queryByRole('dialog')).to.be.null
    expect(anthropic.seen).to.have.lengthOf(1)
    expectUnheld(page)
  })

  it("leaves the vault locked and sends nothing when the user cancels the dialog", async () => {
    const anthropic = TH.fakeAnthropic(200, Joke)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    await loadWithKey()
    const page = await loadPage()
    await screen.findByRole('heading', { name: 'Your vault is locked' })
    await within(region('Your Anthropic API key')).findByText(StoredMask)
    knock()
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
    expect(screen.queryAllByRole('alert').map((alert) => alert.textContent).join('')).to.eq('')
    expect(screen.getByRole('heading', { name: 'Your vault is locked' })).to.exist
    expect(anthropic.seen).to.have.lengthOf(0)
    expectUnheld(page)
  })

  it("locks and unlocks, showing the stored mask while locked and the key's last four characters while unlocked", async () => {
    const page = await loadWithKey()
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    const locked = await screen.findByRole('region', { name: 'Your vault is locked' })
    expect(within(region('Your Anthropic API key')).queryByLabelText('Anthropic API key')).to.be.null
    await within(region('Your Anthropic API key')).findByText(StoredMask)
    TH.expectTextUnheld(ApiKey.slice(-4), page.container, page.client)
    expect(document.body.textContent.includes(ApiKey.slice(-4))).to.eq(false)
    unlockIn(locked)
    await screen.findByText('Your vault is unlocked.')
    await within(region('Your Anthropic API key')).findByText(LiveMask)
    expectUnheld(page)
  })

  it("refuses a wrong passphrase, and stays locked", async () => {
    const page = await loadWithKey()
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    const locked = await screen.findByRole('region', { name: 'Your vault is locked' })
    unlockIn(locked, NextPassphrase)
    expect(await within(locked).findByText('That is not the passphrase.')).to.exist
    expect(screen.queryByText('Your vault is unlocked.')).to.be.null
    expectUnheld(page)
  })

  it("shows the saved key on Show, and deletes it", async () => {
    const page = await loadWithKey()
    const keyPanel = region('Your Anthropic API key')
    fireEvent.click(within(keyPanel).getAllByRole('button', { name: 'Show' })[0]!)
    expect(await within(keyPanel).findByText(ApiKey)).to.exist
    expectUnheld(page)
    fireEvent.click(within(keyPanel).getByRole('button', { name: 'Delete' }))
    expect(await within(keyPanel).findByText('No key saved yet.')).to.exist
    expect(within(region('Knock, knock!')).getByRole<HTMLButtonElement>('button', { name: 'Knock' }).disabled).to.eq(true)
  })

  it("replaces the passphrase, and unlocks with the new one after a reload", async () => {
    const page = await loadWithKey()
    const waysIn = region('Ways in')
    fireEvent.change(within(waysIn).getByLabelText('Current passphrase'), { target: { value: Passphrase } })
    fireEvent.change(within(waysIn).getByLabelText('New passphrase'), { target: { value: NextPassphrase } })
    fireEvent.change(within(waysIn).getByLabelText('Confirm passphrase'), { target: { value: NextPassphrase } })
    const replace = within(waysIn).getByRole<HTMLButtonElement>('button', { name: 'Replace passphrase' })
    await waitFor(() => { expect(replace.disabled).to.eq(false) })
    fireEvent.click(replace)
    await waitFor(() => { expect(within(waysIn).getByLabelText<HTMLInputElement>('Current passphrase').value).to.eq('') })
    expect(within(waysIn).getAllByRole('alert').map((alert) => alert.textContent).join('')).to.eq('')
    expectUnheld(page)

    const reloaded = await loadPage()
    const locked = await screen.findByRole('region', { name: 'Your vault is locked' })
    unlockIn(locked, Passphrase)
    await within(locked).findByText('That is not the passphrase.')
    unlockIn(locked, NextPassphrase)
    await screen.findByText('Your vault is unlocked.')
    expectUnheld(reloaded)
  })

  it("adds a passkey, unlocks with it, and revokes it", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const page = await loadWithKey()
    fireEvent.change(within(region('Ways in')).getByLabelText('Passphrase'), { target: { value: Passphrase } })
    fireEvent.click(within(region('Ways in')).getByRole('button', { name: 'Add passkey' }))
    await within(region('Ways in')).findByRole('button', { name: 'Remove passkey' })
    expect(authenticator.credentialIds()).to.have.lengthOf(1)
    // The passkey shows once the gate is written, before the add's own unlock lands: a Lock before that leaves the bank
    // unlocked (notes/wontfix.md, "A lock, a disconnect or a second form verb while a form verb runs"). Let the add settle.
    await waitFor(() => { expect(page.client.isMutating()).to.eq(0) })

    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    const locked = await screen.findByRole('region', { name: 'Your vault is locked' })
    fireEvent.click(within(locked).getByRole('button', { name: 'Unlock with a passkey' }))
    await screen.findByText('Your vault is unlocked.')
    expect(authenticator.calls.get).to.have.lengthOf(1)

    fireEvent.change(within(region('Ways in')).getByLabelText('Passphrase'), { target: { value: Passphrase } })
    fireEvent.click(within(region('Ways in')).getByRole('button', { name: 'Remove passkey' }))
    await within(region('Ways in')).findByRole('button', { name: 'Add passkey' })
    expectUnheld(page)

    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    await screen.findByRole('region', { name: 'Your vault is locked' })
    expect(screen.queryByRole('button', { name: 'Unlock with a passkey' })).to.be.null
  })

  it("offers the passkey after a reload", async () => {
    TH.installFakeAuthenticator()
    await loadWithKey()
    fireEvent.change(within(region('Ways in')).getByLabelText('Passphrase'), { target: { value: Passphrase } })
    fireEvent.click(within(region('Ways in')).getByRole('button', { name: 'Add passkey' }))
    await within(region('Ways in')).findByRole('button', { name: 'Remove passkey' })

    const reloaded = await loadPage()
    const locked = await screen.findByRole('region', { name: 'Your vault is locked' })
    expect(await within(locked).findByRole('button', { name: 'Unlock with a passkey' })).to.exist
    expectUnheld(reloaded)
  })
})
