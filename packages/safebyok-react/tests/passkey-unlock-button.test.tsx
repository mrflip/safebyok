import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { VaultError, isVaultError, localVaultDB, memoryDeviceDB, memoryStore, openVault, type UnlockSummary, type Vault } from 'safebyok'
import { createPasskey } from '../src/passkey'
import { PasskeyUnlockButton } from '../src/passkey-unlock-button'
import { PassphraseModal } from '../src/passphrase-modal'
import * as TH from './test-helpers'

/** A locked vault in memory with one passkey, made through the fake authenticator, and that authenticator. */
const lockedVaultWithPasskey = async () => {
  const authenticator = TH.installFakeAuthenticator()
  const vaultDB = localVaultDB(memoryStore())
  const open = async () => await openVault({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, passphraseStrengthTest: TH.anyPassphraseTest })
  const maker = await open()
  await maker.unlock('pw')
  const unlockId = await maker.addPasskey('pw', () => createPasskey({ rp: { name: 'Acme' }, user: { name: 'ada@example.com', displayName: 'Ada' } }), { unlocklabel: 'laptop' })
  if (unlockId === null) { throw new Error('the fake authenticator made no passkey') }
  return { authenticator, vault: await open() }
}

/** A vault that refuses every unlock with `err`, and lists one passkey. */
const vaultRefusing = (err: Error, credentialId: string) => TH.stubVault({
  unlocks: [TH.passkeyEnvelopeOf('laptop', { credential_id: credentialId })] as unknown as UnlockSummary[],
  unlock:  () => Promise.reject(err),
})

/** Catches what its children throw while rendering, and shows the message: the host's own boundary. */
class HostBoundary extends Component<{ children: ReactNode }, { caught: string | null }> {
  override state = { caught: null as string | null }
  static getDerivedStateFromError(err: unknown) { return { caught: err instanceof Error ? err.message : 'something' } }
  override render() { return this.state.caught === null ? this.props.children : <p>caught: {this.state.caught}</p> }
}

const noop = () => undefined

/** What the button tells the user when it takes itself away. */
const PasskeyTrouble = "Your passkey can't be used here just now. Unlock with your passphrase instead."

afterEach(() => {
  cleanup()
  TH.uninstallFakeAuthenticator()
})

describe("PasskeyUnlockButton", () => {
  it("unlocks the vault with the passkey the user touches", async () => {
    const { vault } = await lockedVaultWithPasskey()
    const heard: boolean[] = []
    render(<PasskeyUnlockButton vault={vault} onDone={(unlocked) => { heard.push(unlocked) }} onGripe={noop} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(heard).to.deep.equal([true]) })
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("is not there in a browser without WebAuthn, nor for a vault with no passkey", async () => {
    const { authenticator, vault } = await lockedVaultWithPasskey()
    authenticator.uninstall()
    render(<PasskeyUnlockButton vault={vault} onDone={noop} onGripe={noop} />)
    expect(screen.queryByRole('button')).to.be.null
    TH.installFakeAuthenticator()
    const passphraseOnly = TH.stubVault({ unlocks: [TH.envelopeOf('passphrase')] as unknown as UnlockSummary[] })
    render(<PasskeyUnlockButton vault={passphraseOnly} onDone={noop} onGripe={noop} />)
    expect(screen.queryByRole('button')).to.be.null
  })

  it("says only that its last word no longer stands when the user dismisses the prompt", async () => {
    const { authenticator, vault } = await lockedVaultWithPasskey()
    authenticator.refuseNext('NotAllowedError')
    const heard: string[] = []
    render(<PasskeyUnlockButton vault={vault} onDone={(unlocked) => { heard.push(String(unlocked)) }} onGripe={(gripe) => { heard.push(String(gripe)) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(authenticator.calls.get).to.have.lengthOf(1) })
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Use a passkey' }).disabled).to.be.false })
    expect(heard).to.deep.equal(['null'])
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("follows the vault's snapshot: a passkey added meanwhile brings the button", async () => {
    TH.installFakeAuthenticator()
    const vault = await openVault(TH.memoryVaultOpts())
    await vault.unlock('pw')
    render(<PasskeyUnlockButton vault={vault} onDone={noop} onGripe={noop} />)
    expect(screen.queryByText('Use a passkey')).to.be.null
    await act(async () => {
      await vault.addPasskey('pw', () => createPasskey({ rp: { name: 'Acme' }, user: { name: 'ada@example.com', displayName: 'Ada' } }), { unlocklabel: 'laptop' })
    })
    expect(screen.queryByText('Use a passkey')).to.not.be.null
    vault.close()
  })

  it("starts afresh when handed another vault: one that took itself away comes back", async () => {
    const { authenticator, vault } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const gripes: (string | null)[] = []
    const onGripe = (gripe: string | null) => { gripes.push(gripe) }
    const { rerender } = TH.renderReporting(<PasskeyUnlockButton vault={vaultRefusing(new TypeError('fell over'), credentialId)} onDone={noop} onGripe={onGripe} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(gripes).to.deep.equal([null, PasskeyTrouble]) })
    expect(screen.queryByText('Use a passkey')).to.be.null
    rerender(<PasskeyUnlockButton vault={vault} onDone={noop} onGripe={onGripe} />)
    expect(screen.queryByText('Use a passkey')).to.not.be.null
  })

  it("takes the focus when asked to, as a dialog's first choice", async () => {
    const { vault } = await lockedVaultWithPasskey()
    // eslint-disable-next-line jsx-a11y/no-autofocus -- the prop under test
    render(<PasskeyUnlockButton vault={vault} autoFocus onDone={noop} onGripe={noop} />)
    expect(document.activeElement).to.equal(screen.getByText('Use a passkey'))
  })

  it("hands a condition's message to onGripe, and a lock that wins to onDone(false)", async () => {
    const { authenticator, vault } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const gripes: (string | null)[] = []
    render(<PasskeyUnlockButton vault={vaultRefusing(new VaultError('wrong_passkey', "That passkey's answer didn't unlock the vault."), credentialId)} onDone={noop} onGripe={(gripe) => { gripes.push(gripe) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(gripes).to.deep.equal([null, "That passkey's answer didn't unlock the vault."]) })
    cleanup()
    const heard: boolean[] = []
    render(<PasskeyUnlockButton vault={vaultRefusing(new VaultError('vault_locked', 'Locked meanwhile.'), credentialId)} onDone={(unlocked) => { heard.push(unlocked) }} onGripe={noop} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(heard).to.deep.equal([false]) })
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("meets misuse by taking itself away and pointing to the passphrase, reporting the very error to React", async () => {
    const { authenticator } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const closed = new VaultError('vault_closed', 'This vault handle was closed.')
    const gripes: (string | null)[] = []
    const heard: boolean[] = []
    const { reported } = TH.renderReporting(<HostBoundary><PasskeyUnlockButton vault={vaultRefusing(closed, credentialId)} onDone={(unlocked) => { heard.push(unlocked) }} onGripe={(gripe) => { gripes.push(gripe) }} /></HostBoundary>)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(gripes).to.deep.equal([null, PasskeyTrouble]) })
    expect(screen.queryByRole('button')).to.be.null
    expect(reported).to.deep.equal([closed])
    expect(reported[0]).to.equal(closed)
    expect(screen.queryByText(/caught:/)).to.be.null
    expect(heard).to.deep.equal([])
  })

  it("meets an rpId that does not fit the page the same way: a mistake the developer meets in development", async () => {
    const { authenticator, vault } = await lockedVaultWithPasskey()
    authenticator.refuseNext('SecurityError')
    const gripes: (string | null)[] = []
    const { reported } = TH.renderReporting(<PasskeyUnlockButton vault={vault} rpId="elsewhere.example" onDone={noop} onGripe={(gripe) => { gripes.push(gripe) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(gripes).to.deep.equal([null, PasskeyTrouble]) })
    expect(reported).to.have.lengthOf(1)
    expect(isVaultError(reported[0], 'bad_option')).to.be.true
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("meets a failure that is no VaultError the same way", async () => {
    const { authenticator } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const fell = new TypeError('fell over')
    const gripes: (string | null)[] = []
    const { reported } = TH.renderReporting(<PasskeyUnlockButton vault={vaultRefusing(fell, credentialId)} onDone={noop} onGripe={(gripe) => { gripes.push(gripe) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(gripes).to.deep.equal([null, PasskeyTrouble]) })
    expect(reported).to.deep.equal([fell])
  })
})

describe("PassphraseModal, for a vault with a passkey", () => {
  it("offers the passkey first, before the passphrase, and closes unlocked when it is used", async () => {
    const { vault } = await lockedVaultWithPasskey()
    const heard: boolean[] = []
    render(<PassphraseModal vault={vault} onDone={(unlocked) => { heard.push(unlocked) }} />)
    const passkey = screen.getByText('Use a passkey')
    expect(document.activeElement).to.equal(passkey)
    expect(passkey.compareDocumentPosition(screen.getByPlaceholderText('vault passphrase')) & Node.DOCUMENT_POSITION_FOLLOWING).to.not.eq(0)
    fireEvent.click(passkey)
    await waitFor(() => { expect(heard).to.deep.equal([true]) })
  })

  it("drops the passkey's word once a later press of it is dismissed", async () => {
    const { authenticator } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    render(<PassphraseModal vault={vaultRefusing(new VaultError('wrong_passkey', "That passkey's answer didn't unlock the vault."), credentialId)} onDone={noop} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await screen.findByText("That passkey's answer didn't unlock the vault.")
    authenticator.refuseNext('NotAllowedError')
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(screen.queryByText("That passkey's answer didn't unlock the vault.")).to.be.null })
  })

  it("keeps the passphrase when the passkey meets misuse: the button goes, and the dialog says why", async () => {
    const { authenticator } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const closed = new VaultError('vault_closed', 'This vault handle was closed.')
    const { reported } = TH.renderReporting(<PassphraseModal vault={vaultRefusing(closed, credentialId)} onDone={noop} />)
    screen.getByText('Use a passkey').focus()
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).to.eq(PasskeyTrouble) })
    expect(screen.queryByText('Use a passkey')).to.be.null
    expect(document.activeElement).to.equal(screen.getByPlaceholderText('vault passphrase'))
    expect(screen.queryByText('Something went wrong')).to.be.null
    expect(reported).to.deep.equal([closed])
  })

  it("leaves the focus on the passkey button after a condition, inside a shadow root too", async () => {
    const { authenticator } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const shadowHost = document.createElement('div')
    document.body.append(shadowHost)
    const shadowRoot = shadowHost.attachShadow({ mode: 'open' })
    const container = document.createElement('div')
    shadowRoot.append(container)
    try {
      render(<PassphraseModal vault={vaultRefusing(new VaultError('wrong_passkey', "That passkey's answer didn't unlock the vault."), credentialId)} onDone={noop} />, { container })
      const passkey = within(container).getByText('Use a passkey')
      passkey.focus()
      fireEvent.click(passkey)
      await waitFor(() => { expect(within(container).queryByText("That passkey's answer didn't unlock the vault.")).to.not.be.null })
      expect(shadowRoot.activeElement).to.equal(passkey)
    } finally {
      shadowHost.remove()
    }
  })

  it("keeps the passkey's word while the user types the passphrase, until they submit", async () => {
    const { authenticator } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const unlocked: string[] = []
    const misused = { ...vaultRefusing(new VaultError('vault_closed', 'This vault handle was closed.'), credentialId), unlock: (proof: unknown) => {
      if (typeof proof === 'string') { unlocked.push(proof); return Promise.resolve() }
      return Promise.reject(new VaultError('vault_closed', 'This vault handle was closed.'))
    } } as unknown as Vault
    TH.renderReporting(<PassphraseModal vault={misused} onDone={noop} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await screen.findByText(PasskeyTrouble)
    fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
    expect(screen.queryByText(PasskeyTrouble)).to.not.be.null
    fireEvent.click(screen.getByText('Unlock'))
    expect(screen.queryByText(PasskeyTrouble)).to.be.null
    await waitFor(() => { expect(unlocked).to.deep.equal(['pw']) })
  })

  it("offers no passkey to a user choosing the vault's first passphrase", () => {
    TH.installFakeAuthenticator()
    const absent = TH.stubVault({ state: 'absent' })
    render(<PassphraseModal vault={absent} onDone={noop} />)
    expect(screen.queryByText('Use a passkey')).to.be.null
  })
})
