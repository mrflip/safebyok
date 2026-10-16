/**
 * safebyok-react's test helpers: everything `safebyok/testing` has, a fake WebAuthn
 * authenticator, and a render that hears what React reports. Star-import it as `TH`
 * (`import * as TH from './test-helpers'`).
 */
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { vi } from 'vitest'
import { ForcePassphraseReentryHours, type UnlockSummary, type Vault, type VaultState } from 'safebyok'
import { fromB64, toB64 } from 'safebyok/utils'

export * from 'safebyok/testing'

/**
 * `ui` rendered as Testing Library's `render` does, and `reported`: each error a boundary caught,
 * the very value thrown, as React hands it to the root's `onCaughtError` -- where a host's error
 * tracker hears it, and which otherwise writes it to the console.
 *
 * @example
 *   const { reported } = TH.renderReporting(<PassphraseModal vault={vault} onDone={noop} />)
 *   await waitFor(() => { expect(reported).to.have.lengthOf(1) })
 */
export const renderReporting = (ui: ReactElement) => {
  const reported: unknown[] = []
  const rendered = render(ui, { onCaughtError: (err) => { reported.push(err) } })
  return { ...rendered, reported }
}

/** What a stub's subscribe hands back: there was never anything to hear. */
const unsubscribeFromNothing = () => { /* nothing ever changes */ }

/** What a {@link stubVault} is made of: each part a test leaves out takes the stub's default. */
export type StubVaultOpts = {
  state?:           VaultState
  unlocks?:         UnlockSummary[]
  reentryWindowMs?: number
  unlock?:          Vault['unlock']
  destroy?:         Vault['destroy']
}

/** The window, in milliseconds, of a vault opened with the default forcePassphraseReentryHours. */
export const DefaultWindowMs = ForcePassphraseReentryHours * 3_600_000

/**
 * Just enough of a Vault for a component to render it: a snapshot that keeps its identity and
 * never changes (`state`, default 'locked'; `unlocks`, default none), a window (default seven
 * days), a subscribe that never calls back, and whichever calls the test hands it.
 *
 * @example const vault = TH.stubVault({ state: 'absent' })
 * @example const vault = TH.stubVault({ unlock: () => Promise.reject(new VaultError('wrong_passphrase', 'Not that one.')) })
 */
export const stubVault = (opts: StubVaultOpts = {}): Vault => {
  const snapshot = { state: opts.state ?? 'locked', unlocks: opts.unlocks ?? [] }
  return {
    getSnapshot:     () => snapshot,
    subscribe:       () => unsubscribeFromNothing,
    reentryWindowMs: opts.reentryWindowMs ?? DefaultWindowMs,
    unlock:          opts.unlock,
    destroy:         opts.destroy,
  } as unknown as Vault
}

/** How the fake authenticator behaves: whether it offers PRF at all, and whether it answers as it makes a passkey. */
export type FakeAuthenticatorOpts = { prf?: boolean, prfAtCreate?: boolean }

/** A credential as the fake hands it back: just what the helper reads of a PublicKeyCredential. */
type FakeCredential = { type: 'public-key', id: string, rawId: ArrayBuffer, getClientExtensionResults: () => AuthenticationExtensionsClientOutputs }

/** HMAC-SHA256 of `saltBytes` under `secretBytes`: the fake's PRF, as hmac-secret's is in spirit. */
const prfOf = async (secretBytes: Uint8Array<ArrayBuffer>, saltBytes: BufferSource): Promise<ArrayBuffer> => {
  const hmacKey = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return await crypto.subtle.sign('HMAC', hmacKey, saltBytes)
}

/** `source`'s bytes as base64url, whichever kind of buffer it is. */
const b64Of = (source: BufferSource): string => (
  toB64(ArrayBuffer.isView(source) ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength) : new Uint8Array(source))
)

/**
 * A fake WebAuthn authenticator, installed as `navigator.credentials` and `PublicKeyCredential`
 * for the test, in place of a real one: it makes passkeys, each with a random secret, and answers
 * a PRF request with HMAC-SHA256 of the salt under that secret -- the same answer for the same
 * passkey and salt, as a real one gives. `get` answers with the first offered passkey it holds,
 * or the one `touch` names. `refuseNext` makes its next call throw a DOMException of that name, as
 * a browser does when the user dismisses it. `calls` keeps every options object it was handed.
 * `uninstall` puts the globals back, as {@link uninstallFakeAuthenticator} does.
 *
 * @example const authenticator = TH.installFakeAuthenticator()
 * @example const authenticator = TH.installFakeAuthenticator({ prfAtCreate: false })  // answers only when asked again
 * @example const authenticator = TH.installFakeAuthenticator({ prf: false })         // no PRF extension
 */
export const installFakeAuthenticator = (opts: FakeAuthenticatorOpts = {}) => {
  const offersPrf = opts.prf ?? true
  const prfAtCreate = opts.prfAtCreate ?? true
  const secrets = new Map<string, Uint8Array<ArrayBuffer>>()
  const madeIds: string[] = []
  const calls = { create: [] as CredentialCreationOptions[], get: [] as CredentialRequestOptions[] }
  let refusal: string | null = null
  let touched: string | null = null

  const credentialOf = (rawId: Uint8Array<ArrayBuffer>, prf: AuthenticationExtensionsPRFOutputs | undefined): FakeCredential => ({
    type:                      'public-key',
    id:                        toB64(rawId),
    rawId:                     rawId.buffer,
    getClientExtensionResults: () => (prf === undefined ? {} : { prf }),
  })
  const refuseIfTold = () => {
    if (refusal === null) { return }
    const errname = refusal
    refusal = null
    throw new DOMException('The fake authenticator refused, as told.', errname)
  }

  const create = async (options: CredentialCreationOptions): Promise<FakeCredential> => {
    calls.create.push(options)
    refuseIfTold()
    const rawId = crypto.getRandomValues(new Uint8Array(16))
    const secretBytes = crypto.getRandomValues(new Uint8Array(32))
    secrets.set(toB64(rawId), secretBytes)
    madeIds.push(toB64(rawId))
    if (! offersPrf) { return credentialOf(rawId, undefined) }
    const salt = options.publicKey?.extensions?.prf?.eval?.first
    if (! prfAtCreate || salt === undefined) { return credentialOf(rawId, { enabled: true }) }
    return credentialOf(rawId, { enabled: true, results: { first: await prfOf(secretBytes, salt) } })
  }

  const get = async (options: CredentialRequestOptions): Promise<FakeCredential> => {
    calls.get.push(options)
    refuseIfTold()
    const offered = (options.publicKey?.allowCredentials ?? []).map((descriptor) => b64Of(descriptor.id))
    const credentialId = offered.find((candidate) => secrets.has(candidate) && (touched === null || candidate === touched))
    const secretBytes = credentialId === undefined ? undefined : secrets.get(credentialId)
    if (credentialId === undefined || secretBytes === undefined) { throw new DOMException('None of these passkeys is here.', 'NotAllowedError') }
    const rawId = fromB64(credentialId) as Uint8Array<ArrayBuffer>
    const prf = options.publicKey?.extensions?.prf
    const salt = prf?.evalByCredential?.[credentialId]?.first ?? prf?.eval?.first
    if (! offersPrf || salt === undefined) { return credentialOf(rawId, undefined) }
    return credentialOf(rawId, { results: { first: await prfOf(secretBytes, salt) } })
  }

  vi.stubGlobal('PublicKeyCredential', FakePublicKeyCredential)
  Object.defineProperty(navigator, 'credentials', { value: { create, get }, configurable: true })
  return {
    calls,
    /** The credential ids (base64url) of every passkey the fake holds, made or not. */
    credentialIds: () => [...madeIds],
    /** Make the next call throw a DOMException named `errname`: `NotAllowedError` is a dismissal. */
    refuseNext:    (errname: string) => { refusal = errname },
    /** Answer the next `get`s with this credential (base64url id) only, as the user touching it. */
    touch:         (credentialId: string) => { touched = credentialId },
    uninstall:     uninstallFakeAuthenticator,
  }
}

/** Stands in for the browser's PublicKeyCredential, whose presence says the browser offers WebAuthn. */
class FakePublicKeyCredential {
  readonly type = 'public-key'
}

/**
 * Put back the globals {@link installFakeAuthenticator} replaced: the browser has no WebAuthn
 * again. Safe to call when none is installed, so a test file can run it after every test.
 *
 * @example afterEach(TH.uninstallFakeAuthenticator)
 */
export const uninstallFakeAuthenticator = () => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'credentials')
}
