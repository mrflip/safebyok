// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VaultError, memoryStore, type RequestCleartext } from 'safebyok'
import { BankProvider } from 'safebyok-react'
import { SessionBar } from '../../src/components/SessionBar'
import { createAuth } from '../../src/lib/auth'
import * as TH from '../test-helpers'

/** The bar over a fresh fake auth, in a vault for `u1`: behind the provider's own dialog, or `requestCleartext` when given. */
const renderBar = (requestCleartext?: RequestCleartext) => {
  const world = TH.makeWorld()
  const dbStore = memoryStore()
  const auth = createAuth({ applabel: 'acme', dbStore, deviceStore: memoryStore() })
  const ui = <><SessionBar auth={auth} /><TH.VaultProbe /></>
  if (requestCleartext === undefined) {
    world.renderInVault(ui)
  } else {
    const { user_id: _user_id, vaultlabel: _vaultlabel, ...bankOpts } = TH.memoryVaultOpts({ vaultDB: world.vaultDB, deviceDB: world.deviceDB })
    render(<BankProvider {...bankOpts} requestCleartext={requestCleartext} user_id="u1">{ui}</BankProvider>)
  }
  return { world, auth, dbStore }
}

/** A host's requestCleartext that answers a deletion with `passphrase`, as a dialog for it would, and declines every other gating. */
const deletingWith = (passphrase: string): RequestCleartext => async (gating) => {
  if (gating.gatingkind === 'del_vault') { await gating.attempt(passphrase) }
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
    fireEvent.click(await screen.findByRole('button', { name: 'unlock' }))
    await TH.answerPassphraseDialog()
    await TH.expectProbeState('unlocked')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByPlaceholderText('username')
    expect(auth.getSnapshot()).to.be.null
    expect(screen.getByTestId('state').textContent).to.eq('locked')
  })

  it("deletes the account and its vault, once the user confirms and a dialog of the host's own answers the deletion with the passphrase: the vault stays gone, nothing asking for it again", async () => {
    const { world, auth, dbStore } = renderBar(deletingWith(TH.Passphrase))
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    signInAs('margo')
    await screen.findByText('margo')
    await TH.expectProbeState('locked')
    const deleted = await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))
    expect(deleted).to.not.be.null
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await screen.findByPlaceholderText('username')
    expect(auth.getSnapshot()).to.be.null
    expect(dbStore.get('account:acme:margo')).to.be.null
    // This provider's user_id is not the auth's: it stays on u1, and still asks for nothing anew.
    await TH.expectProbeState('none')
    await new Promise((resolve) => { setTimeout(resolve, 50) })
    expect(await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))).to.be.null
  })

  it("keeps the account and says why when the vault cannot be deleted", async () => {
    const { world, auth } = renderBar(deletingWith(TH.Passphrase))
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    signInAs('margo')
    await screen.findByText('margo')
    await TH.expectProbeState('locked')
    vi.spyOn(world.vaultDB, 'tryDelVault').mockResolvedValueOnce(TH.bad(new VaultError('storage_unavailable', 'The vault storage could not be reached: try again shortly.')))
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(await screen.findByText('The vault storage could not be reached: try again shortly.')).to.not.be.null
    expect(auth.getSnapshot()?.userlabel).to.eq('margo')
    expect(await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))).to.not.be.null
  })

  it("deletes the account and its vault through the provider's own dialog, proven by the passphrase", async () => {
    const { world, auth } = renderBar()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    signInAs('margo')
    await screen.findByText('margo')
    await TH.expectProbeState('locked')
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await screen.findByRole('dialog', { name: 'Delete your vault' })
    await TH.answerPassphraseDialog()
    await screen.findByPlaceholderText('username')
    expect(auth.getSnapshot()).to.be.null
    expect(await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))).to.be.null
  })

  it("keeps the account and its vault, saying nothing, when the user cancels the deletion's dialog", async () => {
    const { world, auth } = renderBar()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    signInAs('margo')
    await screen.findByText('margo')
    await TH.expectProbeState('locked')
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await screen.findByRole('dialog', { name: 'Delete your vault' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
    await TH.wakeupAtNextTick()
    expect(document.querySelector('.gripe')).to.be.null
    expect(auth.getSnapshot()?.userlabel).to.eq('margo')
    expect(await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))).to.not.be.null
  })

  it("deletes an account whose vault has no passphrase yet without asking: there is nothing in it, and nothing to prove its deletion", async () => {
    const { world, auth } = renderBar()
    signInAs('margo')
    await screen.findByText('margo')
    await TH.expectProbeState('novel')
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await screen.findByPlaceholderText('username')
    expect(screen.queryByRole('dialog')).to.be.null
    expect(auth.getSnapshot()).to.be.null
    expect(await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))).to.not.be.null
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
