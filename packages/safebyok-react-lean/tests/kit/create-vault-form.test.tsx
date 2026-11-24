import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CreateVaultForm } from '../../src/kit'
import * as TH from '../test-helpers'

/** A new passphrase, an obvious fake, that the world's strength checker finds strong. */
const NewPassphrase = 'a fake new passphrase'

/** The bank's stage as a line of text, with the create-vault form while it is unborn. */
function StageScreen({ world }: Readonly<{ world: TH.ProviderWorld }>) {
  const stage = world.Bank.useBank((snap) => snap.stage)
  return (stage === 'unborn') ? <CreateVaultForm username="hue@example.com" /> : <p>{stage}</p>
}

/** The bank's stage as a line of text. */
function StageLine({ world }: Readonly<{ world: TH.ProviderWorld }>) {
  return <p>{world.Bank.useBank((snap) => snap.stage)}</p>
}

/** A world with nothing stored, rendered under its provider, once it shows the create-vault form. */
async function renderCreateVault() {
  const world = await TH.buildProviderWorld({ stored: 'none' })
  const { container } = render(TH.providerTreeOf(world, <StageScreen world={world} />, { userid: TH.ProviderUser }))
  await screen.findByLabelText('New passphrase')
  return { world, container }
}

/** Type `chosen` into the new-passphrase field and `confirming` into its confirmation, as the user would, the first first. */
function typeChosen(chosen: string, confirming: string): void {
  fireEvent.change(screen.getByLabelText('New passphrase'), { target: { value: chosen } })
  fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: confirming } })
}

/** The Create vault button. */
function createButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name: 'Create vault' })
}

describe("CreateVaultForm", () => {
  it("creates the vault once the passphrase is strong and confirmed, holding it nowhere", async () => {
    const { world, container } = await renderCreateVault()
    expect(createButton().disabled).to.eq(true)
    typeChosen(NewPassphrase, NewPassphrase)
    await screen.findByText('Strong enough')
    expect(screen.getByText('The passphrases match')).to.exist
    expect(createButton().disabled).to.eq(false)
    TH.expectTextUnheld(NewPassphrase, container, world.clients())

    const release = world.deriver.hold()
    fireEvent.click(createButton())
    await screen.findByRole('button', { name: 'Creating…' })
    TH.expectTextUnheld(NewPassphrase, container, world.clients())
    release()
    await screen.findByText('unlocked')
    TH.expectTextUnheld(NewPassphrase, container, world.clients())
  })

  it("keeps Create disabled while the passphrase is weak, and says why", async () => {
    await renderCreateVault()
    typeChosen('short', 'short')
    await screen.findByText('Twelve characters or more, please.')
    expect(createButton().disabled).to.eq(true)
  })

  it("keeps Create disabled until the strength verdict lands", async () => {
    const { world } = await renderCreateVault()
    const release = world.checker.hold()
    typeChosen(NewPassphrase, NewPassphrase)
    expect(screen.getByText('The passphrases match')).to.exist
    expect(createButton().disabled).to.eq(true)
    release()
    await waitFor(() => { expect(createButton().disabled).to.eq(false) })
  })

  it("keeps Create disabled while the confirmation differs", async () => {
    await renderCreateVault()
    typeChosen(NewPassphrase, `${NewPassphrase}!`)
    await screen.findByText('Strong enough')
    expect(screen.getByText('The passphrases do not match')).to.exist
    expect(screen.getByLabelText('Confirm passphrase').getAttribute('aria-invalid')).to.eq('true')
    expect(createButton().disabled).to.eq(true)
  })

  it("shows the refusal and keeps what was typed in both fields when the birth is refused", async () => {
    const { world, container } = await renderCreateVault()
    typeChosen(NewPassphrase, NewPassphrase)
    await waitFor(() => { expect(createButton().disabled).to.eq(false) })
    world.checker.throwing(new Error('The strength checker is down'))
    fireEvent.click(createButton())
    const alert = await screen.findByRole('alert')
    await waitFor(() => { expect(alert.textContent).to.eq('Something went wrong. Please try again later.') })
    await waitFor(() => { expect(createButton().disabled).to.eq(false) })
    expect(screen.getByLabelText<HTMLInputElement>('New passphrase').value).to.eq(NewPassphrase)
    expect(screen.getByLabelText<HTMLInputElement>('Confirm passphrase').value).to.eq(NewPassphrase)
    expect(document.activeElement).to.eq(screen.getByLabelText('New passphrase'))
    expect(screen.getByText('Strong enough')).to.exist
    TH.expectTextUnheld(NewPassphrase, container, world.clients())
  })

  it("empties both fields once the vault is stored", async () => {
    const world = await TH.buildProviderWorld({ stored: 'none' })
    render(TH.providerTreeOf(world, <><StageLine world={world} /><CreateVaultForm username="hue@example.com" /></>, { userid: TH.ProviderUser }))
    typeChosen(NewPassphrase, NewPassphrase)
    await waitFor(() => { expect(createButton().disabled).to.eq(false) })
    fireEvent.click(createButton())
    await screen.findByText('unlocked')
    await waitFor(() => { expect(screen.getByLabelText<HTMLInputElement>('New passphrase').value).to.eq('') })
    expect(screen.getByLabelText<HTMLInputElement>('Confirm passphrase').value).to.eq('')
    expect(screen.queryByText('Strong enough')).to.be.null
    expect(createButton().disabled).to.eq(true)
  })
})
