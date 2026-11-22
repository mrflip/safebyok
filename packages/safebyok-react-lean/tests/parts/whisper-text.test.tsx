import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { isVaultError } from 'safebyok'
import { UnlockDialog } from '../../src/kit'
import { WhisperText } from '../../src/parts'
import * as TH from '../test-helpers'

/** The bank's stage as a line of text, the joke service's key as a `WhisperText`, and the unlock dialog. */
function KeyScreen({ world, field = 'apiKey', masked, onError }: Readonly<{ world: TH.ProviderWorld, field?: string, masked?: ReactNode, onError?: ((err: Error) => void) | undefined }>) {
  const stage = world.Bank.useBank((snap) => snap.stage)
  return (
    <>
      <p>{stage}</p>
      <WhisperText labelpath={TH.JokesPath} field={field} masked={masked} onError={onError} />
      <UnlockDialog />
    </>
  )
}

/** A world with the joke service's key stored, rendered under its provider, once it shows the bank locked. */
async function renderKey(onError?: (err: Error) => void, masked?: ReactNode) {
  const world = await TH.buildProviderWorld({ stored: 'jokes' })
  const { container, rerender } = render(TH.providerTreeOf(world, <KeyScreen world={world} masked={masked} onError={onError} />, { userid: TH.ProviderUser }))
  await screen.findByText('locked')
  return { world, container, rerender }
}

/** True while the page shows the joke service's key. */
function isKeyShown(): boolean {
  return document.body.textContent.includes(TH.JokesKey)
}

/** Press Show, then unlock the dialog it opens with the stored passphrase, once the key shows. */
async function showAndUnlock(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Show' }))
  await screen.findByRole('dialog')
  fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: TH.TestPassphrase } })
  fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
  await waitFor(() => { expect(isKeyShown()).to.eq(true) })
}

describe("WhisperText", () => {
  it("shows the field masked until Show, then asks for the unlock and writes it into the page, holding it nowhere", async () => {
    const { world, container } = await renderKey()
    expect(screen.getByText('••••••••')).to.exist
    expect(isKeyShown()).to.eq(false)
    await showAndUnlock()
    expect(screen.getByRole('button', { name: 'Hide' }).getAttribute('aria-pressed')).to.eq('true')
    TH.expectTextUnheld(TH.JokesKey, container, world.clients())
  })

  it("takes the text out of the page on Hide", async () => {
    await renderKey()
    await showAndUnlock()
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(isKeyShown()).to.eq(false)
    expect(screen.getByText('••••••••')).to.exist
  })

  it("takes the text out of the page on Hide when the mask is an element", async () => {
    await renderKey(undefined, <code>MASK</code>)
    await showAndUnlock()
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(isKeyShown()).to.eq(false)
    expect(screen.getByText('MASK')).to.exist
  })

  it("takes the text out of the page when the bank locks", async () => {
    const { world } = await renderKey()
    await showAndUnlock()
    world.Bank.lock()
    await screen.findByText('locked')
    expect(isKeyShown()).to.eq(false)
    expect(screen.getByRole('button', { name: 'Show' })).to.exist
  })

  it("shows the text at once on an unlocked bank", async () => {
    const { world } = await renderKey()
    const asked = world.Bank.withWhisper(TH.JokesPath, () => null)
    await screen.findByRole('dialog')
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: TH.TestPassphrase } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await asked
    await screen.findByText('unlocked')
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    await waitFor(() => { expect(isKeyShown()).to.eq(true) })
    expect(screen.queryByRole('dialog')).to.be.null
  })

  it("starts masked again when it is given another field", async () => {
    const { world, rerender } = await renderKey()
    await showAndUnlock()
    rerender(TH.providerTreeOf(world, <KeyScreen world={world} field="other" />, { userid: TH.ProviderUser }))
    expect(isKeyShown()).to.eq(false)
    expect(screen.getByText('••••••••')).to.exist
    expect(screen.getByRole('button', { name: 'Show' })).to.exist
  })

  it("stays masked and reports the refusal when the unlock is dismissed", async () => {
    const onError = vi.fn<(err: Error) => void>()
    await renderKey(onError)
    const show = screen.getByRole<HTMLButtonElement>('button', { name: 'Show' })
    fireEvent.click(show)
    expect(show.disabled).to.eq(true)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(onError).toHaveBeenCalledOnce() })
    expect(isVaultError(onError.mock.calls[0]?.[0], 'dismissed')).to.eq(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Show' }).disabled).to.eq(false)
    expect(isKeyShown()).to.eq(false)
  })
})
