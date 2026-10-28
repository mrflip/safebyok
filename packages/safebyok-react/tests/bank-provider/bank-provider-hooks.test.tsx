import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bank, VaultError, isVaultError, type BadNewsHandler } from 'safebyok'
import * as TH from 'safebyok/testing'
import { Activity, StrictMode, useLayoutEffect } from 'react'
import { renderToString } from 'react-dom/server'
import { BankProvider, useBank, useListedVault, useVault, useVaultSnapshot } from '../../src/bank-provider'
import { Probe, grabber, makeWorld, madeWorld, damagedWorld, shownState, expectShown, putThroughNewVault, unreachable, CatchingBoundary, hushConsole, VaultExample, BankVaultExample, BoxCount, countStoreCalls } from './world'

/** Whether the provider above holds a bank. */
const BankShown = () => <span>{useBank() === null ? 'no bank' : 'a bank'}</span>

describe("BankProvider", () => {
  // == [Hooks and lifecycle]: useBank, useVault, useVaultSnapshot, outside a provider, server render, StrictMode, onBadNews held

  describe("its hooks", () => {
    it("hands down no Vault object while signed out, then the vault's, whose lock is a bare handler, as useVault's example shows", async () => {
      const world = makeWorld()
      const tree = (user_id: string | null) => <BankProvider {...world.props} user_id={user_id}><VaultExample /><Probe /></BankProvider>
      const { rerender } = render(tree(null))
      expect(screen.getByText('Opening your vault…')).to.not.be.null
      rerender(tree('u1'))
      await expectShown('novel')
      await putThroughNewVault('a fine passphrase')
      expect(shownState()).to.eq('unlocked')
      fireEvent.click(screen.getByText('Lock'))
      await expectShown('locked')
    })

    it("hands down the vault as the bank lists it, none while signed out, then ready, as useListedVault's example shows", async () => {
      const world = makeWorld()
      const tree = (user_id: string | null) => <BankProvider {...world.props} user_id={user_id}><BankVaultExample /></BankProvider>
      const { rerender } = render(tree(null))
      expect(screen.getByText('Opening your vault…')).to.not.be.null
      rerender(tree('u1'))
      expect(await screen.findByText('Your vault is open.')).to.not.be.null
    })

    it("hands down no snapshot while signed out, then the vault's as it changes, as useVaultSnapshot's example shows", async () => {
      const world = makeWorld()
      const tree = (user_id: string | null) => <BankProvider {...world.props} user_id={user_id}><BoxCount /><Probe /></BankProvider>
      const { rerender } = render(tree(null))
      expect(screen.getByText('Opening your vault…')).to.not.be.null
      rerender(tree('u1'))
      expect(await screen.findByText('0 keys stored')).to.not.be.null
      await putThroughNewVault('a fine passphrase')
      expect(await screen.findByText('1 keys stored')).to.not.be.null
    })

    it("hands down a damaged record as the listed vault's refusal, the very bad news told to onBadNews, and no vault; storage out of reach likewise", async () => {
      const damaged = await damagedWorld()
      const told: VaultError[] = []
      const grab = grabber()
      const { unmount } = render(<BankProvider {...damaged.props} user_id="u1" onBadNews={(news) => { told.push(news) }}><grab.Grab /></BankProvider>)
      await waitFor(() => { expect(grab.latest().err?.refusalkind).to.eq('damaged_vault') })
      expect(grab.latest().bankVault?.lifecycle).to.eq('refused')
      expect(grab.latest().vault).to.be.null
      expect(told).to.deep.equal([grab.latest().err])
      unmount()

      const world = makeWorld()
      const refusal = unreachable()
      vi.spyOn(world.vaultDB, 'tryEnsureVault').mockResolvedValueOnce(TH.bad(refusal))
      const reach = grabber()
      render(<BankProvider {...world.props} user_id="u1"><reach.Grab /></BankProvider>)
      await waitFor(() => { expect(reach.latest().err).to.eq(refusal) })
      expect(reach.latest().vault).to.be.null
    })

    it("hands down the bank it holds, the one that births the vault, for the host to ask again: useBank's example, past 'vault_behind'", async () => {
      const world = makeWorld()
      const grab = grabber()
      render(<BankProvider {...world.props} user_id="u1"><grab.Grab /></BankProvider>)
      const vault = await grab.opened()
      const { bank } = grab.latest()
      if (bank === null) { throw new Error('the provider held no bank') }
      expect(bank).to.be.an.instanceOf(Bank)
      expect(bank.vaultOf({ vaultlabel: 'main' })).to.eq(vault)
      // The device has seen a later epoch than storage serves: a restore from an older copy.
      const scope = TH.scopeOf('u1')
      const record = await TH.expectGood(world.deviceDB.tryGetDeviceRecord(scope))
      if (record === null) { throw new Error('the birth kept no device record') }
      await TH.expectGood(world.deviceDB.tryRaiseDeviceRecord({ ...record, highest_vault_epoch: 9 }))
      await act(async () => { await TH.expectRefusal(bank.reopenVault(vault), 'vault_behind') })
      await waitFor(() => { expect(grab.latest().err?.refusalkind).to.eq('vault_behind') })
      // useBank's example: the host, on the user's say, has this device accept what storage holds.
      const acceptRestore = async () => {
        await bank.clearCachedVault({ vaultlabel: 'main' })
        await bank.ensureVault({ vaultlabel: 'main' })
      }
      await act(acceptRestore)
      await waitFor(() => { expect(grab.latest().vault).to.not.be.null.and.not.eq(vault) })
      expect(grab.latest().err).to.be.null
    })

    it("each throws, rendered with no BankProvider above it, saying what it needs", () => {
      hushConsole()
      const hooks = [['useBank', () => useBank()], ['useListedVault', () => useListedVault('main')], ['useVault', () => useVault('main')], ['useVaultSnapshot', () => useVaultSnapshot('main')]] as const
      for (const [hookname, useHook] of hooks) {
        const Lone = () => {
          useHook()
          return null
        }
        expect(() => render(<Lone />)).to.throw(`${hookname} needs a <BankProvider> above it.`)
      }
    })

    it("renders on the server with no bank, no listed vault, no Vault object and no snapshot, as the client's first render has", () => {
      const html = renderToString(<BankProvider {...makeWorld().props} user_id="u1"><BoxCount /><VaultExample /><BankVaultExample /><BankShown /></BankProvider>)
      expect(html).to.contain('no bank')
      expect(html.match(/Opening your vault…/g)).to.have.lengthOf(3)
    })
  })

  describe("under StrictMode", () => {
    it("reads storage once: the bank its rehearsal makes and lets go reads nothing, and only the vault kept is born (Contract: requestCleartext, in React)", async () => {
      const world = makeWorld()
      const counts = countStoreCalls(world)
      const { Grab, opened } = grabber()
      render(<StrictMode><BankProvider {...world.props} user_id="u1"><Grab /></BankProvider></StrictMode>)
      const vault = await opened()
      await waitFor(() => { expect(TH.stateOf(vault.getSnapshot())).to.eq('novel') })
      await TH.wakeupAtNextTick()
      expect(counts()).to.deep.equal({ subscribe: 1, ensureVault: 1, getDeviceRecord: 1 })
    })

    it("asks for the passphrase and runs the action again, as it does without", async () => {
      const world = makeWorld()
      render(<StrictMode>{world.tree('u1')}</StrictMode>)
      await expectShown('novel')
      await putThroughNewVault('a fine passphrase')
      expect(shownState()).to.eq('unlocked')
    })

    it("makes a bank per user: drops the user's bank and closes its vault as they sign out, and makes the next user's, reading once for each", async () => {
      const world = makeWorld()
      const counts = countStoreCalls(world)
      const { Grab, opened, latest } = grabber()
      const tree = (user_id: string | null) => <StrictMode><BankProvider {...world.props} user_id={user_id}><Grab /></BankProvider></StrictMode>
      const { rerender } = render(tree('u1'))
      const first = await opened()
      const firstBank = latest().bank
      expect(firstBank?.user_id).to.eq('u1')
      await waitFor(() => { expect(TH.stateOf(first.getSnapshot())).to.eq('novel') })
      rerender(tree(null))
      expect(latest().vault).to.be.null
      expect(latest().bank).to.be.null
      await TH.expectRefusal(first.hello(), 'vault_gone')
      rerender(tree('u2'))
      const second = await opened()
      await waitFor(() => { expect(TH.stateOf(second.getSnapshot())).to.eq('novel') })
      expect(second.user_id).to.eq('u2')
      expect(latest().bank).to.not.eq(firstBank)
      expect(latest().bank?.user_id).to.eq('u2')
      expect(counts()).to.deep.equal({ subscribe: 2, ensureVault: 2, getDeviceRecord: 2 })
    })

    it("hands down no bank of the last user in any render once the user_id changes or goes, even before its effects run", async () => {
      const world = makeWorld()
      const seen: { signedIn: string | null, bankUser: string | null }[] = []
      const Witness = ({ signedIn }: { signedIn: string | null }) => {
        seen.push({ signedIn, bankUser: useBank()?.user_id ?? null })
        return null
      }
      const tree = (user_id: string | null) => <BankProvider {...world.props} user_id={user_id}><Witness signedIn={user_id} /></BankProvider>
      const { rerender } = render(tree('u1'))
      await waitFor(() => { expect(seen.at(-1)?.bankUser).to.eq('u1') })
      rerender(tree('u2'))
      await waitFor(() => { expect(seen.at(-1)?.bankUser).to.eq('u2') })
      rerender(tree(null))
      expect(seen.at(-1)?.bankUser).to.be.null
      expect(seen.filter((sight) => sight.bankUser !== null && sight.bankUser !== sight.signedIn)).to.deep.equal([])
    })

    it("makes a fresh vault when a hidden <Activity> shows again, never using the one it closed", async () => {
      const world = makeWorld()
      const { Grab, opened, latest } = grabber()
      const tree = (mode: 'visible' | 'hidden') => <StrictMode><Activity mode={mode}><BankProvider {...world.props} user_id="u1"><Grab /></BankProvider></Activity></StrictMode>
      const { rerender } = render(tree('visible'))
      const first = await opened()
      await waitFor(() => { expect(TH.stateOf(first.getSnapshot())).to.eq('novel') })
      rerender(tree('hidden'))
      await TH.expectRefusal(first.hello(), 'vault_gone')
      rerender(tree('visible'))
      await waitFor(() => { expect(latest().vault).to.not.be.null.and.not.eq(first) })
      const second = latest().vault
      await waitFor(() => { expect(second && TH.stateOf(second.getSnapshot())).to.eq('novel') })
    })
  })

  describe("onBadNews, held", () => {
    it("keeps its vault as an onBadNews written inline comes and changes, telling the one the last render passed, as the second example shows", async () => {
      const world = await madeWorld()
      const spy = TH.spyLogger()
      const told: string[] = []
      const { Grab, opened, latest } = grabber()
      const tree = (teller: string | null) => (
        <BankProvider {...world.props} logger={spy.logger} user_id="u1" onBadNews={teller === null ? undefined : (news) => { told.push(`${teller}: ${news.refusalkind}`) }}>
          <Grab />
        </BankProvider>
      )
      const { rerender } = render(tree(null))
      const vault = await opened()
      expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
      rerender(tree('first'))
      rerender(tree('second'))
      expect(latest().vault).to.eq(vault)
      world.spoil()
      await act(async () => { await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'damaged_vault') })
      // The ring from the spoiling write and the hello each meet it: both told to the latest handler.
      expect([...new Set(told)]).to.deep.equal(['second: damaged_vault'])
      expect(spy.calls.filter((heard) => heard.story?.['call'] === 'BankProvider')).to.deep.equal([])
    })

    it("tells the next user's handler nothing a vault let go meets", async () => {
      const world = await madeWorld()
      const told: string[] = []
      const { Grab, opened } = grabber()
      const tree = (user_id: string) => (
        <BankProvider {...world.props} user_id={user_id} onBadNews={(news) => { told.push(`${user_id}: ${news.refusalkind}`) }}>
          <Grab />
        </BankProvider>
      )
      const { rerender } = render(tree('u1'))
      const first = await opened()
      expect(TH.stateOf(first.getSnapshot())).to.eq('unlocked')
      // A read under way on u1's vault as u2 signs in meets u1's damaged record after the switch.
      world.spoil()
      const hello = first.tryHello({ staleMinutes: 0 })
      rerender(tree('u2'))
      const { ok } = await hello
      expect(ok).to.be.false
      const second = await opened()
      expect(second.user_id).to.eq('u2')
      await waitFor(() => { expect(TH.stateOf(second.getSnapshot())).to.eq('novel') })
      await TH.wakeupAtNextTick()
      expect(told).to.deep.equal([])
    })

    it("tells the next user's handler nothing the last user's vault meets in the commit that brings the next user, before its passive effects", async () => {
      const world = await madeWorld()
      const told: string[] = []
      const made = vi.spyOn(Bank, 'make')
      const { Grab, opened } = grabber()
      const news = new VaultError('damaged_box', "A box in the vault is damaged: it can't be read.")
      // Rendered after the provider, so its layout effect runs after the provider's in the same
      // commit: it tells news through the handler u1's bank was handed, as a read landing then would.
      const LateNews = ({ user_id }: { user_id: string }) => {
        useLayoutEffect(() => {
          if (user_id === 'u2') { void made.mock.calls[0]?.[0].onBadNews?.(news) }
        }, [user_id])
        return null
      }
      const tree = (user_id: string) => (
        <>
          <BankProvider {...world.props} user_id={user_id} onBadNews={(heard) => { told.push(`${user_id}: ${heard.refusalkind}`) }}>
            <Grab />
          </BankProvider>
          <LateNews user_id={user_id} />
        </>
      )
      const { rerender } = render(tree('u1'))
      await opened()
      rerender(tree('u2'))
      await TH.wakeupAtNextTick()
      expect(told.filter((line) => line.startsWith('u2'))).to.deep.equal([])
    })

    it("throws an onBadNews that is no function to the error boundary, as Bank.make refuses it", async () => {
      hushConsole()
      const world = makeWorld()
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <BankProvider {...world.props} user_id="u1" onBadNews={'loudly' as unknown as BadNewsHandler}><Probe /></BankProvider>
        </CatchingBoundary>,
      )
      await expectShown('boundary')
      expect(isVaultError(caught[0], 'bad_option')).to.be.true
      expect((caught[0] as VaultError).message).to.match(/^In Bank.make's options: onBadNews: Expected a function/)
    })
  })
  // --
})
