/** A fake WebAuthn authenticator, as `navigator.credentials`, and what a passkey test reads of the world's stored gate. */

import { onTestFinished, vi } from 'vitest'
import { type PasskeyWayinHeader, fromB64, toB64 } from 'safebyok'
import * as LeanTH from 'safebyok/testing'
import type { ProviderWorld } from './provider-world'

// == [Fake authenticator]: FakeAuthenticatorOpts, installFakeAuthenticator, FakePublicKeyCredential, prfOf, b64Of

/** Options for the fake authenticator.
 * - `prf`         -- false for an authenticator with no PRF extension (default: true)
 * - `prfAtCreate` -- false to return PRF output only on a later request, not when the passkey is created (default: true)
 */
export type FakeAuthenticatorOpts = { prf?: boolean, prfAtCreate?: boolean }

/** The options the kit's tests give `createPasskey` or a passkey form, which {@link installFakeAuthenticator}'s fake answers. */
export const PasskeyMaking = { rp: { name: 'Acme' }, user: { name: 'u1 (main vault)', displayName: 'u1' } }

/** Install a fake WebAuthn authenticator for one test, as `navigator.credentials` and `PublicKeyCredential`. The same passkey and salt always give the same answer.
 * @example const authenticator = TH.installFakeAuthenticator()
 * @example const authenticator = TH.installFakeAuthenticator({ prfAtCreate: false })  // answers only when asked again
 * @example const authenticator = TH.installFakeAuthenticator({ prf: false })         // no PRF extension
 */
export function installFakeAuthenticator(opts: FakeAuthenticatorOpts = {}) {
  const offersPrf = opts.prf ?? true
  const prfAtCreate = opts.prfAtCreate ?? true
  const secrets = new Map<string, Uint8Array<ArrayBuffer>>()
  const calls = { create: [] as CredentialCreationOptions[], get: [] as CredentialRequestOptions[] }
  const handed: Uint8Array[] = []
  let refusal: string | null = null

  // Before it responds, each call throws, if the test asked it to.
  function asTold(): void {
    const errname = refusal
    refusal = null
    if (errname !== null) { throw new DOMException('The fake authenticator refused, as told.', errname) }
  }
  /** A credential as the fake returns it: only the parts of a PublicKeyCredential that the helpers read. */
  type FakeCredential = { type: 'public-key', id: string, rawId: ArrayBuffer, getClientExtensionResults: () => AuthenticationExtensionsClientOutputs }
  // `prf` describes the PRF extension's result: null for no result at all, otherwise an output computed over `salt` when one is given.
  async function credentialOf(credential_id: string, prf: { enabled?: true, salt: BufferSource | undefined } | null): Promise<FakeCredential> {
    const answered: AuthenticationExtensionsPRFOutputs = { ...(prf?.enabled && { enabled: true }) }
    if (prf?.salt !== undefined) {
      const first = new Uint8Array(await prfOf(secrets.get(credential_id)!, prf.salt))
      handed.push(first)
      answered.results = { first }
    }
    const extensions = (prf === null) ? {} : { prf: answered }
    return { type: 'public-key', id: credential_id, rawId: (fromB64(credential_id) as Uint8Array<ArrayBuffer>).buffer, getClientExtensionResults: () => extensions }
  }

  const create = async (options: CredentialCreationOptions): Promise<FakeCredential> => {
    calls.create.push(options)
    asTold()
    const credential_id = toB64(crypto.getRandomValues(new Uint8Array(16)))
    secrets.set(credential_id, crypto.getRandomValues(new Uint8Array(32)))
    if (! offersPrf) { return credentialOf(credential_id, null) }
    return credentialOf(credential_id, { enabled: true, salt: prfAtCreate ? options.publicKey?.extensions?.prf?.eval?.first : undefined })
  }

  const get = async (options: CredentialRequestOptions): Promise<FakeCredential> => {
    calls.get.push(options)
    asTold()
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
  }
}

/** A stand-in for the browser's PublicKeyCredential. Its presence is how code detects WebAuthn support. */
class FakePublicKeyCredential {
  readonly type = 'public-key'
}

/** HMAC-SHA256 of `saltBytes` keyed by `secretBytes`: the fake's PRF, similar in spirit to hmac-secret. */
async function prfOf(secretBytes: Uint8Array<ArrayBuffer>, saltBytes: BufferSource): Promise<ArrayBuffer> {
  const hmacKey = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', hmacKey, saltBytes)
}

/** `source`'s bytes as base64url, for either kind of BufferSource. */
function b64Of(source: BufferSource): string {
  return toB64(ArrayBuffer.isView(source) ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength) : new Uint8Array(source))
}
// --

// == [The stored gate]: _cheat_passkeyHeaderOf

/** The header of the passkey stored on the world's gate, or null for none, as another device over its vaultDB reads it. */
export async function _cheat_passkeyHeaderOf(world: ProviderWorld): Promise<PasskeyWayinHeader | null> {
  const device = LeanTH.makeDevice({}, { vaultDB: world.vaultDB })
  await device.signin(LeanTH.WorldScope.userid)
  return (device.bank!.gate.passkey0?.toJSON() as PasskeyWayinHeader | undefined) ?? null
}
// --
