// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VaultError, memoryStore } from 'safebyok'
import { SessionBar } from '../../src/components/SessionBar'
import { createAuth } from '../../src/lib/auth'
import * as TH from '../test-helpers'

/** The bar over a fresh fake auth, in a vault for `u1`. */
const renderBar = () => {
  const world = TH.makeWorld()
  const dbStore = memoryStore()
  const auth = createAuth({ applabel: 'acme', dbStore, deviceStore: memoryStore() })
  world.renderInVault(<><SessionBar auth={auth} /><TH.VaultProbe /></>)
  return { world, auth, dbStore }
}

const signInAs = (userlabelText: string) => {
  fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: userlabelText } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe("SessionBar", () => {
  it("signs in by username, trimmed, and says who is signed in", async () => {
    const { auth } = renderBar()
    signInAs('  margo ')
    await screen.findByText('margo')
    expect(auth.getSnapshot()?.userlabel).to.eq('margo')
    expect(screen.getByText(`(${auth.getSnapshot()?.userId ?? ''})`)).to.not.be.null
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
    await screen.findByText(/A username is 2-64 letters/)
    expect(auth.getSnapshot()).to.be.null
  })

  it("locks the vault as it signs out", async () => {
    const { auth } = renderBar()
    signInAs('margo')
    await screen.findByText('margo')
    fireEvent.click(await screen.findByRole('button', { name: 'unlock' }))
    await TH.expectProbeState('unlocked')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByPlaceholderText('username')
    expect(auth.getSnapshot()).to.be.null
    expect(screen.getByTestId('state').textContent).to.eq('locked')
  })

  it("deletes the account and its vault, once the user confirms: the vault stays gone, nothing asking for it again", async () => {
    const { world, auth, dbStore } = renderBar()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    signInAs('margo')
    await screen.findByText('margo')
    await TH.expectProbeState('locked')
    const deleted = await TH.propsOf(world.vaultDB, TH.scopeOf('u1'))
    expect(deleted).to.not.be.null
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await screen.findByPlaceholderText('username')
    expect(auth.getSnapshot()).to.be.null
    expect(dbStore.read('account:acme:margo')).to.be.null
    // This provider's userId is not the auth's: it stays on u1, and still asks for nothing anew.
    await TH.expectProbeState('none')
    await new Promise((resolve) => { setTimeout(resolve, 50) })
    expect(await TH.propsOf(world.vaultDB, TH.scopeOf('u1'))).to.be.null
  })

  it("keeps the account and says why when the vault cannot be deleted", async () => {
    const { world, auth } = renderBar()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    signInAs('margo')
    await screen.findByText('margo')
    await TH.expectProbeState('locked')
    vi.spyOn(world.vaultDB, 'delVault').mockResolvedValueOnce(TH.bad(new VaultError('storage_unavailable', 'The vault storage could not be reached: try again shortly.')))
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(await screen.findByText('The vault storage could not be reached: try again shortly.')).to.not.be.null
    expect(auth.getSnapshot()?.userlabel).to.eq('margo')
    expect(await TH.propsOf(world.vaultDB, TH.scopeOf('u1'))).to.not.be.null
  })

  it("keeps the account when the user thinks better of deleting it", async () => {
    const { auth } = renderBar()
    signInAs('margo')
    await screen.findByText('margo')
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(auth.getSnapshot()?.userlabel).to.eq('margo')
  })
})
