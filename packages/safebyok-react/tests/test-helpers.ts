/** safebyok-react's test helpers. This file re-exports everything in `safebyok/testing`, and adds helpers for
 * rendering, open gatings, typing in the dialogs, and a fake authenticator.
 * Helpers that need JSX are in `test-helpers-react.tsx`, re-exported here. Star-import this file as `TH` (`import * as TH from './test-helpers'`).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Component, createElement, use, type ReactElement, type ReactNode } from 'react'
import { expect, onTestFinished, vi } from 'vitest'
import { MemoryDeviceDB, type AnyGating, type Bank, type BankOpts, type Gating, type Gatingkind, type Outcome, type PasskeyAnswer, type RequestCleartext, type Vault } from 'safebyok'
import { Passphrase, VaultScopeGiven, anyStrengthChecker, passkeyOf, quietLogger, testDeriver, useBankWorlds, type BankWorld } from 'safebyok/testing'
import { fromB64, toB64 } from 'safebyok/utils'
import type { BankProviderProps, PassphraseGating } from '../src/shapes'

export * from 'safebyok/testing'
export * from './test-helpers-react'

/** Sweep every bank a test made, once the test ends. This is `useBankWorlds`, under a name that React's hook lint does not mistake for a hook. */
export const sweepBankWorlds = useBankWorlds

// == [Rendering]: renderReporting, Catcher, makePending, Hider

/** Render `ui` as Testing Library's `render` does, and also return `reported`: every error a boundary caught, as React passed it to `onCaughtError`. */
export const renderReporting = (ui: ReactElement) => {
  const reported: unknown[] = []
  const rendered = render(ui, { onCaughtError: (err) => { reported.push(err) } })
  return { ...rendered, reported }
}

/** An error boundary that shows `caught: <message>` for the error it caught, like a host's own boundary. */
export class Catcher extends Component<{ children: ReactNode }, { caught: string | null }> {
  override state = { caught: null as string | null }
  static getDerivedStateFromError(err: unknown) { return { caught: err instanceof Error ? err.message : 'not an Error' } }
  override render() { return this.state.caught === null ? this.props.children : createElement('p', null, `caught: ${this.state.caught}`) }
}

const unsettled = () => { /* replaced before the promise's executor returns */ }

/** Return a promise with its `resolve` and `reject`, so the test can settle it when it chooses. */
export const makePending = <ValT = undefined>() => {
  let resolve: (val: ValT) => void = unsettled
  let reject: (err: unknown) => void = unsettled
  const promise = new Promise<ValT>((resolver, rejecter) => {
    resolve = resolver
    reject = rejecter
  })
  return { promise, resolve, reject }
}

/** Suspend the Suspense boundary around it while `hiding` is pending, and render nothing. A null `hiding` suspends nothing. */
export const Hider = ({ hiding }: { hiding: Promise<unknown> | null }) => {
  if (hiding !== null) { use(hiding) }
  return null
}
// --

// == [Provider world]: DeviceId, providerPropsOf, withoutGesture

/** A device_id for tests that write one into a record by hand. */
export const DeviceId = '00000000-0000-4000-8000-0000000000c1'

/** Return BankProvider props that use `world`'s vaultDB and user, with a new deviceDB. A vault the world's bank built is therefore locked for the provider's bank.
 *
 * @example
 *   const world = TH.makeBankWorld()
 *   render(<BankProvider {...TH.providerPropsOf(world)}><Shows /></BankProvider>)
 */
export const providerPropsOf = (world: BankWorld, overrides: Partial<Omit<BankProviderProps, 'children'>> = {}): Omit<BankProviderProps, 'children'> => ({
  applabel: 'acme', user_id: 'u1', vaultDB: world.vaultDB, deviceDB: new MemoryDeviceDB(),
  keyDeriver: testDeriver, strengthChecker: anyStrengthChecker, logger: quietLogger, ...overrides,
})

/** Make the browser report no active user gesture until the test ends, as it would after a timer or a fetch. */
export const withoutGesture = () => {
  const own = Object.getOwnPropertyDescriptor(navigator, 'userActivation')
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: false, hasBeenActive: true } })
  onTestFinished(() => {
    if (own === undefined) { Reflect.deleteProperty(navigator, 'userActivation') } else { Object.defineProperty(navigator, 'userActivation', own) }
  })
}
// --

// == [Open gatings]: addPasskeyTo, openGatingOf, building, unlocking, replacing, deleting, addingPasskey, revokingPasskey, passphraseGatingOf, gatingOfKind, attemptsOf

/** Add a passkey to `vault`, which belongs to `world`'s own bank, the way a user would in the dialog.
 * Uses `passkeyClear`, or the passkey from `passkeyOf('laptop')` when none is given.
 *
 * @example await TH.addPasskeyTo(world, vault, await createPasskey(TH.PasskeyMaking))  // one the fake authenticator has
 */
export const addPasskeyTo = async (world: BankWorld, vault: Vault, passkeyClear?: PasskeyAnswer | null) => {
  const { typing } = world.dialog
  world.dialog.typing = { passphraseClear: Passphrase, passkeyClear: passkeyClear ?? await passkeyOf('laptop') }
  try {
    await vault.addPasskeyPrompt()
  } finally {
    world.dialog.typing = typing
  }
}

/** `createPasskey` options for tests: a relying party and a user, named as a host would name them. */
export const PasskeyMaking = { rp: { name: 'Acme' }, user: { name: 'u1 (main vault)', displayName: 'u1' } }

/** Call `raise` on a new bank, on another device, over `world`'s vaultDB, and return the gating it opens.
 * The gating stays open until it concludes or the test calls `close`, as it would while a host's dialog is showing. `raising` is the pending outcome of `raise`.
 *
 * @example
 *   await TH.makeBankWithVault(world)
 *   const { gating, raising, close } = await TH.openGatingOf(world, TH.unlocking)
 */
export const openGatingOf = async (world: BankWorld, raise: (bank: Bank) => Promise<Outcome<unknown>>, overrides: Partial<BankOpts> = {}) => {
  const handed = makePending<AnyGating>()
  const closing = makePending()
  const requestCleartext: RequestCleartext = async (gating) => {
    handed.resolve(gating)
    await Promise.race([gating.whenConcluded, closing.promise])
  }
  const bank = world.bankOnAnotherDevice({ requestCleartext, ...overrides })
  await bank.hello()
  const raising = raise(bank)
  const unasked = (async () => { throw new Error(`settled with nobody asked: ${JSON.stringify(await raising)}`) })()
  const gating = await Promise.race([handed.promise, unasked])
  return { gating, raising, bank, close: () => { closing.resolve(undefined) } }
}

/** Open a `build_vault` gating on a bank whose vault is not built yet. */
export const building = (bank: Bank) => bank.tryEnsureVault(VaultScopeGiven)

/** Open an `unlock_vault` gating on a bank whose vault is built and locked on its device. */
export const unlocking = async (bank: Bank) => {
  const vault = await bank.ensureVault(VaultScopeGiven)
  return vault.tryEnsureUnlocked()
}

/** Open a `replace_passphrase` gating on a bank whose vault is built, locked or not. */
export const replacing = async (bank: Bank) => {
  const vault = await bank.ensureVault(VaultScopeGiven)
  return vault.tryReplacePassphrasePrompt()
}

/** Open a `del_vault` gating on a bank whose vault is built, locked or not. */
export const deleting = async (bank: Bank) => {
  const vault = await bank.ensureVault(VaultScopeGiven)
  return vault.tryDelVaultPrompt()
}

/** Open an `add_passkey` gating on a bank whose vault is built and has no passkey. */
export const addingPasskey = async (bank: Bank) => {
  const vault = await bank.ensureVault(VaultScopeGiven)
  return vault.tryAddPasskeyPrompt()
}

/** Open a `revoke_passkey` gating on a bank whose vault is built and has a passkey. */
export const revokingPasskey = async (bank: Bank) => {
  const vault = await bank.ensureVault(VaultScopeGiven)
  return vault.tryRevokePasskeyPrompt()
}

/** Return `gating`, typed as a gating of `gatingkind`. Throws if it is of another kind. */
export const gatingOfKind = <KindT extends Gatingkind>(gating: AnyGating, gatingkind: KindT): Extract<AnyGating, { gatingkind: KindT }> => {
  const isOfKind = (some: AnyGating): some is Extract<AnyGating, { gatingkind: KindT }> => some.gatingkind === gatingkind
  if (isOfKind(gating)) { return gating }
  throw new Error(`not a ${gatingkind} gating: ${gating.gatingkind}`)
}

/** Return `gating`, typed as a `build_vault` or `unlock_vault` gating. Throws if it is of another kind. */
export const passphraseGatingOf = (gating: AnyGating): PassphraseGating => {
  if (gating.gatingkind === 'build_vault' || gating.gatingkind === 'unlock_vault') { return gating }
  throw new Error(`not a passphrase gating: ${gating.gatingkind}`)
}

/** A spy on `gating.attempt`: a gating is frozen, so it goes on the prototype, and spies on every gating's attempt. */
export const attemptsOf = (gating: Gating) => vi.spyOn(Object.getPrototypeOf(gating) as Gating, 'attempt')
// --

// == [Typing in the dialog]: submitPassphrase, submitNewPassphrase, submitReplacement, submitDeletion, submitPasskeyAdd, submitPasskeyRevoke

/** Type the passphrase into the dialog and press Unlock. */
export const submitPassphrase = (passphrase: string) => {
  fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByText('Unlock'))
}

/** Press the button labelled `word`, once the strength checker and the confirmation have enabled it. */
const pressOnceEnabled = async (word: string) => {
  await waitFor(() => { expect(screen.getByText<HTMLButtonElement>(word).disabled).to.be.false })
  fireEvent.click(screen.getByText(word))
}

/** Type a new passphrase and its confirmation, and press Create vault once it is enabled. */
export const submitNewPassphrase = async (passphrase: string) => {
  fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.change(screen.getByPlaceholderText('confirm vault passphrase'), { target: { value: passphrase } })
  await pressOnceEnabled('Create vault')
}

/** Type the current passphrase, a new passphrase and its confirmation, and press Change passphrase once it is enabled. */
export const submitReplacement = async (antePassphrase: string, nextPassphrase: string) => {
  fireEvent.change(screen.getByPlaceholderText('current passphrase'), { target: { value: antePassphrase } })
  fireEvent.change(screen.getByPlaceholderText('new passphrase'), { target: { value: nextPassphrase } })
  fireEvent.change(screen.getByPlaceholderText('confirm new passphrase'), { target: { value: nextPassphrase } })
  await pressOnceEnabled('Change passphrase')
}

/** Type the passphrase into the deletion dialog and press Delete vault. */
export const submitDeletion = (passphrase: string) => {
  fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByText('Delete vault'))
}

/** Type the passphrase into the add-passkey dialog and press Add passkey. */
export const submitPasskeyAdd = (passphrase: string) => {
  fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByText('Add passkey'))
}

/** Type the passphrase into the remove-passkey dialog and press Remove passkey. */
export const submitPasskeyRevoke = (passphrase: string) => {
  fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByText('Remove passkey'))
}
// --

// == [Fake authenticator]: installFakeAuthenticator, FakeAuthenticatorOpts

/** Options for the fake authenticator.
 * - `prf`         -- false for an authenticator with no PRF extension (default: true)
 * - `prfAtCreate` -- false to return PRF output only on a later request, not when the passkey is created (default: true)
 */
export type FakeAuthenticatorOpts = { prf?: boolean, prfAtCreate?: boolean }

/** Install a fake WebAuthn authenticator for one test, as `navigator.credentials` and `PublicKeyCredential`. The same passkey and salt always give the same answer.
 *
 * @example const authenticator = TH.installFakeAuthenticator()
 * @example const authenticator = TH.installFakeAuthenticator({ prfAtCreate: false })  // answers only when asked again
 * @example const authenticator = TH.installFakeAuthenticator({ prf: false })         // no PRF extension
 */
export const installFakeAuthenticator = (opts: FakeAuthenticatorOpts = {}) => {
  const offersPrf = opts.prf ?? true
  const prfAtCreate = opts.prfAtCreate ?? true
  const secrets = new Map<string, Uint8Array<ArrayBuffer>>()
  const calls = { create: [] as CredentialCreationOptions[], get: [] as CredentialRequestOptions[] }
  const handed: Uint8Array[] = []
  let refusal: string | null = null
  let waitingOn: Promise<unknown> | null = null

  // Before it responds, each call first waits and then throws, if the test asked for either.
  const asTold = async () => {
    const [errname, waiting] = [refusal, waitingOn]
    refusal = null
    waitingOn = null
    if (waiting !== null) { await waiting }
    if (errname !== null) { throw new DOMException('The fake authenticator refused, as told.', errname) }
  }
  /** A credential as the fake returns it: only the parts of a PublicKeyCredential that the helpers read. */
  type FakeCredential = { type: 'public-key', id: string, rawId: ArrayBuffer, getClientExtensionResults: () => AuthenticationExtensionsClientOutputs }
  // `prf` describes the PRF extension's result: null for no result at all, otherwise an output computed over `salt` when one is given.
  const credentialOf = async (credential_id: string, prf: { enabled?: true, salt: BufferSource | undefined } | null): Promise<FakeCredential> => {
    const answered: AuthenticationExtensionsPRFOutputs = { ...(prf?.enabled && { enabled: true }) }
    if (prf?.salt !== undefined) {
      const first = new Uint8Array(await prfOf(secrets.get(credential_id)!, prf.salt))
      handed.push(first)
      answered.results = { first }
    }
    const extensions = prf === null ? {} : { prf: answered }
    return { type: 'public-key', id: credential_id, rawId: (fromB64(credential_id) as Uint8Array<ArrayBuffer>).buffer, getClientExtensionResults: () => extensions }
  }

  const create = async (options: CredentialCreationOptions): Promise<FakeCredential> => {
    calls.create.push(options)
    await asTold()
    const credential_id = toB64(crypto.getRandomValues(new Uint8Array(16)))
    secrets.set(credential_id, crypto.getRandomValues(new Uint8Array(32)))
    if (! offersPrf) { return credentialOf(credential_id, null) }
    return credentialOf(credential_id, { enabled: true, salt: prfAtCreate ? options.publicKey?.extensions?.prf?.eval?.first : undefined })
  }

  const get = async (options: CredentialRequestOptions): Promise<FakeCredential> => {
    calls.get.push(options)
    await asTold()
    const offered = (options.publicKey?.allowCredentials ?? []).map((descriptor) => b64Of(descriptor.id))
    const credential_id = offered.find((candidate) => secrets.has(candidate))
    if (credential_id === undefined) { throw new DOMException('None of these passkeys is here.', 'NotAllowedError') }
    if (! offersPrf) { return credentialOf(credential_id, null) }
    const prf = options.publicKey?.extensions?.prf
    return credentialOf(credential_id, { salt: prf?.evalByCredential?.[credential_id]?.first ?? prf?.eval?.first })
  }

  vi.stubGlobal('PublicKeyCredential', FakePublicKeyCredential)
  Object.defineProperty(navigator, 'credentials', { value: { create, get }, configurable: true })
  onTestFinished(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'credentials')
  })
  return {
    calls,
    /** The credential ids (base64url) of every passkey the fake has. */
    credentialIds: () => [...secrets.keys()],
    /** Every PRF output the fake returned, as the same byte arrays it returned. Whoever received them should have zeroed them after copying. */
    answersHanded: () => [...handed],
    /** Make the next call throw a DOMException named `errname`. `NotAllowedError` is what a dismissal throws. */
    refuseNext: (errname: string) => { refusal = errname },
    /** Make the next call wait for `waiting` before it responds, like a user who is slow to touch the sensor. */
    answerNextAfter: (waiting: Promise<unknown>) => { waitingOn = waiting },
  }
}

/** A stand-in for the browser's PublicKeyCredential. Its presence is how code detects WebAuthn support. */
class FakePublicKeyCredential {
  readonly type = 'public-key'
}

/** Return HMAC-SHA256 of `saltBytes` keyed by `secretBytes`. This is the fake's PRF, similar in spirit to hmac-secret. */
const prfOf = async (secretBytes: Uint8Array<ArrayBuffer>, saltBytes: BufferSource): Promise<ArrayBuffer> => {
  const hmacKey = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', hmacKey, saltBytes)
}

/** Return `source`'s bytes as base64url, for either kind of BufferSource. */
const b64Of = (source: BufferSource): string => (
  toB64(ArrayBuffer.isView(source) ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength) : new Uint8Array(source))
)
// --
