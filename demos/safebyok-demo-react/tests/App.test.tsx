// @vitest-environment jsdom
// fake-indexeddb installs an indexedDB global before the demo's stores open their shelves.
import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App'
import { vaultDB } from '../src/lib/stores'
import * as TH from './test-helpers'

// The App derives through the browser's Argon2id: 64 MiB for every passphrase typed, near a
// second each here. What these tests click through is the page, not the deriver (the core's
// tests hold that), so the cheap test deriver stands in.
vi.mock('safebyok/browser', async (importOriginal) => {
  const browser = await importOriginal<typeof import('safebyok/browser')>()
  const { testDeriver } = await import('safebyok/testing')
  return { ...browser, browserOpts: (opts: { dbName: string }) => ({ ...browser.browserOpts(opts), keyDeriver: testDeriver }) }
})

afterEach(() => {
  vaultDB.setOnline(true)
  localStorage.clear()
})

describe("App", () => {
  it("shows the sign-in strip to a visitor, and no flow", () => {
    render(<App />)
    expect(screen.getByPlaceholderText('username')).to.not.be.null
    expect(screen.getByText('Sign in to keep a key and knock.')).to.not.be.null
    expect(screen.queryByRole('button', { name: 'Sign out' })).to.be.null
  })

  it("signs a user in to the flows, and out again", async () => {
    render(<App />)
    TH.signInAs('margo')
    await screen.findByText('margo')
    expect(screen.getByRole('heading', { name: 'Knock-knock, with managed fields' })).to.not.be.null
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByPlaceholderText('username')
    expect(screen.queryByText('margo')).to.be.null
  })

  it("says the backend is off when the outage switch is, and recovers once it is back on", async () => {
    render(<App />)
    TH.signInAs('margo')
    const adding = await screen.findByRole<HTMLButtonElement>('button', { name: 'Add key' })
    await waitFor(() => { expect(adding.disabled).to.be.false })
    const backend = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Backend online' })
    fireEvent.click(backend)
    expect(backend.checked).to.be.false
    fireEvent.click(adding)
    await TH.answerPassphraseDialog()
    await screen.findByText(/backend is switched off/)
    fireEvent.click(backend)
    fireEvent.click(screen.getByRole('button', { name: 'Add key' }))
    await TH.answerPassphraseDialog()
    await screen.findByRole('button', { name: 'Save' })
  })
})
