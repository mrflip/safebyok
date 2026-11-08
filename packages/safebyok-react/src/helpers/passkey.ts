import { PasskeySaltBytes, VaultError, type PasskeyAnswer, type WayinHeader } from 'safebyok'
import { fromB64, toB64 } from 'safebyok/utils'
import { PasskeyChecks, type AskPasskeyOpts, type CreatePasskeyOpts } from '../shapes'
import { Messages } from './messages'

// The WebAuthn half of a passkey, which the core leaves to the host. `createPasskey` makes a passkey
// and asks for its first answer. `askPasskey` asks the vault's passkey again. Nothing here imports React.
//
// These passkeys are not logins. Each is a fresh credential under a random user handle, so it never
// replaces a passkey the host's sign-in uses. Its challenge is random, and no server checks the
// assertion. What matters is the PRF extension's answer, which only the authenticator gives, and
// only after the user's fingerprint, face or PIN. Every call asks for user verification, since an
// authenticator answers differently without it.
//
// Where no passkey answer is to be had (the browser has no WebAuthn, the authenticator no PRF, or
// the browser failed to ask), these refuse `passkey_unavailable`, which a dialog shows in place.

/** True when this browser offers WebAuthn at all: whether to show a passkey button. */
export const passkeysAvailable = (): boolean => (
  typeof PublicKeyCredential === 'function' && typeof navigator === 'object' && 'credentials' in navigator
)

/** Make a new passkey and return its first answer, or null when the user dismisses the prompt.
 *
 * @example
 *   const passkeyClear = await createPasskey({ rp: { name: 'Acme' }, user: { name: email, displayName: fullName } })
 *   if (passkeyClear !== null) { await gating.attempt({ passphraseClear, passkeyClear }) }   // null: dismissed
 */
export const createPasskey = async (given: CreatePasskeyOpts): Promise<PasskeyAnswer | null> => {
  const opts = PasskeyChecks.createPasskeyOpts.parse(given, { where: "In createPasskey's options" })
  demandWebAuthn()
  const prfSaltBytes = crypto.getRandomValues(new Uint8Array(PasskeySaltBytes))
  const created = await askAuthenticator(() => navigator.credentials.create({
    publicKey: {
      rp:                     { name: opts.rp.name, ...optional('id', opts.rp.id) },
      // A random handle, never the host's own user id: an authenticator holding a passkey for the
      // same site and handle would replace it, and the host's sign-in passkey with it.
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
  if (prf?.results !== undefined) { return answerOf(credential_id, prfSaltBytes, prf.results.first) }
  if (prf?.enabled !== true) { throw noPrf() }
  // Many authenticators turn PRF on as they make the passkey, and answer only when asked again.
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
  return answerOf(credential_id, prfSaltBytes, answer)
}

/** Ask the passkey of `passkeyHeader` for its answer, or null when the user dismisses the prompt.
 *
 * @example
 *   const passkeyClear = await askPasskey(gating.passkeyHeader)
 *   if (passkeyClear !== null) { await gating.attempt({ passkeyClear }) }
 */
export const askPasskey = async (passkeyHeader: WayinHeader | null, given: AskPasskeyOpts = {}): Promise<PasskeyAnswer | null> => {
  const { passkeyHeader: header, opts } = PasskeyChecks.askPasskeyInput.parse({ passkeyHeader, opts: given }, { where: "In askPasskey's arguments" })
  demandWebAuthn()
  if (header?.wayinkind !== 'passkey') { throw new VaultError('absent_wayin', Messages.noPasskeyToAsk) }
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
  const passkeyClear = answerOf(credential_id, saltBytes, answer)
  // A browser answers only for the credential it was offered. An answer for another has nothing to unlock.
  if (toB64(new Uint8Array(asked.rawId)) !== credential_id) { passkeyClear.prfBytes.fill(0); throw new VaultError('passkey_unavailable', Messages.passkeyAskFailed) }
  return passkeyClear
}

/** Hand `passkey` to `attempt`, then zero its bytes whatever the attempt did. */
export const attemptOnce = async <ValT>(passkey: PasskeyAnswer, attempt: (passkey: PasskeyAnswer) => Promise<ValT>): Promise<ValT> => {
  PasskeyChecks.attemptOnceAnswer.parse(passkey, { where: "In attemptOnce's passkey" })
  // `attempt` is checked inside the try, so an answer refused for its attempt is zeroed all the same.
  try {
    PasskeyChecks.attemptOnceAttempt.parse(attempt, { where: "In attemptOnce's attempt" })
    return await attempt(passkey)
  } finally {
    passkey.prfBytes.fill(0)
  }
}

/** The bytes of a stored passkey's `credential_id`. */
const credentialBytesOf = (credential_id: string): Uint8Array<ArrayBuffer> => {
  try {
    return fromB64(credential_id) as Uint8Array<ArrayBuffer>
  } catch (err) {
    throw new VaultError('bad_record', "The vault's passkey is stored under a credential_id that is not base64url, so the browser cannot be asked for it.", { cause: err })
  }
}

/** The PasskeyAnswer of credential `credential_id`: the PRF `answer` it gave over `saltBytes`. */
const answerOf = (credential_id: string, saltBytes: Uint8Array, answer: BufferSource): PasskeyAnswer => ({
  credential_id,
  prf_salt_b64: toB64(saltBytes),
  prfBytes:     bytesOf(answer),
})

/** Copy `source`'s bytes, and zero `source`. The answer's bytes are then the only copy. */
const bytesOf = (source: BufferSource): Uint8Array<ArrayBuffer> => {
  // ArrayBuffer.isView, not instanceof, holds across realms (an iframe's buffers, say).
  const handed = ArrayBuffer.isView(source) ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength) : new Uint8Array(source)
  const copied = Uint8Array.from(handed)
  handed.fill(0)
  return copied
}

/** `{ [field]: val }`, or nothing when `val` is undefined. */
const optional = <FieldT extends string, ValT>(field: FieldT, val: ValT | undefined): Partial<Record<FieldT, ValT>> => (
  val === undefined ? {} : { [field]: val } as Record<FieldT, ValT>
)

/** Refuse in a browser without WebAuthn. */
const demandWebAuthn = () => {
  if (! passkeysAvailable()) { throw new VaultError('passkey_unavailable', Messages.noWebAuthn) }
}

/** The refusal for an authenticator that gives no PRF answer. */
const noPrf = () => new VaultError('passkey_unavailable', Messages.noPrf)

/** The credential a WebAuthn call resolves with, or null when the user dismissed it. */
const askAuthenticator = async (call: () => Promise<Credential | null>): Promise<PublicKeyCredential | null> => {
  let credential: Credential | null
  try {
    credential = await call()
  } catch (err) {
    // The browser says NotAllowedError for a dismissal, a timeout and "none of these here" alike, by design.
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) { return null }
    if (err instanceof DOMException && err.name === 'SecurityError') {
      throw new VaultError('bad_option', "The browser refused the passkey's relying party: its id must be this page's domain, or one it belongs to.", { cause: err })
    }
    throw new VaultError('passkey_unavailable', Messages.passkeyAskFailed, { cause: err })
  }
  return credential === null ? null : credential as PublicKeyCredential
}
