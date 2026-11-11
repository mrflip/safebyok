// @vitest-environment jsdom
// Import fake-indexeddb first: it installs an indexedDB global before the demo's VaultDB and DeviceDB open their databases.
import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LandingPage } from '../../src/pages/LandingPage'
import * as TH from '../test-helpers'

// The real pages derive keys with the browser's Argon2id: 64 MiB for every passphrase typed, about a
// second each here. These tests exercise the page, not the deriver (the core's tests cover that), so
// they swap in the cheap test deriver. They also swap in the quiet logger, which skips the console
// notice about a `test_` deriver label.
vi.mock('safebyok/browser', async (importOriginal) => {
  const browser = await importOriginal<typeof import('safebyok/browser')>()
  const { quietLogger, testDeriver } = await import('safebyok/testing')
  return { ...browser, browserOpts: (opts: { dbName: string }) => ({ ...browser.browserOpts(opts), keyDeriver: testDeriver, logger: quietLogger }) }
})

afterEach(() => {
  localStorage.clear()
})

describe("LandingPage", () => {
  it("shows a signed-in user only the widget form, and a link to the labs", async () => {
    render(<LandingPage />)
    TH.signInAs('margo')
    await screen.findByRole('heading', { name: 'Widget form' })
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).to.deep.equal(['Widget form'])
    expect(screen.queryByRole('complementary', { name: 'Developer tools' })).to.be.null
    expect(screen.getByRole('link', { name: /The labs/ }).getAttribute('href')).to.eq('labs.html')
  })
})
