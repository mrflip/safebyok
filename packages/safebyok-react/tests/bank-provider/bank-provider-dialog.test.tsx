import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bank, isVaultError, type Vault, memoryDeviceDB, type Gating, type Outcome, type RequestCleartext, type VaultError } from 'safebyok'
import { useLayoutEffect } from 'react'
import * as TH from '../test-helpers'
import { BankProvider, useVault } from '../../src/bank-provider'
import { Probe, makeWorld, shownState, expectShown, expectOutcome, putThroughNewVault, CatchingBoundary, lockedWorld, watched, hushConsole } from './world'

/** An Unlock button, as a host would write one: the vault unlocked ahead of time, through ensureUnlocked. */
const UnlockButton = () => {
  const vault = useVault('main')?.vault ?? null
  return vault === null ? null : <button onClick={() => { void vault.tryEnsureUnlocked() }}>Unlock ahead</button>
}

/** Keeps in `seen` the Vault object the provider hands down for `vaultlabel`, once there is one. */
const VaultKeeper = ({ seen, vaultlabel }: { seen: Map<string, Vault>, vaultlabel: string }) => {
  const vault = useVault(vaultlabel)?.vault ?? null
  useLayoutEffect(() => { if (vault !== null) { seen.set(vaultlabel, vault) } }, [seen, vaultlabel, vault])
  return null
}

describe("BankProvider", () => {
  // == [Opening and the dialog]: no vault without a user, a call summons the dialog, dismissing, misuse

  it("provides no vault without a signed-in user", () => {
    const world = makeWorld()
    world.mount(null)
    expect(shownState()).to.eq('no vault')
  })

  it("opens the vault for the signed-in user, born 'novel', with no dialog", async () => {
    const world = makeWorld()
    world.mount('u1')
    await expectShown('novel')
    expect(screen.queryByText('Choose a vault passphrase')).to.be.null
  })

  it("summons the dialog for a call that needs the vault, and the call goes on once it unlocks (Contract: requestCleartext, in React)", async () => {
    const world = makeWorld()
    world.mount('u1')
    await expectShown('novel')

    fireEvent.click(screen.getByText('put'))
    await screen.findByPlaceholderText('vault passphrase')
    expect(screen.getByText('Choose a vault passphrase')).to.not.be.null

    TH.typeNewPassphrase('correct horse battery staple')
    fireEvent.click(screen.getByText('Create vault'))

    await expectOutcome('stored')
    expect(shownState()).to.eq('unlocked')
    await waitFor(() => { expect(screen.getByTestId('boxcount').textContent).to.eq('1') })
  })

  it("the dialog promises the window the vault was opened with", async () => {
    const world = makeWorld()
    render(
      <BankProvider applabel="acme" user_id="u1" vaultDB={world.vaultDB} deviceDB={world.deviceDB} keyDeriver={TH.testDeriver}
        strengthChecker={TH.anyStrengthChecker} leaseHours={0.25}>
        <Probe />
      </BankProvider>,
    )
    await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('novel') })
    fireEvent.click(screen.getByText('put'))
    await screen.findByPlaceholderText('vault passphrase')
    expect(screen.queryByText('Locks on this device in 15 minutes.')).to.not.be.null
  })

  it("the dialog promises seven days when the vault was opened with the default window", async () => {
    const world = makeWorld()
    world.mount('u1')
    await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq('novel') })
    fireEvent.click(screen.getByText('put'))
    await screen.findByPlaceholderText('vault passphrase')
    expect(screen.queryByText('Locks on this device in 7 days.')).to.not.be.null
  })

  it("once unlocked, further calls run without the dialog (Contract: ensureUnlocked, Does 2)", async () => {
    const world = makeWorld()
    world.mount('u1')
    await expectShown('novel')
    await putThroughNewVault('a fine passphrase')

    fireEvent.click(screen.getByText('grab'))
    await expectOutcome('read:"sk-fake"')
    expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
  })

  it("a wrong passphrase keeps the dialog open with a calm gripe; the right one proceeds", async () => {
    const world = makeWorld()
    const first = world.mount('u1')
    await expectShown('novel')
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

  it("dismissing the dialog refuses the call vault_locked, and nothing is stored (Contract: ensureUnlocked, Does 3.5)", async () => {
    const world = makeWorld()
    world.mount('u1')
    await expectShown('novel')
    fireEvent.click(screen.getByText('put'))
    await screen.findByPlaceholderText('vault passphrase')
    fireEvent.click(screen.getByText('Cancel'))
    await expectOutcome('dismissed')
    expect(shownState()).to.eq('novel')
    expect(screen.getByTestId('boxcount').textContent).to.eq('0')
  })

  it("a dialog that meets misuse keeps the app in place, and closing it answers declined: the call is refused with the misuse its attempt met, which settled the gating", async () => {
    const world = makeWorld()
    const first = world.mount('u1')
    await expectShown('novel')
    await putThroughNewVault('the right one')
    first.unmount()

    // A tab whose build carries another key deriver than the one the vault was made with, as a
    // stale tab beside a newer deployment would: its unlock refuses with kind 'unknown_key_deriver'.
    const otherDeriver = { ...TH.testDeriver, key_deriver_label: 'other_deriver' }
    const caught: unknown[] = []
    const reported: unknown[] = []
    render(
      <CatchingBoundary caught={caught}>
        <BankProvider {...world.props} deviceDB={memoryDeviceDB()} keyDeriver={otherDeriver} user_id="u1">
          <Probe />
        </BankProvider>
      </CatchingBoundary>,
      { onCaughtError: (err) => { reported.push(err) } },
    )
    await expectShown('locked')
    fireEvent.click(screen.getByText('grab'))
    fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'the right one' } })
    fireEvent.click(screen.getByText('Unlock'))
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    await expectOutcome('refused: unknown_key_deriver')
    expect(shownState()).to.eq('locked')
    expect(caught).to.deep.equal([])
    expect(reported).to.have.lengthOf(1)
    expect(isVaultError(reported[0], 'unknown_key_deriver')).to.be.true
  })
  // --

  // == [Its requestCleartext]: one at a time, closing on a lock, sign-out and another user, the host's own requestCleartext, no gesture

  describe("its requestCleartext, the passphrase dialog", () => {
    it("refuses a call vault_gone when the provider unmounts with the dialog open (Contract: ensureUnlocked, Does 3.7)", async () => {
      const world = await lockedWorld()
      const { unmount } = render(world.tree('u1'))
      const vault = await world.opened()
      const reading = vault.tryGetWhisper('anthropic_api_key')
      await screen.findByPlaceholderText('vault passphrase')
      unmount()
      await TH.expectBad(reading, 'vault_gone')
    })

    it("refuses a read vault_locked when the user dismisses the dialog, as BankProvider's third example shows (Contract: ensureUnlocked, Does 3.5)", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const reading = vault.tryGetWhisper('anthropic_api_key')
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
        const vault = useVault('main')?.vault ?? null
        useLayoutEffect(() => {
          if (vault !== null) { eager.reading = watched(vault.getWhisper('anthropic_api_key')) }
        }, [vault])
        return null
      }
      render(<BankProvider {...world.props} user_id="u1"><Eager /></BankProvider>)
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      await waitFor(() => { expect(eager.reading.outcome).to.eq('sk-fake') })
    })

    it("refuses vault_gone when another user signs in, and shows that user no dialog", async () => {
      const world = await lockedWorld()
      const { rerender } = render(world.tree('u1'))
      const vault = await world.opened()
      const reading = vault.tryGetWhisper('anthropic_api_key')
      await screen.findByPlaceholderText('vault passphrase')
      rerender(world.tree('u2'))
      await TH.expectBad(reading, 'vault_gone')
      await waitFor(() => { expect(world.latest().vault).to.not.be.null })
      expect(world.latest().vault).to.not.equal(vault)
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    })

    it("refuses vault_gone when the user signs out, and the dialog goes", async () => {
      const world = await lockedWorld()
      const { rerender } = render(world.tree('u1'))
      const vault = await world.opened()
      const reading = vault.tryGetWhisper('anthropic_api_key')
      await screen.findByPlaceholderText('vault passphrase')
      rerender(world.tree(null))
      await TH.expectBad(reading, 'vault_gone')
      await waitFor(() => { expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null })
    })

    it("has overlapping calls wait on one dialog: one unlock answers them all (Contract: ensureUnlocked, Does 3.1, and Guarantees)", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const first = vault.getWhisper('anthropic_api_key')
      await screen.findByPlaceholderText('vault passphrase')
      const second = vault.getWhisper('anthropic_api_key')
      await TH.wakeupAtNextTick()
      expect(screen.getAllByPlaceholderText('vault passphrase')).to.have.lengthOf(1)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      expect(await first).to.eq('sk-fake')
      expect(await second).to.eq('sk-fake')
    })

    it("shows another vault's gating over a dialog, the call it replaces refused vault_locked rather than left waiting", async () => {
      const world = await lockedWorld()
      const seen = new Map<string, Vault>()
      render(
        <BankProvider {...world.props} user_id="u1">
          <VaultKeeper seen={seen} vaultlabel="main" />
          <VaultKeeper seen={seen} vaultlabel="work" />
        </BankProvider>,
      )
      await waitFor(() => { expect(seen.size).to.eq(2) })
      const [main, work] = [seen.get('main'), seen.get('work')]
      if (main === undefined || work === undefined) { throw new Error('the provider opened no vault for main or work') }
      const reading = main.tryGetWhisper('anthropic_api_key')
      await screen.findByText('Unlock')
      const storing = work.tryPutBox({ boxlabel: 'openai_api_key' }, 'sk-fake')
      await TH.expectBad(reading, 'vault_locked')
      await screen.findByText('Choose a vault passphrase')
      expect(screen.getAllByPlaceholderText('vault passphrase')).to.have.lengthOf(1)
      fireEvent.click(screen.getByText('Cancel'))
      await TH.expectBad(storing, 'vault_locked')
    })

    it("has overlapping calls each refused vault_locked when the one dialog is cancelled", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const first = vault.tryGetWhisper('anthropic_api_key')
      await screen.findByPlaceholderText('vault passphrase')
      const second = vault.tryGetWhisper('anthropic_api_key')
      await TH.wakeupAtNextTick()
      fireEvent.click(screen.getByText('Cancel'))
      await TH.expectBad(first, 'vault_locked')
      await TH.expectBad(second, 'vault_locked')
    })

    it("stands an attempt down when the user cancels during it: a newer dialog stays asking, and the vault stays locked (Contract: Gating, attempt refuses: gating_landed)", async () => {
      const world = await lockedWorld()
      const gate = TH.makeLatch()
      const slowDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase: string, saltBytes: Uint8Array) => { await gate.pass(); return await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes) } }
      // Each attempt the dialog makes, kept, so the test waits for the one cancelled to finish: the
      // dialog is handed each gating through one whose attempt keeps what it starts.
      const attempts: Promise<Outcome<Vault>>[] = []
      const make = Bank.make.bind(Bank)
      vi.spyOn(Bank, 'make').mockImplementation((opts) => {
        const { requestCleartext } = opts
        if (typeof requestCleartext !== 'function') { throw new TypeError("The provider hands every bank it makes a requestCleartext.") }
        return make({ ...opts, requestCleartext: async (gating) => {
          if (gating.gatingkind !== 'unlock_vault') { await requestCleartext(gating); return }
          const attemptPassphrase = (passphrase: string) => {
            const attempting = gating.attemptPassphrase(passphrase)
            attempts.push(attempting)
            return attempting
          }
          await requestCleartext({ ...gating, attemptPassphrase })
        } })
      })
      render(world.tree('u1', slowDeriver))
      const vault = await world.opened()
      const first = vault.tryGetWhisper('anthropic_api_key')
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      await gate.reached
      fireEvent.click(screen.getByText('Cancel'))
      await TH.expectBad(first, 'vault_locked')

      const second = watched(vault.tryGetWhisper('anthropic_api_key'))
      await screen.findByPlaceholderText('vault passphrase')
      expect(second.outcome).to.eq('pending')
      gate.release()
      const outcomes = await Promise.all(attempts)
      expect(outcomes.map((outcome) => (outcome.ok ? 'unlocked' : outcome.err.refusalkind))).to.deep.equal(['gating_landed'])
      expect(vault.getSnapshot().state).to.eq('locked')
      expect(screen.queryByPlaceholderText('vault passphrase')).to.not.be.null
      expect(second.outcome).to.eq('pending')
      fireEvent.click(screen.getByText('Cancel'))
      await waitFor(() => { expect(second.outcome).to.have.property('ok', false) })
    })

    it("keeps the dialog asking through a box arriving, and closes it as a lock lands, its calls refused vault_locked (Contract: ensureUnlocked, Does 3.7)", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const reading = vault.tryGetWhisper('anthropic_api_key')
      await screen.findByPlaceholderText('vault passphrase')
      const elsewhere = await TH.settledVault({ ...world.props, vaultlabel: 'main', deviceDB: memoryDeviceDB(), user_id: 'u1' })
      await TH.unlock(elsewhere, 'pw')
      await elsewhere.putBox({ boxlabel: 'openai_api_key' }, 'sk-also-fake')
      TH.closeVault(elsewhere)
      await waitFor(() => { expect(vault.getSnapshot().boxes).to.have.lengthOf(2) })
      expect(screen.queryByPlaceholderText('vault passphrase')).to.not.be.null
      await vault.lock()
      await TH.expectBad(reading, 'vault_locked')
      await waitFor(() => { expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null })
    })

    it("leaves the vault locked when a lock lands under the attempt, and closes the dialog (Contract: Gating, attempt refuses: vault_locked)", async () => {
      const world = await lockedWorld()
      const gate = TH.makeLatch()
      const slowDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase: string, saltBytes: Uint8Array) => { await gate.pass(); return await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes) } }
      render(world.tree('u1', slowDeriver))
      const vault = await world.opened()
      const reading = vault.tryGetWhisper('anthropic_api_key')
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
      const other = await TH.settledVault({ ...world.props, vaultlabel: 'main', deviceDB: memoryDeviceDB(), user_id: 'u2' })
      await TH.unlock(other, 'pw2')
      await other.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-other-fake')
      TH.closeVault(other)
      const gate = TH.makeLatch()
      const slowDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase: string, saltBytes: Uint8Array) => { await gate.pass(); return await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes) } }
      const { rerender } = render(world.tree('u1', slowDeriver))
      const vault = await world.opened()
      const first = vault.tryGetWhisper('anthropic_api_key')
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      await gate.reached
      fireEvent.click(screen.getByText('Cancel'))
      await TH.expectBad(first, 'vault_locked')

      rerender(world.tree('u2', slowDeriver))
      await waitFor(() => { expect(world.latest().vault).to.not.be.null })
      const vault2 = world.latest().vault
      if (vault2 === null || vault2 === vault) { throw new Error('the provider opened no vault for u2') }
      const second = watched(vault2.tryGetWhisper('anthropic_api_key'))
      await screen.findByPlaceholderText('vault passphrase')
      gate.release()
      await TH.wakeupAtNextTick()
      expect(vault2.getSnapshot().state).to.eq('locked')
      expect(screen.queryByPlaceholderText('vault passphrase')).to.not.be.null
      expect(second.outcome).to.eq('pending')
      fireEvent.click(screen.getByText('Cancel'))
      await waitFor(() => { expect(second.outcome).to.have.property('ok', false) })
    })

    it("declines unasked while no user gesture is in hand (Contract: requestCleartext, Does 1)", async () => {
      Object.defineProperty(navigator, 'userActivation', { value: { isActive: false }, configurable: true })
      try {
        const world = await lockedWorld()
        render(world.tree('u1'))
        const vault = await world.opened()
        await TH.expectBad(vault.tryGetWhisper('anthropic_api_key'), 'vault_locked')
        expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
        expect(vault.getSnapshot().state).to.eq('locked')
      } finally {
        Reflect.deleteProperty(navigator, 'userActivation')
      }
    })

    it("hands each gating to a requestCleartext of the host's own in place of the dialog, a requestCleartext written inline making no new vault (Contract: requestCleartext, in React)", async () => {
      const world = await lockedWorld()
      const heard: string[] = []
      const tree = (teller: string) => (
        <BankProvider {...world.props} user_id="u1" requestCleartext={async (gating) => {
          heard.push(`${teller}: ${gating.gatingkind}`)
          if (gating.gatingkind === 'unlock_vault') { await gating.attemptPassphrase('pw') }
        }}><world.Grab /></BankProvider>
      )
      const { rerender } = render(tree('first'))
      const vault = await world.opened()
      rerender(tree('second'))
      expect(world.latest().vault).to.eq(vault)
      expect(await vault.getWhisper('anthropic_api_key')).to.eq('sk-fake')
      expect(heard).to.deep.equal(['second: unlock_vault'])
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    })

    it("hands the next user's requestCleartext no gating the last user's vault raises in the commit that brings the next user, before its passive effects", async () => {
      const world = await lockedWorld()
      const asked: string[] = []
      const answers: unknown[] = []
      const made = vi.spyOn(Bank, 'make')
      // Rendered after the provider, so its layout effect runs after the provider's in the same
      // commit: it asks through the requestCleartext u1's bank was handed, as a gating raised then would.
      const LateGating = ({ user_id }: { user_id: string }) => {
        useLayoutEffect(() => {
          const [opts] = made.mock.calls[0] ?? []
          if (user_id === 'u2' && typeof opts?.requestCleartext === 'function') { answers.push(opts.requestCleartext({ gatingkind: 'unlock_vault' } as Gating)) }
        }, [user_id])
        return null
      }
      const tree = (user_id: string) => (
        <>
          <BankProvider {...world.props} user_id={user_id} requestCleartext={() => { asked.push(user_id) }}>
            <Probe />
          </BankProvider>
          <LateGating user_id={user_id} />
        </>
      )
      const { rerender } = render(tree('u1'))
      await expectShown('locked')
      rerender(tree('u2'))
      await TH.wakeupAtNextTick()
      expect(answers).to.have.lengthOf(1)
      expect(asked).to.not.include('u2')
    })

    it("asks no one with requestCleartext null: a call is refused vault_locked, and no dialog shows (Contract: requestCleartext, with none configured)", async () => {
      const world = await lockedWorld()
      render(<BankProvider {...world.props} user_id="u1" requestCleartext={null}><world.Grab /></BankProvider>)
      const vault = await world.opened()
      await TH.expectBad(vault.tryGetWhisper('anthropic_api_key'), 'vault_locked')
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    })

    it("throws a requestCleartext that is no function to the error boundary, as Bank.make refuses it", async () => {
      hushConsole()
      const world = makeWorld()
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <BankProvider {...world.props} user_id="u1" requestCleartext={'modal' as unknown as RequestCleartext}><Probe /></BankProvider>
        </CatchingBoundary>,
      )
      await expectShown('boundary')
      expect(isVaultError(caught[0], 'bad_option')).to.be.true
      expect((caught[0] as VaultError).message).to.match(/requestCleartext is a function/)
    })

    it("unlocks ahead of time through ensureUnlocked, on a button", async () => {
      const world = await lockedWorld()
      render(<BankProvider {...world.props} user_id="u1"><UnlockButton /><world.Grab /></BankProvider>)
      const vault = await world.opened()
      await waitFor(() => { expect(vault.getSnapshot().state).to.eq('locked') })
      fireEvent.click(screen.getByText('Unlock ahead'))
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      await waitFor(() => { expect(vault.getSnapshot().state).to.eq('unlocked') })
    })
  })
  // --

  // == [Every kind's dialog]: a change to the ways in, a deletion, and a call that waits behind one

  describe("its requestCleartext, a dialog for every kind of gating", () => {
    it("asks a passphrase change through its own dialog: the current and the next, the vault unlocked under the next", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const changing = vault.tryPutWayin('passphrase')
      await screen.findByRole('dialog', { name: 'Change your vault passphrase' })
      fireEvent.change(screen.getByPlaceholderText('current passphrase'), { target: { value: 'pw' } })
      TH.typeNewPassphrase('pw two', { fieldlabel: 'new passphrase' })
      fireEvent.click(screen.getByRole('button', { name: 'Change passphrase' }))
      await TH.expectGood(changing)
      await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
      expect(vault.state).to.eq('unlocked')
      await vault.lock()
      await TH.unlock(await TH.settledVault({ ...world.props, deviceDB: memoryDeviceDB(), user_id: 'u1', vaultlabel: 'main' }), 'pw two')
    })

    it("asks a deletion through its own dialog, and the vault is deleted", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const deleting = vault.tryDel()
      await screen.findByRole('dialog', { name: 'Delete your vault' })
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByRole('button', { name: 'Delete vault' }))
      await TH.expectGood(deleting)
      await waitFor(() => { expect(screen.queryByRole('dialog')).to.be.null })
      expect(await TH.propsOf(world.vaultDB, TH.scopeOf('u1'))).to.be.null
    })

    it("has a read wait behind a change's dialog, and go on unasked once the change leaves the vault unlocked", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const changing = vault.tryPutWayin('passphrase')
      await screen.findByRole('dialog', { name: 'Change your vault passphrase' })
      const reading = watched(vault.getWhisper('anthropic_api_key'))
      await TH.wakeupAtNextTick()
      expect(reading.outcome).to.eq('pending')
      expect(screen.getAllByRole('dialog')).to.have.lengthOf(1)
      fireEvent.change(screen.getByPlaceholderText('current passphrase'), { target: { value: 'pw' } })
      TH.typeNewPassphrase('pw two', { fieldlabel: 'new passphrase' })
      fireEvent.click(screen.getByRole('button', { name: 'Change passphrase' }))
      await TH.expectGood(changing)
      expect(await reading.settled).to.eq('sk-fake')
      expect(screen.queryByRole('dialog')).to.be.null
    })

    it("has a read wait behind a change's dialog the user cancels, then ask for the passphrase in a dialog of its own", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const changing = vault.tryPutWayin('passphrase')
      await screen.findByRole('dialog', { name: 'Change your vault passphrase' })
      const reading = vault.getWhisper('anthropic_api_key')
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      const err = await TH.expectBad(changing, 'vault_locked')
      expect(err.message).to.match(/passphrase is unchanged/)
      await screen.findByRole('dialog', { name: 'Unlock your vault' })
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      expect(await reading).to.eq('sk-fake')
    })
  })
  // --
})
