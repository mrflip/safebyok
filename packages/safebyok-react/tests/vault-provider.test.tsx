import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { AnyTextValidators, Ckeys, Label, VaultError, isVaultError, localVaultDB, memoryDeviceDB, memoryStore, type KeyDeriver, type PassphraseVerdict, type Vault, type VaultScope, type VaultValidators } from 'safebyok'
import * as TH from 'safebyok/testing'
import { Component, useLayoutEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { VaultProvider, useVault, useVaultSnapshot, type VaultProviderProps } from '../src/vault-provider'

/** A probe component exercising the binding the way a host app would. */
const Probe = () => {
  const { vault, openError, retryOpen, withUnlockedVault } = useVault()
  const snapshot = useVaultSnapshot()
  const [outcome, setOutcome] = useState('')

  if (openError !== null) {
    return <p><span data-testid="state">{`open error: ${openError.kind}`}</span> <button onClick={retryOpen}>Retry</button></p>
  }
  if (vault === null) { return <span data-testid="state">no vault</span> }

  const put = () => {
    void withUnlockedVault(() => vault.storeBox('anthropic_api_key', 'sk-fake'))
      .then((stored) => { setOutcome(stored === null ? 'dismissed' : 'stored') })
  }
  // A whisper is never null, so null from withUnlockedVault can only mean "dismissed".
  const grab = () => {
    void withUnlockedVault(() => vault.readBox('anthropic_api_key'))
      .then((whisper) => { setOutcome(whisper === null ? 'dismissed' : `read:${JSON.stringify(whisper)}`) })
  }

  return (
    <div>
      <span data-testid="state">{snapshot.state}</span>
      <span data-testid="boxcount">{snapshot.boxes.length}</span>
      <span data-testid="outcome">{outcome}</span>
      <button onClick={put}>put</button>
      <button onClick={grab}>grab</button>
    </div>
  )
}

/**
 * A component that keeps what useVault last handed it, and two ways to read that: `latest()`,
 * and `opened()`, a wait for the vault its provider opens.
 */
const grabber = () => {
  const seen: { provided: ReturnType<typeof useVault> | null } = { provided: null }
  const Grab = () => {
    const provided = useVault()
    // A layout effect runs in the same task as the commit that changed the page, so whatever a
    // test waited to see on the page, latest() hands down from that same render. A passive effect
    // may run after the wait has returned -- on a loaded machine, often enough to fail in CI --
    // and latest() would hand down the render before, with its openError and callbacks.
    useLayoutEffect(() => { seen.provided = provided }, [provided])
    return null
  }
  const latest = () => {
    if (seen.provided === null) { throw new Error('the grabber was never rendered in a provider') }
    return seen.provided
  }
  const opened = async (): Promise<Vault> => {
    await waitFor(() => { expect(seen.provided?.vault ?? null).to.not.be.null })
    const { vault } = latest()
    if (vault === null) { throw new Error('the provider opened no vault') }
    return vault
  }
  return { Grab, latest, opened }
}

/**
 * A fresh world in memory: its two stores, the VaultProvider props over them (all but `userId`),
 * and the Probe in a provider inside a boundary, as a tree or mounted.
 */
const makeWorld = () => {
  const vaultDB = localVaultDB({ store: memoryStore() })
  const deviceDB = memoryDeviceDB()
  const props = { applabel: 'acme', vaultlabel: 'main', vaultDB, deviceDB, keyDeriver: TH.testDeriver, passphraseStrengthTest: TH.anyPassphraseTest }
  const tree = (userId: string | null, caught: unknown[] = []) => (
    <CatchingBoundary caught={caught}>
      <VaultProvider {...props} userId={userId}>
        <Probe />
      </VaultProvider>
    </CatchingBoundary>
  )
  const mount = (userId: string | null, caught: unknown[] = []) => render(tree(userId, caught))
  return { vaultDB, deviceDB, props, tree, mount }
}

/** A world whose `u1` vault was made, with a lockbox, and then had its stored props spoiled. */
const damagedWorld = async () => {
  const store = memoryStore()
  const vaultDB = localVaultDB({ store })
  const deviceDB = memoryDeviceDB()
  const props = { applabel: 'acme', vaultlabel: 'main', vaultDB, deviceDB, keyDeriver: TH.testDeriver, passphraseStrengthTest: TH.anyPassphraseTest }
  const made = await TH.settledVault({ ...props, userId: 'u1' })
  await made.unlock('correct horse')
  await made.storeBox('anthropic_api_key', 'sk-fake')
  made.close()
  const vaultPropsCkey = Ckeys.vaultProps(TH.scopeOf('u1'))
  const vaultProps = JSON.parse(store.read(vaultPropsCkey) ?? 'null') as object
  store.write(vaultPropsCkey, JSON.stringify({ ...vaultProps, unlock_epoch: 'one' }))
  return { store, vaultDB, deviceDB, props }
}

/** A passphraseStrengthTest that refuses any passphrase holding the app's name. */
const refuseAcme = (typed: string): PassphraseVerdict => (typed.includes('acme') ? { strong: false, reason: 'Not the name of the app, please.' } : { strong: true })

/** The state the Probe, or the boundary in its place, shows. */
const shownState = () => screen.getByTestId('state').textContent

/** Waits until the Probe, or the boundary in its place, shows `state`, failing if it never does. */
const expectShown = (state: string) => waitFor(() => { expect(shownState()).to.eq(state) })

/** Waits until the Probe shows `outcome` for its last action, failing if it never does. */
const expectOutcome = (outcome: string) => waitFor(() => { expect(screen.getByTestId('outcome').textContent).to.eq(outcome) })

/** Puts a lockbox through the Probe into a vault not yet made, choosing `passphrase` for it. */
const putThroughNewVault = async (passphrase: string) => {
  fireEvent.click(screen.getByText('put'))
  fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByText('Create vault'))
  await expectOutcome('stored')
}

const unreachable = () => new VaultError('storage_unavailable', 'The vault storage could not be reached: try again shortly.')

/** Catches what its children throw while rendering, keeping the very thrown value for the test. */
class CatchingBoundary extends Component<{ caught: unknown[], children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override componentDidCatch(err: Error, _info: ErrorInfo) { this.props.caught.push(err) }
  override render() { return this.state.failed ? <span data-testid="state">boundary</span> : this.props.children }
}

/** openError's @example, as a host would write it. */
const OpenErrorExample = () => {
  const { openError, retryOpen } = useVault()
  if (openError?.kind === 'storage_blocked') { return <p>{"This browser won't let the app keep your vault on this device."}</p> }
  if (openError?.kind === 'damaged_vault') { return <p>{"Your vault's stored record is damaged."}</p> }
  if (openError !== null) { return <p>{"Can't reach your vault."} <button onClick={retryOpen}>Retry</button></p> }
  return <span>opened</span>
}

/** React reports a boundary-caught render error on the console; the suite stays quiet about it. */
const hushConsole = () => vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ })

/**
 * A world whose vault already holds `anthropic_api_key`, made on another device under the
 * passphrase 'pw', so the provider finds it locked; and a way to mount the provider over it
 * with a grabber, whose `withUnlockedVault` the test calls itself.
 */
const lockedWorld = async () => {
  const world = makeWorld()
  const maker = await TH.settledVault({ ...world.props, deviceDB: memoryDeviceDB(), userId: 'u1' })
  await maker.unlock('pw')
  await maker.storeBox('anthropic_api_key', 'sk-fake')
  maker.close()
  const grab = grabber()
  const tree = (userId: string | null, keyDeriver: KeyDeriver = TH.testDeriver) => (
    <VaultProvider {...world.props} keyDeriver={keyDeriver} userId={userId}><grab.Grab /></VaultProvider>
  )
  return { ...world, ...grab, tree }
}

/** A promise's outcome so far, read without waiting on it: 'pending' until it settles; `settled` is the promise itself. */
const watched = <ResultT,>(promise: Promise<ResultT>) => {
  const seen: { outcome: ResultT | 'pending', settled: Promise<ResultT> } = { outcome: 'pending', settled: promise }
  const follow = async () => {
    try {
      seen.outcome = await promise
    } catch {
      // A rejection is the test's to await, through settled.
    }
  }
  void follow()
  return seen
}

/** The provider over a world, with whatever logger and clock the render hands it. */
const providerOf = (world: ReturnType<typeof makeWorld>, sinks: Partial<Pick<VaultProviderProps, 'logger' | 'clock' | 'passphraseStrengthTest'>>) => (
  <VaultProvider {...world.props} userId="u1" {...sinks}><Probe /></VaultProvider>
)

/** Advice on a passphrase being chosen: a word until it is twelve characters or more. */
const twelveOrMore = (typed: string) => (typed.length < 12 ? 'Twelve characters or more, please.' : null)

/** Stands in for a function a test replaces before it is called. */
const noop = () => { /* replaced before use */ }

describe("VaultProvider", () => {
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

  it("an action through withUnlockedVault summons the dialog, and unlocking retries it", async () => {
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

  it("once unlocked, further actions run without the dialog", async () => {
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
    await world.deviceDB.eraseAll()
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

  it("dismissing the dialog resolves the action to null, and nothing is stored", async () => {
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

  it("a dialog that meets misuse keeps the app in place, and closing it resolves the action to null", async () => {
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

  describe("withUnlockedVault settles every call", () => {
    it("resolves null when the provider unmounts with the dialog open", async () => {
      const world = await lockedWorld()
      const { unmount } = render(world.tree('u1'))
      const vault = await world.opened()
      const reading = world.latest().withUnlockedVault(() => vault.readBox('anthropic_api_key'))
      await screen.findByPlaceholderText('vault passphrase')
      unmount()
      expect(await reading).to.be.null
    })

    it("keeps a dialog an action opens in the very commit that gave the provider its vault", async () => {
      const world = await lockedWorld()
      const eager: { reading: { outcome: unknown } } = { reading: { outcome: 'pending' } }
      // A layout effect runs in the commit itself, before React's passive effects -- among them the
      // provider's cleanup from the render before, the one with no vault yet -- have had their turn.
      const Eager = () => {
        const { vault, withUnlockedVault } = useVault()
        useLayoutEffect(() => {
          if (vault !== null) { eager.reading = watched(withUnlockedVault(() => vault.readBox('anthropic_api_key'))) }
        }, [vault, withUnlockedVault])
        return null
      }
      render(<VaultProvider {...world.props} userId="u1"><Eager /></VaultProvider>)
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      await waitFor(() => { expect(eager.reading.outcome).to.eq('sk-fake') })
    })

    it("resolves null when another user signs in, and shows that user no dialog", async () => {
      const world = await lockedWorld()
      const { rerender } = render(world.tree('u1'))
      const vault = await world.opened()
      const reading = world.latest().withUnlockedVault(() => vault.readBox('anthropic_api_key'))
      await screen.findByPlaceholderText('vault passphrase')
      rerender(world.tree('u2'))
      expect(await reading).to.be.null
      await waitFor(() => { expect(world.latest().vault).to.not.be.null })
      expect(world.latest().vault).to.not.equal(vault)
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    })

    it("resolves null when the user signs out", async () => {
      const world = await lockedWorld()
      const { rerender } = render(world.tree('u1'))
      const vault = await world.opened()
      const reading = world.latest().withUnlockedVault(() => vault.readBox('anthropic_api_key'))
      await screen.findByPlaceholderText('vault passphrase')
      rerender(world.tree(null))
      expect(await reading).to.be.null
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    })

    it("resolves null for an action whose refusal lands after the user signed out, and shows the next user no dialog", async () => {
      const world = await lockedWorld()
      const { rerender } = render(world.tree('u1'))
      const vault = await world.opened()
      let release: () => void = noop
      const held = new Promise<void>((resolve) => { release = resolve })
      // A host action that holds its refusal back a while, as one that logs it first might.
      const reading = watched(world.latest().withUnlockedVault(async () => {
        try {
          return await vault.readBox('anthropic_api_key')
        } catch (err) {
          await held
          throw err
        }
      }))
      rerender(world.tree(null))
      release()
      await waitFor(() => { expect(reading.outcome).to.be.null })
      rerender(world.tree('u2'))
      await waitFor(() => { expect(world.latest().vault).to.not.be.null })
      expect(world.latest().vault).to.not.equal(vault)
      await TH.wakeupAtNextTick()
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    })

    it("has overlapping calls wait on one dialog: one unlock runs them all", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const first = world.latest().withUnlockedVault(() => vault.readBox('anthropic_api_key'))
      await screen.findByPlaceholderText('vault passphrase')
      const second = world.latest().withUnlockedVault(() => vault.readBox('anthropic_api_key'))
      await TH.wakeupAtNextTick()
      expect(screen.getAllByPlaceholderText('vault passphrase')).to.have.lengthOf(1)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      expect(await first).to.eq('sk-fake')
      expect(await second).to.eq('sk-fake')
    })

    it("has overlapping calls each resolve null when the one dialog is cancelled", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const first = world.latest().withUnlockedVault(() => vault.readBox('anthropic_api_key'))
      await screen.findByPlaceholderText('vault passphrase')
      const second = world.latest().withUnlockedVault(() => vault.readBox('anthropic_api_key'))
      await TH.wakeupAtNextTick()
      fireEvent.click(screen.getByText('Cancel'))
      expect(await first).to.be.null
      expect(await second).to.be.null
    })

    it("an unlock finishing after Cancel closes a newer dialog too, and runs the actions waiting on it", async () => {
      const world = await lockedWorld()
      const gate = TH.makeGate()
      const slowDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase: string, saltBytes: Uint8Array) => { await gate.pass(); return await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes) } }
      render(world.tree('u1', slowDeriver))
      const vault = await world.opened()
      const first = world.latest().withUnlockedVault(() => vault.readBox('anthropic_api_key'))
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      await gate.reached
      fireEvent.click(screen.getByText('Cancel'))
      expect(await first).to.be.null

      const second = watched(world.latest().withUnlockedVault(() => vault.readBox('anthropic_api_key')))
      await screen.findByPlaceholderText('vault passphrase')
      expect(second.outcome).to.eq('pending')
      gate.release()
      await waitFor(() => { expect(second.outcome).to.eq('sk-fake') })
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    })

    it("closes a dialog the vault unlocks under without it, and runs the actions waiting on it", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const reading = world.latest().withUnlockedVault(() => vault.readBox('anthropic_api_key'))
      await screen.findByPlaceholderText('vault passphrase')
      await vault.unlock('pw')
      expect(await reading).to.eq('sk-fake')
      await waitFor(() => { expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null })
    })

    it("keeps a dialog asking through a change that is no unlock: a lockbox arriving, a lock", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      const reading = watched(world.latest().withUnlockedVault(() => vault.readBox('anthropic_api_key')))
      await screen.findByPlaceholderText('vault passphrase')
      const elsewhere = await TH.settledVault({ ...world.props, deviceDB: memoryDeviceDB(), userId: 'u1' })
      await elsewhere.unlock('pw')
      await elsewhere.storeBox('openai_api_key', 'sk-also-fake')
      elsewhere.close()
      await waitFor(() => { expect(vault.getSnapshot().boxes).to.have.lengthOf(2) })
      await vault.lock()
      await TH.wakeupAtNextTick()
      expect(screen.queryByPlaceholderText('vault passphrase')).to.not.be.null
      expect(reading.outcome).to.eq('pending')
      fireEvent.click(screen.getByText('Cancel'))
      await waitFor(() => { expect(reading.outcome).to.be.null })
    })

    it("runs an action refused just as the vault unlocked again, with no dialog to ask", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      let tries = 0
      // The refusal is met while locked, and the unlock lands before withUnlockedVault hears it.
      const reading = watched(world.latest().withUnlockedVault(async () => {
        tries += 1
        if (tries > 1) { return await vault.readBox('anthropic_api_key') }
        try {
          return await vault.readBox('anthropic_api_key')
        } catch (err) {
          await vault.unlock('pw')
          throw err
        }
      }))
      await waitFor(() => { expect(reading.outcome).to.eq('sk-fake') })
      expect(tries).to.eq(2)
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    })

    it("resolves null for a refusal landing once the next user's vault is open, and shows that user no dialog", async () => {
      const world = await lockedWorld()
      const { rerender } = render(world.tree('u1'))
      const vault = await world.opened()
      let release: () => void = noop
      const held = new Promise<void>((resolve) => { release = resolve })
      const reading = watched(world.latest().withUnlockedVault(async () => {
        try {
          return await vault.readBox('anthropic_api_key')
        } catch (err) {
          await held
          throw err
        }
      }))
      rerender(world.tree('u2'))
      await waitFor(() => { expect(world.latest().vault).to.not.be.null })
      expect(world.latest().vault).to.not.equal(vault)
      release()
      await waitFor(() => { expect(reading.outcome).to.be.null })
      await TH.wakeupAtNextTick()
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    })

    it("lets a lock() landing between the unlock and the run again win: the caller hears vault_locked", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      let tries = 0
      const reading = world.latest().withUnlockedVault(async () => {
        tries += 1
        if (tries > 1) { await vault.lock() }
        return await vault.readBox('anthropic_api_key')
      })
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      await expect(reading).rejects.toMatchObject({ kind: 'vault_locked' })
      await TH.wakeupAtNextTick()
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    })

    it("resolves null when the provider unmounts while the run again after the unlock is under way", async () => {
      const world = await lockedWorld()
      const { unmount } = render(world.tree('u1'))
      const vault = await world.opened()
      let tries = 0
      const reading = world.latest().withUnlockedVault(async () => {
        tries += 1
        const read = vault.readBox('anthropic_api_key')
        // The page goes as the run again starts, and the provider closes the vault under the read.
        if (tries > 1) { unmount() }
        return await read
      })
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      expect(await reading).to.be.null
      expect(tries).to.eq(2)
    })

    it("resolves null when the provider unmounts while the action is under way", async () => {
      const world = await lockedWorld()
      const { unmount } = render(world.tree('u1'))
      const vault = await world.opened()
      await vault.unlock('pw')
      const reading = world.latest().withUnlockedVault(async () => {
        const read = vault.readBox('anthropic_api_key')
        unmount()
        return await read
      })
      expect(await reading).to.be.null
    })

    it("still throws vault_closed for a handle closed by someone else, which is misuse", async () => {
      const world = await lockedWorld()
      render(world.tree('u1'))
      const vault = await world.opened()
      await vault.unlock('pw')
      vault.close()
      await TH.expectRefusal(world.latest().withUnlockedVault(() => vault.readBox('anthropic_api_key')), 'vault_closed')
    })

    it("leaves another user's dialog asking when the last user's cancelled unlock finishes late", async () => {
      const world = await lockedWorld()
      const other = await TH.settledVault({ ...world.props, deviceDB: memoryDeviceDB(), userId: 'u2' })
      await other.unlock('pw2')
      await other.storeBox('anthropic_api_key', 'sk-other-fake')
      other.close()
      const gate = TH.makeGate()
      const slowDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase: string, saltBytes: Uint8Array) => { await gate.pass(); return await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes) } }
      const { rerender } = render(world.tree('u1', slowDeriver))
      const vault = await world.opened()
      const first = world.latest().withUnlockedVault(() => vault.readBox('anthropic_api_key'))
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByText('Unlock'))
      await gate.reached
      fireEvent.click(screen.getByText('Cancel'))
      expect(await first).to.be.null

      rerender(world.tree('u2', slowDeriver))
      await waitFor(() => { expect(world.latest().vault).to.not.be.null })
      const vault2 = world.latest().vault
      if (vault2 === null || vault2 === vault) { throw new Error('the provider opened no vault for u2') }
      const second = watched(world.latest().withUnlockedVault(() => vault2.readBox('anthropic_api_key')))
      await screen.findByPlaceholderText('vault passphrase')
      gate.release()
      await TH.wakeupAtNextTick()
      expect(vault2.getSnapshot().state).to.eq('locked')
      expect(screen.queryByPlaceholderText('vault passphrase')).to.not.be.null
      expect(second.outcome).to.eq('pending')
      fireEvent.click(screen.getByText('Cancel'))
      await waitFor(() => { expect(second.outcome).to.be.null })
    })
  })

  it("asks for a keyDeriver outright, as Vault.make does", () => {
    expectTypeOf<Pick<VaultProviderProps, 'keyDeriver'>>().toEqualTypeOf<{ keyDeriver: KeyDeriver }>()
  })

  it("passes every Vault.make option through, as given", async () => {
    // A fixed instant the vault accepts as a time: after 1981, before FarFuture.
    const ClockMillis = Date.UTC(2026, 9, 15)
    const { Grab, opened } = grabber()
    render(
      <VaultProvider applabel="acme" vaultlabel="main" userId="u1" vaultDB={localVaultDB({ store: memoryStore() })} deviceDB={memoryDeviceDB()}
        keyDeriver={TH.testDeriver} passphraseStrengthTest={TH.anyPassphraseTest} clock={{ now: () => ClockMillis }} leaseHours={1} maxWhisperBytes={8} maxLockboxes={1}>
        <Grab />
      </VaultProvider>,
    )
    const vault = await opened()

    await vault.unlock('correct horse battery staple')
    // One hour, 3,600,000 ms, after the clock's time.
    expect(vault.getSnapshot().askPassphraseAt).to.eq(ClockMillis + 3_600_000)
    // 'sk-fake' is nine bytes of JSON, one over the limit given.
    await TH.expectRefusal(vault.storeBox('anthropic_api_key', 'sk-fake'), 'whisper_too_large')
    // One lockbox fills the vault: a second is refused for room.
    await vault.storeBox('openai_api_key', 'sk')
    await TH.expectRefusal(vault.storeBox('mistral_api_key', 'sk'), 'vault_full')
  })

  it("passes the validators through, reopening for a changed check but not for a bag rebuilt around the same ones", async () => {
    const { Grab, latest, opened } = grabber()
    const { props } = makeWorld()
    // A bag written in the props, as a host might: new at every render, around the same schemas.
    const tree = (boxlabelCheck: VaultValidators['boxlabel']) => (
      <VaultProvider {...props} userId="u1" validators={{ boxlabel: boxlabelCheck }}>
        <Grab />
      </VaultProvider>
    )
    const { rerender } = render(tree(AnyTextValidators.boxlabel))
    const first = await opened()
    await first.unlock('correct horse battery staple')
    await first.storeBox('Anthropic API key', 'sk-fake')
    rerender(tree(AnyTextValidators.boxlabel))
    expect(latest().vault).to.eq(first)
    // Another schema, a narrower one: a new check, so a new vault handle, which lists what is
    // stored as it stands, the checks running at entry only.
    rerender(tree(Label))
    await waitFor(() => { expect(latest().vault).to.not.be.null.and.not.eq(first) })
    expect(latest().vault?.getSnapshot().boxes.map((summary) => summary.boxlabel)).to.deep.equal(['Anthropic API key'])
  })

  it("passes passphraseStrengthTest through: the vault it opens refuses a weak new passphrase with the test's reason", async () => {
    const { Grab, opened } = grabber()
    const { props } = makeWorld()
    render(<VaultProvider {...props} userId="u1" passphraseStrengthTest={refuseAcme}><Grab /></VaultProvider>)
    const vault = await opened()
    const err = await TH.expectRefusal(vault.unlock('acme acme acme acme'), 'weak_passphrase')
    expect(err.message).to.eq('Not the name of the app, please.')
    await vault.unlock('correct horse battery staple')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("throws to the error boundary at the render that lacks a passphraseStrengthTest, before any open", () => {
    hushConsole()
    const caught: unknown[] = []
    const { passphraseStrengthTest: _admitsAny, ...props } = makeWorld().props
    const lacking = props as VaultProviderProps
    render(<CatchingBoundary caught={caught}><VaultProvider {...lacking} userId="u1"><Probe /></VaultProvider></CatchingBoundary>)
    expect(shownState()).to.eq('boundary')
    expect(isVaultError(caught[0], 'bad_option')).to.be.true
    expect((caught[0] as Error).message).to.match(/passphraseStrengthTest is required.*browserOpts/)
  })

  it("keeps its vault for a passphraseStrengthTest that keeps its identity, the vault running that test", async () => {
    const { Grab, latest, opened } = grabber()
    const { props } = makeWorld()
    const tree = () => <VaultProvider {...props} userId="u1" passphraseStrengthTest={refuseAcme}><Grab /></VaultProvider>
    const { rerender } = render(tree())
    const first = await opened()
    rerender(tree())
    expect(latest().vault).to.eq(first)
    await TH.expectRefusal(first.unlock('acme acme acme acme'), 'weak_passphrase')
  })

  it("reopens for a passphraseStrengthTest that changes identity, as for any option: the new vault runs the new test", async () => {
    const { Grab, latest, opened } = grabber()
    const { props } = makeWorld()
    const tree = (reason: string) => (
      <VaultProvider {...props} userId="u1" passphraseStrengthTest={(_typed) => ({ strong: false, reason })}>
        <Grab />
      </VaultProvider>
    )
    const { rerender } = render(tree('First reason.'))
    const first = await opened()
    rerender(tree('Second reason.'))
    await waitFor(() => { expect(latest().vault).to.not.be.null.and.not.eq(first) })
    const second = latest().vault
    if (second === null) { throw new Error('the provider opened no vault') }
    const err = await TH.expectRefusal(second.unlock('correct horse battery staple'), 'weak_passphrase')
    expect(err.message).to.eq('Second reason.')
    await TH.expectRefusal(first.unlock('correct horse battery staple'), 'vault_closed')
  })

  it("shows the vault locked when storage says its user signed out, as the vault locks itself", async () => {
    const { Grab, opened } = grabber()
    const { props, vaultDB } = makeWorld()
    render(
      <VaultProvider {...props} userId="u1">
        <Probe />
        <Grab />
      </VaultProvider>,
    )
    const vault = await opened()
    await vault.unlock('correct horse battery staple')
    await expectShown('unlocked')
    vi.spyOn(vaultDB, 'readBox').mockRejectedValueOnce(new VaultError('identity_revoked', 'No one is signed in: sign in, then try again.'))
    await TH.expectRefusal(vault.readBox('anthropic_api_key'), 'identity_revoked')
    await expectShown('locked')
  })

  it("passes the wayinlabel check through: a way in labelled as the host's check allows is added", async () => {
    const { Grab, opened } = grabber()
    render(
      <VaultProvider {...makeWorld().props} userId="u1" validators={{ wayinlabel: AnyTextValidators.wayinlabel }}>
        <Grab />
      </VaultProvider>,
    )
    const vault = await opened()
    await vault.unlock('correct horse battery staple')
    await vault.addPassphrase('correct horse battery staple', 'a spare passphrase', { wayinlabel: 'Written down, in the drawer' })
    expect(vault.getSnapshot().wayins.map((wayin) => wayin.wayinlabel)).to.deep.equal(['passphrase', 'Written down, in the drawer'])
  })

  it("passes the logger through: what the vault has nobody to throw to reaches it", async () => {
    const spy = TH.spyLogger()
    let reading = Date.UTC(2026, 9, 15)
    const clock = { now: () => reading }
    const { Grab, opened } = grabber()
    render(
      <VaultProvider {...makeWorld().props} userId="u1" clock={clock} logger={spy.logger}>
        <Grab />
      </VaultProvider>,
    )
    const vault = await opened()
    await vault.unlock('correct horse battery staple')
    reading = NaN
    await vault.lockSoon()
    expect(spy.calls.map((heard) => heard.level)).to.deep.equal(['warn'])
    expect(spy.calls[0]?.story).to.deep.equal({ call: 'lockSoon' })
  })

  it("uses the logger its vaultDB was made with when given none: the provider's warnings and its vault's reach the one logger", async () => {
    const spy = TH.spyLogger()
    const vaultDB = localVaultDB({ store: memoryStore(), logger: spy.logger })
    let reading = Date.UTC(2026, 9, 15)
    const { Grab, opened } = grabber()
    const providing = (clock: { now: () => number }) => (
      <VaultProvider {...makeWorld().props} vaultDB={vaultDB} userId="u1" clock={clock}>
        <Grab />
      </VaultProvider>
    )
    const { rerender } = render(providing({ now: () => reading }))
    await opened()
    rerender(providing({ now: () => reading }))
    await waitFor(() => { expect(spy.calls.map((heard) => heard.story?.['call'])).to.include('VaultProvider') })
    const vault = await opened()
    await vault.unlock('correct horse battery staple')
    reading = NaN
    await vault.lockSoon()
    expect(spy.calls.map((heard) => [heard.level, heard.story?.['call']])).to.deep.equal([['warn', 'VaultProvider'], ['warn', 'lockSoon']])
  })

  it("passes allowStartOver to the dialog: a user who forgot the passphrase may start a new vault", async () => {
    const world = await lockedWorld()
    render(<VaultProvider {...world.props} userId="u1" allowStartOver><world.Grab /></VaultProvider>)
    const vault = await world.opened()
    const reading = watched(world.latest().withUnlockedVault(() => vault.readBox('anthropic_api_key')))
    fireEvent.click(await screen.findByText('Forgot it? Start a new vault'))
    fireEvent.click(screen.getByText('Remove and start over'))
    fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'a new pw' } })
    expect(screen.queryByText('Choose a vault passphrase')).to.not.be.null
    fireEvent.click(screen.getByText('Create vault'))
    // The action runs again, in the new vault, where there is no such lockbox.
    await expect(reading.settled).rejects.toMatchObject({ kind: 'absent_box' })
  })

  it("passes passphraseUsername and passphraseAdvice to the dialog: what a password manager files it under, and what is said as the user chooses", async () => {
    const world = makeWorld()
    render(
      <VaultProvider {...world.props} userId="u1" passphraseUsername="margo@example.com (vault)" passphraseAdvice={twelveOrMore}>
        <Probe />
      </VaultProvider>,
    )
    fireEvent.click(await screen.findByText('put'))
    const field = await screen.findByPlaceholderText('vault passphrase')
    expect(document.querySelector<HTMLInputElement>('input[autocomplete="username"]')?.value).to.eq('margo@example.com (vault)')
    fireEvent.change(field, { target: { value: 'short' } })
    expect(await screen.findByText('Twelve characters or more, please.')).to.not.be.null
  })

  describe("advice, by default, from the passphraseStrengthTest", () => {
    it("says the test's reason as the user chooses a weak passphrase, and nothing for one it admits", async () => {
      const world = makeWorld()
      render(<VaultProvider {...world.props} userId="u1" passphraseStrengthTest={refuseAcme}><Probe /></VaultProvider>)
      fireEvent.click(await screen.findByText('put'))
      const field = await screen.findByPlaceholderText('vault passphrase')
      fireEvent.change(field, { target: { value: 'acme forever' } })
      await waitFor(() => { expect(screen.getByRole('status').textContent).to.eq('Not the name of the app, please.') })
      expect(field.getAttribute('aria-describedby')).to.eq(screen.getByRole('status').id)
      fireEvent.change(field, { target: { value: 'correct horse battery staple' } })
      await waitFor(() => { expect(screen.getByRole('status').textContent).to.eq('') })
    })

    it("says nothing for a test that fails to answer, as a word list failing to load mid-typing does, and keeps the dialog", async () => {
      const world = makeWorld()
      const caught: unknown[] = []
      const flaky = vi.fn(refuseAcme).mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      render(<CatchingBoundary caught={caught}><VaultProvider {...world.props} userId="u1" passphraseStrengthTest={flaky}><Probe /></VaultProvider></CatchingBoundary>)
      fireEvent.click(await screen.findByText('put'))
      const field = await screen.findByPlaceholderText('vault passphrase')
      fireEvent.change(field, { target: { value: 'acme' } })
      await waitFor(() => { expect(flaky).to.have.callCount(1) })
      expect(screen.getByRole('status').textContent).to.eq('')
      fireEvent.change(field, { target: { value: 'acme forever' } })
      await waitFor(() => { expect(screen.getByRole('status').textContent).to.eq('Not the name of the app, please.') })
      expect(caught).to.have.lengthOf(0)
      expect(screen.queryByPlaceholderText('vault passphrase')).to.not.be.null
    })

    it("hands the test the vault's scope, as the vault does", async () => {
      const world = makeWorld()
      const heard = vi.fn((_typed: string, _scope: VaultScope): PassphraseVerdict => ({ strong: true }))
      render(<VaultProvider {...world.props} userId="u1" passphraseStrengthTest={heard}><Probe /></VaultProvider>)
      fireEvent.click(await screen.findByText('put'))
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'some words' } })
      await waitFor(() => { expect(heard).toHaveBeenCalledWith('some words', TH.scopeOf('u1')) })
    })

    it("gives way to the host's own passphraseAdvice, which the test never hears", async () => {
      const world = makeWorld()
      const heard = vi.fn(refuseAcme)
      render(<VaultProvider {...world.props} userId="u1" passphraseStrengthTest={heard} passphraseAdvice={twelveOrMore}><Probe /></VaultProvider>)
      fireEvent.click(await screen.findByText('put'))
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'acme' } })
      await waitFor(() => { expect(screen.getByRole('status').textContent).to.eq('Twelve characters or more, please.') })
      expect(heard).not.toHaveBeenCalled()
    })

    it("asks nothing while unlocking: the test runs only on a passphrase being chosen", async () => {
      const world = await lockedWorld()
      const heard = vi.fn(TH.anyPassphraseTest)
      render(<VaultProvider {...world.props} userId="u1" passphraseStrengthTest={heard}><world.Grab /></VaultProvider>)
      const vault = await world.opened()
      void world.latest().withUnlockedVault(() => vault.readBox('anthropic_api_key'))
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      expect(screen.queryByRole('status')).to.be.null
      expect(heard).not.toHaveBeenCalled()
    })
  })

  describe("warning the developer once", () => {
    it("of a logger written inline, which reopens the vault at every render", async () => {
      const spy = TH.spyLogger()
      const world = makeWorld()
      const { rerender } = render(providerOf(world, { logger: { ...spy.logger } }))
      await expectShown('absent')
      rerender(providerOf(world, { logger: { ...spy.logger } }))
      await expectShown('absent')
      rerender(providerOf(world, { logger: { ...spy.logger } }))
      await expectShown('absent')
      const warned = spy.calls.filter((heard) => heard.story?.['call'] === 'VaultProvider')
      expect(warned).to.have.lengthOf(1)
      expect(warned[0]?.level).to.eq('warn')
      expect(warned[0]?.story).to.deep.equal({ call: 'VaultProvider', props: ['logger'] })
      expect(warned[0]?.message).to.match(/define it once, outside the component, or memoize it/)
    })

    it("of a clock written inline, through the console when there is no logger", async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { /* kept out of the test output */ })
      const world = makeWorld()
      const { rerender } = render(providerOf(world, { clock: { now: () => Date.now() } }))
      await expectShown('absent')
      rerender(providerOf(world, { clock: { now: () => Date.now() } }))
      await expectShown('absent')
      // Each open with the test deriver also warns, of the deriver: only the provider's own are counted.
      const warned = consoleWarn.mock.calls.map(([said]) => String(said)).filter((said) => said.startsWith('safebyok: VaultProvider'))
      expect(warned).to.have.lengthOf(1)
      expect(warned[0]).to.match(/^safebyok: VaultProvider reopened the vault because its clock changed identity/)
    })

    it("of a passphraseStrengthTest written inline, which reopens the vault at every render", async () => {
      const spy = TH.spyLogger()
      const world = makeWorld()
      const { rerender } = render(providerOf(world, { logger: spy.logger, passphraseStrengthTest: () => ({ strong: true }) }))
      await expectShown('absent')
      rerender(providerOf(world, { logger: spy.logger, passphraseStrengthTest: () => ({ strong: true }) }))
      await expectShown('absent')
      rerender(providerOf(world, { logger: spy.logger, passphraseStrengthTest: () => ({ strong: true }) }))
      await expectShown('absent')
      const warned = spy.calls.filter((heard) => heard.story?.['call'] === 'VaultProvider')
      expect(warned).to.have.lengthOf(1)
      expect(warned[0]?.story).to.deep.equal({ call: 'VaultProvider', props: ['passphraseStrengthTest'] })
    })

    it("of nothing, for a logger and clock that keep their identity", async () => {
      const spy = TH.spyLogger()
      const clock = { now: () => Date.now() }
      const world = makeWorld()
      const { rerender } = render(providerOf(world, { logger: spy.logger, clock }))
      await expectShown('absent')
      rerender(providerOf(world, { logger: spy.logger, clock }))
      await expectShown('absent')
      expect(spy.calls).to.deep.equal([])
    })
  })

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

    it("throws a passphraseStrengthTest that is no function to the error boundary at render, as Vault.make would refuse it", () => {
      hushConsole()
      const caught: unknown[] = []
      const misfit = { strong: true } as unknown as VaultProviderProps['passphraseStrengthTest']
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider {...makeWorld().props} userId="u1" passphraseStrengthTest={misfit}>
            <Probe />
          </VaultProvider>
        </CatchingBoundary>,
      )
      expect(shownState()).to.eq('boundary')
      expect(isVaultError(caught[0], 'bad_option')).to.be.true
      expect((caught[0] as Error).message).to.include('passphraseStrengthTest')
    })

    it("throws a bad option to the error boundary, as the very VaultError", async () => {
      hushConsole()
      const caught: unknown[] = []
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider {...makeWorld().props} userId="u1" maxLockboxes={0}>
            <Probe />
          </VaultProvider>
        </CatchingBoundary>,
      )
      await expectShown('boundary')
      expect(isVaultError(caught[0], 'bad_option')).to.be.true
    })

    it("throws a rejection that is no VaultError to the boundary: only a VaultError can be a condition", async () => {
      hushConsole()
      const world = makeWorld()
      // Mocked past VaultDB's public verb, which would wrap a raw throw as storage_unavailable.
      const stray = new TypeError('something is not a function')
      vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(stray)
      const caught: unknown[] = []
      world.mount('u1', caught)
      await expectShown('boundary')
      expect(caught[0]).to.eq(stray)
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
        vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(condition)
        const caught: unknown[] = []
        world.mount('u1', caught)
        await expectShown(`open error: ${kind}`)
        expect(caught).to.have.length(0)
      })
    }

    it("hands down the very VaultError, beside the handle still opening, whose trouble it is", async () => {
      const world = makeWorld()
      const trouble = unreachable()
      vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(trouble)
      const { Grab, latest } = grabber()
      render(
        <VaultProvider {...world.props} userId="u1">
          <Grab />
        </VaultProvider>,
      )
      await waitFor(() => { expect(latest().openError).to.eq(trouble) })
      expect(latest().vault?.getSnapshot()).to.deep.include({ state: 'opening', trouble })
    })

    it("hands down the vault at once, still opening, while its hello reads storage, and no openError", async () => {
      const world = makeWorld()
      const gate = TH.holdNextCall(world.vaultDB, 'readVaultProps')
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
      vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(misuse)
      const caught: unknown[] = []
      world.mount('u1', caught)
      await expectShown('boundary')
      expect(caught[0]).to.eq(misuse)
    })

    it("throws a hello refused as bad_record to the error boundary too, as misuse like bad_option", async () => {
      hushConsole()
      const world = makeWorld()
      const misuse = new VaultError('bad_record', 'A record the developer built wrongly.')
      vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(misuse)
      const caught: unknown[] = []
      world.mount('u1', caught)
      await expectShown('boundary')
      expect(caught[0]).to.eq(misuse)
    })

    it("throws a prop Vault.make does not take to the error boundary, naming it and its new name, rather than drop it unseen", async () => {
      hushConsole()
      const caught: unknown[] = []
      const retired = { forcePassphraseReentryHours: 1 } as Partial<VaultProviderProps>
      render(
        <CatchingBoundary caught={caught}>
          <VaultProvider {...makeWorld().props} userId="u1" {...retired}>
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
      vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(unreachable())
      world.mount('u1')
      await expectShown('open error: storage_unavailable')
      fireEvent.click(screen.getByText('Retry'))
      await expectShown('absent')
    })

    it("a retry that fails again hands down the fresh error", async () => {
      const world = makeWorld()
      const first = unreachable()
      const second = new VaultError('not_permitted', 'Sign in to reach this vault.')
      vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(first).mockRejectedValueOnce(second)
      world.mount('u1')
      await expectShown('open error: storage_unavailable')
      fireEvent.click(screen.getByText('Retry'))
      await expectShown('open error: not_permitted')
    })

    it("retries on the same handle, its one storage watch kept throughout", async () => {
      const world = makeWorld()
      const tally = TH.tallyWatches(world.vaultDB)
      const reads = vi.spyOn(world.vaultDB, 'readVaultProps')
      reads.mockRejectedValueOnce(unreachable()).mockRejectedValueOnce(unreachable())
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
      const reads = vi.spyOn(world.vaultDB, 'readVaultProps')
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

    describe("retireDamagedVault", () => {
      it("retires the vault openError says is damaged, with this device's lease, and opens a fresh one", async () => {
        const { store, deviceDB, props } = await damagedWorld()
        const { Grab, latest } = grabber()
        render(<VaultProvider {...props} userId="u1"><Grab /><Probe /></VaultProvider>)
        await expectShown('open error: damaged_vault')
        expect(await deviceDB.readLease(TH.scopeOf('u1'))).to.not.be.null
        await act(async () => { await latest().retireDamagedVault() })
        await expectShown('absent')
        expect(store.ckeys()).to.deep.equal([])
        expect(await deviceDB.readLease(TH.scopeOf('u1'))).to.be.null
        expect(latest().openError).to.be.null
      })

      it("does nothing for an openError that is not damaged_vault", async () => {
        const world = makeWorld()
        const retiring = vi.spyOn(world.vaultDB, 'retireDamagedVault')
        vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(unreachable())
        const { Grab, latest } = grabber()
        render(<VaultProvider {...world.props} userId="u1"><Grab /><Probe /></VaultProvider>)
        await expectShown('open error: storage_unavailable')
        await act(async () => { await latest().retireDamagedVault() })
        expect(retiring).not.toHaveBeenCalled()
        expect(shownState()).to.eq('open error: storage_unavailable')
      })

      it("does nothing while the vault is open, however sound", async () => {
        const world = makeWorld()
        const retiring = vi.spyOn(world.vaultDB, 'retireDamagedVault')
        const { Grab, latest } = grabber()
        render(<VaultProvider {...world.props} userId="u1"><Grab /><Probe /></VaultProvider>)
        await expectShown('absent')
        await act(async () => { await latest().retireDamagedVault() })
        expect(retiring).not.toHaveBeenCalled()
        expect(shownState()).to.eq('absent')
      })

      it("opens again, and still rejects, when retiring finds the vault made anew", async () => {
        const { vaultDB, props } = await damagedWorld()
        vi.spyOn(vaultDB, 'retireDamagedVault').mockRejectedValueOnce(new VaultError('stale_write', 'Storage changed.'))
        // The vault is made anew behind the provider's back: the reopen finds it sound.
        const reads = vi.spyOn(vaultDB, 'readVaultProps')
        const { Grab, latest } = grabber()
        render(<VaultProvider {...props} userId="u1"><Grab /><Probe /></VaultProvider>)
        await expectShown('open error: damaged_vault')
        reads.mockResolvedValueOnce(null)
        await act(async () => {
          await expect(latest().retireDamagedVault()).rejects.toMatchObject({ kind: 'stale_write' })
        })
        await expectShown('absent')
      })

      it("rejects misuse (bad_option) without opening again, leaving openError for retryOpen", async () => {
        const { vaultDB, props } = await damagedWorld()
        const misuse = new VaultError('bad_option', 'That vault reads sound.')
        vi.spyOn(vaultDB, 'retireDamagedVault').mockRejectedValueOnce(misuse)
        const reads = vi.spyOn(vaultDB, 'readVaultProps')
        const { Grab, latest } = grabber()
        render(<VaultProvider {...props} userId="u1"><Grab /><Probe /></VaultProvider>)
        await expectShown('open error: damaged_vault')
        const readsBefore = reads.mock.calls.length
        await act(async () => {
          await expect(latest().retireDamagedVault()).rejects.toMatchObject({ kind: 'bad_option' })
        })
        await TH.wakeupAtNextTick()
        expect(reads.mock.calls.length).to.eq(readsBefore)
        expect(shownState()).to.eq('open error: damaged_vault')
      })

      it("rejects with storage's refusal, leaving the damaged openError in place", async () => {
        const { vaultDB, props } = await damagedWorld()
        vi.spyOn(vaultDB, 'retireDamagedVault').mockRejectedValueOnce(unreachable())
        const { Grab, latest } = grabber()
        render(<VaultProvider {...props} userId="u1"><Grab /><Probe /></VaultProvider>)
        await expectShown('open error: damaged_vault')
        await act(async () => {
          await expect(latest().retireDamagedVault()).rejects.toMatchObject({ kind: 'storage_unavailable' })
        })
        expect(shownState()).to.eq('open error: damaged_vault')
        await act(async () => { await latest().retireDamagedVault() })
        await expectShown('absent')
      })
    })

    it("clears openError when the user signs out", async () => {
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(unreachable())
      const { rerender } = world.mount('u1')
      await expectShown('open error: storage_unavailable')
      rerender(world.tree(null))
      expect(shownState()).to.eq('no vault')
    })

    it("matches openError's @example: the message and its Retry button, in place", async () => {
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(unreachable())
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
      vi.spyOn(world.props.deviceDB, 'readMark').mockRejectedValue(new DOMException('The operation is insecure.', 'SecurityError'))
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
      vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValue(new VaultError('corrupt_record', 'The stored vault failed its checks.'))
      render(
        <VaultProvider {...world.props} userId="u1">
          <OpenErrorExample />
        </VaultProvider>,
      )
      await screen.findByText("Your vault's stored record is damaged.")
      expect(screen.queryByText('Retry')).to.be.null
    })

    it("throws a rejection of null too: the failure is held, not the value", async () => {
      hushConsole()
      const world = makeWorld()
      vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(null)
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
      expect(caught[0]).to.be.null
    })

    it("ignores a rejection that arrives after the user signed out", async () => {
      hushConsole()
      const world = makeWorld()
      let rejectRead: (err: unknown) => void = noop
      const readVaultProps = vi.spyOn(world.vaultDB, 'readVaultProps').mockReturnValueOnce(new Promise((_resolve, reject) => { rejectRead = reject }))
      const caught: unknown[] = []
      const tree = (userId: string | null) => (
        <CatchingBoundary caught={caught}>
          <VaultProvider {...world.props} userId={userId}>
            <Probe />
          </VaultProvider>
        </CatchingBoundary>
      )
      const { rerender } = render(tree('u1'))
      await waitFor(() => { expect(readVaultProps).toHaveBeenCalledOnce() })
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
})
