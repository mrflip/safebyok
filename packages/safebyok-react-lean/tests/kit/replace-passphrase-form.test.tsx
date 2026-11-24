import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReplacePassphraseForm, UnlockForm } from '../../src/kit'
import * as TH from '../test-helpers'

const Passphrase = TH.TestPassphrase

/** A new passphrase, an obvious fake, that the world's strength checker finds strong. */
const NextPassphrase = 'a fake next passphrase'

/** A passphrase one letter off the stored one. */
const WrongPassphrase = 'correct horse battery stable'

/** The bank's stage as a line of text, beside the replace form, with the unlock form while it is locked. */
function StageScreen({ world }: Readonly<{ world: TH.ProviderWorld }>) {
  const stage = world.Bank.useWorld((snap) => snap.stage)
  return (
    <>
      <p>{stage}</p>
      <ReplacePassphraseForm username="hue@example.com" />
      {(stage === 'locked') && <UnlockForm />}
    </>
  )
}

/** A world with a bank stored, rendered under its provider, once it shows the bank locked. */
async function renderReplace() {
  const world = await TH.buildProviderWorld({ stored: 'jokes' })
  const { container } = render(TH.providerTreeOf(world, <StageScreen world={world} />, { userid: TH.ProviderUser }))
  await screen.findByText('locked')
  return { world, container }
}

/** Type `current`, then {@link NextPassphrase} and its confirmation, into the replace form, as the user would, waiting until its submit is enabled. */
async function typeReplacement(current: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('Current passphrase'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('New passphrase'), { target: { value: NextPassphrase } })
  fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: NextPassphrase } })
  await waitFor(() => { expect(replaceButton().disabled).to.eq(false) })
}

/** The Replace passphrase button. */
function replaceButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name: 'Replace passphrase' })
}

describe("ReplacePassphraseForm", () => {
  it("replaces the passphrase, holding neither the current one nor the new one, and the new one unlocks the bank", async () => {
    const { world, container } = await renderReplace()
    await typeReplacement(Passphrase)
    const release = world.deriver.hold()
    fireEvent.click(replaceButton())
    await screen.findByRole('button', { name: 'Replacing…' })
    TH.expectTextUnheld(Passphrase, container, world.clients())
    TH.expectTextUnheld(NextPassphrase, container, world.clients())
    release()
    await screen.findByText('unlocked')
    for (const text of [Passphrase, NextPassphrase]) { TH.expectTextUnheld(text, container, world.clients()) }
    // React resets the form once the action settles, which may be after the stage shows `unlocked`.
    await waitFor(() => { expect(screen.getByLabelText<HTMLInputElement>('Current passphrase').value).to.eq('') })
    expect(screen.getByLabelText<HTMLInputElement>('New passphrase').value).to.eq('')
    expect(screen.getByLabelText<HTMLInputElement>('Confirm passphrase').value).to.eq('')
    expect(replaceButton().disabled).to.eq(true)

    act(() => { world.Bank.lock() })
    fireEvent.change(await screen.findByLabelText('Passphrase'), { target: { value: Passphrase } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    const alert = await screen.findByText('That is not the passphrase.')
    expect(alert).to.exist
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: NextPassphrase } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await screen.findByText('unlocked')
  })

  it("says a wrong current passphrase is wrong, hands its field focus, keeps what was typed, and replaces nothing", async () => {
    const { world, container } = await renderReplace()
    await typeReplacement(WrongPassphrase)
    fireEvent.click(replaceButton())
    const field = screen.getByLabelText<HTMLInputElement>('Current passphrase')
    await waitFor(() => { expect(document.activeElement).to.eq(field) })
    const alerts = screen.getAllByRole('alert').map((alert) => alert.textContent)
    expect(alerts).to.include('That is not the passphrase.')
    expect(field.getAttribute('aria-invalid')).to.eq('true')
    await waitFor(() => { expect(replaceButton().disabled).to.eq(false) })
    expect(field.value).to.eq(WrongPassphrase)
    expect(screen.getByLabelText<HTMLInputElement>('New passphrase').value).to.eq(NextPassphrase)
    expect(screen.getByLabelText<HTMLInputElement>('Confirm passphrase').value).to.eq(NextPassphrase)
    for (const text of [WrongPassphrase, NextPassphrase]) { TH.expectTextUnheld(text, container, world.clients()) }

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: Passphrase } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await screen.findByText('unlocked')
  })

  it("keeps Replace disabled while the new passphrase is weak or unconfirmed", async () => {
    await renderReplace()
    fireEvent.change(screen.getByLabelText('Current passphrase'), { target: { value: Passphrase } })
    fireEvent.change(screen.getByLabelText('New passphrase'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: 'short' } })
    await screen.findByText('Twelve characters or more, please.')
    expect(replaceButton().disabled).to.eq(true)
    fireEvent.change(screen.getByLabelText('New passphrase'), { target: { value: NextPassphrase } })
    await screen.findByText('Strong enough')
    expect(screen.getByText('The passphrases do not match')).to.exist
    expect(replaceButton().disabled).to.eq(true)
  })
})
