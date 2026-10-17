// @vitest-environment jsdom
// fake-indexeddb installs an indexedDB global before the demo's stores open their shelves.
import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App'

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
    await screen.findByText(/No lockboxes yet/)
    expect(screen.getByText('The Knock-Knock Machine')).to.not.be.null
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByPlaceholderText('username')
    expect(screen.queryByText('The Knock-Knock Machine')).to.be.null
  })

  it("clicks through the passphrase dialog: set, lock, mistype, dismiss, enter, and start over", async () => {
    render(<App />)
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'clicker' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/This vault lives only in this browser/)).to.not.be.null

    // Set: the first store asks for a new vault's passphrase.
    fireEvent.click(await screen.findByRole('button', { name: 'Add a lockbox' }))
    fireEvent.change(screen.getByPlaceholderText('anthropic_api_key'), { target: { value: 'anthropic_api_key' } })
    fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-test-not-a-real-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const choosing = await screen.findByRole('dialog', { name: 'Choose a vault passphrase' })
    fireEvent.change(within(choosing).getByPlaceholderText('vault passphrase'), { target: { value: 'correct horse one' } })
    fireEvent.click(within(choosing).getByRole('button', { name: 'Create vault' }))
    await screen.findByText(/🔓 unlocked until/)

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

    // Forgot it: start a new vault from the dialog, emptied of every lockbox.
    fireEvent.click(screen.getByRole('button', { name: 'lock now' }))
    await screen.findByText('🔒 locked')
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Forgot it? Start a new vault' }))
    fireEvent.click(screen.getByRole('button', { name: 'Erase and start over' }))
    fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'correct horse two' } })
    expect(screen.getByRole('dialog', { name: 'Choose a vault passphrase' })).to.not.be.null
    fireEvent.click(screen.getByRole('button', { name: 'Create vault' }))
    await screen.findByText(/No lockboxes yet/)
  })
})
