import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { VaultError, isVaultError, localVaultDB, memoryDeviceDB, memoryStore, openVault, type Vault } from 'safebyok'
import { createPasskey } from '../src/passkey'
import { PasskeyUnlockButton } from '../src/passkey-unlock-button'
import { PassphraseModal } from '../src/passphrase-modal'
import * as TH from './test-helpers'

/** A locked vault in memory with one passkey, made through the fake authenticator, and that authenticator. */
const lockedVaultWithPasskey = async () => {
  const authenticator = TH.installFakeAuthenticator()
  const vaultDB = localVaultDB(memoryStore())
  const open = async () => await openVault({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver })
  const maker = await open()
  await maker.unlock('pw')
  const unlockId = await maker.addPasskey('pw', () => createPasskey({ rp: { name: 'Acme' }, user: { name: 'ada@example.com', displayName: 'Ada' } }), { unlocklabel: 'laptop' })
  if (unlockId === null) { throw new Error('the fake authenticator made no passkey') }
  return { authenticator, vault: await open() }
}

/** The unlock window a stub vault reports: the default seven days, in ms. */
const SevenDaysMillis = 604_800_000

/** A vault that refuses every unlock with `err`, and lists one passkey. */
const vaultRefusing = (err: Error, credentialId: string) => ({
  reentryWindowMillis: SevenDaysMillis,
  getSnapshot:     () => ({ state: 'locked', unlocks: [TH.passkeyEnvelopeOf('laptop', { credential_id: credentialId })] }),
  unlock:          () => Promise.reject(err),
}) as unknown as Vault

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
    const passphraseOnly = { reentryWindowMillis: SevenDaysMillis, getSnapshot: () => ({ state: 'locked', unlocks: [TH.envelopeOf('passphrase')] }) } as unknown as Vault
    render(<PasskeyUnlockButton vault={passphraseOnly} onDone={noop} onGripe={noop} />)
    expect(screen.queryByRole('button')).to.be.null
  })

  it("does nothing when the user dismisses the prompt", async () => {
    const { authenticator, vault } = await lockedVaultWithPasskey()
    authenticator.refuseNext('NotAllowedError')
    const heard: string[] = []
    render(<PasskeyUnlockButton vault={vault} onDone={(unlocked) => { heard.push(String(unlocked)) }} onGripe={(gripe) => { heard.push(gripe) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(authenticator.calls.get).to.have.lengthOf(1) })
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Use a passkey' }).disabled).to.be.false })
    expect(heard).to.deep.equal([])
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("hands a condition's message to onGripe, and a lock that wins to onDone(false)", async () => {
    const { authenticator, vault } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const gripes: string[] = []
    render(<PasskeyUnlockButton vault={vaultRefusing(new VaultError('wrong_passkey', "That passkey's answer didn't unlock the vault."), credentialId)} onDone={noop} onGripe={(gripe) => { gripes.push(gripe) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(gripes).to.deep.equal(["That passkey's answer didn't unlock the vault."]) })
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
    const gripes: string[] = []
    const heard: boolean[] = []
    const { reported } = TH.renderReporting(<HostBoundary><PasskeyUnlockButton vault={vaultRefusing(closed, credentialId)} onDone={(unlocked) => { heard.push(unlocked) }} onGripe={(gripe) => { gripes.push(gripe) }} /></HostBoundary>)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(gripes).to.deep.equal([PasskeyTrouble]) })
    expect(screen.queryByRole('button')).to.be.null
    expect(reported).to.deep.equal([closed])
    expect(reported[0]).to.equal(closed)
    expect(screen.queryByText(/caught:/)).to.be.null
    expect(heard).to.deep.equal([])
  })

  it("meets an rpId that does not fit the page the same way: a mistake the developer meets in development", async () => {
    const { authenticator, vault } = await lockedVaultWithPasskey()
    authenticator.refuseNext('SecurityError')
    const gripes: string[] = []
    const { reported } = TH.renderReporting(<PasskeyUnlockButton vault={vault} rpId="elsewhere.example" onDone={noop} onGripe={(gripe) => { gripes.push(gripe) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(gripes).to.deep.equal([PasskeyTrouble]) })
    expect(reported).to.have.lengthOf(1)
    expect(isVaultError(reported[0], 'bad_option')).to.be.true
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("meets a failure that is no VaultError the same way", async () => {
    const { authenticator } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const fell = new TypeError('fell over')
    const gripes: string[] = []
    const { reported } = TH.renderReporting(<PasskeyUnlockButton vault={vaultRefusing(fell, credentialId)} onDone={noop} onGripe={(gripe) => { gripes.push(gripe) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(gripes).to.deep.equal([PasskeyTrouble]) })
    expect(reported).to.deep.equal([fell])
  })
})

describe("PassphraseModal, for a vault with a passkey", () => {
  it("offers the passkey beside the passphrase, and closes unlocked when it is used", async () => {
    const { vault } = await lockedVaultWithPasskey()
    const heard: boolean[] = []
    render(<PassphraseModal vault={vault} onDone={(unlocked) => { heard.push(unlocked) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(heard).to.deep.equal([true]) })
  })

  it("keeps the passphrase when the passkey meets misuse: the button goes, and the dialog says why", async () => {
    const { authenticator } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const closed = new VaultError('vault_closed', 'This vault handle was closed.')
    const { reported } = TH.renderReporting(<PassphraseModal vault={vaultRefusing(closed, credentialId)} onDone={noop} />)
    screen.getByText('Use a passkey').focus()
    fireEvent.click(screen.getByText('Use a passkey'))
    const said = await screen.findByRole('alert')
    expect(said.textContent).to.eq(PasskeyTrouble)
    expect(screen.queryByText('Use a passkey')).to.be.null
    expect(document.activeElement).to.equal(screen.getByPlaceholderText('vault passphrase'))
    expect(screen.queryByText('Something went wrong')).to.be.null
    expect(reported).to.deep.equal([closed])
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
    const absent = { reentryWindowMillis: SevenDaysMillis, getSnapshot: () => ({ state: 'absent', unlocks: [] }) } as unknown as Vault
    render(<PassphraseModal vault={absent} onDone={noop} />)
    expect(screen.queryByText('Use a passkey')).to.be.null
  })
})
