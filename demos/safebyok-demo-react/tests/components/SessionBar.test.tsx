// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStore } from 'safebyok-old'
import { SessionBar } from '../../src/components/SessionBar'
import { createAuth } from '../../src/lib/auth'
import * as TH from '../test-helpers'

/** The bar over a fresh fake auth, beside the vault probe, in a bank for `u1`. */
const renderBar = () => {
  const auth = createAuth({ applabel: 'acme', dbStore: memoryStore(), deviceStore: memoryStore() })
  const { vaultDB } = TH.renderInBank(<><SessionBar auth={auth} /><TH.VaultProbe /></>)
  return { auth, vaultDB }
}

const signInAs = (userlabelText: string) => {
  fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: userlabelText } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

afterEach(() => { vi.restoreAllMocks() })

/** Signs in as margo, and builds and unlocks her vault through the provider's dialog. */
const signInWithVault = async () => {
  signInAs('margo')
  await screen.findByText('margo')
  await TH.expectProbe('unborn none')
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  await TH.answerPassphraseDialog()
  await TH.expectProbe('present unlocked')
}

describe("SessionBar", () => {
  it("signs in by username, trimmed, and says who is signed in", async () => {
    const { auth } = renderBar()
    signInAs('  margo ')
    await screen.findByText('margo')
    expect(auth.getSnapshot()?.userlabel).to.eq('margo')
    expect(screen.getByText(`(${auth.getSnapshot()?.user_id ?? ''})`)).to.not.be.null
  })

  it("signs in from the keyboard too", async () => {
    const { auth } = renderBar()
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
      renderBar()
      expect(persist).not.toHaveBeenCalled()
      signInAs('margo')
      await screen.findByText('margo')
      expect(persist).toHaveBeenCalledOnce()
    } finally {
      Reflect.deleteProperty(navigator, 'storage')
    }
  })

  it("says what a username is when one will not do, and stays signed out", async () => {
    const { auth } = renderBar()
    signInAs('not a label')
    await screen.findByText(/A username is 2 to 40 lowercase letters/)
    expect(auth.getSnapshot()).to.be.null
  })

  it("locks the vault as it signs out", async () => {
    const { auth } = renderBar()
    signInAs('margo')
    await screen.findByText('margo')
    await TH.expectProbe('unborn none')
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await TH.answerPassphraseDialog()
    await TH.expectProbe('present unlocked')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByPlaceholderText('username')
    expect(auth.getSnapshot()).to.be.null
    await TH.expectProbe('present locked')
  })

  it("deletes the vault through the provider's dialog, then the account", async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    const { auth } = renderBar()
    await signInWithVault()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await TH.answerDeletionDialog()
    await screen.findByPlaceholderText('username')
    expect(auth.getSnapshot()).to.be.null
    await TH.expectProbe('unborn none')
  })

  it("deletes an account whose vault was never born, asking nothing", async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    const { auth } = renderBar()
    signInAs('margo')
    await screen.findByText('margo')
    await TH.expectProbe('unborn none')
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await screen.findByPlaceholderText('username')
    expect(auth.getSnapshot()).to.be.null
  })

  it("keeps the account and the vault when the user cancels the dialog", async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    const { auth } = renderBar()
    await signInWithVault()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await TH.settleAsks()
    expect(auth.getSnapshot()?.userlabel).to.eq('margo')
    expect(document.querySelector('.session-bar .gripe')).to.be.null
    await TH.expectProbe('present unlocked')
  })

  it("asks nothing of the vault when the user does not confirm", async () => {
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    const { auth } = renderBar()
    await signInWithVault()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).to.be.null
    expect(auth.getSnapshot()?.userlabel).to.eq('margo')
  })
})
