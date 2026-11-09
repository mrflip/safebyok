/** safebyok-react's test helpers: everything `safebyok/testing` has, a provider over a bank world, a render that hears what React reports, a promise pending until the test settles it, and a way to have Suspense hide what it renders.
 * Those that need JSX are in `test-helpers-react.tsx`, which it re-exports. Star-import it as `TH` (`import * as TH from './test-helpers'`).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Component, createElement, use, type ReactElement, type ReactNode } from 'react'
import { expect, onTestFinished, vi } from 'vitest'
import { MemoryDeviceDB, type AnyGating, type Bank, type BankOpts, type Gatingkind, type Outcome, type PasskeyAnswer, type RequestCleartext, type Vault } from 'safebyok'
import { Passphrase, VaultScopeGiven, anyStrengthChecker, passkeyOf, quietLogger, testDeriver, useBankWorlds, type BankWorld } from 'safebyok/testing'
import { fromB64, toB64 } from 'safebyok/utils'
import type { BankProviderProps, PassphraseGating } from '../src/shapes'

export * from 'safebyok/testing'
export * from './test-helpers-react'

/** Sweep every bank a test made, after it: `useBankWorlds`, named so React's hook rules do not take it for a hook. */
export const sweepBankWorlds = useBankWorlds

// == [Rendering]: renderReporting, Catcher, makePending, Hider

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
export const makePending = <ValT = undefined>() => {
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

/** A device_id for a test that writes one into a record by hand. */
export const DeviceId = '00000000-0000-4000-8000-0000000000c1'

/** A BankProvider's props over `world`'s vaultDB, signed in as the world's user, with a deviceDB of its own, so a vault the world's bank built is locked to the provider's.
 *
 * @example
 *   const world = TH.makeBankWorld()
 *   render(<BankProvider {...TH.providerPropsOf(world)}><Shows /></BankProvider>)
 */
export const providerPropsOf = (world: BankWorld, overrides: Partial<Omit<BankProviderProps, 'children'>> = {}): Omit<BankProviderProps, 'children'> => ({
  applabel: 'acme', user_id: 'u1', vaultDB: world.vaultDB, deviceDB: new MemoryDeviceDB(),
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

// == [Open gatings]: addPasskeyTo, openGatingOf, building, unlocking, replacing, deleting, addingPasskey, revokingPasskey, passphraseGatingOf, gatingOfKind

/** Add a passkey to `vault`, a vault of `world`'s own bank, as its user would at the dialog: `passkeyClear`, or the passkey `passkeyOf('laptop')` makes.
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

/** What a test hands `createPasskey`: a relying party and a user, as a host would name them. */
export const PasskeyMaking = { rp: { name: 'Acme' }, user: { name: 'u1 (main vault)', displayName: 'u1' } }

/** The gating `raise` opens on a fresh bank over `world`'s vaultDB, on another device, kept open until it concludes or the test calls `close`, as a host's requestCleartext keeps it open while its dialog shows; and `raising`, the outcome of `raise`.
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

/** What opens a `build_vault` gating on a bank whose vault is not built. */
export const building = (bank: Bank) => bank.tryEnsureVault(VaultScopeGiven)

/** What opens an `unlock_vault` gating on a bank whose vault is built and locked on its device. */
export const unlocking = async (bank: Bank) => {
  const vault = await bank.ensureVault(VaultScopeGiven)
  return vault.tryEnsureUnlocked()
}

/** What opens a `replace_passphrase` gating on a bank whose vault is built, locked or not. */
export const replacing = async (bank: Bank) => {
  const vault = await bank.ensureVault(VaultScopeGiven)
  return vault.tryReplacePassphrasePrompt()
}

/** What opens a `del_vault` gating on a bank whose vault is built, locked or not. */
export const deleting = async (bank: Bank) => {
  const vault = await bank.ensureVault(VaultScopeGiven)
  return vault.tryDelVaultPrompt()
}

/** What opens an `add_passkey` gating on a bank whose vault is built and has no passkey. */
export const addingPasskey = async (bank: Bank) => {
  const vault = await bank.ensureVault(VaultScopeGiven)
  return vault.tryAddPasskeyPrompt()
}

/** What opens a `revoke_passkey` gating on a bank whose vault is built and has a passkey. */
export const revokingPasskey = async (bank: Bank) => {
  const vault = await bank.ensureVault(VaultScopeGiven)
  return vault.tryRevokePasskeyPrompt()
}

/** `gating`, which the test knows to be of `gatingkind`. */
export const gatingOfKind = <KindT extends Gatingkind>(gating: AnyGating, gatingkind: KindT): Extract<AnyGating, { gatingkind: KindT }> => {
  const isOfKind = (some: AnyGating): some is Extract<AnyGating, { gatingkind: KindT }> => some.gatingkind === gatingkind
  if (isOfKind(gating)) { return gating }
  throw new Error(`not a ${gatingkind} gating: ${gating.gatingkind}`)
}

/** `gating`, which the test knows to be a `build_vault` or `unlock_vault` one. */
export const passphraseGatingOf = (gating: AnyGating): PassphraseGating => {
  if (gating.gatingkind === 'build_vault' || gating.gatingkind === 'unlock_vault') { return gating }
  throw new Error(`not a passphrase gating: ${gating.gatingkind}`)
}
// --

// == [Typing in the dialog]: submitPassphrase, submitNewPassphrase, submitReplacement, submitDeletion, submitPasskeyAdd, submitPasskeyRevoke

/** Types the passphrase in the dialog and presses Unlock. */
export const submitPassphrase = (passphrase: string) => {
  fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByText('Unlock'))
}

/** Presses the button that says `word` once the strength checker and the confirmation have enabled it. */
const pressOnceEnabled = async (word: string) => {
  await waitFor(() => { expect(screen.getByText<HTMLButtonElement>(word).disabled).to.be.false })
  fireEvent.click(screen.getByText(word))
}

/** Types a first passphrase and its confirmation, and presses Create vault once it can be. */
export const submitNewPassphrase = async (passphrase: string) => {
  fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.change(screen.getByPlaceholderText('confirm vault passphrase'), { target: { value: passphrase } })
  await pressOnceEnabled('Create vault')
}

/** Types the passphrase in use, a new one and its confirmation, and presses Change passphrase once it can be. */
export const submitReplacement = async (antePassphrase: string, nextPassphrase: string) => {
  fireEvent.change(screen.getByPlaceholderText('current passphrase'), { target: { value: antePassphrase } })
  fireEvent.change(screen.getByPlaceholderText('new passphrase'), { target: { value: nextPassphrase } })
  fireEvent.change(screen.getByPlaceholderText('confirm new passphrase'), { target: { value: nextPassphrase } })
  await pressOnceEnabled('Change passphrase')
}

/** Types the passphrase in the deletion dialog and presses Delete vault. */
export const submitDeletion = (passphrase: string) => {
  fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByText('Delete vault'))
}

/** Types the passphrase in the add-passkey dialog and presses Add passkey. */
export const submitPasskeyAdd = (passphrase: string) => {
  fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByText('Add passkey'))
}

/** Types the passphrase in the remove-passkey dialog and presses Remove passkey. */
export const submitPasskeyRevoke = (passphrase: string) => {
  fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByText('Remove passkey'))
}
// --

// == [Fake authenticator]: installFakeAuthenticator, FakeAuthenticatorOpts

/** How the fake authenticator behaves: whether it offers PRF at all, and whether it answers as it makes a passkey. */
export type FakeAuthenticatorOpts = { prf?: boolean, prfAtCreate?: boolean }

/** A WebAuthn authenticator for one test, as `navigator.credentials` and `PublicKeyCredential`: same passkey and salt, same answer.
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

  // Each call refuses as told, or waits as told, before it answers.
  const asTold = async () => {
    const [errname, waiting] = [refusal, waitingOn]
    refusal = null
    waitingOn = null
    if (waiting !== null) { await waiting }
    if (errname !== null) { throw new DOMException('The fake authenticator refused, as told.', errname) }
  }
  /** A credential as the fake hands it back: what the helpers read of a PublicKeyCredential. */
  type FakeCredential = { type: 'public-key', id: string, rawId: ArrayBuffer, getClientExtensionResults: () => AuthenticationExtensionsClientOutputs }
  // `prf` is what the PRF extension answers: null for none, and its answer over `salt`, if given.
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
    /** Every PRF answer the fake handed out, as the bytes it handed: what its caller should have zeroed once copied. */
    answersHanded: () => [...handed],
    /** Make the next call throw a DOMException named `errname`: `NotAllowedError` is a dismissal. */
    refuseNext: (errname: string) => { refusal = errname },
    /** Make the next call wait for `waiting` before it answers, as a user slow to touch the sensor. */
    answerNextAfter: (waiting: Promise<unknown>) => { waitingOn = waiting },
  }
}

/** Stands in for the browser's PublicKeyCredential, whose presence says the browser offers WebAuthn. */
class FakePublicKeyCredential {
  readonly type = 'public-key'
}

/** HMAC-SHA256 of `saltBytes` under `secretBytes`: the fake's PRF, as hmac-secret's is in spirit. */
const prfOf = async (secretBytes: Uint8Array<ArrayBuffer>, saltBytes: BufferSource): Promise<ArrayBuffer> => {
  const hmacKey = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', hmacKey, saltBytes)
}

/** `source`'s bytes as base64url, whichever kind of buffer it is. */
const b64Of = (source: BufferSource): string => (
  toB64(ArrayBuffer.isView(source) ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength) : new Uint8Array(source))
)
// --
