/**
 * safebyok-react's test helpers: everything `safebyok/testing` has, a provider over a bank world,
 * a render that hears what React reports, a promise held for the test to settle, and a way to have
 * Suspense hide what it holds. Those that need JSX are in `test-helpers-react.tsx`, which it
 * re-exports. Star-import it as `TH` (`import * as TH from './test-helpers'`).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { Component, createElement, use, type ReactElement, type ReactNode } from 'react'
import { onTestFinished } from 'vitest'
import { MemoryDeviceDB, type AnyGating, type Bank, type BankOpts, type Outcome, type RequestCleartext } from 'safebyok'
import { VaultScopeGiven, anyStrengthChecker, quietLogger, testDeriver, useBankWorlds, type BankWorld } from 'safebyok/testing'
import type { BankProviderProps } from '../src/bank-provider'
import type { PassphraseGating } from '../src/passphrase-modal'

export * from 'safebyok/testing'
export * from './test-helpers-react'

/** Sweep every bank a test made, after it: `useBankWorlds`, named so React's hook rules do not take it for a hook. */
export const sweepBankWorlds = useBankWorlds

// == [Rendering]: renderReporting, Catcher, held, Hider

/** `ui` rendered as Testing Library's `render` does, and `reported`: each error a boundary caught, as React hands it to `onCaughtError`. */
export const renderReporting = (ui: ReactElement) => {
  const reported: unknown[] = []
  const rendered = render(ui, { onCaughtError: (err) => { reported.push(err) } })
  return { ...rendered, reported }
}

/** An error boundary that shows `caught: <message>` for what it caught, as a host's would. */
export class Catcher extends Component<{ children: ReactNode }, { caught: string | null }> {
  override state = { caught: null as string | null }
  static getDerivedStateFromError(err: unknown) { return { caught: err instanceof Error ? err.message : 'not an Error' } }
  override render() { return this.state.caught === null ? this.props.children : createElement('p', null, `caught: ${this.state.caught}`) }
}

const unsettled = () => { /* replaced before the promise's executor returns */ }

/** A promise and the functions that settle it, for the test to settle when it chooses. */
export const held = <ValT = undefined>() => {
  let resolve: (val: ValT) => void = unsettled
  let reject: (err: unknown) => void = unsettled
  const promise = new Promise<ValT>((resolver, rejecter) => {
    resolve = resolver
    reject = rejecter
  })
  return { promise, resolve, reject }
}

/** Suspends the Suspense boundary around it while `hiding` is pending, and renders nothing; null suspends nothing. */
export const Hider = ({ hiding }: { hiding: Promise<unknown> | null }) => {
  if (hiding !== null) { use(hiding) }
  return null
}
// --

// == [Provider world]: DeviceId, providerPropsOf, withoutGesture

/** The device_id of the provider's bank in these tests. */
export const DeviceId = '00000000-0000-4000-8000-0000000000c1'

/**
 * A BankProvider's props over `world`'s vaultDB, signed in as the world's user, with a deviceDB of
 * its own, so a vault the world's bank built is locked to the provider's.
 *
 * @example
 *   const world = TH.makeBankWorld()
 *   render(<BankProvider {...TH.providerPropsOf(world)}><Shows /></BankProvider>)
 */
export const providerPropsOf = (world: BankWorld, overrides: Partial<Omit<BankProviderProps, 'children'>> = {}): Omit<BankProviderProps, 'children'> => ({
  applabel: 'acme', user_id: 'u1', device_id: DeviceId, vaultDB: world.vaultDB, deviceDB: new MemoryDeviceDB(),
  keyDeriver: testDeriver, strengthChecker: anyStrengthChecker, logger: quietLogger, ...overrides,
})

/** From here until the test ends, the browser says the user's gesture is spent, as after a timer or a fetch. */
export const withoutGesture = () => {
  const own = Object.getOwnPropertyDescriptor(navigator, 'userActivation')
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: false, hasBeenActive: true } })
  onTestFinished(() => {
    if (own === undefined) { Reflect.deleteProperty(navigator, 'userActivation') } else { Object.defineProperty(navigator, 'userActivation', own) }
  })
}
// --

// == [Held gatings]: heldGatingOf, building, unlocking, passphraseGatingOf

/**
 * The gating `raise` opens on a fresh bank over `world`'s vaultDB, on another device, held open
 * until it settles or the test calls `close`, as a host's requestCleartext holds it while its
 * dialog shows; and `raising`, the outcome of `raise`.
 *
 * @example
 *   await TH.makeBankWithVault(world)
 *   const { gating, raising, close } = await TH.heldGatingOf(world, TH.unlocking)
 */
export const heldGatingOf = async (world: BankWorld, raise: (bank: Bank) => Promise<Outcome<unknown>>, overrides: Partial<BankOpts> = {}) => {
  const handed = held<AnyGating>()
  const closing = held()
  const requestCleartext: RequestCleartext = async (gating) => {
    handed.resolve(gating)
    await Promise.race([gating.whenSettled, closing.promise])
  }
  const bank = world.bankOnAnotherDevice({ requestCleartext, ...overrides })
  await bank.hello()
  const raising = raise(bank)
  const unasked = (async () => { throw new Error(`settled with nobody asked: ${JSON.stringify(await raising)}`) })()
  const gating = await Promise.race([handed.promise, unasked])
  return { gating, raising, bank, close: () => { closing.resolve(undefined) } }
}

/** What opens a `build_vault` gating on a bank whose vault is not built. */
export const building = (bank: Bank) => bank.tryEnsureVault(VaultScopeGiven)

/** What opens an `unlock_vault` gating on a bank whose vault is built and locked on its device. */
export const unlocking = async (bank: Bank) => {
  const vault = await bank.ensureVault(VaultScopeGiven)
  return vault.tryEnsureUnlocked()
}

/** `gating`, which the test knows to be a `build_vault` or `unlock_vault` one. */
export const passphraseGatingOf = (gating: AnyGating): PassphraseGating => {
  if (gating.gatingkind === 'build_vault' || gating.gatingkind === 'unlock_vault') { return gating }
  throw new Error(`not a passphrase gating: ${gating.gatingkind}`)
}
// --

// == [Typing in the dialog]: submitPassphrase, submitNewPassphrase

/** Types the passphrase in the dialog and presses Unlock. */
export const submitPassphrase = (passphrase: string) => {
  fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByText('Unlock'))
}

/** Types a first passphrase and its confirmation, `confirming` if given, and presses Create vault. */
export const submitNewPassphrase = (passphrase: string, confirming: string = passphrase) => {
  fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.change(screen.getByPlaceholderText('confirm vault passphrase'), { target: { value: confirming } })
  fireEvent.click(screen.getByText('Create vault'))
}
// --
