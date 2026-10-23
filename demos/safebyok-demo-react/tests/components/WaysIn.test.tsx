// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react'
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

/** Waits until WaysIn shows its gripe, and hands back what it says. */
const gripeShown = async () => {
  await waitFor(() => { expect(document.querySelector('.gripe')).to.not.be.null })
  return document.querySelector('.gripe')?.textContent ?? ''
}

describe("WaysIn", () => {
  it("shows the vault's ways in while it is locked: its passphrase, and no passkey", async () => {
    await renderWaysIn()
    expect(screen.getByText('passphrase')).to.not.be.null
    expect(screen.getByText('no passkey')).to.not.be.null
  })

  it("raises putWayin('passphrase') at Change passphrase, which the provider's dialog declines for now: it says so, and the passphrase stands", async () => {
    const { world } = await renderWaysIn()
    fireEvent.click(screen.getByRole('button', { name: 'Change passphrase' }))
    expect(await gripeShown()).to.match(/declined/)
    expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    const vault = await world.open()
    await TH.unlock(vault, TH.Passphrase)
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("raises putWayin('passkey') at Add fingerprint, which the provider's dialog declines for now, asking no authenticator: it says so, and the vault keeps no passkey", async () => {
    const create = installDismissedAuthenticator()
    await renderWaysIn()
    fireEvent.click(screen.getByRole('button', { name: 'Add fingerprint' }))
    expect(await gripeShown()).to.match(/declined/)
    expect(create).not.toHaveBeenCalled()
    expect(screen.getByText('no passkey')).to.not.be.null
  })

  it("offers to change the passphrase in a browser without passkeys, but no fingerprint to add, nor one to remove while there is none", async () => {
    await renderWaysIn()
    expect(screen.getByRole('button', { name: 'Change passphrase' })).to.not.be.null
    expect(screen.queryByRole('button', { name: 'Add fingerprint' })).to.be.null
    expect(screen.queryByRole('button', { name: 'Remove fingerprint' })).to.be.null
    expect(screen.getByText('no passkey')).to.not.be.null
  })

  it("offers to replace or remove the vault's passkey, and raises delWayin('passkey') at Remove fingerprint, which the provider's dialog declines for now: the passkey stays", async () => {
    installDismissedAuthenticator()
    await renderWaysIn(async (world) => {
      const vault = await world.openUnlocked()
      await TH.putWayin(vault, TH.Passphrase, await TH.passkeyOf('laptop'))
    })
    expect(screen.getByRole('button', { name: 'Replace fingerprint' })).to.not.be.null
    fireEvent.click(screen.getByRole('button', { name: 'Remove fingerprint' }))
    expect(await gripeShown()).to.match(/declined/)
    expect(screen.queryByText('no passkey')).to.be.null
    expect(screen.getByRole('button', { name: 'Remove fingerprint' })).to.not.be.null
  })
})
