import { PasskeySaltBytes, VaultError, type PasskeyAnswer, type PasskeyWayinSummary } from 'safebyok'
import { fromB64, toB64 } from 'safebyok/utils'
import { Messages } from './messages'

/**
 * The WebAuthn half of a passkey unlock, which the core leaves to the host: `createPasskey` makes a
 * new passkey and asks it for its first answer, `askPasskey` asks the vault's passkey for its
 * answer again. Both hand back a {@link PasskeyAnswer} for the vault (`putWayin`, `unlock`), or
 * null when the user dismissed the prompt. Nothing here imports React: any framework's host may use
 * them.
 *
 * These passkeys are not logins. Each is a fresh credential of its own, made under a random user
 * handle so it never replaces a passkey the host's sign-in uses; its challenge is random and no
 * server ever checks the assertion. What matters is the PRF extension's answer, which only the
 * authenticator can give, and only after the user's fingerprint, face or PIN: every call asks for
 * user verification, since an authenticator answers differently without it.
 */

/**
 * True when this browser offers WebAuthn at all: whether to show a passkey button. Whether its
 * authenticator offers the PRF extension is learned only by trying; `createPasskey` refuses with
 * kind 'passkey_unavailable' when it does not.
 *
 * @example passkeysAvailable() && <button onClick={addFingerprint}>Add fingerprint unlock</button>
 */
export const passkeysAvailable = (): boolean => (
  typeof PublicKeyCredential === 'function' && typeof navigator === 'object' && 'credentials' in navigator
)

/** What `createPasskey` asks of the host: how the authenticator shows the new passkey. */
export type CreatePasskeyOpts = {
  /**
   * The relying party: the `name` the authenticator shows (`Acme`), and the `id`, the domain the
   * passkey belongs to -- by default the page's own. A passkey made under one `id` answers only to
   * pages that ask with it: pass the same `rpId` to `askPasskey`.
   */
  rp:       { name: string, id?: string | undefined }
  /** How the authenticator lists the passkey: an account `name` (an email, say) and a `displayName`. */
  user:     { name: string, displayName: string }
  /** How long the browser waits for the user, in milliseconds; the browser's default otherwise. */
  timeout?: number | undefined
}

/** What `askPasskey` may be told: the relying party's `rpId`, if the passkey was made under one, and a `timeout`. */
export type AskPasskeyOpts = {
  rpId?:    string | undefined
  timeout?: number | undefined
}

/**
 * A new passkey, and its first answer over a fresh salt: what `vault.putWayin` takes, beside the
 * vault's passphrase, to put the vault's passkey. The browser asks the user to make the passkey (a fingerprint, a face, a security key), and, on authenticators
 * that answer only when asked again, to touch it once more.
 *
 * Resolves null when the user dismisses the prompt (or lets it time out). Refuses with kind
 * 'passkey_unavailable' when the browser has no WebAuthn, or the authenticator does not offer the
 * PRF extension, and 'bad_option' when the relying party's `id` does not fit this page. A passkey
 * made but never answered for -- no PRF, or the second touch dismissed -- is useless to the
 * vault, and stays on the authenticator until the user deletes it; so does one made for a
 * `putWayin` that is then refused (a mistyped passphrase, say): make another to try again.
 *
 * @example
 *   const answer = await createPasskey({ rp: { name: 'Acme' }, user: { name: email, displayName: fullName } })
 *   if (answer !== null) { await vault.putWayin(passphrase, answer) }    // null: dismissed
 */
export const createPasskey = async (opts: CreatePasskeyOpts): Promise<PasskeyAnswer | null> => {
  checkAvailable()
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
  const credentialId = toB64(new Uint8Array(created.rawId))
  const { prf } = created.getClientExtensionResults()
  if (prf?.results !== undefined) { return answerOf(credentialId, prfSaltBytes, prf.results.first) }
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
  return answerOf(credentialId, prfSaltBytes, answer)
}

/**
 * The answer of the vault's one passkey: what `vault.unlock` (or `ask.attempt`) takes. `passkey`
 * is the snapshot's, as it stands (`vault.getSnapshot().passkey`); the browser asks the user to
 * touch it, and asks it for its answer over its own salt.
 *
 * Resolves null when the user dismisses the prompt (or lets it time out, or has not that passkey
 * at hand). Refuses with kind 'absent_wayin' when `passkey` is null, the vault having none;
 * 'damaged_wayin' when it is stored damaged -- its `credential_id` or `prf_salt_b64` not
 * base64url, or its salt not `PasskeySaltBytes` long, which the vault would refuse;
 * 'passkey_unavailable' when the browser has no WebAuthn or the passkey gives no PRF answer; and
 * 'bad_option' when `opts.rpId` does not fit this page.
 *
 * @example
 *   const passkey = await askPasskey(vault.getSnapshot().passkey)
 *   if (passkey !== null) { await vault.unlock(passkey) }
 */
export const askPasskey = async (passkey: PasskeyWayinSummary | null, opts: AskPasskeyOpts = {}): Promise<PasskeyAnswer | null> => {
  checkAvailable()
  if (passkey === null) {
    throw new VaultError('absent_wayin', Messages.noPasskeyToAsk)
  }
  const asking = askable(passkey)
  if (asking === null) {
    throw new VaultError('damaged_wayin', Messages.passkeyDamaged)
  }
  const asked = await askAuthenticator(() => navigator.credentials.get({
    publicKey: {
      challenge:        crypto.getRandomValues(new Uint8Array(32)),
      ...optional('rpId', opts.rpId),
      allowCredentials: [{ type: 'public-key', id: asking.credentialBytes }],
      userVerification: 'required',
      ...optional('timeout', opts.timeout),
      extensions:       { prf: { evalByCredential: { [asking.credentialId]: { first: asking.saltBytes } } } },
    },
  }))
  if (asked === null) { return null }
  const credentialId = toB64(new Uint8Array(asked.rawId))
  const answer = asked.getClientExtensionResults().prf?.results?.first
  // A browser answers only for the credential it was offered; one that does not has nothing to unlock.
  if (answer === undefined || credentialId !== asking.credentialId) { throw noPrf() }
  return answerOf(credentialId, asking.saltBytes, answer)
}

/**
 * The vault's passkey, its credential id and salt as bytes for WebAuthn; null when either is
 * not base64url, or the salt is not `PasskeySaltBytes` long.
 */
const askable = (passkey: PasskeyWayinSummary) => {
  try {
    const saltBytes = fromB64(passkey.prf_salt_b64) as Uint8Array<ArrayBuffer>
    if (saltBytes.length !== PasskeySaltBytes) { return null }
    return {
      credentialId:    passkey.credential_id,
      credentialBytes: fromB64(passkey.credential_id) as Uint8Array<ArrayBuffer>,
      saltBytes,
    }
  } catch {
    return null
  }
}

/** A PasskeyAnswer of the credential `credentialId`, answering `answer` over `saltBytes`. */
const answerOf = (credentialId: string, saltBytes: Uint8Array, answer: BufferSource): PasskeyAnswer => ({
  credentialId,
  prfSaltB64: toB64(saltBytes),
  prfBytes:   bytesOf(answer),
})

/** A copy of `source`'s bytes, whichever kind of buffer the browser handed back. */
const bytesOf = (source: BufferSource): Uint8Array => (
  // ArrayBuffer.isView, not instanceof, holds across realms (an iframe's buffers, say).
  Uint8Array.from(ArrayBuffer.isView(source) ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength) : new Uint8Array(source))
)

/** `{ [field]: val }`, or nothing when `val` is undefined: WebAuthn's options take a field left out, never one set to undefined. */
const optional = <FieldT extends string, ValT>(field: FieldT, val: ValT | undefined): Partial<Record<FieldT, ValT>> => (
  val === undefined ? {} : { [field]: val } as Record<FieldT, ValT>
)

const checkAvailable = () => {
  if (! passkeysAvailable()) {
    throw new VaultError('passkey_unavailable', Messages.noWebAuthn)
  }
}

const noPrf = () => new VaultError('passkey_unavailable', Messages.noPrf)

/**
 * The credential a WebAuthn call resolves with, or null when the user dismissed it. Its other
 * refusals become VaultErrors, the browser's own error kept as the cause.
 */
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
