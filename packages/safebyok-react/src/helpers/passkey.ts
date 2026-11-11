import { PasskeySaltBytes, VaultError, type PasskeyAnswer, type WayinHeader } from 'safebyok'
import { fromB64, toB64 } from 'safebyok/utils'
import { PasskeyChecks, type AskPasskeyOpts, type CreatePasskeyOpts } from '../shapes'
import { Messages } from './messages'

// These passkeys are not used to sign in. Each is a fresh credential under a random user handle, with a random
// challenge, and no server checks the assertion. The part that matters is the PRF extension's output, which only
// the authenticator can produce, and only after the user's fingerprint, face or PIN. Every call requires user
// verification, because an authenticator gives a different PRF output without it.

/** True when this browser supports WebAuthn. Use it to decide whether to show a passkey button. */
export const passkeysAvailable = (): boolean => (
  typeof PublicKeyCredential === 'function' && typeof navigator === 'object' && 'credentials' in navigator
)

/** Create a new passkey and return its first answer. Returns null when the user dismisses the prompt.
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
  if (prf?.results !== undefined) { return answerOf(credential_id, prfSaltBytes, prf.results.first) }
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
  return answerOf(credential_id, prfSaltBytes, answer)
}

/** Ask the passkey named in `passkeyHeader` for its answer. Returns null when the user dismisses the prompt.
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
  // The browser should respond only with the credential it was asked for. A response from any other credential cannot unlock this vault.
  if (toB64(new Uint8Array(asked.rawId)) !== credential_id) { passkeyClear.prfBytes.fill(0); throw new VaultError('passkey_unavailable', Messages.passkeyAskFailed) }
  return passkeyClear
}

/** Pass `passkey` to `attempt`, then zero the passkey's bytes, whether the attempt succeeded or threw. */
export const attemptOnce = async <ValT>(passkey: PasskeyAnswer, attempt: (passkey: PasskeyAnswer) => Promise<ValT>): Promise<ValT> => {
  PasskeyChecks.attemptOnceAnswer.parse(passkey, { where: "In attemptOnce's passkey" })
  // `attempt` is validated inside the try, so the passkey's bytes are zeroed even when `attempt` is not a function.
  try {
    PasskeyChecks.attemptOnceAttempt.parse(attempt, { where: "In attemptOnce's attempt" })
    return await attempt(passkey)
  } finally {
    passkey.prfBytes.fill(0)
  }
}

const credentialBytesOf = (credential_id: string): Uint8Array<ArrayBuffer> => {
  try {
    return fromB64(credential_id) as Uint8Array<ArrayBuffer>
  } catch (err) {
    throw new VaultError('bad_record', "The vault's passkey is stored under a credential_id that is not base64url, so the browser cannot be asked for it.", { cause: err })
  }
}

const answerOf = (credential_id: string, saltBytes: Uint8Array, answer: BufferSource): PasskeyAnswer => ({
  credential_id,
  prf_salt_b64: toB64(saltBytes),
  prfBytes:     bytesOf(answer),
})

/** Copy `source`'s bytes and zero the original, so the returned bytes are the only copy. */
const bytesOf = (source: BufferSource): Uint8Array<ArrayBuffer> => {
  // ArrayBuffer.isView works across realms (an iframe's buffers, for example). instanceof does not.
  const handed = ArrayBuffer.isView(source) ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength) : new Uint8Array(source)
  const copied = Uint8Array.from(handed)
  handed.fill(0)
  return copied
}

const optional = <FieldT extends string, ValT>(field: FieldT, val: ValT | undefined): Partial<Record<FieldT, ValT>> => (
  val === undefined ? {} : { [field]: val } as Record<FieldT, ValT>
)

const demandWebAuthn = () => {
  if (! passkeysAvailable()) { throw new VaultError('passkey_unavailable', Messages.noWebAuthn) }
}

const noPrf = () => new VaultError('passkey_unavailable', Messages.noPrf)

const askAuthenticator = async (call: () => Promise<Credential | null>): Promise<PublicKeyCredential | null> => {
  let credential: Credential | null
  try {
    credential = await call()
  } catch (err) {
    // By design, the browser reports NotAllowedError for a dismissal, a timeout and "no matching passkey" alike.
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) { return null }
    if (err instanceof DOMException && err.name === 'SecurityError') {
      throw new VaultError('bad_option', "The browser refused the passkey's relying party: its id must be this page's domain, or one it belongs to.", { cause: err })
    }
    throw new VaultError('passkey_unavailable', Messages.passkeyAskFailed, { cause: err })
  }
  return credential === null ? null : credential as PublicKeyCredential
}
