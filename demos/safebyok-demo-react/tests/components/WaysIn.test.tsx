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

/** WaysIn over `u1`'s vault, made on another device, once its passphrase field shows. */
const renderWaysIn = async () => {
  const world = TH.makeWorld()
  await world.seed({})
  world.renderInVault(<WaysIn />)
  const field = await screen.findByLabelText<HTMLInputElement>(/^your passphrase/)
  const form = field.closest('form')
  if (form === null) { throw new Error('the passphrase field has no form around it') }
  return { field, form }
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

  it("reads the passphrase as the form is submitted, so an autofill that sends no input event still counts", async () => {
    const create = installDismissedAuthenticator()
    const { field } = await renderWaysIn()
    // As a password manager may fill it: the value set, no input event sent.
    field.value = TH.Passphrase
    fireEvent.click(screen.getByRole('button', { name: 'Add fingerprint' }))
    await waitFor(() => { expect(create).to.have.callCount(1) })
    expect(document.querySelector('.gripe')).to.be.null
  })

  it("says the passphrase is wrong, never asking the authenticator, and keeps what was typed", async () => {
    const create = installDismissedAuthenticator()
    const { field } = await renderWaysIn()
    fireEvent.change(field, { target: { value: 'not the passphrase' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add fingerprint' }))
    await waitFor(() => { expect(document.querySelector('.gripe')).to.not.be.null })
    expect(create).to.not.have.been.called
    expect(field.value).to.eq('not the passphrase')
  })
})
