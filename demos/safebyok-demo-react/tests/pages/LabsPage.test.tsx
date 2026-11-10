// @vitest-environment jsdom
// fake-indexeddb installs an indexedDB global before the demo's VaultDB and DeviceDB open their shelves.
import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LabsPage } from '../../src/pages/LabsPage'
import { vaultDB } from '../../src/lib/storage'
import * as TH from '../test-helpers'

// The pages derive through the browser's Argon2id: 64 MiB for every passphrase typed, near a
// second each here. What these tests click through is the page, not the deriver (the core's
// tests keep to that), so the cheap test deriver stands in.
vi.mock('safebyok/browser', async (importOriginal) => {
  const browser = await importOriginal<typeof import('safebyok/browser')>()
  const { testDeriver } = await import('safebyok/testing')
  return { ...browser, browserOpts: (opts: { dbName: string }) => ({ ...browser.browserOpts(opts), keyDeriver: testDeriver }) }
})

afterEach(() => {
  vaultDB.setOnline(true)
  localStorage.clear()
})

describe("LabsPage", () => {
  it("shows the sign-in strip to a visitor, and no flow", () => {
    render(<LabsPage />)
    expect(screen.getByPlaceholderText('username')).to.not.be.null
    expect(screen.getByText('Sign in to keep a key and knock.')).to.not.be.null
    expect(screen.queryByRole('button', { name: 'Sign out' })).to.be.null
  })

  it("signs a user in to the flows, and out again", async () => {
    render(<LabsPage />)
    TH.signInAs('margo')
    await screen.findByText('margo')
    await screen.findByRole('heading', { name: 'DOM form' })
    const titles = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(titles).to.deep.equal(['Widget form', 'Toolkit form', 'DOM form', 'Behind the scenes'])
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByPlaceholderText('username')
    expect(screen.queryByText('margo')).to.be.null
  })

  it("says the backend is off while the outage switch is", async () => {
    render(<LabsPage />)
    TH.signInAs('margo')
    const flow = within(await screen.findByRole('region', { name: 'DOM form' }))
    const adding = await flow.findByRole<HTMLButtonElement>('button', { name: 'Add key' })
    await waitFor(() => { expect(adding.disabled).to.be.false })
    const backend = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Backend online' })
    fireEvent.click(backend)
    expect(backend.checked).to.be.false
    fireEvent.click(adding)
    await TH.answerPassphraseDialog()
    await screen.findByText(/backend is switched off/)
    fireEvent.click(backend)
    fireEvent.click(flow.getByRole('button', { name: 'Add key' }))
    await TH.answerPassphraseDialog()
    await flow.findByRole('button', { name: 'Save' })
  })
})
