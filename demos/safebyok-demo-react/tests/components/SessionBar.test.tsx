// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as TH from '../test-helpers'

/** Render the bar with a fresh fake auth, in a bank for `u1`. */
const renderBar = async () => {
  const auth = TH.makeAuth()
  await TH.renderInBank(<TH.LiveSessionBar auth={auth} />)
  return { auth }
}

describe("SessionBar", () => {
  it("signs in by username, trimmed, and shows the account menu", async () => {
    const { auth } = await renderBar()
    TH.signInAs('  margo ')
    await screen.findByText('margo')
    expect(auth.getSnapshot()?.userlabel).to.eq('margo')
    expect(screen.getByRole('region', { name: 'Account' })).to.not.be.null
    expect(screen.queryByPlaceholderText('username')).to.be.null
  })

  it("signs in from the keyboard too", async () => {
    const { auth } = await renderBar()
    const field = screen.getByPlaceholderText('username')
    fireEvent.change(field, { target: { value: 'margo' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await screen.findByText('margo')
    expect(auth.getSnapshot()).to.not.be.null
  })

  it("asks the browser to keep this site's storage on the sign-in click, not before", async () => {
    const persist = vi.fn().mockResolvedValue(true)
    Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true })
    try {
      await renderBar()
      expect(persist).not.toHaveBeenCalled()
      TH.signInAs('margo')
      await screen.findByText('margo')
      expect(persist).toHaveBeenCalledOnce()
    } finally {
      Reflect.deleteProperty(navigator, 'storage')
    }
  })

  it("says what a username is when one will not do, and stays signed out", async () => {
    const { auth } = await renderBar()
    TH.signInAs('not a label')
    await screen.findByText(/A username is 2 to 40 lowercase letters/)
    expect(auth.getSnapshot()).to.be.null
  })
})
