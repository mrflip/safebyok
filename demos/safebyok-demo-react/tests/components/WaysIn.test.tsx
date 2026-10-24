// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { WaysIn } from '../../src/components/WaysIn'
import * as TH from '../test-helpers'

/**
 * A browser that offers passkeys, whose authenticator the user dismisses every time: enough to
 * see whether anything got as far as asking for one. Returns the authenticator's `create`.
 */
const installDismissedAuthenticator = () => {
  const create = vi.fn(() => Promise.reject(new DOMException('The user dismissed it.', 'NotAllowedError')))
  // Its presence is what says the browser offers passkeys.
  vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() { /* never called */ })
  Object.defineProperty(navigator, 'credentials', { value: { create }, configurable: true })
  onTestFinished(() => { Reflect.deleteProperty(navigator, 'credentials') })
  return create
}

/**
 * WaysIn over `u1`'s vault, made on another device, once its buttons show; `prepare` changes the
 * vault first, from outside the page.
 */
const renderWaysIn = async (prepare?: (world: ReturnType<typeof TH.makeWorld>) => Promise<void>) => {
  const world = TH.makeWorld()
  await world.seed({})
  await prepare?.(world)
  world.renderInVault(<WaysIn />)
  await screen.findByRole('button', { name: 'Change passphrase' })
  return { world }
}

describe("WaysIn", () => {
  it("shows the vault's ways in while it is locked: its passphrase, and no passkey", async () => {
    await renderWaysIn()
    expect(screen.getByText('passphrase')).to.not.be.null
    expect(screen.getByText('no passkey')).to.not.be.null
  })

  it("raises putWayin('passphrase') at Change passphrase, which the provider's dialog answers with the current passphrase and the next: the next unlocks the vault", async () => {
    const { world } = await renderWaysIn()
    fireEvent.click(screen.getByRole('button', { name: 'Change passphrase' }))
    const dialog = await screen.findByRole('dialog', { name: 'Change your vault passphrase' })
    fireEvent.change(within(dialog).getByPlaceholderText('current passphrase'), { target: { value: TH.Passphrase } })
    fireEvent.change(within(dialog).getByPlaceholderText('new passphrase'), { target: { value: 'a new passphrase entirely' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change passphrase' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
    expect(document.querySelector('.gripe')).to.be.null
    const vault = await world.open()
    await TH.unlock(vault, 'a new passphrase entirely')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("says nothing when the user cancels a change: the passphrase stands", async () => {
    const { world } = await renderWaysIn()
    fireEvent.click(screen.getByRole('button', { name: 'Change passphrase' }))
    await screen.findByRole('dialog', { name: 'Change your vault passphrase' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
    await TH.wakeupAtNextTick()
    expect(document.querySelector('.gripe')).to.be.null
    const vault = await world.open()
    await TH.unlock(vault, TH.Passphrase)
  })

  it("raises putWayin('passkey') at Add fingerprint, whose dialog takes the passphrase and then asks the authenticator: dismissed, the dialog stays and the vault keeps no passkey", async () => {
    const create = installDismissedAuthenticator()
    await renderWaysIn()
    fireEvent.click(screen.getByRole('button', { name: 'Add fingerprint' }))
    await screen.findByRole('dialog', { name: 'Add a passkey' })
    fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: TH.Passphrase } })
    fireEvent.click(screen.getByRole('button', { name: 'Add passkey' }))
    await waitFor(() => { expect(create).toHaveBeenCalledOnce() })
    expect(screen.getByRole('dialog', { name: 'Add a passkey' })).to.not.be.null
    expect(screen.getByText('no passkey')).to.not.be.null
  })

  it("offers to change the passphrase in a browser without passkeys, but no fingerprint to add, nor one to remove while there is none", async () => {
    await renderWaysIn()
    expect(screen.getByRole('button', { name: 'Change passphrase' })).to.not.be.null
    expect(screen.queryByRole('button', { name: 'Add fingerprint' })).to.be.null
    expect(screen.queryByRole('button', { name: 'Remove fingerprint' })).to.be.null
    expect(screen.getByText('no passkey')).to.not.be.null
  })

  it("offers to replace or remove the vault's passkey, and raises delWayin('passkey') at Remove fingerprint, whose dialog takes the passphrase: the passkey goes", async () => {
    installDismissedAuthenticator()
    await renderWaysIn(async (world) => {
      const vault = await world.openUnlocked()
      await TH.putWayin(vault, TH.Passphrase, await TH.passkeyOf('laptop'))
    })
    expect(screen.getByRole('button', { name: 'Replace fingerprint' })).to.not.be.null
    fireEvent.click(screen.getByRole('button', { name: 'Remove fingerprint' }))
    await screen.findByRole('dialog', { name: 'Remove your passkey' })
    await TH.answerPassphraseDialog()
    expect(await screen.findByText('no passkey')).to.not.be.null
    expect(screen.queryByRole('button', { name: 'Remove fingerprint' })).to.be.null
  })
})
