import { cipherBinding, deriveWrappingKey, fromB64, importWrappingKeyBytes, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder, type Ciphered } from './crypto'
import { VaultError } from './errors'
import type { KeyDeriver } from './key-deriver'
import { PassphraseKeyBytes } from './key-deriver-spec'
import { PasskeySaltBytes, type PasskeyEnvelope, type PasskeyProof, type PassphraseEnvelope, type UnlockEnvelope, type UnlockMethod, type UnlockSummary, type VaultBundle, type VaultScope } from './types'

/**
 * Unlock envelopes: each the vaultKey wrapped under a key one method makes, so a vault has several
 * ways in and one vaultKey behind them all. Imported whole, as `Envelope`: `Envelope.sealPassphrase`
 * and `Envelope.sealPasskey` make one, `Envelope.open` finds the one a passphrase or a passkey
 * opens, `Envelope.summarize` gives its public face. Internal to the package; the vault calls it.
 *
 * Each envelope's wrap is bound to its vault -- the scope, and the bundle fields that never
 * change, `vault_id` and `registered_at` -- and to its own public header (every field but the wrap
 * itself, encoded with its keys sorted: its `vault_key_epoch`, `device_id` and `registered_at`
 * among them), under a purpose its method names. A passkey envelope's key is made with that same
 * context as its HKDF `info`. The bundle's `unlock_epoch` and the list of envelopes are not in it:
 * a change to one envelope bumps the epoch and rewrites the list, and the others, whose
 * passphrases this device does not hold, must still open. An envelope whose `vault_key_epoch` is
 * not the bundle's is passed over as damaged, so one spliced in from an older bundle never hands
 * over its older vaultKey as the bundle's own.
 */

/**
 * The vaultKey's two lives after an unwrap. `transientKey` is extractable, because only an
 * extractable key can be wrapped (for the device record, or into a new way in); the
 * operation that needed it drops it on return. `sessionKey` is the handle the vault keeps
 * between operations: non-extractable, so the platform itself refuses to export its bytes.
 */
export type VaultKeyPair = { transientKey: CryptoKey, sessionKey: CryptoKey }

/** `EnvelopeT` with every field but its wrap, member by member of a union. */
type HeaderOf<EnvelopeT> = EnvelopeT extends unknown ? Omit<EnvelopeT, 'vault_key_wrapped'> : never
/** An envelope's public header, every field but its wrap: what the wrap is bound to. */
export type EnvelopeHeader = HeaderOf<UnlockEnvelope>

/**
 * What an envelope's wrap binds of the bundle it belongs to: the fields a bundle never changes once
 * made. A whole {@link VaultBundle} is one.
 */
export type BundleIdentity = Pick<VaultBundle, 'vault_id' | 'registered_at'>

/**
 * What an envelope is stamped with besides its method's own fields: its `unlock_id` and
 * `unlocklabel`, the `vault_key_epoch` of the vaultKey it wraps, and the `device_id` and
 * `registered_at` of the device and the time that added the way in. A way in sealed anew keeps
 * its stamp; an envelope is one.
 */
export type EnvelopeStamp = Pick<UnlockEnvelope, 'unlock_id' | 'unlocklabel' | 'vault_key_epoch' | 'device_id' | 'registered_at'>

/** The binding's first part: the bundle's format, under which every envelope's wrap is bound. */
const BundleFormat = 'safebyok-vault-v2'

/** The binding purpose of each method's wrap, so no method's envelope opens as another's. */
const PurposeForMethod = {
  passphrase: 'vault_key_passphrase_wrapped',
  passkey:    'vault_key_passkey_wrapped',
} as const satisfies Readonly<Record<UnlockMethod, string>>

/** The usages of the handle a vault keeps: it wraps a lockboxKey and unwraps one, nothing else. */
const SessionUsage = { extractable: false, usage: ['wrapKey', 'unwrapKey'] } as const
// The transient is only ever the wrapped argument of a wrap; WebCrypto refuses an empty usage
// list, so it carries the narrowest one.
const TransientUsage = { extractable: true, usage: ['wrapKey'] } as const

/**
 * The context an envelope's wrap is bound to (and, for a passkey, its key made with): the vault it
 * lets into, and its own public header.
 */
const binding = (scope: VaultScope, bundle: BundleIdentity, header: EnvelopeHeader): Uint8Array => (
  cipherBinding(BundleFormat, scope.applabel, scope.user_id, scope.vaultlabel, bundle.vault_id, bundle.registered_at, PurposeForMethod[header.method], header)
)

/** The stamp's own fields, and nothing else of whatever carries them: an envelope sealed anew passes itself. */
const stampOf = ({ unlock_id, unlocklabel, vault_key_epoch, device_id, registered_at }: EnvelopeStamp): EnvelopeStamp => (
  { unlock_id, unlocklabel, vault_key_epoch, device_id, registered_at }
)

/** `envelope` without its wrap. */
const headerOf = (envelope: UnlockEnvelope): EnvelopeHeader => {
  const { vault_key_wrapped: _wrapped, ...header } = envelope
  return header
}

/**
 * Every unlock's proof: a passphrase the user typed, or what a passkey answered. A blank
 * passphrase never reaches here, nor a passkey proof of the wrong shape: the vault refuses both
 * at its door.
 */
export type UnlockProof = string | PasskeyProof

/** The refusal for a key deriver's result that is not 32 bytes of a view. */
const notKeyBytes = () => new VaultError('bad_option', 'keyDeriver handed back something other than 32 key bytes: a passphraseKey is a 256-bit key.')

/** The memory a key deriver's bytes sit in, as the platform names it: told apart even across realms, and where `SharedArrayBuffer` is absent. */
const isSharedMemory = (view: ArrayBufferView): boolean => Object.prototype.toString.call(view.buffer) === '[object SharedArrayBuffer]'

/**
 * True when every byte of `bytes` is zero. Reads every byte whatever it finds, OR-ing them
 * together as libsodium's `sodium_is_zero` does, with no early exit. No JavaScript engine promises
 * constant time, but nothing here branches on a byte: only the verdict steers what follows, and
 * the refusal of an all-zero output tells that anyway.
 */
const isAllZero = (bytes: Uint8Array): boolean => bytes.reduce((seen, byte) => seen | byte, 0) === 0

/**
 * The passphraseKey `keyDeriver` makes of `passphrase` and its salt: 32 bytes, no other, in memory
 * of their own, or kind `bad_option` before anything is wrapped -- WebCrypto would accept 16 or 24
 * as a weaker AES key, and refuses a view over shared memory with no kind. Thirty-two zero bytes
 * are refused too, with the same kind: a key anyone could rebuild, which no derivation makes, but
 * a deriver handing back bytes it kept from an earlier call, wiped since, would. The bytes the
 * deriver handed back are zeroed once imported, whether or not the import succeeds, and when
 * refused for their length: they are ours the moment they are returned, and a copy lingering in
 * memory helps no one. Shared memory is refused untouched.
 */
const passphraseKeyOf = async (keyDeriver: KeyDeriver, passphrase: string, saltBytes: Uint8Array): Promise<CryptoKey> => {
  const handed: unknown = await keyDeriver.deriveKeyBytes(passphrase, saltBytes)
  if (! ArrayBuffer.isView(handed)) { throw notKeyBytes() }
  if (isSharedMemory(handed)) {
    throw new VaultError('bad_option', 'keyDeriver handed back key bytes in shared memory (a SharedArrayBuffer), which WebCrypto will not import and other threads could read: hand back a fresh Uint8Array.')
  }
  const keyBytes = new Uint8Array(handed.buffer, handed.byteOffset, handed.byteLength)
  try {
    if (keyBytes.byteLength !== PassphraseKeyBytes) { throw notKeyBytes() }
    if (isAllZero(keyBytes)) {
      throw new VaultError('bad_option', 'keyDeriver handed back 32 zero bytes, a key anyone could rebuild: derive the key afresh on every call, and never hand back bytes kept from an earlier one.')
    }
    return await importWrappingKeyBytes(keyBytes)
  } finally {
    keyBytes.fill(0)
  }
}

/**
 * A passphrase envelope around `vaultKey`, under a fresh passphraseSalt.
 *
 * @param keyDeriver - What makes the passphraseKey; its label goes on the envelope.
 * @param passphrase - The passphrase this envelope admits.
 * @param scope - The vault's scope, bound into the wrap.
 * @param bundle - The bundle's `vault_id` and `registered_at`, bound into the wrap.
 * @param stamp - The envelope's {@link EnvelopeStamp}: its id, label, vaultKey epoch, device and time.
 * @param vaultKey - The vaultKey to wrap: extractable, as only such a key can be.
 */
export const sealPassphrase = async (
  keyDeriver: KeyDeriver,
  passphrase: string,
  scope: VaultScope,
  bundle: BundleIdentity,
  stamp: EnvelopeStamp,
  vaultKey: CryptoKey,
): Promise<PassphraseEnvelope> => {
  const { envelope } = await wrapUnderPassphrase(keyDeriver, passphrase, scope, bundle, stamp, vaultKey)
  return envelope
}

/**
 * A vault's first passphrase envelope, as {@link sealPassphrase} makes one, and the session's
 * handle on the vaultKey through it: the creating unlock keeps that, where every later envelope
 * is for the vault's other devices.
 *
 * @returns The envelope, and a non-extractable handle on the vaultKey unwrapped from it.
 */
export const sealFirstPassphrase = async (
  keyDeriver: KeyDeriver,
  passphrase: string,
  scope: VaultScope,
  bundle: BundleIdentity,
  stamp: EnvelopeStamp,
  vaultKey: CryptoKey,
): Promise<{ envelope: PassphraseEnvelope, sessionKey: CryptoKey }> => {
  const { envelope, passphraseKey, envelopeBinding } = await wrapUnderPassphrase(keyDeriver, passphrase, scope, bundle, stamp, vaultKey)
  const sessionKey = await unwrapKeyUnder(passphraseKey, envelope.vault_key_wrapped, envelopeBinding, SessionUsage)
  return { envelope, sessionKey }
}

/** The envelope around `vaultKey` under `passphrase`'s key, with that key and the binding it was wrapped to. */
const wrapUnderPassphrase = async (
  keyDeriver: KeyDeriver,
  passphrase: string,
  scope: VaultScope,
  bundle: BundleIdentity,
  stamp: EnvelopeStamp,
  vaultKey: CryptoKey,
) => {
  const saltBytes = randomBytes(keyDeriver.salt_bytes)
  const header = {
    method:            'passphrase',
    ...stampOf(stamp),
    key_deriver_label: keyDeriver.key_deriver_label,
    salt_b64:          toB64(saltBytes),
  } as const
  const passphraseKey = await passphraseKeyOf(keyDeriver, passphrase, saltBytes)
  const envelopeBinding = binding(scope, bundle, header)
  const wrapped = await wrapKeyUnder(passphraseKey, vaultKey, envelopeBinding)
  const envelope: PassphraseEnvelope = { ...header, vault_key_wrapped: wrapped }
  return { envelope, passphraseKey, envelopeBinding }
}

/**
 * The vaultKey out of whichever of `bundle`'s passphrase envelopes `passphrase` opens -- or, given
 * `unlockId`, out of that one envelope only. Each envelope tried costs one key derivation, in the
 * order the bundle lists them, and the first that opens ends the search. An envelope refusing to
 * open IS the passphrase check: there is no comparison.
 *
 * An envelope whose salt is not base64url of `keyDeriver.salt_bytes` bytes is damaged: its
 * deriver never made such a salt. So is one whose `vault_key_epoch` is not the bundle's: it wraps
 * some other vaultKey than the bundle stands for. Either is passed over, costing no derivation,
 * and the others are tried as ever, so one damaged way in shuts out no other.
 *
 * Refuses with kind `absent_unlock` when `unlockId` names no passphrase envelope of the bundle,
 * `unknown_key_deriver` when every envelope it would try was made by a key deriver other than
 * `keyDeriver`, `damaged_unlock` when every one it would try is damaged, and `wrong_passphrase`
 * when none it tried opens. That last is all the envelopes can say: a wrong passphrase and an
 * envelope altered in storage fail alike, so its message names both -- and, when envelopes made
 * by another key deriver were passed over, how many, and that opening the vault where it was
 * made may help.
 *
 * @returns Both lives of the vaultKey, and the `unlock_id` of the envelope that opened.
 */
export const openWithPassphrase = async (
  keyDeriver: KeyDeriver,
  passphrase: string,
  scope: VaultScope,
  bundle: VaultBundle,
  unlockId?: string,
): Promise<VaultKeyPair & { unlockId: string }> => {
  const passphrases = bundle.unlocks.filter((envelope) => envelope.method === 'passphrase')
  const aimed = unlockId === undefined ? passphrases : passphrases.filter((envelope) => envelope.unlock_id === unlockId)
  if (aimed.length === 0) { throw absentUnlock() }
  const derivable = aimed.filter((envelope) => envelope.key_deriver_label === keyDeriver.key_deriver_label)
  if (derivable.length === 0) {
    throw new VaultError('unknown_key_deriver', 'This vault was made with a key deriver this package does not carry: update safebyok, or open the vault where it was made.')
  }
  // Sorted out before the first derivation, so the outcome never hangs on order. (Checked here
  // rather than in the record's schema, which every entry point's bundle carries whole.)
  const sound = derivable.filter((envelope) => (
    saltBytesOf(envelope.salt_b64)?.length === keyDeriver.salt_bytes && envelope.vault_key_epoch === bundle.vault_key_epoch
  ))
  if (sound.length === 0) {
    if (unlockId !== undefined) {
      throw new VaultError('damaged_unlock', "That passphrase's way into the vault is stored damaged, so it could not be tried. Unlock another way, then remove it and add the passphrase again. The vault was left as it is.")
    }
    const told = derivable.length < aimed.length
      ? "Every passphrase of this vault that this package can try is stored damaged, and the others were made with a key deriver this package does not carry. Update safebyok, or open the vault where it was made. The vault was left as it is."
      : "Every passphrase of this vault is stored damaged, so none could be tried. Unlock with a passkey, if the vault has one, then add a new passphrase. The vault was left as it is."
    throw new VaultError('damaged_unlock', told)
  }
  for (const envelope of sound) {
    const opened = await tryPassphrase(keyDeriver, passphrase, scope, bundle, envelope)
    if (opened !== null) { return { ...opened, unlockId: envelope.unlock_id } }
  }
  const skipped = aimed.length - derivable.length
  const elsewhere = skipped === 0 ? '' : ` ${skippedByOtherDeriver(skipped)}`
  if (sound.length < derivable.length) {
    throw new VaultError('wrong_passphrase', `That passphrase didn't unlock the vault, and one of its passphrases is stored damaged, so could not be tried. Check for typos and try again; if it was that one, unlock another way.${elsewhere}`)
  }
  throw new VaultError('wrong_passphrase', `That passphrase didn't unlock the vault. Check for typos and try again. If you're sure it's right, the stored vault may be damaged.${elsewhere}`)
}

/** What a wrong passphrase adds when `count` of the vault's passphrases were passed over for another key deriver's. */
const skippedByOtherDeriver = (count: number): string => {
  const [subject, verb, which] = count === 1
    ? ["One of this vault's passphrases was", 'it was', 'that one']
    : [`${String(count)} of this vault's passphrases were`, 'they were', 'one of those']
  return `${subject} made with a key deriver this package does not carry, so ${verb} not tried: if the passphrase you typed is ${which}, open the vault where it was made.`
}

/**
 * The refusal for an `unlock_id` that names no way in of the bundle: it may have been removed on
 * another device. Never quotes the id.
 */
export const absentUnlock = () => new VaultError('absent_unlock', "This vault has no way in with that unlock_id: it may have been removed on another device. Look again at the snapshot's unlocks.")

/** An envelope's salt as bytes, or null when its base64url text is not base64url. */
export const saltBytesOf = (saltB64: string): Uint8Array | null => {
  try {
    return fromB64(saltB64)
  } catch {
    return null
  }
}

/** Both lives of the vaultKey out of one passphrase envelope, or null when it will not open. */
const tryPassphrase = async (
  keyDeriver: KeyDeriver,
  passphrase: string,
  scope: VaultScope,
  bundle: BundleIdentity,
  envelope: PassphraseEnvelope,
): Promise<VaultKeyPair | null> => {
  const passphraseKey = await passphraseKeyOf(keyDeriver, passphrase, fromB64(envelope.salt_b64))
  return await tryUnwrap(passphraseKey, binding(scope, bundle, headerOf(envelope)), envelope.vault_key_wrapped)
}

/** Both lives of the vaultKey out of `wrapped` under `wrappingKey`, or null when it will not open. */
const tryUnwrap = async (wrappingKey: CryptoKey, envelopeBinding: Uint8Array, wrapped: Ciphered): Promise<VaultKeyPair | null> => {
  try {
    const transientKey = await unwrapKeyUnder(wrappingKey, wrapped, envelopeBinding, TransientUsage)
    const sessionKey = await unwrapKeyUnder(wrappingKey, wrapped, envelopeBinding, SessionUsage)
    return { transientKey, sessionKey }
  } catch {
    return null
  }
}

/**
 * The public face of an envelope, as a locked vault may show it: its method, id, label, and the
 * device and time that added it, and for a passkey the credential and salt a host asks its
 * authenticator with; never a passphrase's salt, never a wrap.
 *
 * @example Envelope.summarize(bundle.unlocks[0])  // { method: 'passphrase', unlock_id: '1b9d...', unlocklabel: 'passphrase', device_id: 'k3x9...', registered_at: 1760000000000 }
 * @example Envelope.summarize(passkeyEnvelope)    // { method: 'passkey', unlock_id, unlocklabel: 'laptop', device_id, registered_at, credential_id: 'AXk3...', prf_salt_b64: 'q83v...' }
 */
export const summarize = (envelope: UnlockEnvelope): UnlockSummary => {
  const { method, unlock_id, unlocklabel, device_id, registered_at } = envelope
  if (method === 'passphrase') { return { method, unlock_id, unlocklabel, device_id, registered_at } }
  return { method, unlock_id, unlocklabel, device_id, registered_at, credential_id: envelope.credential_id, prf_salt_b64: envelope.prf_salt_b64 }
}

/**
 * The vaultKey out of whichever of `bundle`'s envelopes `proof` opens: a passphrase as
 * {@link openWithPassphrase} finds it, a passkey as {@link openWithPasskey} does.
 */
export const open = async (
  keyDeriver: KeyDeriver,
  proof: UnlockProof,
  scope: VaultScope,
  bundle: VaultBundle,
  unlockId?: string,
): Promise<VaultKeyPair & { unlockId: string }> => (
  typeof proof === 'string'
    ? await openWithPassphrase(keyDeriver, proof, scope, bundle, unlockId)
    : await openWithPasskey(proof, scope, bundle, unlockId)
)

/**
 * The passkeyKey a passkey's PRF answer makes: HKDF-SHA256 over the answer, its `info` the
 * envelope's whole binding -- the vault, the purpose, and every public field of the envelope,
 * the credential among them -- so the same answer put to any other use, or in any other vault,
 * makes another key.
 */
const passkeyKeyOf = async (prfBytes: Uint8Array, envelopeBinding: Uint8Array): Promise<CryptoKey> => (
  await deriveWrappingKey(prfBytes, envelopeBinding)
)

/**
 * A passkey envelope around `vaultKey`, for the passkey whose answer `passkey` holds. The envelope
 * keeps the passkey's credential id and the salt it answered for, so the vault can ask it again;
 * never the answer.
 *
 * @param passkey - What the new passkey answered, over a fresh salt of {@link PasskeySaltBytes}.
 * @param scope - The vault's scope, bound into the wrap and its key.
 * @param bundle - The bundle's `vault_id` and `registered_at`, bound into the wrap and its key.
 * @param stamp - The envelope's {@link EnvelopeStamp}: its id, label, vaultKey epoch, device and time.
 * @param vaultKey - The vaultKey to wrap: extractable, as only such a key can be.
 */
export const sealPasskey = async (
  passkey: PasskeyProof,
  scope: VaultScope,
  bundle: BundleIdentity,
  stamp: EnvelopeStamp,
  vaultKey: CryptoKey,
): Promise<PasskeyEnvelope> => {
  const header = {
    method:        'passkey',
    ...stampOf(stamp),
    credential_id: passkey.credentialId,
    prf_salt_b64:  passkey.prfSaltB64,
  } as const
  const envelopeBinding = binding(scope, bundle, header)
  const passkeyKey = await passkeyKeyOf(passkey.prfBytes, envelopeBinding)
  const wrapped = await wrapKeyUnder(passkeyKey, vaultKey, envelopeBinding)
  return { ...header, vault_key_wrapped: wrapped }
}

/**
 * The vaultKey out of the passkey envelope of the credential that answered `passkey` -- given
 * `unlockId`, only if that is the envelope it names. No key derivation to speak of, and nothing
 * to try in turn: a credential has at most one envelope in a vault.
 *
 * Refuses with kind `absent_unlock` when no passkey envelope of the bundle is that credential's
 * (or the one `unlockId` names is not), `damaged_unlock` when its envelope's salt is not
 * base64url of {@link PasskeySaltBytes} bytes or its `vault_key_epoch` is not the bundle's, and
 * `wrong_passkey` when the answer is for another
 * salt than the envelope's, or does not open it. An answer for the envelope's own credential and
 * salt that does not open it is most likely an envelope altered in storage, but a passkey asked
 * without user verification answers differently, and the vault cannot tell how it was asked: so
 * it is `wrong_passkey`, and its message names both.
 *
 * @returns Both lives of the vaultKey, and the `unlock_id` of the envelope that opened.
 */
export const openWithPasskey = async (
  passkey: PasskeyProof,
  scope: VaultScope,
  bundle: VaultBundle,
  unlockId?: string,
): Promise<VaultKeyPair & { unlockId: string }> => {
  const envelope = bundle.unlocks.find((candidate): candidate is PasskeyEnvelope => (
    candidate.method === 'passkey' && candidate.credential_id === passkey.credentialId
    && (unlockId === undefined || candidate.unlock_id === unlockId)
  ))
  if (envelope === undefined) {
    throw new VaultError('absent_unlock', "None of this vault's passkeys is the one that answered: it may have been removed on another device, or be a passkey for another vault. Look again at the snapshot's unlocks.")
  }
  // A salt no envelope this package writes could hold, or a vaultKey other than the bundle's, is a
  // damaged way in, not a wrong passkey.
  if (saltBytesOf(envelope.prf_salt_b64)?.length !== PasskeySaltBytes || envelope.vault_key_epoch !== bundle.vault_key_epoch) {
    throw new VaultError('damaged_unlock', "This passkey's way into the vault is stored damaged, so it could not be tried. Unlock with a passphrase, then remove this passkey and add it again. The vault was left as it is.")
  }
  if (envelope.prf_salt_b64 !== passkey.prfSaltB64) {
    throw new VaultError('wrong_passkey', "The passkey answered for a different salt than this vault keeps for it: ask it again with the prf_salt_b64 the snapshot's unlocks list.")
  }
  const envelopeBinding = binding(scope, bundle, headerOf(envelope))
  const passkeyKey = await passkeyKeyOf(passkey.prfBytes, envelopeBinding)
  const opened = await tryUnwrap(passkeyKey, envelopeBinding, envelope.vault_key_wrapped)
  if (opened === null) {
    throw new VaultError('wrong_passkey', "That passkey answered, but its answer didn't unlock the vault: its stored way in may be damaged. Unlock with a passphrase; if that works, remove this passkey and add it again.")
  }
  return { ...opened, unlockId: envelope.unlock_id }
}
