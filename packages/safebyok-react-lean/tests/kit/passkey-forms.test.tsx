import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PasskeySaltSize, type WayinHeader, toB64 } from 'safebyok'
import { AddPasskeyForm, PasskeyUnlockButton, RevokePasskeyForm } from '../../src/kit'
import { KitPhrases } from '../../src/kit/phrases-kit'
import * as TH from '../test-helpers'

const Passphrase = TH.TestPassphrase

/** A passphrase one letter off the stored one. */
const WrongPassphrase = 'correct horse battery stable'

/** The bank's stage as a line of text, beside the form `kind` names: an unlock button handed `passkeyHeader`, or none when it is undefined. */
function StageScreen({ world, kind, passkeyHeader }: Readonly<{ world: TH.ProviderWorld, kind: 'add' | 'revoke' | 'unlock', passkeyHeader?: WayinHeader | null | undefined }>) {
  const stage = world.Bank.useWorld((snap) => snap.stage)
  return (
    <>
      <p>{stage}</p>
      {(kind === 'add') && <AddPasskeyForm passkeyOpts={TH.PasskeyMaking} username="hue@example.com" />}
      {(kind === 'revoke') && <RevokePasskeyForm username="hue@example.com" />}
      {(kind === 'unlock') && <PasskeyUnlockButton passkeyHeader={passkeyHeader} />}
    </>
  )
}

/** A world with a bank stored, rendered with the form `kind` names under its provider, once it shows the bank locked. */
async function renderWorld(kind: 'add' | 'revoke' | 'unlock', world?: TH.ProviderWorld, passkeyHeader?: WayinHeader | null) {
  world ??= await TH.buildProviderWorld({ stored: 'jokes' })
  const rendered = render(TH.providerTreeOf(world, <StageScreen world={world} kind={kind} passkeyHeader={passkeyHeader} />, { userid: TH.ProviderUser }))
  await screen.findByText('locked')
  return { world, ...rendered }
}

/** Type `passphrase` into the form's passphrase field and press `button`. */
function submitPassphrase(passphrase: string, button: string): void {
  fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByRole('button', { name: button }))
}

/** The text of the form's alert, once it has some. */
async function alertText(): Promise<string> {
  const alert = await screen.findByRole('alert')
  await waitFor(() => { expect(alert.textContent).to.not.eq('') })
  return alert.textContent
}

/** A world whose stored bank has a passkey, added through the add form and then locked, and that passkey's header. Install the fake authenticator first. */
async function buildPasskeyWorld() {
  const { world, unmount } = await renderWorld('add')
  submitPassphrase(Passphrase, 'Add passkey')
  await screen.findByText('unlocked')
  act(() => { world.Bank.lock() })
  unmount()
  const passkeyHeader = await TH._cheat_passkeyHeaderOf(world)
  expect(passkeyHeader).to.not.be.null
  return { world, passkeyHeader }
}

describe("AddPasskeyForm", () => {
  it("adds a passkey under the passphrase, holding the passphrase nowhere and zeroing the passkey's answer", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const { world, container } = await renderWorld('add')
    expect(await TH._cheat_passkeyHeaderOf(world)).to.be.null
    const release = world.deriver.hold()
    submitPassphrase(Passphrase, 'Add passkey')
    await screen.findByRole('button', { name: 'Adding…' })
    TH.expectTextUnheld(Passphrase, container, world.clients())
    release()
    await screen.findByText('unlocked')
    TH.expectTextUnheld(Passphrase, container, world.clients())
    expect(authenticator.answersHanded().every((answer) => answer.every((byte) => byte === 0))).to.be.true
    const passkeyHeader = await TH._cheat_passkeyHeaderOf(world)
    expect(passkeyHeader?.credential_id).to.eq(authenticator.credentialIds()[0])
    expect(authenticator.calls.create[0]?.publicKey?.user).to.include({ name: 'u1 (main vault)' })
  })

  it("adds nothing when the user dismisses the prompt, and says nothing", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const { world } = await renderWorld('add')
    authenticator.refuseNext('NotAllowedError')
    submitPassphrase(Passphrase, 'Add passkey')
    await waitFor(() => { expect(authenticator.calls.create).to.have.lengthOf(1) })
    await screen.findByRole('button', { name: 'Add passkey' })
    expect(screen.getByRole('alert').textContent).to.eq('')
    expect(screen.getByText('locked')).to.exist
    expect(await TH._cheat_passkeyHeaderOf(world)).to.be.null
    expect(world.deriver.heard).to.eq(0)
  })

  it("drops a wrong-passphrase message when the next attempt ends at a dismissed prompt", async () => {
    const authenticator = TH.installFakeAuthenticator()
    await renderWorld('add')
    submitPassphrase(WrongPassphrase, 'Add passkey')
    expect(await alertText()).to.eq('That is not the passphrase.')
    // The alert shows while the first attempt's action is still pending, and the form empties when it settles: type the next one after.
    await screen.findByRole('button', { name: 'Add passkey' })
    authenticator.refuseNext('NotAllowedError')
    submitPassphrase(Passphrase, 'Add passkey')
    await waitFor(() => { expect(authenticator.calls.create).to.have.lengthOf(2) })
    await waitFor(() => { expect(screen.getByRole('alert').textContent).to.eq('') })
  })

  it("says why an authenticator without PRF cannot make one, and adds nothing", async () => {
    TH.installFakeAuthenticator({ prf: false })
    const { world, container } = await renderWorld('add')
    submitPassphrase(Passphrase, 'Add passkey')
    expect(await alertText()).to.eq(KitPhrases.noPrf)
    expect(await TH._cheat_passkeyHeaderOf(world)).to.be.null
    TH.expectTextUnheld(Passphrase, container, world.clients())
  })

  it("says a wrong passphrase is wrong, hands its field focus, and adds nothing", async () => {
    TH.installFakeAuthenticator()
    const { world, container } = await renderWorld('add')
    submitPassphrase(WrongPassphrase, 'Add passkey')
    expect(await alertText()).to.eq('That is not the passphrase.')
    const field = screen.getByLabelText<HTMLInputElement>('Passphrase')
    await waitFor(() => { expect(document.activeElement).to.eq(field) })
    expect(field.getAttribute('aria-invalid')).to.eq('true')
    expect(await TH._cheat_passkeyHeaderOf(world)).to.be.null
    TH.expectTextUnheld(WrongPassphrase, container, world.clients())
  })
})

describe("RevokePasskeyForm", () => {
  it("removes the passkey under the passphrase, holding the passphrase nowhere", async () => {
    TH.installFakeAuthenticator()
    const { world } = await buildPasskeyWorld()
    const { container } = await renderWorld('revoke', world)
    submitPassphrase(Passphrase, 'Remove passkey')
    await screen.findByText('unlocked')
    TH.expectTextUnheld(Passphrase, container, world.clients())
    expect(await TH._cheat_passkeyHeaderOf(world)).to.be.null
  })

  it("says a wrong passphrase is wrong, and keeps the passkey", async () => {
    TH.installFakeAuthenticator()
    const { world, passkeyHeader } = await buildPasskeyWorld()
    const { container } = await renderWorld('revoke', world)
    submitPassphrase(WrongPassphrase, 'Remove passkey')
    expect(await alertText()).to.eq('That is not the passphrase.')
    expect(await TH._cheat_passkeyHeaderOf(world)).to.deep.equal(passkeyHeader)
    TH.expectTextUnheld(WrongPassphrase, container, world.clients())
  })
})

describe("PasskeyUnlockButton", () => {
  it("unlocks the bank by its passkey", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const { world, passkeyHeader } = await buildPasskeyWorld()
    await renderWorld('unlock', world, passkeyHeader)
    fireEvent.click(screen.getByRole('button', { name: 'Unlock with a passkey' }))
    await screen.findByText('unlocked')
    expect(authenticator.calls.get).to.have.lengthOf(1)
    expect(authenticator.answersHanded().every((answer) => answer.every((byte) => byte === 0))).to.be.true
  })

  // PasskeyUnlockButton @example
  it("unlocks by the bank's own passkey when handed no header", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const { world } = await buildPasskeyWorld()
    await renderWorld('unlock', world)
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock with a passkey' }))
    await screen.findByText('unlocked')
    expect(authenticator.calls.get).to.have.lengthOf(1)
  })

  it("renders nothing for a header of null, even for a bank with a passkey", async () => {
    TH.installFakeAuthenticator()
    const { world } = await buildPasskeyWorld()
    await renderWorld('unlock', world, null)
    expect(screen.queryByRole('button')).to.be.null
  })

  it("renders nothing while the bank has no passkey", async () => {
    TH.installFakeAuthenticator()
    await renderWorld('unlock', undefined, null)
    expect(screen.queryByRole('button')).to.be.null
  })

  it("renders nothing in a browser without WebAuthn, even for a bank with a passkey", async () => {
    TH.installFakeAuthenticator()
    const { world, passkeyHeader } = await buildPasskeyWorld()
    Reflect.deleteProperty(navigator, 'credentials')
    await renderWorld('unlock', world, passkeyHeader)
    expect(screen.queryByRole('button')).to.be.null
  })

  it("changes nothing when the user dismisses the prompt", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const { world, passkeyHeader } = await buildPasskeyWorld()
    await renderWorld('unlock', world, passkeyHeader)
    authenticator.refuseNext('NotAllowedError')
    fireEvent.click(screen.getByRole('button', { name: 'Unlock with a passkey' }))
    await waitFor(() => { expect(authenticator.calls.get).to.have.lengthOf(1) })
    await screen.findByRole('button', { name: 'Unlock with a passkey' })
    expect(screen.getByRole('alert').textContent).to.eq('')
    expect(screen.getByText('locked')).to.exist
  })

  it("says a passkey that answers over another salt does not unlock this vault", async () => {
    TH.installFakeAuthenticator()
    const { world, passkeyHeader } = await buildPasskeyWorld()
    const otherSalt = toB64(crypto.getRandomValues(new Uint8Array(PasskeySaltSize)))
    await renderWorld('unlock', world, { ...passkeyHeader!, prf_salt_b64: otherSalt } as WayinHeader)
    fireEvent.click(screen.getByRole('button', { name: 'Unlock with a passkey' }))
    expect(await alertText()).to.eq(KitPhrases.wrongPasskey)
    expect(screen.getByText('locked')).to.exist
  })

  it("drops a wrong-passkey message when the next attempt ends at a dismissed prompt", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const { world, passkeyHeader } = await buildPasskeyWorld()
    const otherSalt = toB64(crypto.getRandomValues(new Uint8Array(PasskeySaltSize)))
    await renderWorld('unlock', world, { ...passkeyHeader!, prf_salt_b64: otherSalt } as WayinHeader)
    fireEvent.click(screen.getByRole('button', { name: 'Unlock with a passkey' }))
    expect(await alertText()).to.eq(KitPhrases.wrongPasskey)
    authenticator.refuseNext('NotAllowedError')
    fireEvent.click(screen.getByRole('button', { name: 'Unlock with a passkey' }))
    await waitFor(() => { expect(authenticator.calls.get).to.have.lengthOf(2) })
    await waitFor(() => { expect(screen.getByRole('alert').textContent).to.eq('') })
  })

  it("says why, when the browser fails to ask", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const { world, passkeyHeader } = await buildPasskeyWorld()
    await renderWorld('unlock', world, passkeyHeader)
    authenticator.refuseNext('UnknownError')
    fireEvent.click(screen.getByRole('button', { name: 'Unlock with a passkey' }))
    expect(await alertText()).to.eq(KitPhrases.passkeyAskFailed)
    expect(screen.getByText('locked')).to.exist
  })
})
