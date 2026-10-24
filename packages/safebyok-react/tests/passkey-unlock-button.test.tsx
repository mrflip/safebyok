import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VaultError, isVaultError, localVaultDB, memoryDeviceDB, memoryStore, type UnlockVaultGating } from 'safebyok'
import { createPasskey } from '../src/passkey'
import { PasskeyUnlockButton } from '../src/passkey-unlock-button'
import { PassphraseModal, type DialogAnswer } from '../src/passphrase-modal'
import * as TH from './test-helpers'

/** A locked vault in memory with one passkey, made through the fake authenticator, that authenticator, and the `unlock_vault` gating the vault raised, held open. */
const lockedVaultWithPasskey = async () => {
  const authenticator = TH.installFakeAuthenticator()
  const vaultDB = localVaultDB({ store: memoryStore() })
  const opts = { applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker }
  const maker = await TH.settledVault({ ...opts, deviceDB: memoryDeviceDB() })
  await TH.unlock(maker, 'pw')
  const answer = await createPasskey({ rp: { name: 'Acme' }, user: { name: 'ada@example.com', displayName: 'Ada' } })
  if (answer === null) { throw new Error('the fake authenticator made no passkey') }
  await TH.putWayin(maker, 'pw', answer)
  const { vault, gating } = await TH.gatedBy({ ...opts, deviceDB: memoryDeviceDB() })
  return { authenticator, vault, gating: TH.asKind(gating, 'unlock_vault') }
}

/** The `unlock_vault` gating of a stub vault with a passkey, `stubOpts` its own: by default its every attempt refused with `err`. */
const stubUnlockGating = (credentialId: string, stubOpts: TH.GatingOfOpts & TH.StubVaultOpts): UnlockVaultGating => TH.asKind(TH.stubGating({
  passkey: { ...TH.passkeyWayinOf('laptop', { credential_id: credentialId }), vault_tok: 'vault-tok-u1' },
  ...stubOpts,
}), 'unlock_vault')

/** The `unlock_vault` gating of a vault that refuses every attempt with `err`, and has a passkey. */
const gatingRefusing = (err: Error, credentialId: string) => stubUnlockGating(credentialId, { attempt: () => Promise.reject(err) })

const noop = () => undefined

/** What the button tells the user when it takes itself away. */
const PasskeyTrouble = "Your passkey can't be used here just now. Unlock with your passphrase instead."

afterEach(() => {
  cleanup()
  TH.uninstallFakeAuthenticator()
})

describe("PasskeyUnlockButton", () => {
  it("unlocks the vault with the passkey the user touches", async () => {
    const { vault, gating } = await lockedVaultWithPasskey()
    const heard: DialogAnswer[] = []
    render(<PasskeyUnlockButton gating={gating} onDone={(unlocked) => { heard.push(unlocked) }} onGripe={noop} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(heard).to.deep.equal(['unlocked']) })
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("is not there in a browser without WebAuthn, nor for a vault with no passkey", async () => {
    const { authenticator, gating } = await lockedVaultWithPasskey()
    authenticator.uninstall()
    render(<PasskeyUnlockButton gating={gating} onDone={noop} onGripe={noop} />)
    expect(screen.queryByRole('button')).to.be.null
    TH.installFakeAuthenticator()
    const passphraseOnly = TH.stubVault({ passkey: null })
    render(<PasskeyUnlockButton gating={TH.asKind(TH.gatingOf(passphraseOnly), 'unlock_vault')} onDone={noop} onGripe={noop} />)
    expect(screen.queryByRole('button')).to.be.null
  })

  it("says only that its last word no longer stands when the user dismisses the prompt", async () => {
    const { authenticator, vault, gating } = await lockedVaultWithPasskey()
    authenticator.refuseNext('NotAllowedError')
    const heard: string[] = []
    render(<PasskeyUnlockButton gating={gating} onDone={(answer) => { heard.push(answer) }} onGripe={(gripe) => { heard.push(String(gripe)) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(authenticator.calls.get).to.have.lengthOf(1) })
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Use a passkey' }).disabled).to.be.false })
    expect(heard).to.deep.equal(['null'])
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("follows the vault's snapshot: a passkey added meanwhile brings the button", async () => {
    TH.installFakeAuthenticator()
    const vault = await TH.settledVault(TH.memoryVaultOpts())
    await TH.unlock(vault, 'pw')
    render(<PasskeyUnlockButton gating={TH.asKind(TH.gatingOf(vault), 'unlock_vault')} onDone={noop} onGripe={noop} />)
    expect(screen.queryByText('Use a passkey')).to.be.null
    await act(async () => {
      const answer = await createPasskey({ rp: { name: 'Acme' }, user: { name: 'ada@example.com', displayName: 'Ada' } })
      if (answer !== null) { await TH.putWayin(vault, 'pw', answer) }
    })
    expect(screen.queryByText('Use a passkey')).to.not.be.null
    TH.closeVault(vault)
  })

  it("starts afresh when handed another vault: one that took itself away comes back", async () => {
    const { authenticator, gating } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const gripes: (string | null)[] = []
    const onGripe = (gripe: string | null) => { gripes.push(gripe) }
    const { rerender } = TH.renderReporting(<PasskeyUnlockButton gating={gatingRefusing(new TypeError('fell over'), credentialId)} onDone={noop} onGripe={onGripe} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(gripes).to.deep.equal([null, PasskeyTrouble]) })
    expect(screen.queryByText('Use a passkey')).to.be.null
    rerender(<PasskeyUnlockButton gating={gating} onDone={noop} onGripe={onGripe} />)
    expect(screen.queryByText('Use a passkey')).to.not.be.null
  })

  it("takes the focus when asked to, as a dialog's first choice", async () => {
    const { gating } = await lockedVaultWithPasskey()
    // eslint-disable-next-line jsx-a11y/no-autofocus -- the prop under test
    render(<PasskeyUnlockButton gating={gating} autoFocus onDone={noop} onGripe={noop} />)
    expect(document.activeElement).to.equal(screen.getByText('Use a passkey'))
  })

  it("hands a condition's message to onGripe, and a lock that wins to onDone(false)", async () => {
    const { authenticator, vault } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const gripes: (string | null)[] = []
    render(<PasskeyUnlockButton gating={gatingRefusing(new VaultError('wrong_passkey', "That passkey's answer didn't unlock the vault."), credentialId)} onDone={noop} onGripe={(gripe) => { gripes.push(gripe) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(gripes).to.deep.equal([null, "That passkey's answer didn't unlock the vault."]) })
    cleanup()
    const heard: DialogAnswer[] = []
    render(<PasskeyUnlockButton gating={gatingRefusing(new VaultError('vault_locked', 'Locked meanwhile.'), credentialId)} onDone={(unlocked) => { heard.push(unlocked) }} onGripe={noop} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(heard).to.deep.equal(['declined']) })
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("leaves an attempt under way to answer when pressed during it: attempt_in_flight reaches neither onDone nor onGripe's word", async () => {
    const { authenticator } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const heard: DialogAnswer[] = []
    const gripes: (string | null)[] = []
    const attempt = vi.fn(() => Promise.reject(new VaultError('attempt_in_flight', 'An attempt is already under way.')))
    render(<PasskeyUnlockButton gating={stubUnlockGating(credentialId, { attempt })} onDone={(answer) => { heard.push(answer) }} onGripe={(gripe) => { gripes.push(gripe) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(attempt).toHaveBeenCalledTimes(1) })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(heard).to.deep.equal([])
    expect(gripes).to.deep.equal([null])
  })

  it("meets misuse by taking itself away and pointing to the passphrase, reporting the very error to React", async () => {
    const { authenticator } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const misuse = new VaultError('bad_option', 'This call was handed an option it does not take.')
    const gripes: (string | null)[] = []
    const heard: DialogAnswer[] = []
    const { reported } = TH.renderReporting(<TH.Catcher><PasskeyUnlockButton gating={gatingRefusing(misuse, credentialId)} onDone={(unlocked) => { heard.push(unlocked) }} onGripe={(gripe) => { gripes.push(gripe) }} /></TH.Catcher>)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(gripes).to.deep.equal([null, PasskeyTrouble]) })
    expect(screen.queryByRole('button')).to.be.null
    expect(reported).to.deep.equal([misuse])
    expect(reported[0]).to.equal(misuse)
    expect(screen.queryByText(/caught:/)).to.be.null
    expect(heard).to.deep.equal([])
  })

  it("meets an rpId that does not fit the page the same way: a mistake the developer meets in development", async () => {
    const { authenticator, vault, gating } = await lockedVaultWithPasskey()
    authenticator.refuseNext('SecurityError')
    const gripes: (string | null)[] = []
    const { reported } = TH.renderReporting(<PasskeyUnlockButton gating={gating} rpId="elsewhere.example" onDone={noop} onGripe={(gripe) => { gripes.push(gripe) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(gripes).to.deep.equal([null, PasskeyTrouble]) })
    expect(reported).to.have.lengthOf(1)
    expect(isVaultError(reported[0], 'bad_option')).to.be.true
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("meets a failure that is no VaultError the same way, as the vault answers it: unexpected_error, reported to React without what was thrown, its cause", async () => {
    const { authenticator } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const fell = new TypeError('fell over')
    const gripes: (string | null)[] = []
    const { reported } = TH.renderReporting(<PasskeyUnlockButton gating={gatingRefusing(fell, credentialId)} onDone={noop} onGripe={(gripe) => { gripes.push(gripe) }} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(gripes).to.deep.equal([null, PasskeyTrouble]) })
    expect(reported).to.have.lengthOf(1)
    expect(reported[0]).to.include({ refusalkind: 'unexpected_error' })
    expect((reported[0] as Error).cause).to.be.undefined
  })

  describe("once it has gone", () => {
    // Each call is held under way while the button unmounts -- its dialog went, or the test that
    // rendered it ended -- and settles after. A button gone touches neither its own state nor the
    // callbacks its dialog handed it.

    const UnlockOutcomes = [
      [null,                                                                      'an unlock that succeeds'],
      [new VaultError('wrong_passkey', "That passkey's answer didn't unlock it."), 'a condition'],
      [new VaultError('vault_locked', 'Locked meanwhile.'),                       'a lock that won meanwhile'],
      [new VaultError('bad_option', 'This call was handed an option it does not take.'), 'misuse: an option amiss'],
    ] as const

    for (const [refusal, blurb] of UnlockOutcomes) {
      it(`does nothing with ${blurb}, landing after it unmounted`, async () => {
        const { authenticator } = await lockedVaultWithPasskey()
        const [credentialId = ''] = authenticator.credentialIds()
        const unlocking = TH.held()
        const attempt = vi.fn<TH.StubAttempt>(() => unlocking.promise)
        const gating = stubUnlockGating(credentialId, { attempt })
        const gripes: (string | null)[] = []
        const heard: DialogAnswer[] = []
        const { reported, unmount } = TH.renderReporting(<PasskeyUnlockButton gating={gating} onDone={(unlocked) => { heard.push(unlocked) }} onGripe={(gripe) => { gripes.push(gripe) }} />)
        fireEvent.click(screen.getByText('Use a passkey'))
        await waitFor(() => { expect(attempt).toHaveBeenCalledOnce() })
        unmount()
        const updates = TH.watchStateUpdates()
        await act(async () => {
          if (refusal === null) { unlocking.resolve(undefined) } else { unlocking.reject(refusal) }
          await TH.wakeupAtNextTick()
        })
        expect(updates.count()).to.eq(0)
        expect(gripes).to.deep.equal([null])
        expect(heard).to.deep.equal([])
        expect(reported).to.deep.equal([])
      })
    }

    it("never unlocks with a passkey the user touched after it unmounted", async () => {
      const { vault, gating: raised } = await lockedVaultWithPasskey()
      const touching = TH.held()
      const answered = TH.held()
      const fakeGet = navigator.credentials.get.bind(navigator.credentials)
      vi.spyOn(navigator.credentials, 'get').mockImplementation(async (options) => {
        await touching.promise
        const credential = await fakeGet(options)
        answered.resolve(undefined)
        return credential
      })
      const attemptPasskey = vi.fn(raised.attemptPasskey)
      const gating: UnlockVaultGating = { ...raised, attemptPasskey }
      const gripes: (string | null)[] = []
      const { unmount } = render(<PasskeyUnlockButton gating={gating} onDone={noop} onGripe={(gripe) => { gripes.push(gripe) }} />)
      fireEvent.click(screen.getByText('Use a passkey'))
      unmount()
      const updates = TH.watchStateUpdates()
      await act(async () => {
        touching.resolve(undefined)
        await answered.promise
        await TH.wakeupAtNextTick()
      })
      expect(attemptPasskey).not.toHaveBeenCalled()
      expect(vault.getSnapshot().state).to.eq('locked')
      expect(updates.count()).to.eq(0)
      expect(gripes).to.deep.equal([null])
    })
  })
})

describe("PassphraseModal, for a vault with a passkey", () => {
  it("offers the passkey first, before the passphrase, and closes unlocked when it is used", async () => {
    const { gating } = await lockedVaultWithPasskey()
    const heard: DialogAnswer[] = []
    render(<PassphraseModal gating={gating} onDone={(unlocked) => { heard.push(unlocked) }} />)
    const passkey = screen.getByText('Use a passkey')
    expect(document.activeElement).to.equal(passkey)
    expect(passkey.compareDocumentPosition(screen.getByPlaceholderText('vault passphrase')) & Node.DOCUMENT_POSITION_FOLLOWING).to.not.eq(0)
    fireEvent.click(passkey)
    await waitFor(() => { expect(heard).to.deep.equal(['unlocked']) })
  })

  it("drops the passkey's word once a later press of it is dismissed", async () => {
    const { authenticator } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    render(<PassphraseModal gating={gatingRefusing(new VaultError('wrong_passkey', "That passkey's answer didn't unlock the vault."), credentialId)} onDone={noop} />)
    fireEvent.click(screen.getByText('Use a passkey'))
    await screen.findByText("That passkey's answer didn't unlock the vault.")
    authenticator.refuseNext('NotAllowedError')
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(screen.queryByText("That passkey's answer didn't unlock the vault.")).to.be.null })
  })

  it("keeps the passphrase when the passkey meets misuse: the button goes, and the dialog says why", async () => {
    const { authenticator } = await lockedVaultWithPasskey()
    const [credentialId = ''] = authenticator.credentialIds()
    const misuse = new VaultError('bad_option', 'This call was handed an option it does not take.')
    const { reported } = TH.renderReporting(<PassphraseModal gating={gatingRefusing(misuse, credentialId)} onDone={noop} />)
    screen.getByText('Use a passkey').focus()
    fireEvent.click(screen.getByText('Use a passkey'))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).to.eq(PasskeyTrouble) })
    expect(screen.queryByText('Use a passkey')).to.be.null
    expect(document.activeElement).to.equal(screen.getByPlaceholderText('vault passphrase'))
    expect(screen.queryByText('Something went wrong')).to.be.null
    expect(reported).to.deep.equal([misuse])
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
      render(<PassphraseModal gating={gatingRefusing(new VaultError('wrong_passkey', "That passkey's answer didn't unlock the vault."), credentialId)} onDone={noop} />, { container })
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
    const misused = stubUnlockGating(credentialId, {
      attempt: (cleartext) => {
        if (typeof cleartext === 'string') { unlocked.push(cleartext); return Promise.resolve() }
        return Promise.reject(new VaultError('bad_option', 'This call was handed an option it does not take.'))
      },
    })
    TH.renderReporting(<PassphraseModal gating={misused} onDone={noop} />)
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
    const novel = TH.stubVault({ state: 'novel' })
    render(<PassphraseModal gating={TH.gatingOf(novel)} onDone={noop} />)
    expect(screen.queryByText('Use a passkey')).to.be.null
  })
})
