// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { WaysIn } from '../../src/components/WaysIn'
import * as TH from '../test-helpers'

/**
 * A browser that offers passkeys, whose authenticator the user dismisses every time: enough to
 * see whether the vault got as far as asking for one. Returns the authenticator's `create`.
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
 * WaysIn over `u1`'s vault, made on another device, once its passphrase field shows; `prepare`
 * changes the vault first, from outside the page.
 */
const renderWaysIn = async (prepare?: (world: ReturnType<typeof TH.makeWorld>) => Promise<void>) => {
  const world = TH.makeWorld()
  await world.seed({})
  await prepare?.(world)
  world.renderInVault(<WaysIn />)
  const field = await screen.findByLabelText<HTMLInputElement>(/^your passphrase/)
  const form = field.closest('form')
  if (form === null) { throw new Error('the passphrase field has no form around it') }
  return { world, field, form }
}

describe("WaysIn", () => {
  it("files the passphrase under a hidden username, as the passphrase dialog does, for a password manager", async () => {
    installDismissedAuthenticator()
    const { field, form } = await renderWaysIn()
    const username = form.querySelector<HTMLInputElement>('input[autocomplete="username"]')
    expect(username?.value).to.eq('u1 (main vault)')
    expect(username?.hidden).to.be.true
    expect(username?.style.display).to.eq('none')
    expect(field.getAttribute('autocomplete')).to.eq('current-password')
  })

  it("reads the passphrase as a button is pressed, so an autofill that sends no input event still counts", async () => {
    const { field } = await renderWaysIn()
    // As a password manager may fill it: the value set, no input event sent.
    field.value = TH.Passphrase
    fireEvent.change(screen.getByLabelText(/^new passphrase/), { target: { value: 'a new horse battery staple' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change passphrase' }))
    await waitFor(() => { expect(field.value).to.eq('') })
    expect(document.querySelector('.gripe')).to.be.null
  })

  it("says the passphrase is wrong, and keeps what was typed", async () => {
    const { field } = await renderWaysIn()
    fireEvent.change(field, { target: { value: 'not the passphrase' } })
    fireEvent.change(screen.getByLabelText(/^new passphrase/), { target: { value: 'a new horse battery staple' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change passphrase' }))
    await waitFor(() => { expect(document.querySelector('.gripe')).to.not.be.null })
    expect(field.value).to.eq('not the passphrase')
  })

  it("asks the authenticator first for a fingerprint, and keeps the form as it was when the user dismisses it", async () => {
    const create = installDismissedAuthenticator()
    const { field } = await renderWaysIn()
    fireEvent.change(field, { target: { value: TH.Passphrase } })
    fireEvent.click(screen.getByRole('button', { name: 'Add fingerprint' }))
    await waitFor(() => { expect(create).to.have.callCount(1) })
    expect(document.querySelector('.gripe')).to.be.null
    expect(field.value).to.eq(TH.Passphrase)
    expect(screen.getByText('no passkey')).to.not.be.null
  })

  it("changes the passphrase, the standing one its proof, and empties the form", async () => {
    const { world, field } = await renderWaysIn()
    fireEvent.change(field, { target: { value: TH.Passphrase } })
    fireEvent.change(screen.getByLabelText(/^new passphrase/), { target: { value: 'a new horse battery staple' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change passphrase' }))
    await waitFor(() => { expect(field.value).to.eq('') })
    expect(document.querySelector('.gripe')).to.be.null
    const vault = await world.open()
    await vault.unlock('a new horse battery staple')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("offers to change the passphrase in a browser without passkeys, but no fingerprint to add, nor one to remove while there is none", async () => {
    await renderWaysIn()
    expect(screen.getByRole('button', { name: 'Change passphrase' })).to.not.be.null
    expect(screen.queryByRole('button', { name: 'Add fingerprint' })).to.be.null
    expect(screen.queryByRole('button', { name: 'Remove fingerprint' })).to.be.null
    expect(screen.getByText('no passkey')).to.not.be.null
  })

  it("offers to replace or remove the vault's passkey, and removes it with the passphrase as proof", async () => {
    installDismissedAuthenticator()
    const { field } = await renderWaysIn(async (world) => {
      const vault = await world.openUnlocked()
      await vault.putWayin(TH.Passphrase, await TH.passkeyOf('laptop'))
    })
    expect(screen.getByRole('button', { name: 'Replace fingerprint' })).to.not.be.null
    fireEvent.change(field, { target: { value: TH.Passphrase } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove fingerprint' }))
    await screen.findByText('no passkey')
    expect(screen.queryByRole('button', { name: 'Remove fingerprint' })).to.be.null
    expect(screen.getByRole('button', { name: 'Add fingerprint' })).to.not.be.null
  })
})
