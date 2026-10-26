import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Scopepath, VaultError, delDamagedVault, isVaultError, label, localVaultDB, memoryDeviceDB } from 'safebyok'
import * as TH from 'safebyok/testing'
import { BankProvider, type BankProviderProps } from '../../src/bank-provider'
import { Probe, grabber, makeWorld, madeWorld, damagedWorld, shownState, expectShown, unreachable, CatchingBoundary, VaultExample, hushConsole, noop } from './world'

/** What a store deaf to every write hands back for a subscribe: an unsubscribe from nothing. */
const silence = () => { /* it never rang */ }
/** A store's subscribe that never rings. */
const neverRings = () => silence

describe("BankProvider", () => {
  // == [Refusals on open]: when Bank.make or the birth refuses, a vault gone, a damaged vault

  describe("when Bank.make or the birth refuses", () => {
    it("throws a bad label to the error boundary, as the very VaultError", async () => {
      hushConsole()
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <BankProvider {...makeWorld().props} applabel="Not A Label" user_id="u1">
            <Probe />
          </BankProvider>
        </CatchingBoundary>,
      )
      await expectShown('boundary')
      expect(caught).to.have.length(1)
      expect(isVaultError(caught[0], 'bad_scope')).to.be.true
    })

    it("throws a validators prop to the error boundary, as Bank.make refuses an option it does not take: the name rules are the package's own", async () => {
      hushConsole()
      const caught: unknown[] = []
      const validators = { boxlabel: label }
      render(
        <CatchingBoundary caught={caught}>
          <BankProvider {...makeWorld().props} user_id="u1" {...{ validators } as object}>
            <Probe />
          </BankProvider>
        </CatchingBoundary>,
      )
      await expectShown('boundary')
      expect(isVaultError(caught[0], 'bad_option')).to.be.true
      expect((caught[0] as Error).message).to.include('spelling')
    })

    it("throws a strengthChecker that is no function to the error boundary at render, as Bank.make would refuse it", () => {
      hushConsole()
      const caught: unknown[] = []
      const misfit = { strong: true } as unknown as BankProviderProps['strengthChecker']
      render(
        <CatchingBoundary caught={caught}>
          <BankProvider {...makeWorld().props} user_id="u1" strengthChecker={misfit}>
            <Probe />
          </BankProvider>
        </CatchingBoundary>,
      )
      expect(shownState()).to.eq('boundary')
      expect(isVaultError(caught[0], 'bad_option')).to.be.true
      expect((caught[0] as Error).message).to.include('strengthChecker')
    })

    it("throws a birth whose strengthChecker's load fails to the error boundary, as unexpected_error, what the load threw its cause", async () => {
      hushConsole()
      const caught: unknown[] = []
      const lost = new Error('the word list did not load')
      const checker = Object.assign(TH.anyStrengthChecker.bind(null), { load: () => Promise.reject(lost) })
      render(
        <CatchingBoundary caught={caught}>
          <BankProvider {...makeWorld().props} user_id="u1" strengthChecker={checker}>
            <Probe />
          </BankProvider>
        </CatchingBoundary>,
      )
      await expectShown('boundary')
      expect(isVaultError(caught[0], 'unexpected_error')).to.be.true
      expect((caught[0] as Error).cause).to.eq(lost)
    })

    it("throws a bad option to the error boundary, as the very VaultError", async () => {
      hushConsole()
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <BankProvider {...makeWorld().props} user_id="u1" maxBoxes={0}>
            <Probe />
          </BankProvider>
        </CatchingBoundary>,
      )
      await expectShown('boundary')
      expect(isVaultError(caught[0], 'bad_option')).to.be.true
    })

    it("throws a rejection that is no VaultError to the boundary, as the vault answers it: unexpected_error, misuse, what was thrown its cause", async () => {
      hushConsole()
      const world = makeWorld()
      // Mocked past VaultDB's public verb, which would wrap a raw throw as storage_unavailable.
      const stray = new TypeError('something is not a function')
      vi.spyOn(world.vaultDB, 'ensureVault').mockRejectedValueOnce(stray)
      const caught: unknown[] = []
      world.mount('u1', caught)
      await expectShown('boundary')
      expect(caught[0]).to.include({ refusalkind: 'unexpected_error', cause: stray })
    })

    const ConditionCases = [
      ["storage_unavailable", 'storage that cannot be reached'],
      ["identity_revoked",    'a user storage no longer serves, as when signed out of the backend'],
      ["not_permitted",       'a call storage refuses the signed-in user'],
      ["damaged_vault",       'a vault whose stored record fails its checks'],
    ] as const

    for (const [kind, blurb] of ConditionCases) {
      it(`hands down ${blurb} as the entry's refusal, in place, leaving the boundary alone`, async () => {
        const world = makeWorld()
        const condition = new VaultError(kind, 'Something the app can tell the user about.')
        vi.spyOn(world.vaultDB, 'ensureVault').mockResolvedValueOnce(TH.bad(condition))
        const caught: unknown[] = []
        world.mount('u1', caught)
        await expectShown(`refused: ${kind}`)
        expect(caught).to.have.length(0)
      })
    }

    it("hands down the very VaultError its birth was refused with, and no vault", async () => {
      const world = makeWorld()
      const refusal = unreachable()
      vi.spyOn(world.vaultDB, 'ensureVault').mockResolvedValueOnce(TH.bad(refusal))
      const { Grab, latest } = grabber()
      render(
        <BankProvider {...world.props} user_id="u1">
          <Grab />
        </BankProvider>,
      )
      await waitFor(() => { expect(latest().err).to.eq(refusal) })
      expect(latest().vault).to.be.null
    })

    it("hands down no vault while its birth reads storage, the entry starting; then the vault, novel", async () => {
      const world = makeWorld()
      const gate = TH.holdNextCall(world.vaultDB, 'ensureVault')
      const { Grab, latest, opened } = grabber()
      render(<BankProvider {...world.props} user_id="u1"><Grab /></BankProvider>)
      await gate.reached
      expect(latest().vault).to.be.null
      expect(latest().entry?.status).to.eq('starting')
      gate.release()
      const vault = await opened()
      expect(vault.getSnapshot().state).to.eq('novel')
    })

    it("throws a birth refused as misuse to the error boundary, as the very VaultError", async () => {
      hushConsole()
      const world = makeWorld()
      const misuse = new VaultError('bad_option', 'Something the developer must fix.')
      vi.spyOn(world.vaultDB, 'ensureVault').mockResolvedValueOnce(TH.bad(misuse))
      const caught: unknown[] = []
      world.mount('u1', caught)
      await expectShown('boundary')
      expect(caught[0]).to.eq(misuse)
    })

    it("throws a birth refused as bad_record to the error boundary too, as misuse like bad_option", async () => {
      hushConsole()
      const world = makeWorld()
      const misuse = new VaultError('bad_record', 'A record the developer built wrongly.')
      vi.spyOn(world.vaultDB, 'ensureVault').mockResolvedValueOnce(TH.bad(misuse))
      const caught: unknown[] = []
      world.mount('u1', caught)
      await expectShown('boundary')
      expect(caught[0]).to.eq(misuse)
    })

    it("throws a prop Bank.make does not take to the error boundary, naming it and its new name, rather than drop it unseen", async () => {
      hushConsole()
      const caught: unknown[] = []
      const deleted = { forcePassphraseReentryHours: 1 } as Partial<BankProviderProps>
      render(
        <CatchingBoundary caught={caught}>
          <BankProvider {...makeWorld().props} user_id="u1" {...deleted}>
            <Probe />
          </BankProvider>
        </CatchingBoundary>,
      )
      await expectShown('boundary')
      expect(isVaultError(caught[0], 'bad_option')).to.be.true
      expect((caught[0] as Error).message).to.include('forcePassphraseReentryHours (called leaseHours now)')
    })

    it("opens once the app asks again and storage relents, the refusal gone with the entry that held it", async () => {
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'ensureVault').mockResolvedValueOnce(TH.bad(unreachable()))
      world.mount('u1')
      await expectShown('refused: storage_unavailable')
      fireEvent.click(screen.getByText('Retry'))
      await expectShown('novel')
    })

    it("keeps a vault holding the newer copy in hand when a later read meets an older one, as for a vault found behind: locked, its trouble vault_behind, the entry still timely", async () => {
      const world = await madeWorld()
      const vaultScopepath = Scopepath.vault(TH.scopeOf('u1'))
      const older = world.store.read(vaultScopepath) ?? ''
      // This device changes the passphrase, so its record of the vault is newer than `older`.
      const changer = await TH.settledVault({ ...world.props, vaultlabel: 'main', user_id: 'u1' })
      await TH.putWayin(changer, 'correct horse', 'another horse')
      TH.closeVault(changer)
      const { Grab, latest } = grabber()
      render(<BankProvider {...world.props} user_id="u1"><Grab /><Probe /></BankProvider>)
      await expectShown('unlocked')
      // Storage hands back the older copy; the vault's read refuses it, keeping the newer in hand.
      world.store.write(vaultScopepath, older)
      const shown = latest().vault
      expect(shown).to.not.be.null
      await act(async () => { if (shown !== null) { await TH.expectRefusal(TH.readAfresh(shown), 'vault_behind') } })
      await expectShown('locked')
      expect(latest().vault).to.eq(shown)
      expect(latest().entry?.status).to.eq('timely')
      expect(shown?.getSnapshot().trouble?.refusalkind).to.eq('vault_behind')
      expect(shown?.snapshot.gate_epoch).to.eq(2)
    })

    it("hands down a vault storage serves older than this device has seen as the entry's refusal, vault_behind, and no vault, asking again not mending it", async () => {
      const world = await madeWorld()
      const vaultScopepath = Scopepath.vault(TH.scopeOf('u1'))
      const older = world.store.read(vaultScopepath) ?? ''
      const changer = await TH.settledVault({ ...world.props, vaultlabel: 'main', user_id: 'u1' })
      await TH.putWayin(changer, 'correct horse', 'another horse')
      TH.closeVault(changer)
      // Storage hands back the older copy before the provider's birth reads it.
      world.store.write(vaultScopepath, older)
      const { Grab, latest } = grabber()
      render(<BankProvider {...world.props} user_id="u1"><Grab /><Probe /></BankProvider>)
      await expectShown('refused: vault_behind')
      expect(latest().vault).to.be.null
      fireEvent.click(screen.getByText('Retry'))
      await expectShown('refused: vault_behind')
    })

    it("keeps a vault a later read finds behind in hand, locked, its trouble vault_behind, the entry still timely", async () => {
      const world = await madeWorld()
      const vaultScopepath = Scopepath.vault(TH.scopeOf('u1'))
      const older = world.store.read(vaultScopepath) ?? ''
      // Deaf to the other tab's write, so that the vault first meets the newer copy as the older.
      const deafDB = localVaultDB({ store: { ...world.store, subscribe: neverRings } })
      const { Grab, latest } = grabber()
      render(<BankProvider {...world.props} vaultDB={deafDB} user_id="u1"><Grab /><Probe /></BankProvider>)
      await expectShown('unlocked')
      // Another tab of this device changes the passphrase; storage then hands back the older copy.
      const changer = await TH.settledVault({ ...world.props, vaultlabel: 'main', user_id: 'u1' })
      await TH.putWayin(changer, 'correct horse', 'another horse')
      TH.closeVault(changer)
      world.store.write(vaultScopepath, older)
      const shown = latest().vault
      await act(async () => { if (shown !== null) { await TH.expectRefusal(TH.readAfresh(shown), 'vault_behind') } })
      await expectShown('locked')
      expect(latest().vault).to.eq(shown)
      expect(latest().entry?.status).to.eq('timely')
      expect(shown?.getSnapshot().trouble?.refusalkind).to.eq('vault_behind')
    })

    it("leaves a vault a later read finds deleted refused, vault_gone, asking nothing until the app asks again: then the next life, novel", async () => {
      const world = await madeWorld()
      const reads = vi.spyOn(world.vaultDB, 'ensureVault')
      const { Grab, latest } = grabber()
      render(<BankProvider {...world.props} user_id="u1"><Grab /><Probe /></BankProvider>)
      await expectShown('unlocked')
      const deleter = await TH.settledVault({ ...world.props, vaultlabel: 'main', user_id: 'u1', deviceDB: memoryDeviceDB() })
      await TH.del(deleter, 'correct horse')
      const readsBefore = reads.mock.calls.length
      const shown = latest().vault
      await act(async () => { if (shown !== null) { await TH.expectRefusal(TH.readAfresh(shown), 'vault_gone') } })
      await expectShown('refused: vault_gone')
      await act(async () => { await TH.wakeupAtNextTick() })
      expect(reads.mock.calls.length).to.eq(readsBefore)
      expect(shownState()).to.eq('refused: vault_gone')
      fireEvent.click(screen.getByText('Retry'))
      await expectShown('novel')
      expect(latest().vault).to.not.eq(shown)
      expect(latest().err).to.be.null
    })

    it("leaves a vault deleted and made anew elsewhere refused until the app asks again: then the one that stands", async () => {
      const world = await madeWorld()
      const { Grab, latest } = grabber()
      render(<BankProvider {...world.props} user_id="u1"><Grab /><Probe /></BankProvider>)
      await expectShown('unlocked')
      const elsewhere = await TH.settledVault({ ...world.props, vaultlabel: 'main', user_id: 'u1', deviceDB: memoryDeviceDB() })
      const shown = latest().vault
      await TH.del(elsewhere, 'correct horse')
      const remade = await TH.bankOf(elsewhere).ensureVault({ vaultlabel: 'main' })
      await TH.unlock(remade, 'a new pw')
      // The provider's watch hears it all; however its reads fall, its Vault object is gone.
      await waitFor(() => { expect(shownState()).to.match(/^refused: vault_(gone|remade)$/) })
      fireEvent.click(screen.getByText('Retry'))
      await expectShown('locked')
      expect(latest().vault).to.not.eq(shown)
      expect(latest().vault?.vault_tok).to.eq(remade.vault_tok)
      expect(latest().err).to.be.null
    })

    it("a retry that fails again hands down the fresh error", async () => {
      const world = makeWorld()
      const first = unreachable()
      const second = new VaultError('not_permitted', 'Sign in to reach this vault.')
      vi.spyOn(world.vaultDB, 'ensureVault').mockResolvedValueOnce(TH.bad(first)).mockResolvedValueOnce(TH.bad(second))
      world.mount('u1')
      await expectShown('refused: storage_unavailable')
      fireEvent.click(screen.getByText('Retry'))
      await expectShown('refused: not_permitted')
    })

    it("retries with a new birth each time, only the vault born at last holding a storage watch", async () => {
      const world = makeWorld()
      const tally = TH.tallyWatches(world.vaultDB)
      const reads = vi.spyOn(world.vaultDB, 'ensureVault')
      reads.mockResolvedValueOnce(TH.bad(unreachable())).mockResolvedValueOnce(TH.bad(unreachable()))
      world.mount('u1')
      await expectShown('refused: storage_unavailable')
      fireEvent.click(screen.getByText('Retry'))
      await waitFor(() => { expect(reads).toHaveBeenCalledTimes(2) })
      await expectShown('refused: storage_unavailable')
      fireEvent.click(screen.getByText('Retry'))
      await expectShown('novel')
      expect(tally).to.deep.equal({ opened: 1, closed: 0 })
    })

    it("asks again only once the bank holds no entry: a vault let go is born anew, one standing is left alone", async () => {
      const world = makeWorld()
      const reads = vi.spyOn(world.vaultDB, 'ensureVault')
      const { Grab, latest } = grabber()
      const { rerender } = render(<BankProvider {...world.props} user_id="u1"><Grab /><Probe /></BankProvider>)
      await expectShown('novel')
      const first = latest().vault
      rerender(<BankProvider {...world.props} user_id="u1"><Grab /><Probe /></BankProvider>)
      await act(async () => { await TH.wakeupAtNextTick() })
      expect(reads).toHaveBeenCalledOnce()
      act(() => { latest().bank?.closeVault({ vaultlabel: 'main' }) })
      await waitFor(() => { expect(latest().vault).to.not.be.null.and.not.eq(first) })
      expect(reads).toHaveBeenCalledTimes(2)
    })

    it("opens a fresh vault, novel, once the host deletes a damaged one and asks again", async () => {
      const { store, deviceDB, props } = await damagedWorld()
      const { Grab, latest } = grabber()
      render(<BankProvider {...props} user_id="u1"><Grab /><Probe /></BankProvider>)
      await expectShown('refused: damaged_vault')
      await act(async () => {
        await delDamagedVault({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vaultDB: props.vaultDB, deviceDB })
        await latest().bank?.ensureVault({ vaultlabel: 'main' })
      })
      await expectShown('novel')
      expect(store.ckeys(), 'a tombstone in the place of the vault record').to.deep.equal(['vault^acme^u1^main'])
      expect(await TH.expectingGood(deviceDB).getLease(TH.scopeOf('u1'))).to.be.null
      expect(latest().err).to.be.null
    })

    it("hands down no refusal once the user signs out", async () => {
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'ensureVault').mockResolvedValueOnce(TH.bad(unreachable()))
      const { rerender } = world.mount('u1')
      await expectShown('refused: storage_unavailable')
      rerender(world.tree(null))
      await expectShown('no vault')
    })

    it("matches useVault's @example for a refusal: the refusal's message, in place", async () => {
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'ensureVault').mockResolvedValueOnce(TH.bad(unreachable()))
      render(
        <BankProvider {...world.props} user_id="u1">
          <VaultExample />
        </BankProvider>,
      )
      const notice = await screen.findByText(/^Can't open your vault: /)
      expect(notice.tagName).to.eq('P')
      expect(notice.textContent).to.include(unreachable().message)
    })

    it("throws a rejection of null too, as unexpected_error: the failure is held, not the value", async () => {
      hushConsole()
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'ensureVault').mockRejectedValueOnce(null)
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <BankProvider {...world.props} user_id="u1">
            <Probe />
          </BankProvider>
        </CatchingBoundary>,
      )
      await expectShown('boundary')
      expect(caught).to.have.length(1)
      expect(caught[0]).to.have.property('refusalkind', 'unexpected_error')
    })

    it("ignores a rejection that arrives after the user signed out", async () => {
      hushConsole()
      const world = makeWorld()
      let rejectRead: (err: unknown) => void = noop
      const ensureVault = vi.spyOn(world.vaultDB, 'ensureVault').mockReturnValueOnce(new Promise((_resolve, reject) => { rejectRead = reject }))
      const caught: unknown[] = []
      const tree = (user_id: string | null) => (
        <CatchingBoundary caught={caught}>
          <BankProvider {...world.props} user_id={user_id}>
            <Probe />
          </BankProvider>
        </CatchingBoundary>
      )
      const { rerender } = render(tree('u1'))
      await waitFor(() => { expect(ensureVault).toHaveBeenCalledOnce() })
      rerender(tree(null))
      await act(async () => {
        rejectRead(new VaultError('storage_unavailable', 'The vault storage could not be reached.'))
        await TH.wakeupAtNextTick()
      })
      expect(shownState()).to.eq('no vault')
      expect(caught).to.have.length(0)
    })

    it("opens nothing, and so throws nothing, while nobody is signed in", async () => {
      hushConsole()
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <BankProvider {...makeWorld().props} applabel="Not A Label" user_id={null}>
            <Probe />
          </BankProvider>
        </CatchingBoundary>,
      )
      await TH.wakeupAtNextTick()
      expect(shownState()).to.eq('no vault')
      expect(caught).to.have.length(0)
    })
  })
  // --
})
