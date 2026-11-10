// @vitest-environment jsdom
// fake-indexeddb installs an indexedDB global before the demo's VaultDB and DeviceDB open their shelves.
import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LandingPage } from '../../src/pages/LandingPage'
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
  localStorage.clear()
})

describe("LandingPage", () => {
  it("shows a signed-in user the widget form alone, with no control panels, and links to the labs", async () => {
    render(<LandingPage />)
    TH.signInAs('margo')
    await screen.findByRole('heading', { name: 'Widget form' })
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).to.deep.equal(['Widget form'])
    expect(screen.queryByRole('complementary', { name: 'Developer tools' })).to.be.null
    expect(screen.getByRole('link', { name: /The labs/ }).getAttribute('href')).to.eq('labs.html')
  })
})
