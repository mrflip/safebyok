import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Vault, VaultError, isVaultError, type BadNewsHandler } from 'safebyok'
import * as TH from 'safebyok/testing'
import { Activity, StrictMode, useLayoutEffect } from 'react'
import { renderToString } from 'react-dom/server'
import { VaultProvider, useOpenError, useVault, useVaultSnapshot } from '../../src/vault-provider'
import { Probe, grabber, makeWorld, madeWorld, damagedWorld, shownState, expectShown, putThroughNewVault, unreachable, CatchingBoundary, hushConsole, LockButton, BoxCount, countStoreCalls } from './world'

describe("VaultProvider", () => {
  // == [Hooks and lifecycle]: useVault, useVaultSnapshot, useOpenError, outside a provider, server render, StrictMode, onBadNews held

  describe("its hooks", () => {
    it("hands down null while signed out, then the vault, whose lock is a bare handler, as useVault's example shows", async () => {
      const world = makeWorld()
      const tree = (userId: string | null) => <VaultProvider {...world.props} userId={userId}><LockButton /><Probe /></VaultProvider>
      const { rerender } = render(tree(null))
      expect(screen.getByText('Sign in')).to.not.be.null
      rerender(tree('u1'))
      await expectShown('absent')
      await putThroughNewVault('a fine passphrase')
      expect(shownState()).to.eq('unlocked')
      fireEvent.click(screen.getByText('Lock'))
      await expectShown('locked')
    })

    it("hands down no snapshot while signed out, then the vault's as it changes, as useVaultSnapshot's example shows", async () => {
      const world = makeWorld()
      const tree = (userId: string | null) => <VaultProvider {...world.props} userId={userId}><BoxCount /><Probe /></VaultProvider>
      const { rerender } = render(tree(null))
      expect(screen.getByText('Opening your vault…')).to.not.be.null
      rerender(tree('u1'))
      expect(await screen.findByText('0 keys stored')).to.not.be.null
      await putThroughNewVault('a fine passphrase')
      expect(await screen.findByText('1 keys stored')).to.not.be.null
    })

    it("hands down a damaged record as openError, the very bad news the vault keeps as its trouble; storage out of reach is openError alone", async () => {
      const damaged = await damagedWorld()
      const told: VaultError[] = []
      const grab = grabber()
      const { unmount } = render(<VaultProvider {...damaged.props} userId="u1" onBadNews={(news) => { told.push(news) }}><grab.Grab /></VaultProvider>)
      await waitFor(() => { expect(grab.latest().openError?.refusalkind).to.eq('damaged_vault') })
      expect(grab.latest().vault?.trouble).to.eq(grab.latest().openError)
      expect(told).to.deep.equal([grab.latest().openError])
      unmount()

      const world = makeWorld()
      const refusal = unreachable()
      vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(TH.bad(refusal))
      const reach = grabber()
      render(<VaultProvider {...world.props} userId="u1"><reach.Grab /></VaultProvider>)
      await waitFor(() => { expect(reach.latest().openError).to.eq(refusal) })
      expect(reach.latest().vault?.trouble).to.be.null
    })

    it("each throws, rendered with no VaultProvider above it, saying what it needs", () => {
      hushConsole()
      const hooks = [['useVault', useVault], ['useVaultSnapshot', useVaultSnapshot], ['useOpenError', useOpenError]] as const
      for (const [hookname, useHook] of hooks) {
        const Lone = () => {
          useHook()
          return null
        }
        expect(() => render(<Lone />)).to.throw(`${hookname} needs a <VaultProvider> above it.`)
      }
    })

    it("renders on the server with no vault and no snapshot, as the client's first render has", () => {
      const html = renderToString(<VaultProvider {...makeWorld().props} userId="u1"><BoxCount /><LockButton /></VaultProvider>)
      expect(html).to.contain('Opening your vault…').and.contain('Sign in')
    })
  })

  describe("under StrictMode", () => {
    it("reads storage once: the vault its rehearsal makes and closes reads nothing, and only the vault kept says hello (Contract: getProof, in React)", async () => {
      const world = makeWorld()
      const counts = countStoreCalls(world)
      const { Grab, opened } = grabber()
      render(<StrictMode><VaultProvider {...world.props} userId="u1"><Grab /></VaultProvider></StrictMode>)
      const vault = await opened()
      await waitFor(() => { expect(vault.getSnapshot().state).to.eq('absent') })
      await TH.wakeupAtNextTick()
      expect(counts()).to.deep.equal({ subscribe: 1, getVaultProps: 1, getMark: 1 })
    })

    it("asks for the passphrase and runs the action again, as it does without", async () => {
      const world = makeWorld()
      render(<StrictMode>{world.tree('u1')}</StrictMode>)
      await expectShown('absent')
      await putThroughNewVault('a fine passphrase')
      expect(shownState()).to.eq('unlocked')
    })

    it("closes the vault as the user signs out, and makes the next user's, reading once for each", async () => {
      const world = makeWorld()
      const counts = countStoreCalls(world)
      const { Grab, opened, latest } = grabber()
      const tree = (userId: string | null) => <StrictMode><VaultProvider {...world.props} userId={userId}><Grab /></VaultProvider></StrictMode>
      const { rerender } = render(tree('u1'))
      const first = await opened()
      await waitFor(() => { expect(first.getSnapshot().state).to.eq('absent') })
      rerender(tree(null))
      expect(latest().vault).to.be.null
      await TH.expectRefusal(first.hello(), 'vault_closed')
      rerender(tree('u2'))
      const second = await opened()
      await waitFor(() => { expect(second.getSnapshot().state).to.eq('absent') })
      expect(second.user_id).to.eq('u2')
      expect(counts()).to.deep.equal({ subscribe: 2, getVaultProps: 2, getMark: 2 })
    })

    it("makes a fresh vault when a hidden <Activity> shows again, never using the one it closed", async () => {
      const world = makeWorld()
      const { Grab, opened, latest } = grabber()
      const tree = (mode: 'visible' | 'hidden') => <StrictMode><Activity mode={mode}><VaultProvider {...world.props} userId="u1"><Grab /></VaultProvider></Activity></StrictMode>
      const { rerender } = render(tree('visible'))
      const first = await opened()
      await waitFor(() => { expect(first.getSnapshot().state).to.eq('absent') })
      rerender(tree('hidden'))
      await TH.expectRefusal(first.hello(), 'vault_closed')
      rerender(tree('visible'))
      await waitFor(() => { expect(latest().vault).to.not.be.null.and.not.eq(first) })
      const second = latest().vault
      await waitFor(() => { expect(second?.getSnapshot().state).to.eq('absent') })
    })
  })

  describe("onBadNews, held", () => {
    it("keeps its vault as an onBadNews written inline comes and changes, telling the one the last render passed, as the second example shows", async () => {
      const world = await madeWorld()
      const spy = TH.spyLogger()
      const told: string[] = []
      const { Grab, opened, latest } = grabber()
      const tree = (teller: string | null) => (
        <VaultProvider {...world.props} logger={spy.logger} userId="u1" onBadNews={teller === null ? undefined : (news) => { told.push(`${teller}: ${news.refusalkind}`) }}>
          <Grab />
        </VaultProvider>
      )
      const { rerender } = render(tree(null))
      const vault = await opened()
      await waitFor(() => { expect(vault.getSnapshot().state).to.not.eq('opening') })
      rerender(tree('first'))
      rerender(tree('second'))
      expect(latest().vault).to.eq(vault)
      world.spoil()
      await act(async () => { await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'damaged_vault') })
      // The ring from the spoiling write and the hello each meet it: both told to the latest handler.
      expect([...new Set(told)]).to.deep.equal(['second: damaged_vault'])
      expect(spy.calls.filter((heard) => heard.story?.['call'] === 'VaultProvider')).to.deep.equal([])
    })

    it("tells the next user's handler nothing a closed vault meets", async () => {
      const world = await madeWorld()
      const told: string[] = []
      const { Grab, opened } = grabber()
      const tree = (userId: string) => (
        <VaultProvider {...world.props} userId={userId} onBadNews={(news) => { told.push(`${userId}: ${news.refusalkind}`) }}>
          <Grab />
        </VaultProvider>
      )
      const { rerender } = render(tree('u1'))
      const first = await opened()
      await waitFor(() => { expect(first.getSnapshot().state).to.not.eq('opening') })
      // A read under way on u1's vault as u2 signs in meets u1's damaged record after the switch.
      world.spoil()
      const hello = first.tryHello({ staleMinutes: 0 })
      rerender(tree('u2'))
      const { ok } = await hello
      expect(ok).to.be.false
      const second = await opened()
      expect(second.user_id).to.eq('u2')
      await waitFor(() => { expect(second.getSnapshot().state).to.eq('absent') })
      await TH.wakeupAtNextTick()
      expect(told).to.deep.equal([])
    })

    it("tells the next user's handler nothing the last user's vault meets in the commit that brings the next user, before its passive effects", async () => {
      const world = await madeWorld()
      const told: string[] = []
      const made = vi.spyOn(Vault, 'make')
      const { Grab, opened } = grabber()
      const news = new VaultError('damaged_box', "A box in the vault is damaged: it can't be read.")
      // Rendered after the provider, so its layout effect runs after the provider's in the same
      // commit: it tells news through the handler u1's vault was handed, as a read landing then would.
      const LateNews = ({ userId }: { userId: string }) => {
        useLayoutEffect(() => {
          if (userId === 'u2') { void made.mock.calls[0]?.[0].onBadNews?.(news) }
        }, [userId])
        return null
      }
      const tree = (userId: string) => (
        <>
          <VaultProvider {...world.props} userId={userId} onBadNews={(heard) => { told.push(`${userId}: ${heard.refusalkind}`) }}>
            <Grab />
          </VaultProvider>
          <LateNews userId={userId} />
        </>
      )
      const { rerender } = render(tree('u1'))
      await opened()
      rerender(tree('u2'))
      await TH.wakeupAtNextTick()
      expect(told.filter((line) => line.startsWith('u2'))).to.deep.equal([])
    })

    it("throws an onBadNews that is no function to the error boundary, as Vault.make refuses it", async () => {
      hushConsole()
      const world = makeWorld()
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider {...world.props} userId="u1" onBadNews={'loudly' as unknown as BadNewsHandler}><Probe /></VaultProvider>
        </CatchingBoundary>,
      )
      await expectShown('boundary')
      expect(isVaultError(caught[0], 'bad_option')).to.be.true
      expect((caught[0] as VaultError).message).to.match(/onBadNews is a function/)
    })
  })
  // --
})
