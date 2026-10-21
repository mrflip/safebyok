import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AnyTextValidators, Ckeys, VaultError, isVaultError, memoryDeviceDB, type VaultValidators } from 'safebyok'
import * as TH from 'safebyok/testing'
import { VaultProvider, type VaultProviderProps } from '../../src/vault-provider'
import { Probe, grabber, makeWorld, madeWorld, damagedWorld, shownState, expectShown, unreachable, CatchingBoundary, OpenErrorExample, hushConsole, noop } from './world'

describe("VaultProvider", () => {
  // == [Refusals on open]: when Vault.make or hello refuses, delDamagedVault

  describe("when Vault.make or hello refuses", () => {
    it("throws a bad label to the error boundary, as the very VaultError", async () => {
      hushConsole()
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider {...makeWorld().props} applabel="Not A Label" userId="u1">
            <Probe />
          </VaultProvider>
        </CatchingBoundary>,
      )
      await expectShown('boundary')
      expect(caught).to.have.length(1)
      expect(isVaultError(caught[0], 'bad_label')).to.be.true
    })

    it("throws a validators bag with a misspelt field to the error boundary, rather than keep the default check unseen", async () => {
      hushConsole()
      const caught: unknown[] = []
      const misspelt = { boxLabel: AnyTextValidators.boxlabel } as unknown as VaultValidators
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider {...makeWorld().props} userId={null} validators={misspelt}>
            <Probe />
          </VaultProvider>
        </CatchingBoundary>,
      )
      await expectShown('boundary')
      expect(isVaultError(caught[0], 'bad_option')).to.be.true
      expect((caught[0] as Error).message).to.include('spelling')
    })

    it("throws a strengthChecker that is no function to the error boundary at render, as Vault.make would refuse it", () => {
      hushConsole()
      const caught: unknown[] = []
      const misfit = { strong: true } as unknown as VaultProviderProps['strengthChecker']
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider {...makeWorld().props} userId="u1" strengthChecker={misfit}>
            <Probe />
          </VaultProvider>
        </CatchingBoundary>,
      )
      expect(shownState()).to.eq('boundary')
      expect(isVaultError(caught[0], 'bad_option')).to.be.true
      expect((caught[0] as Error).message).to.include('strengthChecker')
    })

    it("throws a hello whose strengthChecker's load fails to the error boundary, as unexpected_error, what the load threw its cause", async () => {
      hushConsole()
      const caught: unknown[] = []
      const lost = new Error('the word list did not load')
      const checker = Object.assign(TH.anyStrengthChecker.bind(null), { load: () => Promise.reject(lost) })
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider {...makeWorld().props} userId="u1" strengthChecker={checker}>
            <Probe />
          </VaultProvider>
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
          <VaultProvider {...makeWorld().props} userId="u1" maxBoxes={0}>
            <Probe />
          </VaultProvider>
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
      vi.spyOn(world.vaultDB, 'getVaultProps').mockRejectedValueOnce(stray)
      const caught: unknown[] = []
      world.mount('u1', caught)
      await expectShown('boundary')
      expect(caught[0]).to.include({ refusalkind: 'unexpected_error', cause: stray })
    })

    const ConditionCases = [
      ["storage_unavailable", 'storage that cannot be reached'],
      ["identity_revoked",    'a user storage no longer serves, as when signed out of the backend'],
      ["not_permitted",       'a call storage refuses the signed-in user'],
      ["damaged_vault",       'a vault whose stored props fail their checks'],
    ] as const

    for (const [kind, blurb] of ConditionCases) {
      it(`hands down ${blurb} as openError, in place, leaving the boundary alone`, async () => {
        const world = makeWorld()
        const condition = new VaultError(kind, 'Something the app can tell the user about.')
        vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(TH.bad(condition))
        const caught: unknown[] = []
        world.mount('u1', caught)
        await expectShown(`open error: ${kind}`)
        expect(caught).to.have.length(0)
      })
    }

    it("hands down the very VaultError its hello was refused with, beside the handle still opening", async () => {
      const world = makeWorld()
      const refusal = unreachable()
      vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(TH.bad(refusal))
      const { Grab, latest } = grabber()
      render(
        <VaultProvider {...world.props} userId="u1">
          <Grab />
        </VaultProvider>,
      )
      await waitFor(() => { expect(latest().openError).to.eq(refusal) })
      expect(latest().vault?.getSnapshot()).to.deep.include({ state: 'opening', trouble: null })
    })

    it("hands down the vault at once, still opening, while its hello reads storage, and no openError", async () => {
      const world = makeWorld()
      const gate = TH.holdNextCall(world.vaultDB, 'getVaultProps')
      const { Grab, latest, opened } = grabber()
      render(<VaultProvider {...world.props} userId="u1"><Grab /></VaultProvider>)
      const vault = await opened()
      await gate.reached
      expect(vault.getSnapshot().state).to.eq('opening')
      expect(latest().openError).to.be.null
      gate.release()
      await waitFor(() => { expect(vault.getSnapshot().state).to.eq('absent') })
    })

    it("throws a hello refused as misuse to the error boundary, as the very VaultError", async () => {
      hushConsole()
      const world = makeWorld()
      const misuse = new VaultError('bad_option', 'Something the developer must fix.')
      vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(TH.bad(misuse))
      const caught: unknown[] = []
      world.mount('u1', caught)
      await expectShown('boundary')
      expect(caught[0]).to.eq(misuse)
    })

    it("throws a hello refused as bad_record to the error boundary too, as misuse like bad_option", async () => {
      hushConsole()
      const world = makeWorld()
      const misuse = new VaultError('bad_record', 'A record the developer built wrongly.')
      vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(TH.bad(misuse))
      const caught: unknown[] = []
      world.mount('u1', caught)
      await expectShown('boundary')
      expect(caught[0]).to.eq(misuse)
    })

    it("throws a prop Vault.make does not take to the error boundary, naming it and its new name, rather than drop it unseen", async () => {
      hushConsole()
      const caught: unknown[] = []
      const deleted = { forcePassphraseReentryHours: 1 } as Partial<VaultProviderProps>
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider {...makeWorld().props} userId="u1" {...deleted}>
            <Probe />
          </VaultProvider>
        </CatchingBoundary>,
      )
      await expectShown('boundary')
      expect(isVaultError(caught[0], 'bad_option')).to.be.true
      expect((caught[0] as Error).message).to.include('forcePassphraseReentryHours (called leaseHours now)')
    })

    it("retryOpen opens again: once storage relents, the vault opens and openError clears", async () => {
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(TH.bad(unreachable()))
      world.mount('u1')
      await expectShown('open error: storage_unavailable')
      fireEvent.click(screen.getByText('Retry'))
      await expectShown('absent')
    })

    it("clears openError once a ring from storage settles the vault, with no retry", async () => {
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(TH.bad(unreachable()))
      world.mount('u1')
      await expectShown('open error: storage_unavailable')
      const elsewhere = await TH.settledVault({ ...world.props, userId: 'u1', deviceDB: memoryDeviceDB() })
      await elsewhere.unlock('correct horse battery staple')
      await expectShown('locked')
    })

    it("hands down a rolled_back that a later read met as openError, the vault sent back to opening, rather than sit at opening with none", async () => {
      const world = await madeWorld()
      const vaultPropsCkey = Ckeys.vaultProps(TH.scopeOf('u1'))
      const older = world.store.read(vaultPropsCkey) ?? ''
      // This device changes the passphrase, so its mark of the vault is newer than `older`.
      const changer = await TH.settledVault({ ...world.props, userId: 'u1' })
      await changer.putWayin('correct horse', 'another horse')
      changer.close()
      const { Grab, latest } = grabber()
      render(<VaultProvider {...world.props} userId="u1"><Grab /><Probe /></VaultProvider>)
      await expectShown('locked')
      // Storage hands back the older copy; the vault's watch reads it, refuses it, and opens again.
      world.store.write(vaultPropsCkey, older)
      await expectShown('open error: rolled_back')
      expect(latest().openError).to.eq(latest().vault?.trouble)
      expect(latest().vault?.state).to.eq('opening')
    })

    it("a retry that fails again hands down the fresh error", async () => {
      const world = makeWorld()
      const first = unreachable()
      const second = new VaultError('not_permitted', 'Sign in to reach this vault.')
      vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(TH.bad(first)).mockResolvedValueOnce(TH.bad(second))
      world.mount('u1')
      await expectShown('open error: storage_unavailable')
      fireEvent.click(screen.getByText('Retry'))
      await expectShown('open error: not_permitted')
    })

    it("retries on the same handle, its one storage watch kept throughout", async () => {
      const world = makeWorld()
      const tally = TH.tallyWatches(world.vaultDB)
      const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
      reads.mockResolvedValueOnce(TH.bad(unreachable())).mockResolvedValueOnce(TH.bad(unreachable()))
      world.mount('u1')
      await expectShown('open error: storage_unavailable')
      fireEvent.click(screen.getByText('Retry'))
      await waitFor(() => { expect(reads).toHaveBeenCalledTimes(2) })
      await expectShown('open error: storage_unavailable')
      fireEvent.click(screen.getByText('Retry'))
      await expectShown('absent')
      expect(tally).to.deep.equal({ opened: 1, closed: 0 })
    })

    it("retryOpen does nothing while there is no openError", async () => {
      const world = makeWorld()
      const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
      const { Grab, latest } = grabber()
      render(
        <VaultProvider {...world.props} userId="u1">
          <Grab />
          <Probe />
        </VaultProvider>,
      )
      await expectShown('absent')
      const readsBefore = reads.mock.calls.length
      await act(async () => {
        latest().retryOpen()
        await TH.wakeupAtNextTick()
      })
      expect(reads.mock.calls.length).to.eq(readsBefore)
      expect(shownState()).to.eq('absent')
    })

    describe("delDamagedVault", () => {
      it("deletes the vault openError says is damaged, with this device's lease, and opens a fresh one", async () => {
        const { store, deviceDB, props } = await damagedWorld()
        const { Grab, latest } = grabber()
        render(<VaultProvider {...props} userId="u1"><Grab /><Probe /></VaultProvider>)
        await expectShown('open error: damaged_vault')
        expect(await TH.expectingGood(deviceDB).getLease(TH.scopeOf('u1'))).to.not.be.null
        await act(async () => { await latest().delDamagedVault() })
        await expectShown('absent')
        expect(store.ckeys()).to.deep.equal([])
        expect(await TH.expectingGood(deviceDB).getLease(TH.scopeOf('u1'))).to.be.null
        expect(latest().openError).to.be.null
      })

      it("does nothing for an openError that is not damaged_vault", async () => {
        const world = makeWorld()
        const deleting = vi.spyOn(world.vaultDB, 'delDamagedVault')
        vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(TH.bad(unreachable()))
        const { Grab, latest } = grabber()
        render(<VaultProvider {...world.props} userId="u1"><Grab /><Probe /></VaultProvider>)
        await expectShown('open error: storage_unavailable')
        await act(async () => { await latest().delDamagedVault() })
        expect(deleting).not.toHaveBeenCalled()
        expect(shownState()).to.eq('open error: storage_unavailable')
      })

      it("does nothing while the vault is open, however sound", async () => {
        const world = makeWorld()
        const deleting = vi.spyOn(world.vaultDB, 'delDamagedVault')
        const { Grab, latest } = grabber()
        render(<VaultProvider {...world.props} userId="u1"><Grab /><Probe /></VaultProvider>)
        await expectShown('absent')
        await act(async () => { await latest().delDamagedVault() })
        expect(deleting).not.toHaveBeenCalled()
        expect(shownState()).to.eq('absent')
      })

      it("opens again, and still rejects, when deleting finds the vault made anew", async () => {
        const { vaultDB, props } = await damagedWorld()
        vi.spyOn(vaultDB, 'delDamagedVault').mockResolvedValueOnce(TH.bad(new VaultError('stale_write', 'Storage changed.')))
        // The vault is made anew behind the provider's back: the reopen finds it sound.
        const reads = vi.spyOn(vaultDB, 'getVaultProps')
        const { Grab, latest } = grabber()
        render(<VaultProvider {...props} userId="u1"><Grab /><Probe /></VaultProvider>)
        await expectShown('open error: damaged_vault')
        reads.mockResolvedValueOnce(TH.good(null))
        await act(async () => {
          await expect(latest().delDamagedVault()).rejects.toMatchObject({ refusalkind: 'stale_write' })
        })
        await expectShown('absent')
      })

      it("rejects misuse (bad_option) without opening again, leaving openError for retryOpen", async () => {
        const { vaultDB, props } = await damagedWorld()
        const misuse = new VaultError('bad_option', 'That vault reads sound.')
        vi.spyOn(vaultDB, 'delDamagedVault').mockResolvedValueOnce(TH.bad(misuse))
        const reads = vi.spyOn(vaultDB, 'getVaultProps')
        const { Grab, latest } = grabber()
        render(<VaultProvider {...props} userId="u1"><Grab /><Probe /></VaultProvider>)
        await expectShown('open error: damaged_vault')
        const readsBefore = reads.mock.calls.length
        await act(async () => {
          await expect(latest().delDamagedVault()).rejects.toMatchObject({ refusalkind: 'bad_option' })
        })
        await TH.wakeupAtNextTick()
        expect(reads.mock.calls.length).to.eq(readsBefore)
        expect(shownState()).to.eq('open error: damaged_vault')
      })

      it("rejects with storage's refusal, leaving the damaged openError in place", async () => {
        const { vaultDB, props } = await damagedWorld()
        vi.spyOn(vaultDB, 'delDamagedVault').mockResolvedValueOnce(TH.bad(unreachable()))
        const { Grab, latest } = grabber()
        render(<VaultProvider {...props} userId="u1"><Grab /><Probe /></VaultProvider>)
        await expectShown('open error: damaged_vault')
        await act(async () => {
          await expect(latest().delDamagedVault()).rejects.toMatchObject({ refusalkind: 'storage_unavailable' })
        })
        expect(shownState()).to.eq('open error: damaged_vault')
        await act(async () => { await latest().delDamagedVault() })
        await expectShown('absent')
      })
    })

    it("clears openError when the user signs out", async () => {
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(TH.bad(unreachable()))
      const { rerender } = world.mount('u1')
      await expectShown('open error: storage_unavailable')
      rerender(world.tree(null))
      expect(shownState()).to.eq('no vault')
    })

    it("matches openError's @example, and useOpenError's: the message and its Retry button, in place", async () => {
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(TH.bad(unreachable()))
      render(
        <VaultProvider {...world.props} userId="u1">
          <OpenErrorExample />
        </VaultProvider>,
      )
      const notice = await screen.findByText("Can't reach your vault.")
      expect(notice.tagName).to.eq('P')
      fireEvent.click(screen.getByText('Retry'))
      const opened = await screen.findByText('opened')
      expect(opened.tagName).to.eq('SPAN')
    })

    it("matches openError's @example for a browser that withholds storage: it says why, and offers no Retry", async () => {
      const world = makeWorld()
      vi.spyOn(world.props.deviceDB, 'getMark').mockRejectedValue(new DOMException('The operation is insecure.', 'SecurityError'))
      render(
        <VaultProvider {...world.props} userId="u1">
          <OpenErrorExample />
        </VaultProvider>,
      )
      await screen.findByText("This browser won't let the app keep your vault on this device.")
      expect(screen.queryByText('Retry')).to.be.null
    })

    it("matches openError's @example for a damaged record: no Retry, which cannot mend it", async () => {
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValue(TH.bad(new VaultError('damaged_vault', "This vault's stored props failed their checks.")))
      render(
        <VaultProvider {...world.props} userId="u1">
          <OpenErrorExample />
        </VaultProvider>,
      )
      await screen.findByText("Your vault's stored record is damaged.")
      expect(screen.queryByText('Retry')).to.be.null
    })

    it("throws a rejection of null too, as unexpected_error: the failure is held, not the value", async () => {
      hushConsole()
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'getVaultProps').mockRejectedValueOnce(null)
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider {...world.props} userId="u1">
            <Probe />
          </VaultProvider>
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
      const getVaultProps = vi.spyOn(world.vaultDB, 'getVaultProps').mockReturnValueOnce(new Promise((_resolve, reject) => { rejectRead = reject }))
      const caught: unknown[] = []
      const tree = (userId: string | null) => (
        <CatchingBoundary caught={caught}>
          <VaultProvider {...world.props} userId={userId}>
            <Probe />
          </VaultProvider>
        </CatchingBoundary>
      )
      const { rerender } = render(tree('u1'))
      await waitFor(() => { expect(getVaultProps).toHaveBeenCalledOnce() })
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
          <VaultProvider {...makeWorld().props} applabel="Not A Label" userId={null}>
            <Probe />
          </VaultProvider>
        </CatchingBoundary>,
      )
      await TH.wakeupAtNextTick()
      expect(shownState()).to.eq('no vault')
      expect(caught).to.have.length(0)
    })
  })
  // --
})
