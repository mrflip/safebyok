/**
 * Helpers the BankProvider suites share: a probe and a grabber in a provider, worlds in memory
 * (fresh, made, damaged, locked), and the host examples the doc blocks show.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, vi } from 'vitest'
import { Ckeys, VaultError, localVaultDB, memoryDeviceDB, memoryStore, type DeviceDB, type KeyDeriver, type PassphraseVerdict, type Vault, type VaultDB } from 'safebyok'
import * as TH from 'safebyok/testing'
import { Component, useLayoutEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { BankProvider, useBank, useVault, useVaultSnapshot, type BankProviderProps } from '../../src/bank-provider'

// == [Test helpers]: useProvided, Probe, grabber, makeWorld, madeWorld, damagedWorld, lockedWorld, watched, providerOf, VaultExample, BoxCount, countStoreCalls, others

/** Everything the provider hands down for u1's `main` vault, through each of its hooks, as one bag: the bank, the entry, and the entry's Vault object, if any. */
export const useProvided = () => {
  const bank = useBank()
  const entry = useVault('main')
  return { bank, entry, vault: entry?.vault ?? null, err: entry?.err ?? null }
}

/** What the Probe shows for a call refused `err`: 'dismissed' for a dialog declined (vault_locked), the kind otherwise. */
const saidOf = (err: VaultError) => (err.refusalkind === 'vault_locked' ? 'dismissed' : `refused: ${err.refusalkind}`)

/**
 * A probe component exercising the binding the way a host app would: its `put` and `grab` call
 * the vault, which asks through the provider's dialog when it is locked or novel.
 */
export const Probe = () => {
  const bank = useBank()
  const entry = useVault('main')
  const snapshot = useVaultSnapshot('main')
  const [outcome, setOutcome] = useState('')

  if (entry?.err !== null && entry?.err !== undefined) {
    const retry = () => { if (bank !== null) { void bank.tryEnsureVault({ userId: entry.scope.user_id, vaultlabel: 'main' }) } }
    return <p><span data-testid="state">{`refused: ${entry.err.refusalkind}`}</span> <button onClick={retry}>Retry</button></p>
  }
  const vault = entry?.vault ?? null
  if (vault === null || snapshot === null) { return <span data-testid="state">no vault</span> }

  const put = () => {
    void vault.tryPutBox({ boxlabel: 'anthropic_api_key' }, 'sk-fake').then((stored) => { setOutcome(stored.ok ? 'stored' : saidOf(stored.err)) })
  }
  const grab = () => {
    void vault.tryGetWhisper('anthropic_api_key').then((read) => { setOutcome(read.ok ? `read:${JSON.stringify(read.val)}` : saidOf(read.err)) })
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
 * A component that keeps what the provider's hooks last handed it, and two ways to read that:
 * `latest()`, and `opened()`, a wait for the vault its provider opens.
 */
export const grabber = () => {
  const seen: { provided: ReturnType<typeof useProvided> | null } = { provided: null }
  const Grab = () => {
    const provided = useProvided()
    // A layout effect runs in the same task as the commit that changed the page, so whatever a
    // test waited to see on the page, latest() hands down from that same render. A passive effect
    // may run after the wait has returned -- on a loaded machine, often enough to fail in CI --
    // and latest() would hand down the render before, with its entry.
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
 * A fresh world in memory: its two stores, the BankProvider props over them (all but `userId`),
 * and the Probe in a provider inside a boundary, as a tree or mounted.
 */
export const makeWorld = () => {
  const vaultDB = localVaultDB({ store: memoryStore() })
  const deviceDB = memoryDeviceDB()
  const props = { applabel: 'acme', vaultDB, deviceDB, keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker }
  const tree = (userId: string | null, caught: unknown[] = []) => (
    <CatchingBoundary caught={caught}>
      <BankProvider {...props} userId={userId}>
        <Probe />
      </BankProvider>
    </CatchingBoundary>
  )
  const mount = (userId: string | null, caught: unknown[] = []) => render(tree(userId, caught))
  return { vaultDB, deviceDB, props, tree, mount }
}

/** A world whose `u1` vault was made, with a box, its lease kept on this device; `spoil()` breaks its stored props. */
export const madeWorld = async () => {
  const store = memoryStore()
  const vaultDB = localVaultDB({ store })
  const deviceDB = memoryDeviceDB()
  const props = { applabel: 'acme', vaultDB, deviceDB, keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker }
  const made = await TH.settledVault({ ...props, userId: 'u1', vaultlabel: 'main' })
  await made.unlock('correct horse')
  await made.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-fake')
  TH.closeVault(made)
  const spoil = () => {
    const vaultPropsCkey = Ckeys.vaultProps(TH.scopeOf('u1'))
    const vaultProps = JSON.parse(store.read(vaultPropsCkey) ?? 'null') as object
    store.write(vaultPropsCkey, JSON.stringify({ ...vaultProps, gate_epoch: 'one' }))
  }
  return { store, vaultDB, deviceDB, props, spoil }
}

/** A world whose `u1` vault was made, with a box, and then had its stored props spoiled. */
export const damagedWorld = async () => {
  const world = await madeWorld()
  world.spoil()
  return world
}

/** A strengthChecker that refuses any passphrase holding the app's name. */
export const refuseAcme = (typed: string): PassphraseVerdict => (typed.includes('acme') ? { strong: false, reason: 'Not the name of the app, please.' } : { strong: true })

/** The state the Probe, or the boundary in its place, shows. */
export const shownState = () => screen.getByTestId('state').textContent

/** Waits until the Probe, or the boundary in its place, shows `state`, failing if it never does. */
export const expectShown = (state: string) => waitFor(() => { expect(shownState()).to.eq(state) })

/** Waits until the Probe shows `outcome` for its last action, failing if it never does. */
export const expectOutcome = (outcome: string) => waitFor(() => { expect(screen.getByTestId('outcome').textContent).to.eq(outcome) })

/** Puts a box through the Probe into a vault not yet made, choosing `passphrase` for it. */
export const putThroughNewVault = async (passphrase: string) => {
  fireEvent.click(screen.getByText('put'))
  fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByText('Create vault'))
  await expectOutcome('stored')
}

export const unreachable = () => new VaultError('storage_unavailable', 'The vault storage could not be reached: try again shortly.')

/** Catches what its children throw while rendering, keeping the very thrown value for the test. */
export class CatchingBoundary extends Component<{ caught: unknown[], children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override componentDidCatch(err: Error, _info: ErrorInfo) { this.props.caught.push(err) }
  override render() { return this.state.failed ? <span data-testid="state">boundary</span> : this.props.children }
}


/** React reports a boundary-caught render error on the console; the suite stays quiet about it. */
export const hushConsole = () => vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ })

/**
 * A world whose vault already holds `anthropic_api_key`, made on another device under the
 * passphrase 'pw', so the provider finds it locked; and a way to mount the provider over it
 * with a grabber, whose vault the test calls itself.
 */
export const lockedWorld = async () => {
  const world = makeWorld()
  const maker = await TH.settledVault({ ...world.props, deviceDB: memoryDeviceDB(), userId: 'u1', vaultlabel: 'main' })
  await maker.unlock('pw')
  await maker.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-fake')
  TH.closeVault(maker)
  const grab = grabber()
  const tree = (userId: string | null, keyDeriver: KeyDeriver = TH.testDeriver) => (
    <BankProvider {...world.props} keyDeriver={keyDeriver} userId={userId}><grab.Grab /></BankProvider>
  )
  return { ...world, ...grab, tree }
}

/** A promise's outcome so far, read without waiting on it: 'pending' until it settles; `settled` is the promise itself. */
export const watched = <ResultT,>(promise: Promise<ResultT>) => {
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
export const providerOf = (world: ReturnType<typeof makeWorld>, sinks: Partial<Pick<BankProviderProps, 'logger' | 'clock' | 'strengthChecker'>>) => (
  <BankProvider {...world.props} userId="u1" {...sinks}><Probe /></BankProvider>
)

/** Advice on a passphrase being chosen: a word until it is twelve characters or more. */
export const twelveOrMore = (typed: string) => (typed.length < 12 ? 'Twelve characters or more, please.' : null)

/** useVault's @example, as a host would write it. */
export const VaultExample = () => {
  const entry = useVault('main')
  if (entry === null || entry.status === 'starting') { return <p>Opening your vault…</p> }
  if (entry.vault === null) { return <p>{"Can't open your vault: "}{entry.err?.message}</p> }
  const { vault } = entry
  return <button onClick={() => { void vault.lock() }}>Lock</button>
}

/** useVaultSnapshot's @example, as a host would write it. */
export const BoxCount = () => {
  const snapshot = useVaultSnapshot('main')
  if (snapshot === null) { return <p>Opening your vault…</p> }
  return <p>{snapshot.boxes.length} keys stored</p>
}

/** Counts the calls a world's stores hear that a vault's birth makes: the storage watch, the ensure of the vault, the device record read. */
export const countStoreCalls = (world: { vaultDB: VaultDB, deviceDB: DeviceDB }) => {
  const subscribe = vi.spyOn(world.vaultDB, 'subscribe')
  const ensureVault = vi.spyOn(world.vaultDB, 'ensureVault')
  const getDeviceRecord = vi.spyOn(world.deviceDB, 'getDeviceRecord')
  return () => ({ subscribe: subscribe.mock.calls.length, ensureVault: ensureVault.mock.calls.length, getDeviceRecord: getDeviceRecord.mock.calls.length })
}

/** Stands in for a function a test replaces before it is called. */
export const noop = () => { /* replaced before use */ }
// --
