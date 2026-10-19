import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { isVaultError, memoryDeviceDB, type GetProof, type VaultError } from 'safebyok'
import { useLayoutEffect } from 'react'
import * as TH from 'safebyok/testing'
import { VaultProvider, useVault } from '../../src/vault-provider'
import { Probe, makeWorld, shownState, expectShown, expectOutcome, putThroughNewVault, CatchingBoundary, lockedWorld, watched, hushConsole } from './world'

/** An Unlock button, as a host would write one: the vault unlocked ahead of time, through ensureLease. */
const UnlockButton = () => {
  const vault = useVault()
  return vault === null ? null : <button onClick={() => { void vault.tryEnsureLease() }}>Unlock ahead</button>
}

describe("VaultProvider", () => {
  // == [Opening and the dialog]: no vault without a user, a call summons the dialog, dismissing, misuse

  it("provides no vault without a signed-in user", () => {
    const world = makeWorld()
    world.mount(null)
    expect(shownState()).to.eq('no vault')
  })

  it("opens the vault for the signed-in user, settling into 'absent' with no dialog", async () => {
    const world = makeWorld()
    world.mount('u1')
    await expectShown('absent')
    expect(screen.queryByText('Choose a vault passphrase')).to.be.null
  })

  it("summons the dialog for a call that needs the vault, and the call goes on once it unlocks (Contract: getProof, in React)", async () => {
    const world = makeWorld()
    world.mount('u1')
    await expectShown('absent')

    fireEvent.click(screen.getByText('put'))
    const passphraseInput = await screen.findByPlaceholderText('vault passphrase')
    expect(screen.getByText('Choose a vault passphrase')).to.not.be.null

    fireEvent.change(passphraseInput, { target: { value: 'correct horse battery staple' } })
    fireEvent.click(screen.getByText('Create vault'))

    await expectOutcome('stored')
    expect(shownState()).to.eq('unlocked')
    await waitFor(() => { expect(screen.getByTestId('boxcount').textContent).to.eq('1') })
  })

  it("the dialog promises the window the vault was opened with", async () => {
    const world = makeWorld()
    render(
      <VaultProvider applabel="acme" vaultlabel="main" userId="u1" vaultDB={world.vaultDB} deviceDB={world.deviceDB} keyDeriver={TH.testDeriver}
        passphraseStrengthTest={TH.anyPassphraseTest} leaseHours={0.25}>
        <Probe />
      </VaultProvider>,
    )
    await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('absent') })
    fireEvent.click(screen.getByText('put'))
    await screen.findByPlaceholderText('vault passphrase')
    expect(screen.queryByText('Locks on this device in 15 minutes.')).to.not.be.null
  })

  it("the dialog promises seven days when the vault was opened with the default window", async () => {
    const world = makeWorld()
    world.mount('u1')
    await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('absent') })
    fireEvent.click(screen.getByText('put'))
    await screen.findByPlaceholderText('vault passphrase')
    expect(screen.queryByText('Locks on this device in 7 days.')).to.not.be.null
  })

  it("once unlocked, further calls run without the dialog (Contract: ensureLease, Does 2)", async () => {
    const world = makeWorld()
    world.mount('u1')
    await expectShown('absent')
    await putThroughNewVault('a fine passphrase')

    fireEvent.click(screen.getByText('grab'))
    await expectOutcome('read:"sk-fake"')
    expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
  })

  it("a wrong passphrase keeps the dialog open with a calm gripe; the right one proceeds", async () => {
    const world = makeWorld()
    const first = world.mount('u1')
    await expectShown('absent')
    await putThroughNewVault('the right one')
    first.unmount()

    // A fresh mount after the lease is gone: lock it by clearing the device side.
    await world.deviceDB.delAll()
    world.mount('u1')
    await expectShown('locked')
    fireEvent.click(screen.getByText('grab'))
    fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'the wrong one' } })
    fireEvent.click(screen.getByText('Unlock'))
    await screen.findByText(/^That passphrase didn't unlock the vault. Check for typos and try again./)

    fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'the right one' } })
    fireEvent.click(screen.getByText('Unlock'))
    await expectOutcome('read:"sk-fake"')
  })

  it("dismissing the dialog refuses the call vault_locked, and nothing is stored (Contract: ensureLease, Does 3.5)", async () => {
    const world = makeWorld()
    world.mount('u1')
    await expectShown('absent')
    fireEvent.click(screen.getByText('put'))
    await screen.findByPlaceholderText('vault passphrase')
    fireEvent.click(screen.getByText('Cancel'))
    await expectOutcome('dismissed')
    expect(shownState()).to.eq('absent')
    expect(screen.getByTestId('boxcount').textContent).to.eq('0')
  })

  it("a dialog that meets misuse keeps the app in place, and closing it answers declined: the call is refused vault_locked", async () => {
    const world = makeWorld()
    const first = world.mount('u1')
    await expectShown('absent')
    await putThroughNewVault('the right one')
    first.unmount()

    // A tab whose build carries another key deriver than the one the vault was made with, as a
    // stale tab beside a newer deployment would: its unlock refuses with kind 'unknown_key_deriver'.
    const otherDeriver = { ...TH.testDeriver, key_deriver_label: 'other_deriver' }
    const caught: unknown[] = []
    const reported: unknown[] = []
    render(
      <CatchingBoundary caught={caught}>
        <VaultProvider {...world.props} deviceDB={memoryDeviceDB()} keyDeriver={otherDeriver} userId="u1">
          <Probe />
        </VaultProvider>
      </CatchingBoundary>,
      { onCaughtError: (err) => { reported.push(err) } },
    )
    await expectShown('locked')
    fireEvent.click(screen.getByText('grab'))
    fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'the right one' } })
    fireEvent.click(screen.getByText('Unlock'))
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    await expectOutcome('dismissed')
    expect(shownState()).to.eq('locked')
    expect(caught).to.deep.equal([])
    expect(reported).to.have.lengthOf(1)
    expect(isVaultError(reported[0], 'unknown_key_deriver')).to.be.true
  })
  // --

  // == [Its getProof]: one at a time, closing on a lock, sign-out and another user, the host's own getProof, no gesture

  describe("its getProof, the passphrase dialog", () => {
    it("refuses a call vault_locked when the provider unmounts with the dialog open (Contract: ensureLease, Does 3.7)", async () => {
      const world = await lockedWorld()
      const { unmount } = render(world.tree('u1'))
      const vault = await world.opened()
      const reading = vault.tryGetBox('anthropic_api_key')
      await screen.findByPlaceholderText('vault passphrase')
      unmount()
      await TH.expectBad(reading, 'vault_locked')
    })

    it("refuses a read vault_locked when the user dismisses the dialog, as VaultProvider's third example shows (Contract: ensureLease, Does 3.5)", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const reading = vault.tryGetBox('anthropic_api_key')
      await screen.findByPlaceholderText('vault passphrase')
      fireEvent.click(screen.getByText('Cancel'))
      const { ok } = await reading
      expect(ok).to.be.false
      expect(vault.getSnapshot().state).to.eq('locked')
    })

    it("keeps a dialog a call opens in the very commit that gave the provider its vault", async () => {
      const world = await lockedWorld()
      const eager: { reading: { outcome: unknown } } = { reading: { outcome: 'pending' } }
      // A layout effect runs in the commit itself, before React's passive effects have had their turn.
      const Eager = () => {
        const vault = useVault()
        useLayoutEffect(() => {
          if (vault !== null) { eager.reading = watched(vault.getBox('anthropic_api_key')) }
        }, [vault])
        return null
      }
      render(<VaultProvider {...world.props} userId="u1"><Eager /></VaultProvider>)
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      await waitFor(() => { expect(eager.reading.outcome).to.eq('sk-fake') })
    })

    it("refuses vault_locked when another user signs in, and shows that user no dialog", async () => {
      const world = await lockedWorld()
      const { rerender } = render(world.tree('u1'))
      const vault = await world.opened()
      const reading = vault.tryGetBox('anthropic_api_key')
      await screen.findByPlaceholderText('vault passphrase')
      rerender(world.tree('u2'))
      await TH.expectBad(reading, 'vault_locked')
      await waitFor(() => { expect(world.latest().vault).to.not.be.null })
      expect(world.latest().vault).to.not.equal(vault)
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    })

    it("refuses vault_locked when the user signs out, and the dialog goes", async () => {
      const world = await lockedWorld()
      const { rerender } = render(world.tree('u1'))
      const vault = await world.opened()
      const reading = vault.tryGetBox('anthropic_api_key')
      await screen.findByPlaceholderText('vault passphrase')
      rerender(world.tree(null))
      await TH.expectBad(reading, 'vault_locked')
      await waitFor(() => { expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null })
    })

    it("has overlapping calls wait on one dialog: one unlock answers them all (Contract: ensureLease, Does 3.1, and Guarantees)", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const first = vault.getBox('anthropic_api_key')
      await screen.findByPlaceholderText('vault passphrase')
      const second = vault.getBox('anthropic_api_key')
      await TH.wakeupAtNextTick()
      expect(screen.getAllByPlaceholderText('vault passphrase')).to.have.lengthOf(1)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      expect(await first).to.eq('sk-fake')
      expect(await second).to.eq('sk-fake')
    })

    it("has overlapping calls each refused vault_locked when the one dialog is cancelled", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const first = vault.tryGetBox('anthropic_api_key')
      await screen.findByPlaceholderText('vault passphrase')
      const second = vault.tryGetBox('anthropic_api_key')
      await TH.wakeupAtNextTick()
      fireEvent.click(screen.getByText('Cancel'))
      await TH.expectBad(first, 'vault_locked')
      await TH.expectBad(second, 'vault_locked')
    })

    it("lets an attempt finishing after Cancel unlock the vault, which answers a newer dialog too", async () => {
      const world = await lockedWorld()
      const gate = TH.makeGate()
      const slowDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase: string, saltBytes: Uint8Array) => { await gate.pass(); return await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes) } }
      render(world.tree('u1', slowDeriver))
      const vault = await world.opened()
      const first = vault.tryGetBox('anthropic_api_key')
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      await gate.reached
      fireEvent.click(screen.getByText('Cancel'))
      await TH.expectBad(first, 'vault_locked')

      const second = watched(vault.getBox('anthropic_api_key'))
      await screen.findByPlaceholderText('vault passphrase')
      expect(second.outcome).to.eq('pending')
      gate.release()
      await waitFor(() => { expect(second.outcome).to.eq('sk-fake') })
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    })

    it("closes a dialog the vault unlocks under without it, and the calls waiting on it go on", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const reading = vault.getBox('anthropic_api_key')
      await screen.findByPlaceholderText('vault passphrase')
      await vault.unlock('pw')
      expect(await reading).to.eq('sk-fake')
      await waitFor(() => { expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null })
    })

    it("keeps the dialog asking through a box arriving, and closes it as a lock lands, its calls refused vault_locked (Contract: ensureLease, Does 3.7)", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const reading = vault.tryGetBox('anthropic_api_key')
      await screen.findByPlaceholderText('vault passphrase')
      const elsewhere = await TH.settledVault({ ...world.props, deviceDB: memoryDeviceDB(), userId: 'u1' })
      await elsewhere.unlock('pw')
      await elsewhere.putBox('openai_api_key', 'sk-also-fake')
      elsewhere.close()
      await waitFor(() => { expect(vault.getSnapshot().boxes).to.have.lengthOf(2) })
      expect(screen.queryByPlaceholderText('vault passphrase')).to.not.be.null
      await vault.lock()
      await TH.expectBad(reading, 'vault_locked')
      await waitFor(() => { expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null })
    })

    it("leaves the vault locked when a lock lands under the attempt, and closes the dialog (Contract: getProof, attempt refuses: vault_locked)", async () => {
      const world = await lockedWorld()
      const gate = TH.makeGate()
      const slowDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase: string, saltBytes: Uint8Array) => { await gate.pass(); return await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes) } }
      render(world.tree('u1', slowDeriver))
      const vault = await world.opened()
      const reading = vault.tryGetBox('anthropic_api_key')
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      await gate.reached
      await vault.lock()
      gate.release()
      await TH.expectBad(reading, 'vault_locked')
      await waitFor(() => { expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null })
      await TH.wakeupAtNextTick()
      expect(vault.getSnapshot().state).to.eq('locked')
    })

    it("leaves another user's dialog asking when the last user's cancelled attempt finishes late", async () => {
      const world = await lockedWorld()
      const other = await TH.settledVault({ ...world.props, deviceDB: memoryDeviceDB(), userId: 'u2' })
      await other.unlock('pw2')
      await other.putBox('anthropic_api_key', 'sk-other-fake')
      other.close()
      const gate = TH.makeGate()
      const slowDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase: string, saltBytes: Uint8Array) => { await gate.pass(); return await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes) } }
      const { rerender } = render(world.tree('u1', slowDeriver))
      const vault = await world.opened()
      const first = vault.tryGetBox('anthropic_api_key')
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      await gate.reached
      fireEvent.click(screen.getByText('Cancel'))
      await TH.expectBad(first, 'vault_locked')

      rerender(world.tree('u2', slowDeriver))
      await waitFor(() => { expect(world.latest().vault).to.not.be.null })
      const vault2 = world.latest().vault
      if (vault2 === null || vault2 === vault) { throw new Error('the provider opened no vault for u2') }
      const second = watched(vault2.tryGetBox('anthropic_api_key'))
      await screen.findByPlaceholderText('vault passphrase')
      gate.release()
      await TH.wakeupAtNextTick()
      expect(vault2.getSnapshot().state).to.eq('locked')
      expect(screen.queryByPlaceholderText('vault passphrase')).to.not.be.null
      expect(second.outcome).to.eq('pending')
      fireEvent.click(screen.getByText('Cancel'))
      await waitFor(() => { expect(second.outcome).to.have.property('ok', false) })
    })

    it("declines unasked while no user gesture is in hand, and carries on under a lease ending (Contract: getProof, Does 1)", async () => {
      Object.defineProperty(navigator, 'userActivation', { value: { isActive: false }, configurable: true })
      try {
        const world = await lockedWorld()
        render(world.tree('u1'))
        const vault = await world.opened()
        await TH.expectBad(vault.tryGetBox('anthropic_api_key'), 'vault_locked')
        expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
        await vault.unlock('pw')
        expect(await vault.ensureLease({ renewMinutes: Infinity })).to.eq(vault)
        expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
      } finally {
        Reflect.deleteProperty(navigator, 'userActivation')
      }
    })

    it("hands each ask to a getProof of the host's own in place of the dialog, a getProof written inline making no new vault (Contract: getProof, in React)", async () => {
      const world = await lockedWorld()
      const heard: string[] = []
      const tree = (teller: string) => (
        <VaultProvider {...world.props} userId="u1" getProof={async (ask) => {
          heard.push(`${teller}: ${ask.why}`)
          const { ok } = await ask.attempt('pw')
          return ok ? 'unlocked' : 'declined'
        }}><world.Grab /></VaultProvider>
      )
      const { rerender } = render(tree('first'))
      const vault = await world.opened()
      rerender(tree('second'))
      expect(world.latest().vault).to.eq(vault)
      expect(await vault.getBox('anthropic_api_key')).to.eq('sk-fake')
      expect(heard).to.deep.equal(['second: locked'])
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    })

    it("asks no one with getProof null: a call is refused vault_locked, and no dialog shows (Contract: getProof, with none configured)", async () => {
      const world = await lockedWorld()
      render(<VaultProvider {...world.props} userId="u1" getProof={null}><world.Grab /></VaultProvider>)
      const vault = await world.opened()
      await TH.expectBad(vault.tryGetBox('anthropic_api_key'), 'vault_locked')
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    })

    it("throws a getProof that is no function to the error boundary, as Vault.make refuses it", async () => {
      hushConsole()
      const world = makeWorld()
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider {...world.props} userId="u1" getProof={'modal' as unknown as GetProof}><Probe /></VaultProvider>
        </CatchingBoundary>,
      )
      await expectShown('boundary')
      expect(isVaultError(caught[0], 'bad_option')).to.be.true
      expect((caught[0] as VaultError).message).to.match(/getProof is a function/)
    })

    it("unlocks ahead of time through ensureLease, on a button", async () => {
      const world = await lockedWorld()
      render(<VaultProvider {...world.props} userId="u1"><UnlockButton /><world.Grab /></VaultProvider>)
      const vault = await world.opened()
      await waitFor(() => { expect(vault.getSnapshot().state).to.eq('locked') })
      fireEvent.click(screen.getByText('Unlock ahead'))
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      await waitFor(() => { expect(vault.getSnapshot().state).to.eq('unlocked') })
    })
  })
  // --
})
