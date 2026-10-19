import { cipherCtx, deriveWrappingKey, fromB64, importWrappingKeyBytes, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder, type Ciphered } from './crypto'
import { VaultError } from './errors'
import type { KeyDeriver } from './key-deriver'
import { PassphraseKeyBytes } from './key-deriver-spec'
import { PasskeySaltBytes, type PasskeyWayin, type PasskeyProof, type PassphraseWayin, type Wayin, type WayinKind, type WayinSummary, type VaultProps, type VaultScope } from './types'

/**
 * Wayins: each the vaultKey wrapped under a wayinKey one kind of wayin makes, so a vault has several
 * ways in and one vaultKey behind them all. Imported whole, as `Wayin`: `Wayin.sealPassphrase`
 * and `Wayin.sealPasskey` make one, `Wayin.open` finds the one a passphrase or a passkey
 * opens, `Wayin.summarize` gives its visible fields. Internal to the package; the vault calls it.
 *
 * Each wayin's wrap is bound to its vault -- the scope, and the fields of the vault props that never
 * change, `vault_id` and `registered_at` -- and to its own visible header (every field but the wrap
 * itself, encoded with its keys sorted: its `vault_key_epoch`, `device_id` and `registered_at`
 * among them), under a purpose its wayinkind names. A passkey wayin's key is made with that same
 * context as its HKDF `info`. The vault props' `unlock_epoch` and the list of wayins are not in it:
 * a change to one wayin bumps the epoch and rewrites the list, and the others, whose
 * passphrases this device does not hold, must still open. A wayin whose `vault_key_epoch` is
 * not the vault props' is passed over as damaged, so one spliced in from older vault props never
 * hands over its older vaultKey as theirs.
 */

/**
 * The vaultKey's two lives after an unwrap. `transientKey` is extractable, because only an
 * extractable key can be wrapped (for the device record, or into a new way in); the
 * operation that needed it drops it on return. `sessionKey` is the handle the vault keeps
 * between operations: non-extractable, so the platform itself refuses to export its bytes.
 */
export type VaultKeyPair = { transientKey: CryptoKey, sessionKey: CryptoKey }

/** `WayinT` with every field but its wrap, member by member of a union. */
type HeaderOf<WayinT> = WayinT extends unknown ? Omit<WayinT, 'vault_key_wayin_wrapped'> : never
/** A wayin's visible header, every field but its wrap: what the wrap is bound to. */
export type WayinHeader = HeaderOf<Wayin>

/**
 * What a wayin's wrap binds of the vault props it belongs to: the fields the vault props never
 * change once made. A whole {@link VaultProps} is one.
 */
export type VaultIdentity = Pick<VaultProps, 'vault_id' | 'registered_at'>

/**
 * What a wayin is stamped with besides its wayinkind's own fields: its `wayin_id` and
 * `wayinlabel`, the `vault_key_epoch` of the vaultKey it wraps, and the `device_id` and
 * `registered_at` of the device and the time that added the way in. A way in sealed anew keeps
 * its stamp; a wayin is one.
 */
export type WayinStamp = Pick<Wayin, 'wayin_id' | 'wayinlabel' | 'vault_key_epoch' | 'device_id' | 'registered_at'>

/** The ctx's first part: the vault props' format, under which every wayin's wrap is bound. */
const VaultPropsFormat = 'safebyok-vault-v3'

/** The ctx purpose of each wayinkind's wrap, so no kind of wayin opens as another. */
const PurposeForWayinkind = {
  passphrase: 'vault_key_passphrase_wrapped',
  passkey:    'vault_key_passkey_wrapped',
} as const satisfies Readonly<Record<WayinKind, string>>

/** The usages of the handle a vault keeps: it wraps a lockboxKey and unwraps one, nothing else. */
const SessionUsage = { extractable: false, usage: ['wrapKey', 'unwrapKey'] } as const
// The transient is only ever the wrapped argument of a wrap; WebCrypto refuses an empty usage
// list, so it carries the narrowest one.
const TransientUsage = { extractable: true, usage: ['wrapKey'] } as const

/**
 * The context a wayin's wrap is bound to (and, for a passkey, its key made with): the vault it
 * lets into, and its own visible header.
 */
const wayinCtxOf = (scope: VaultScope, vaultProps: VaultIdentity, header: WayinHeader): Uint8Array => (
  cipherCtx(VaultPropsFormat, scope.applabel, scope.user_id, scope.vaultlabel, vaultProps.vault_id, vaultProps.registered_at, PurposeForWayinkind[header.wayinkind], header)
)

/** The stamp's own fields, and nothing else of whatever carries them: a wayin sealed anew passes itself. */
const stampOf = ({ wayin_id, wayinlabel, vault_key_epoch, device_id, registered_at }: WayinStamp): WayinStamp => (
  { wayin_id, wayinlabel, vault_key_epoch, device_id, registered_at }
)

/** `wayin` without its wrap. */
const headerOf = (wayin: Wayin): WayinHeader => {
  const { vault_key_wayin_wrapped: _wrapped, ...header } = wayin
  return header
}

/**
 * What the user presents to show a wayin is theirs: a passphrase the user typed, or what a
 * passkey answered. A blank passphrase never reaches here, nor a passkey proof of the wrong
 * shape: the vault refuses both at its door.
 */
export type Proof = string | PasskeyProof

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
 * A passphrase wayin around `vaultKey`, under a fresh passphraseSalt.
 *
 * @param keyDeriver - What makes the passphraseKey; its label goes on the wayin.
 * @param passphrase - The passphrase this wayin admits.
 * @param scope - The vault's scope, bound into the wrap.
 * @param vaultProps - The vault props' `vault_id` and `registered_at`, bound into the wrap.
 * @param stamp - The wayin's {@link WayinStamp}: its id, label, vaultKey epoch, device and time.
 * @param vaultKey - The vaultKey to wrap: extractable, as only such a key can be.
 */
export const sealPassphrase = async (
  keyDeriver: KeyDeriver,
  passphrase: string,
  scope: VaultScope,
  vaultProps: VaultIdentity,
  stamp: WayinStamp,
  vaultKey: CryptoKey,
): Promise<PassphraseWayin> => {
  const { wayin } = await wrapUnderPassphrase(keyDeriver, passphrase, scope, vaultProps, stamp, vaultKey)
  return wayin
}

/**
 * A vault's first passphrase wayin, as {@link sealPassphrase} makes one, and the session's
 * handle on the vaultKey through it: the creating unlock keeps that, where every later wayin
 * is for the vault's other devices.
 *
 * @returns The wayin, and a non-extractable handle on the vaultKey unwrapped from it.
 */
export const sealFirstPassphrase = async (
  keyDeriver: KeyDeriver,
  passphrase: string,
  scope: VaultScope,
  vaultProps: VaultIdentity,
  stamp: WayinStamp,
  vaultKey: CryptoKey,
): Promise<{ wayin: PassphraseWayin, sessionKey: CryptoKey }> => {
  const { wayin, wayinKey, wayinCtx } = await wrapUnderPassphrase(keyDeriver, passphrase, scope, vaultProps, stamp, vaultKey)
  const sessionKey = await unwrapKeyUnder(wayinKey, wayin.vault_key_wayin_wrapped, wayinCtx, SessionUsage)
  return { wayin, sessionKey }
}

/** The wayin around `vaultKey` under `passphrase`'s key, with that key and the ctx it was wrapped to. */
const wrapUnderPassphrase = async (
  keyDeriver: KeyDeriver,
  passphrase: string,
  scope: VaultScope,
  vaultProps: VaultIdentity,
  stamp: WayinStamp,
  vaultKey: CryptoKey,
) => {
  const saltBytes = randomBytes(keyDeriver.salt_bytes)
  const header = {
    wayinkind:         'passphrase',
    ...stampOf(stamp),
    key_deriver_label: keyDeriver.key_deriver_label,
    salt_b64:          toB64(saltBytes),
  } as const
  const wayinKey = await passphraseKeyOf(keyDeriver, passphrase, saltBytes)
  const wayinCtx = wayinCtxOf(scope, vaultProps, header)
  const wrapped = await wrapKeyUnder(wayinKey, vaultKey, wayinCtx)
  const wayin: PassphraseWayin = { ...header, vault_key_wayin_wrapped: wrapped }
  return { wayin, wayinKey, wayinCtx }
}

/**
 * The vaultKey out of whichever of `vaultProps`'s passphrase wayins `passphrase` opens -- or, given
 * `wayinId`, out of that one wayin only. Each wayin tried costs one key derivation, in the
 * order the vault props list them, and the first that opens ends the search. A wayin refusing to
 * open IS the passphrase check: there is no comparison.
 *
 * A wayin whose salt is not base64url of `keyDeriver.salt_bytes` bytes is damaged: its
 * deriver never made such a salt. So is one whose `vault_key_epoch` is not the vault props': it
 * wraps some other vaultKey than the vault props stand for. Either is passed over, costing no derivation,
 * and the others are tried as ever, so one damaged way in shuts out no other.
 *
 * Refuses with kind `absent_wayin` when `wayinId` names no passphrase wayin of the vault props,
 * `unknown_key_deriver` when every wayin it would try was made by a key deriver other than
 * `keyDeriver`, `damaged_wayin` when every one it would try is damaged, and `wrong_passphrase`
 * when none it tried opens. That last is all the wayins can say: a wrong passphrase and a
 * wayin altered in storage fail alike, so its message names both -- and, when wayins made
 * by another key deriver were passed over, how many, and that opening the vault where it was
 * made may help.
 *
 * @returns Both lives of the vaultKey, and the `wayin_id` of the wayin that opened.
 */
export const openWithPassphrase = async (
  keyDeriver: KeyDeriver,
  passphrase: string,
  scope: VaultScope,
  vaultProps: VaultProps,
  wayinId?: string,
): Promise<VaultKeyPair & { wayinId: string }> => {
  const passphrases = vaultProps.wayins.filter((wayin) => wayin.wayinkind === 'passphrase')
  const aimed = wayinId === undefined ? passphrases : passphrases.filter((wayin) => wayin.wayin_id === wayinId)
  if (aimed.length === 0) { throw absentWayin() }
  const derivable = aimed.filter((wayin) => wayin.key_deriver_label === keyDeriver.key_deriver_label)
  if (derivable.length === 0) {
    throw new VaultError('unknown_key_deriver', 'This vault was made with a key deriver this package does not carry: update safebyok, or open the vault where it was made.')
  }
  // Sorted out before the first derivation, so the outcome never hangs on order. (Checked here
  // rather than in the record's schema, which every entry point's vault props carry whole.)
  const sound = derivable.filter((wayin) => (
    saltBytesOf(wayin.salt_b64)?.length === keyDeriver.salt_bytes && wayin.vault_key_epoch === vaultProps.vault_key_epoch
  ))
  if (sound.length === 0) {
    if (wayinId !== undefined) {
      throw new VaultError('damaged_wayin', "That passphrase's way into the vault is stored damaged, so it could not be tried. Unlock another way, then remove it and add the passphrase again. The vault was left as it is.")
    }
    const told = derivable.length < aimed.length
      ? "Every passphrase of this vault that this package can try is stored damaged, and the others were made with a key deriver this package does not carry. Update safebyok, or open the vault where it was made. The vault was left as it is."
      : "Every passphrase of this vault is stored damaged, so none could be tried. Unlock with a passkey, if the vault has one, then add a new passphrase. The vault was left as it is."
    throw new VaultError('damaged_wayin', told)
  }
  for (const wayin of sound) {
    const opened = await tryPassphrase(keyDeriver, passphrase, scope, vaultProps, wayin)
    if (opened !== null) { return { ...opened, wayinId: wayin.wayin_id } }
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
 * The refusal for a `wayin_id` that names no way in of the vault props: it may have been removed on
 * another device. Never quotes the id.
 */
export const absentWayin = () => new VaultError('absent_wayin', "This vault has no way in with that wayin_id: it may have been removed on another device. Look again at the snapshot's wayins.")

/** A wayin's salt as bytes, or null when its base64url text is not base64url. */
export const saltBytesOf = (saltB64: string): Uint8Array | null => {
  try {
    return fromB64(saltB64)
  } catch {
    return null
  }
}

/** Both lives of the vaultKey out of one passphrase wayin, or null when it will not open. */
const tryPassphrase = async (
  keyDeriver: KeyDeriver,
  passphrase: string,
  scope: VaultScope,
  vaultProps: VaultIdentity,
  wayin: PassphraseWayin,
): Promise<VaultKeyPair | null> => {
  const wayinKey = await passphraseKeyOf(keyDeriver, passphrase, fromB64(wayin.salt_b64))
  return await tryUnwrap(wayinKey, wayinCtxOf(scope, vaultProps, headerOf(wayin)), wayin.vault_key_wayin_wrapped)
}

/** Both lives of the vaultKey out of `wrapped` under `wayinKey`, or null when it will not open. */
const tryUnwrap = async (wayinKey: CryptoKey, wayinCtx: Uint8Array, wrapped: Ciphered): Promise<VaultKeyPair | null> => {
  try {
    const transientKey = await unwrapKeyUnder(wayinKey, wrapped, wayinCtx, TransientUsage)
    const sessionKey = await unwrapKeyUnder(wayinKey, wrapped, wayinCtx, SessionUsage)
    return { transientKey, sessionKey }
  } catch {
    return null
  }
}

/**
 * The visible fields of a wayin, as a locked vault may show them: its wayinkind, id, label, and the
 * device and time that added it, and for a passkey the credential and salt a host asks its
 * authenticator with; never a passphrase's salt, never a wrap.
 *
 * @example Wayin.summarize(vaultProps.wayins[0]) // { wayinkind: 'passphrase', wayin_id: '1b9d...', wayinlabel: 'passphrase', device_id: 'k3x9...', registered_at: 1760000000000 }
 * @example Wayin.summarize(passkeyWayin)    // { wayinkind: 'passkey', wayin_id, wayinlabel: 'laptop', device_id, registered_at, credential_id: 'AXk3...', prf_salt_b64: 'q83v...' }
 */
export const summarize = (wayin: Wayin): WayinSummary => {
  const { wayinkind, wayin_id, wayinlabel, device_id, registered_at } = wayin
  if (wayinkind === 'passphrase') { return { wayinkind, wayin_id, wayinlabel, device_id, registered_at } }
  return { wayinkind, wayin_id, wayinlabel, device_id, registered_at, credential_id: wayin.credential_id, prf_salt_b64: wayin.prf_salt_b64 }
}

/**
 * The vaultKey out of whichever of `vaultProps`'s wayins `proof` opens: a passphrase as
 * {@link openWithPassphrase} finds it, a passkey as {@link openWithPasskey} does.
 */
export const open = async (
  keyDeriver: KeyDeriver,
  proof: Proof,
  scope: VaultScope,
  vaultProps: VaultProps,
  wayinId?: string,
): Promise<VaultKeyPair & { wayinId: string }> => (
  typeof proof === 'string'
    ? await openWithPassphrase(keyDeriver, proof, scope, vaultProps, wayinId)
    : await openWithPasskey(proof, scope, vaultProps, wayinId)
)

/**
 * The passkeyKey a passkey's PRF answer makes: HKDF-SHA256 over the answer, its `info` the
 * wayin's whole ctx -- the vault, the purpose, and every visible field of the wayin,
 * the credential among them -- so the same answer put to any other use, or in any other vault,
 * makes another key.
 */
const passkeyKeyOf = async (prfBytes: Uint8Array, wayinCtx: Uint8Array): Promise<CryptoKey> => (
  await deriveWrappingKey(prfBytes, wayinCtx)
)

/**
 * A passkey wayin around `vaultKey`, for the passkey whose answer `passkey` holds. The wayin
 * keeps the passkey's credential id and the salt it answered for, so the vault can ask it again;
 * never the answer.
 *
 * @param passkey - What the new passkey answered, over a fresh salt of {@link PasskeySaltBytes}.
 * @param scope - The vault's scope, bound into the wrap and its key.
 * @param vaultProps - The vault props' `vault_id` and `registered_at`, bound into the wrap and its key.
 * @param stamp - The wayin's {@link WayinStamp}: its id, label, vaultKey epoch, device and time.
 * @param vaultKey - The vaultKey to wrap: extractable, as only such a key can be.
 */
export const sealPasskey = async (
  passkey: PasskeyProof,
  scope: VaultScope,
  vaultProps: VaultIdentity,
  stamp: WayinStamp,
  vaultKey: CryptoKey,
): Promise<PasskeyWayin> => {
  const header = {
    wayinkind:     'passkey',
    ...stampOf(stamp),
    credential_id: passkey.credentialId,
    prf_salt_b64:  passkey.prfSaltB64,
  } as const
  const wayinCtx = wayinCtxOf(scope, vaultProps, header)
  const wayinKey = await passkeyKeyOf(passkey.prfBytes, wayinCtx)
  const wrapped = await wrapKeyUnder(wayinKey, vaultKey, wayinCtx)
  return { ...header, vault_key_wayin_wrapped: wrapped }
}

/**
 * The vaultKey out of the passkey wayin of the credential that answered `passkey` -- given
 * `wayinId`, only if that is the wayin it names. No key derivation to speak of, and nothing
 * to try in turn: a credential has at most one wayin in a vault.
 *
 * Refuses with kind `absent_wayin` when no passkey wayin of the vault props is that credential's
 * (or the one `wayinId` names is not), `damaged_wayin` when its wayin's salt is not
 * base64url of {@link PasskeySaltBytes} bytes or its `vault_key_epoch` is not the vault props', and
 * `wrong_passkey` when the answer is for another
 * salt than the wayin's, or does not open it. An answer for the wayin's own credential and
 * salt that does not open it is most likely a wayin altered in storage, but a passkey asked
 * without user verification answers differently, and the vault cannot tell how it was asked: so
 * it is `wrong_passkey`, and its message names both.
 *
 * @returns Both lives of the vaultKey, and the `wayin_id` of the wayin that opened.
 */
export const openWithPasskey = async (
  passkey: PasskeyProof,
  scope: VaultScope,
  vaultProps: VaultProps,
  wayinId?: string,
): Promise<VaultKeyPair & { wayinId: string }> => {
  const wayin = vaultProps.wayins.find((candidate): candidate is PasskeyWayin => (
    candidate.wayinkind === 'passkey' && candidate.credential_id === passkey.credentialId
    && (wayinId === undefined || candidate.wayin_id === wayinId)
  ))
  if (wayin === undefined) {
    throw new VaultError('absent_wayin', "None of this vault's passkeys is the one that answered: it may have been removed on another device, or be a passkey for another vault. Look again at the snapshot's wayins.")
  }
  // A salt no wayin this package writes could hold, or a vaultKey other than the vault props', is a
  // damaged way in, not a wrong passkey.
  if (saltBytesOf(wayin.prf_salt_b64)?.length !== PasskeySaltBytes || wayin.vault_key_epoch !== vaultProps.vault_key_epoch) {
    throw new VaultError('damaged_wayin', "This passkey's way into the vault is stored damaged, so it could not be tried. Unlock with a passphrase, then remove this passkey and add it again. The vault was left as it is.")
  }
  if (wayin.prf_salt_b64 !== passkey.prfSaltB64) {
    throw new VaultError('wrong_passkey', "The passkey answered for a different salt than this vault keeps for it: ask it again with the prf_salt_b64 the snapshot's wayins list.")
  }
  const wayinCtx = wayinCtxOf(scope, vaultProps, headerOf(wayin))
  const wayinKey = await passkeyKeyOf(passkey.prfBytes, wayinCtx)
  const opened = await tryUnwrap(wayinKey, wayinCtx, wayin.vault_key_wayin_wrapped)
  if (opened === null) {
    throw new VaultError('wrong_passkey', "That passkey answered, but its answer didn't unlock the vault: its stored way in may be damaged. Unlock with a passphrase; if that works, remove this passkey and add it again.")
  }
  return { ...opened, wayinId: wayin.wayin_id }
}
