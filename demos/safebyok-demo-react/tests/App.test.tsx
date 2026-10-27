// @vitest-environment jsdom
// fake-indexeddb installs an indexedDB global before the demo's stores open their shelves.
import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserOpts } from 'safebyok/browser'
import { App } from '../src/App'
import { Applabel, vaultDB } from '../src/lib/stores'

// The App derives through the browser's defaults: 64 MiB of Argon2id for every passphrase typed,
// near a second each here and over five on a loaded CI machine under coverage, where one click
// through the dialog runs five of them. What these tests click through is the page, not the
// deriver (the core's tests hold that), so the App's bag swaps in the cheap test deriver. One bag
// for each of browserOpts' own, so its identity stays put, as the provider needs.
vi.mock('safebyok/browser', async (importOriginal) => {
  const browser = await importOriginal<typeof import('safebyok/browser')>()
  const { testDeriver } = await import('safebyok/testing')
  const cheapened = new WeakMap<BrowserOpts, BrowserOpts>()
  const cheapOpts = (...args: Parameters<typeof browser.browserOpts>): BrowserOpts => {
    const bag = browser.browserOpts(...args)
    const kept = cheapened.get(bag) ?? Object.freeze({ ...bag, keyDeriver: testDeriver })
    cheapened.set(bag, kept)
    return kept
  }
  return { ...browser, browserOpts: cheapOpts }
})

afterEach(() => { localStorage.clear() })

describe("App", () => {
  it("shows the sign-in strip and both inspection panels to a visitor, and no vault", () => {
    render(<App />)
    expect(screen.getByPlaceholderText('username')).to.not.be.null
    expect(screen.getByText(/The backend database/)).to.not.be.null
    expect(screen.getByText(/This device/)).to.not.be.null
    expect(screen.queryByText('The Knock-Knock Machine')).to.be.null
  })

  it("opens the signed-in user's vault: the knock-knock machine and the dashboard appear", async () => {
    render(<App />)
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'margo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText(/No boxes yet/)
    expect(screen.getByText('The Knock-Knock Machine')).to.not.be.null
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByPlaceholderText('username')
    expect(screen.queryByText('The Knock-Knock Machine')).to.be.null
  })

  it("deletes an account whose vault has no passphrase yet, asking nothing: the vault holds no boxes, and its empty record stays in storage", async () => {
    render(<App />)
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'leaver' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText(/No boxes yet/)
    const shown = await screen.findByText(/^\(user_/)
    const scope = { applabel: Applabel, user_id: shown.textContent.slice(1, -1), vaultlabel: 'main' }
    const born = await vaultDB.getVault(scope)
    expect(born.ok && born.val !== null).to.be.true
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await screen.findByPlaceholderText('username')
    expect(screen.queryByRole('dialog')).to.be.null
    const kept = await vaultDB.getVault(scope)
    expect(kept.ok && kept.val !== null).to.be.true
  })

  it("clicks through the passphrase dialog: set, lock, mistype, dismiss, and enter", async () => {
    render(<App />)
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'clicker' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/This vault lives only in this browser/)).to.not.be.null

    // Set: the first store asks for a new vault's passphrase.
    fireEvent.click(await screen.findByRole('button', { name: 'Add a box' }))
    fireEvent.change(screen.getByPlaceholderText('anthropic_api_key'), { target: { value: 'anthropic_api_key' } })
    fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-test-not-a-real-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const choosing = await screen.findByRole('dialog', { name: 'Choose a vault passphrase' })
    fireEvent.change(within(choosing).getByPlaceholderText('vault passphrase'), { target: { value: 'correct horse one' } })
    fireEvent.change(within(choosing).getByPlaceholderText('confirm vault passphrase'), { target: { value: 'correct horse one' } })
    fireEvent.click(within(choosing).getByRole('button', { name: 'Create vault' }))
    await screen.findByText(/🔓 unlocked until/)
    // The save goes on once the vault unlocks: its box is listed before the lock below, which
    // would otherwise land while the save is under way.
    await screen.findByRole('button', { name: 'view' })

    // Lock, then mistype: the dialog stays, saying so.
    fireEvent.click(screen.getByRole('button', { name: 'lock now' }))
    await screen.findByText('🔒 locked')
    fireEvent.click(await screen.findByRole('button', { name: 'view' }))
    const unlocking = await screen.findByRole('dialog', { name: 'Unlock your vault' })
    fireEvent.change(within(unlocking).getByPlaceholderText('vault passphrase'), { target: { value: 'correct horse wrong' } })
    fireEvent.click(within(unlocking).getByRole('button', { name: 'Unlock' }))
    await waitFor(() => { expect(within(unlocking).getByRole('alert').textContent).to.not.eq('') })

    // Dismiss: nothing is shown.
    fireEvent.keyDown(within(unlocking).getByPlaceholderText('vault passphrase'), { key: 'Escape' })
    await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
    expect(screen.queryByText('sk-ant-test-not-a-real-key')).to.be.null

    // Enter: the whisper shows.
    fireEvent.click(screen.getByRole('button', { name: 'view' }))
    fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'correct horse one' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await screen.findByText('sk-ant-test-not-a-real-key')
  })

})
