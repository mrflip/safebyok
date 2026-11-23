/** The passkey helpers: `createPasskey` makes a passkey and returns its answer, `askPasskey` asks the bank's passkey for its answer. */

import { Checkers, PasskeySaltSize, VaultError, fromB64, toB64, type PasskeyAnswer, type WayinHeader } from 'safebyok'
import { KitPhrases } from './phrases-kit'

// These passkeys are not used to sign in. Each is a fresh credential under a random user handle, with a random
// challenge, and no server checks the assertion. The part that matters is the PRF extension's output, which only
// the authenticator can produce, and only after the user's fingerprint, face or PIN. Every call requires user
// verification, because an authenticator gives a different PRF output without it.

// == [The helpers]: passkeysAvailable, createPasskey, askPasskey

/** True when this browser supports WebAuthn. Use it to decide whether to show a passkey button. */
export function passkeysAvailable(): boolean {
  return (typeof PublicKeyCredential === 'function') && (typeof navigator === 'object') && ('credentials' in navigator)
}

/** Create a new passkey and return its first answer. Returns null when the user dismisses the prompt.
 * Hand the answer to a form verb's `attempt` straight away: its gating copies the bytes and zeroes the answer's own.
 * @example
 *   const nextPasskeyAnswer = await createPasskey({ rp: { name: 'Acme' }, user: { name: email, displayName: fullName } })
 *   if (nextPasskeyAnswer !== null) { await addPasskey.attempt({ passphrase, nextPasskeyAnswer }) }
 */
export async function createPasskey(given: CreatePasskeyOpts): Promise<PasskeyAnswer | null> {
  const opts = PasskeyChecks.createPasskeyOpts.parse(given, { where: "In createPasskey's options" })
  demandWebAuthn()
  const prfSaltBytes = crypto.getRandomValues(new Uint8Array(PasskeySaltSize))
  const created = await askAuthenticator(() => navigator.credentials.create({
    publicKey: {
      rp:                     { name: opts.rp.name, ...optional('id', opts.rp.id) },
      // Use a random handle, never the host's own user id. An authenticator replaces any passkey it already has
      // for the same site and handle, which would overwrite the host's sign-in passkey.
      user:                   { ...opts.user, id: crypto.getRandomValues(new Uint8Array(16)) },
      challenge:              crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams:       [{ type: 'public-key', alg: -8 }, { type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'discouraged', userVerification: 'required' },
      ...optional('timeout', opts.timeout),
      extensions:             { prf: { eval: { first: prfSaltBytes } } },
    },
  }))
  if (created === null) { return null }
  const credential_id = toB64(new Uint8Array(created.rawId))
  const { prf } = created.getClientExtensionResults()
  if (prf?.results !== undefined) { return makePasskeyAnswer(credential_id, prfSaltBytes, prf.results.first) }
  if (prf?.enabled !== true) { throw noPrf() }
  // Many authenticators enable PRF when they create the passkey, but return its output only on a later request.
  const asked = await askAuthenticator(() => navigator.credentials.get({
    publicKey: {
      challenge:        crypto.getRandomValues(new Uint8Array(32)),
      ...optional('rpId', opts.rp.id),
      allowCredentials: [{ type: 'public-key', id: created.rawId }],
      userVerification: 'required',
      ...optional('timeout', opts.timeout),
      extensions:       { prf: { eval: { first: prfSaltBytes } } },
    },
  }))
  if (asked === null) { return null }
  const answer = asked.getClientExtensionResults().prf?.results?.first
  if (answer === undefined) { throw noPrf() }
  return makePasskeyAnswer(credential_id, prfSaltBytes, answer)
}

/** Ask the passkey named in `passkeyHeader` for its answer. Returns null when the user dismisses the prompt.
 * Refuses `absent_wayin` for a bank with no passkey, `passkeyHeader` null. Hand the answer to a form verb's `attempt` straight away.
 * @example
 *   const passkeyAnswer = await askPasskey(passkeyHeader, { rpId: 'example.com' })
 *   if (passkeyAnswer !== null) { await unlock.attempt({ passkeyAnswer }) }
 */
export async function askPasskey(passkeyHeader: WayinHeader | null, given: AskPasskeyOpts = {}): Promise<PasskeyAnswer | null> {
  const { passkeyHeader: header, opts } = PasskeyChecks.askPasskeyArgs.parse({ passkeyHeader, opts: given }, { where: "In askPasskey's arguments" })
  demandWebAuthn()
  if (header?.wayinkind !== 'passkey') { throw new VaultError('absent_wayin', KitPhrases.noPasskeyToAsk) }
  const { credential_id } = header
  const credentialBytes = credentialBytesOf(credential_id)
  const saltBytes = fromB64(header.prf_salt_b64) as Uint8Array<ArrayBuffer>
  const asked = await askAuthenticator(() => navigator.credentials.get({
    publicKey: {
      challenge:        crypto.getRandomValues(new Uint8Array(32)),
      ...optional('rpId', opts.rpId),
      allowCredentials: [{ type: 'public-key', id: credentialBytes }],
      userVerification: 'required',
      ...optional('timeout', opts.timeout),
      extensions:       { prf: { evalByCredential: { [credential_id]: { first: saltBytes } } } },
    },
  }))
  if (asked === null) { return null }
  const answer = asked.getClientExtensionResults().prf?.results?.first
  if (answer === undefined) { throw noPrf() }
  const passkeyCleartext = makePasskeyAnswer(credential_id, saltBytes, answer)
  // The browser should respond only with the credential it was asked for. A response from any other credential cannot unlock this vault.
  if (toB64(new Uint8Array(asked.rawId)) !== credential_id) {
    passkeyCleartext.prfBytes.fill(0)
    throw new VaultError('passkey_unavailable', KitPhrases.passkeyAskFailed)
  }
  return passkeyCleartext
}
// --

// == [Options]: CreatePasskeyOpts, AskPasskeyOpts, PasskeyChecks, isB64

/** Options for {@link createPasskey}: how the authenticator labels the new passkey. */
export type CreatePasskeyOpts = {
  /** The relying party: the `name` the authenticator shows, and the `id` (a domain) the passkey is tied to. */
  rp:       { name: string, id?: string | undefined }
  /** The account `name` and `displayName` the authenticator lists the passkey under. */
  user:     { name: string, displayName: string }
  /** Milliseconds the browser waits for the user. Defaults to the browser's own limit. */
  timeout?: number | undefined
}

/** Options for {@link askPasskey}. */
export type AskPasskeyOpts = {
  /** The relying-party id the passkey was created under. Defaults to the page's own domain. */
  rpId?:    string | undefined
  /** Milliseconds the browser waits for the user. Defaults to the browser's own limit. */
  timeout?: number | undefined
}

// The header's salt is checked as base64url here, the same check the core makes when it reads the vault.
// The core checks credential_id only as text, so one that is not base64url passes here and is refused
// later as a damaged record (credentialBytesOf).
/** Checkers for the arguments of the passkey helpers. */
const PasskeyChecks = Checkers('bad_record', ({ obj, discrim, lit, str, int }) => {
  const timeout = int.positive().optional()
  const named = str.min(1)
  const passphraseHeader = obj({ wayinkind: lit('passphrase') })
  const passkeyHeader = obj({ wayinkind: lit('passkey'), credential_id: named, prf_salt_b64: named.refine(isB64, 'Expected base64url text') })
  return {
    createPasskeyOpts: obj({
      rp:   obj({ name: named, id: named.optional() }).strict(),
      user: obj({ name: named, displayName: str }).strict(),
      timeout,
    }).strict(),
    askPasskeyArgs: obj({
      passkeyHeader: discrim('wayinkind', [passphraseHeader, passkeyHeader]).nullable(),
      opts:          obj({ rpId: named.optional(), timeout }).strict(),
    }),
  }
})

/** True when `text` is base64url. */
function isB64(text: string): boolean {
  try {
    fromB64(text)
    return true
  } catch {
    return false
  }
}
// --

// == [Helpers]: credentialBytesOf, makePasskeyAnswer, copyThenZero, optional, demandWebAuthn, noPrf, askAuthenticator

/** The bytes of `credential_id`, refusing one that is not base64url as a damaged record. */
function credentialBytesOf(credential_id: string): Uint8Array<ArrayBuffer> {
  try {
    return fromB64(credential_id) as Uint8Array<ArrayBuffer>
  } catch (err) {
    throw new VaultError('bad_record', "The vault's passkey is stored under a credential_id that is not base64url, so the browser cannot be asked for it.", { cause: err })
  }
}

/** The passkey answer of `credential_id` over `saltBytes`, its PRF bytes a copy of `answer`, which is zeroed. */
function makePasskeyAnswer(credential_id: string, saltBytes: Uint8Array, answer: BufferSource): PasskeyAnswer {
  return { credential_id, prf_salt_b64: toB64(saltBytes), prfBytes: copyThenZero(answer) }
}

/** Copy `source`'s bytes and zero the original, so the returned bytes are the only copy. */
function copyThenZero(source: BufferSource): Uint8Array<ArrayBuffer> {
  // ArrayBuffer.isView works across realms (an iframe's buffers, for example). instanceof does not.
  const handed = ArrayBuffer.isView(source) ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength) : new Uint8Array(source)
  const copied = Uint8Array.from(handed)
  handed.fill(0)
  return copied
}

/** `{ [field]: val }`, or nothing where `val` is undefined, for spreading into the browser's options. */
function optional<FieldT extends string, ValT>(field: FieldT, val: ValT | undefined): Partial<Record<FieldT, ValT>> {
  return (val === undefined) ? {} : { [field]: val } as Record<FieldT, ValT>
}

/** Refuse `passkey_unavailable` in a browser without WebAuthn. */
function demandWebAuthn(): void {
  if (! passkeysAvailable()) { throw new VaultError('passkey_unavailable', KitPhrases.noWebAuthn) }
}

/** The refusal for an authenticator that gives no PRF output. */
function noPrf(): VaultError {
  return new VaultError('passkey_unavailable', KitPhrases.noPrf)
}

/** The credential `call` resolves, or null when the user dismissed the prompt. */
async function askAuthenticator(call: () => Promise<Credential | null>): Promise<PublicKeyCredential | null> {
  let credential: Credential | null
  try {
    credential = await call()
  } catch (err) {
    // By design, the browser reports NotAllowedError for a dismissal, a timeout and "no matching passkey" alike.
    if ((err instanceof DOMException) && ((err.name === 'NotAllowedError') || (err.name === 'AbortError'))) { return null }
    if ((err instanceof DOMException) && (err.name === 'SecurityError')) {
      throw new VaultError('bad_record', "The browser refused the passkey's relying party: its id must be this page's domain, or one it belongs to.", { cause: err })
    }
    throw new VaultError('passkey_unavailable', KitPhrases.passkeyAskFailed, { cause: err })
  }
  return (credential === null) ? null : credential as PublicKeyCredential
}
// --
