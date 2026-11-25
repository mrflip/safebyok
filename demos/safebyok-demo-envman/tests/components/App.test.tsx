// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as TH from '../test-helpers'

// Hue keeps her team's secrets in Envman: signs in, creates a vault, adds secrets, and rotates them. Each test drives the
// real app, its giver and the core, over the app's own localStorage vaultDB, with the core's fast test deriver in place of
// Argon2id. A reload is a fresh import of the app's modules, so a fresh giver, over what localStorage kept.

vi.mock('safebyok/browser', async (importOriginal) => {
  const browser = await importOriginal<typeof import('safebyok/browser')>()
  const { testDeriver } = await import('safebyok/testing')
  return { ...browser, argon2idWebV1Deriver: testDeriver }
})

/** Hue's passphrase, an obvious fake that zxcvbn finds strong. */
const Passphrase = 'gentle otter juggles nine lanterns'

/** The OpenAI key Hue adds first, an obvious fake. */
const OpenaiKey = 'sk-proj-fake-0123456789abcdef'

/** The database URL Hue adds second, an obvious fake. */
const DatabaseUrl = 'postgres://hue:fake-password-42@db.example.test/envman'

/** The OpenAI key Hue rotates to, an obvious fake. */
const NextOpenaiKey = 'sk-proj-fake-fedcba9876543210'

/** {@link OpenaiKey}'s mask as its sidecar stores it, no character of its tail shown: what a locked page shows. */
const StoredMask = 'sk**********************'

/** {@link OpenaiKey}'s mask with its last four characters: what an unlocked page shows. */
const LiveMask = 'sk******************cdef'

/** {@link NextOpenaiKey}'s mask with its last four characters. */
const NextLiveMask = 'sk******************3210'

/** The page as a fresh load finds it: the app's modules imported anew over what localStorage kept, and rendered. */
async function loadPage() {
  cleanup()
  vi.resetModules()
  const { App } = await import('../../src/components/App')
  const { queryClient } = await import('../../src/lib/sok')
  const { container } = render(<StrictMode><App /></StrictMode>)
  return { container, client: queryClient }
}

/** Assert that neither the passphrase nor any value is in what React or the page's QueryClient holds. */
function expectUnheld(page: Awaited<ReturnType<typeof loadPage>>): void {
  for (const text of [Passphrase, OpenaiKey, DatabaseUrl, NextOpenaiKey]) { TH.expectTextUnheld(text, page.container, page.client) }
}

/** The section of the page titled `title`. */
function region(title: string): HTMLElement { return screen.getByRole('region', { name: title }) }

/** The row of the secret titled `title`, once it shows. */
async function rowOf(title: string): Promise<HTMLElement> { return await screen.findByRole('listitem', { name: title }) }

/** The value input of the secret titled `title`. */
function valInputOf(row: HTMLElement, title: string): HTMLInputElement { return within(row).getByLabelText<HTMLInputElement>(`Value of ${title}`) }

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

/** Add a secret with the add form, last rotated on `lastRotatedDay` or, left out, today. */
async function addEnv(title: string, val: string, lastRotatedDay = ''): Promise<void> {
  const form = region('Add a secret')
  fireEvent.change(within(form).getByLabelText('Title'), { target: { value: title } })
  fireEvent.change(within(form).getByLabelText('Description'), { target: { value: `The ${title} of production` } })
  fireEvent.change(within(form).getByLabelText('Rotation period in days'), { target: { value: '30' } })
  fireEvent.change(within(form).getByLabelText('Last rotated'), { target: { value: lastRotatedDay } })
  fireEvent.change(within(form).getByLabelText('Value'), { target: { value: val } })
  fireEvent.click(within(form).getByRole('button', { name: 'Add' }))
  await rowOf(title)
  await waitFor(() => { expect(within(form).getByLabelText<HTMLInputElement>('Title').value).to.eq('') })
}

/** A new user, signed in, with a vault and two secrets added, the database URL last rotated long ago: the page that did it. */
async function loadWithEnvs() {
  const page = await loadPage()
  await signin()
  await createVault()
  await addEnv('OPENAI_API_KEY', OpenaiKey)
  await addEnv('DATABASE_URL', DatabaseUrl, '2020-01-01')
  return page
}

/** Focus `input`, and wait for it to show `val`. */
async function revealIn(input: HTMLInputElement, val: string): Promise<void> {
  act(() => { input.focus() })
  await waitFor(() => { expect([input.type, input.value]).to.deep.equal(['text', val]) })
}

/** Unlock with the passphrase in the form inside `container`. */
function unlockIn(container: HTMLElement): void {
  fireEvent.change(within(container).getByLabelText('Passphrase'), { target: { value: Passphrase } })
  fireEvent.click(within(container).getByRole('button', { name: 'Unlock' }))
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe("Envman", () => {
  it("adds two secrets, and lists them after a reload, red where overdue", async () => {
    const page = await loadWithEnvs()
    expect(within(await rowOf('OPENAI_API_KEY')).queryByText('Overdue for rotation')).to.be.null
    expect(within(await rowOf('DATABASE_URL')).getByText('Overdue for rotation')).to.exist
    expectUnheld(page)

    const reloaded = await loadPage()
    await screen.findByRole('heading', { name: 'Your vault is locked' })
    const openai = await rowOf('OPENAI_API_KEY')
    const database = await rowOf('DATABASE_URL')
    expect(within(openai).getByText('The OPENAI_API_KEY of production')).to.exist
    expect(within(database).getByText('Last rotated 2020-01-01.', { exact: false })).to.exist
    expect(database.className).to.contain('overdue')
    expect(openai.className).not.to.contain('overdue')
    expect(valInputOf(openai, 'OPENAI_API_KEY')).to.include({ type: 'password', value: '' })
    await within(openai).findByText(StoredMask)
    expectUnheld(reloaded)
  })

  it("shows a value on focus, and Undo masks it again unchanged", async () => {
    const page = await loadWithEnvs()
    const row = await rowOf('OPENAI_API_KEY')
    const input = valInputOf(row, 'OPENAI_API_KEY')
    await revealIn(input, OpenaiKey)
    fireEvent.change(input, { target: { value: NextOpenaiKey } })
    const undo = within(row).getByRole<HTMLButtonElement>('button', { name: 'Undo' })
    await waitFor(() => { expect(undo.disabled).to.eq(false) })
    fireEvent.click(undo)
    act(() => { input.blur() })
    await waitFor(() => { expect([input.type, input.value]).to.deep.equal(['password', '']) })
    await revealIn(input, OpenaiKey)
    expectUnheld(page)
  })

  it("saves a new value, stamping it rotated today, and keeps it across a reload", async () => {
    await loadWithEnvs()
    const row = await rowOf('DATABASE_URL')
    const input = valInputOf(row, 'DATABASE_URL')
    await revealIn(input, DatabaseUrl)
    fireEvent.change(input, { target: { value: NextOpenaiKey } })
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(row.className).not.to.contain('overdue') })
    expect(within(row).getByText(`Last rotated ${new Date().toISOString().slice(0, 10)}.`, { exact: false })).to.exist

    const reloaded = await loadPage()
    const locked = await screen.findByRole('region', { name: 'Your vault is locked' })
    unlockIn(locked)
    await screen.findByText('Your vault is unlocked.')
    const reloadedRow = await rowOf('DATABASE_URL')
    expect(reloadedRow.className).not.to.contain('overdue')
    await within(reloadedRow).findByText(NextLiveMask)
    await revealIn(valInputOf(reloadedRow, 'DATABASE_URL'), NextOpenaiKey)
    expectUnheld(reloaded)
  })

  it("shows a value's last four characters while unlocked, and the stored mask while locked", async () => {
    const page = await loadWithEnvs()
    const row = await rowOf('OPENAI_API_KEY')
    await within(row).findByText(LiveMask)
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    const locked = await screen.findByRole('region', { name: 'Your vault is locked' })
    await within(row).findByText(StoredMask)
    expect(document.body.textContent.includes(OpenaiKey.slice(-4))).to.eq(false)
    TH.expectTextUnheld(OpenaiKey.slice(-4), page.container, page.client)
    unlockIn(locked)
    await screen.findByText('Your vault is unlocked.')
    await within(row).findByText(LiveMask)
    expectUnheld(page)
  })

  it("empties an open draft on Lock", async () => {
    const page = await loadWithEnvs()
    const row = await rowOf('OPENAI_API_KEY')
    const input = valInputOf(row, 'OPENAI_API_KEY')
    const undo = within(row).getByRole<HTMLButtonElement>('button', { name: 'Undo' })
    await revealIn(input, OpenaiKey)
    fireEvent.change(input, { target: { value: NextOpenaiKey } })
    act(() => { input.blur() })
    await waitFor(() => { expect(undo.disabled).to.eq(false) })
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    const locked = await screen.findByRole('region', { name: 'Your vault is locked' })
    await waitFor(() => { expect(undo.disabled).to.eq(true) })
    expect(input).to.include({ type: 'password', value: '' })
    expectUnheld(page)
    unlockIn(locked)
    await screen.findByText('Your vault is unlocked.')
    await revealIn(input, OpenaiKey)
    expectUnheld(page)
  })

  it("back-dates and renames a secret through its settings, written on Save", async () => {
    const page = await loadWithEnvs()
    const row = await rowOf('OPENAI_API_KEY')
    fireEvent.click(within(row).getByRole('button', { name: 'Settings of OPENAI_API_KEY' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings of OPENAI_API_KEY' })
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'OPENAI_KEY_PROD' } })
    fireEvent.change(within(dialog).getByLabelText('Last rotated'), { target: { value: '2021-06-01' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
    const renamed = await rowOf('OPENAI_KEY_PROD')
    expect(within(renamed).getByText('Overdue for rotation')).to.exist
    fireEvent.click(within(renamed).getByRole('button', { name: 'Save' }))
    // Undo, not Save: Save is disabled while the write is pending too, and Undo only once the draft is clean.
    await waitFor(() => { expect(within(renamed).getByRole<HTMLButtonElement>('button', { name: 'Undo' }).disabled).to.eq(true) })
    expectUnheld(page)

    await loadPage()
    const reloadedRow = await rowOf('OPENAI_KEY_PROD')
    expect(reloadedRow.className).to.contain('overdue')
    expect(within(reloadedRow).getByText('Last rotated 2021-06-01.', { exact: false })).to.exist
  })

  it("asks for the passphrase when a value is focused on a locked vault, then shows it", async () => {
    await loadWithEnvs()
    const page = await loadPage()
    await screen.findByRole('heading', { name: 'Your vault is locked' })
    const row = await rowOf('OPENAI_API_KEY')
    const input = valInputOf(row, 'OPENAI_API_KEY')
    act(() => { input.focus() })
    unlockIn(await screen.findByRole('dialog'))
    await screen.findByText('Your vault is unlocked.')
    await waitFor(() => { expect([input.type, input.value]).to.deep.equal(['text', OpenaiKey]) })
    expect(screen.queryByRole('dialog')).to.be.null
    expectUnheld(page)
  })
})
