// @vitest-environment jsdom
// fake-indexeddb installs an indexedDB global before the demo's stores open their shelves.
import 'fake-indexeddb/auto'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App'

// The App derives through the browser's Argon2id: 64 MiB for every passphrase typed, near a
// second each here. What these tests click through is the page, not the deriver (the core's
// tests hold that), so the cheap test deriver stands in.
vi.mock('safebyok/browser', async (importOriginal) => {
  const browser = await importOriginal<typeof import('safebyok/browser')>()
  const { testDeriver } = await import('safebyok/testing')
  return { ...browser, argon2idWebV1Deriver: testDeriver }
})

afterEach(() => { localStorage.clear() })

describe("App", () => {
  it("shows the sign-in strip to a visitor", () => {
    render(<App />)
    expect(screen.getByPlaceholderText('username')).to.not.be.null
    expect(screen.queryByRole('button', { name: 'Sign out' })).to.be.null
  })

  it("signs a user in and out", async () => {
    render(<App />)
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'margo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText('margo')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByPlaceholderText('username')
    expect(screen.queryByText('margo')).to.be.null
  })
})
