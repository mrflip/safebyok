import * as Z from 'zod/mini'
import { deriveWrappingKey, fromB64, fromB64OrNull, importWrappingKeyBytes } from './crypto'
import { VaultError } from './errors'
import type { KeyDeriver } from './key-deriver'
import { hostThrewRefusal } from './outcome'
import { PassphraseKeyBytes } from './key-deriver-spec'
import { PasskeySaltBytes, type PasskeyAnswer, type PassphraseWayinRecord, type WayinKind } from './types'
import { decorate } from './adorn'
import type { Vault } from './vault'
import type { PasskeyWayin } from './wayin'

/** Proofs: what the user hands in to show a wayin is theirs, checked once at the vault's door.
 * Neither kind is ever stored or logged, and each is held for one attempt only. The secret never
 * leaves its proof: `proof.wayinKeyFor(wayin)` hands back a non-extractable wayinKey.
 * Each `parse` refuses 'bad_option' for what is not a proof of its kind, quoting none of it.
 */

/** The slice of a {@link Vault} a proof reads: its key deriver, and its check for a new passphrase. */
export type ProofVault = Pick<Vault, 'keyDeriver' | 'checkPassphrase'>

/** A checked proof, a {@link PassphraseProof} or a {@link PasskeyProof}, told apart by `kind`.
 * Its secret shows in no `JSON.stringify`, spread or log line: `toJSON()` is its `kind` alone.
 *
 * @example const proof = Proof.parse(vault, passphrase)   // a PassphraseProof; kind 'passphrase'
 * @example JSON.stringify(Proof.parse(vault, passphrase))   // '{"kind":"passphrase"}'
 */
export abstract class Proof {
  /** The vault the proof was handed to. Not enumerable. */
  declare readonly vault: ProofVault
  /** Which kind of wayin the proof can open. */
  abstract readonly kind: WayinKind

  protected constructor(vault: ProofVault) {
    decorate<Proof>(this, { vault })
  }

  /** A proof as a host hands one in, checked: text is a passphrase, anything else a passkey's answer.
   * A blank passphrase is a proof all the same. Its use decides its refusal:
   * `checkStrongEnough` for a new one, `wayin.tryOpen` for one that proves.
   *
   * @param given - The passphrase typed, or a {@link PasskeyAnswer}.
   *
   * @example Proof.parse(vault, 'correct horse battery staple')   // a PassphraseProof
   * @example Proof.parse(vault, await askPasskey(vault.passkey))   // a PasskeyProof
   * @example Proof.parse(vault, { credentialId: 'abc' })   // throws 'bad_option'
   */
  static parse(vault: ProofVault, given: unknown): PassphraseProof | PasskeyProof {
    if (typeof given === 'string') { return PassphraseProof.parse(vault, given) }
    return PasskeyProof.parse(vault, given)
  }

  /** The proof as a log line or `JSON.stringify` may show it: its `kind`, and nothing secret. */
  toJSON(): { kind: WayinKind } {
    return { kind: this.kind }
  }
}

/** A passphrase the user typed, as proof: it opens a passphrase wayin through the key deriver, over that wayin's own salt.
 *
 * @example const proof = PassphraseProof.parse(vault, typed)
 * @example await proof.wayinKeyFor(wayin.record)   // the passphraseKey, non-extractable
 */
export class PassphraseProof extends Proof {
  /** Always `passphrase`. */
  readonly kind = 'passphrase'
  /** The passphrase as the user typed it. Secret: not enumerable, never logged, never stored. */
  declare readonly passphrase: string

  private constructor(vault: ProofVault, passphrase: string) {
    super(vault)
    decorate<PassphraseProof>(this, { passphrase })
    Object.freeze(this)
  }

  /** A passphrase as a host hands one in, checked to be text: to unlock with, or a new one to seal after {@link checkStrongEnough}.
   *
   * @example PassphraseProof.parse(vault, typed)
   * @example PassphraseProof.parse(vault, 42)   // throws 'bad_option'
   */
  static override parse(vault: ProofVault, given: unknown): PassphraseProof {
    if (typeof given !== 'string') {
      throw new VaultError('bad_option', 'A passphrase is the text the user typed, as a string.')
    }
    return new PassphraseProof(vault, given)
  }

  /** True for a passphrase that is empty or only spaces: no wayin opens to one, and no new one may be one. */
  get isBlank(): boolean {
    return ! this.passphrase.trim()
  }

  /** Check this passphrase as a new one, through its vault's `checkPassphrase`, before it becomes a wayin.
   * It refuses 'weak_passphrase' for a weak one, the checker's reason its message, and for a blank
   * one, which the checker never hears. A broken checker's refusal passes as it came. A passphrase
   * that proves is never checked.
   *
   * @example await PassphraseProof.parse(vault, chosen).checkStrongEnough()   // throws 'weak_passphrase' with the checker's reason
   */
  async checkStrongEnough(): Promise<void> {
    const verdict = await this.vault.checkPassphrase(this.passphrase)
    if (! verdict.strong) { throw new VaultError('weak_passphrase', verdict.reason) }
  }

  /** The non-extractable passphraseKey this passphrase makes over the salt of `wayin`, through the vault's key deriver.
   * The deriver's bytes are zeroed once imported. It refuses 'bad_option' for a deriver that hands
   * back anything but 32 bytes, in memory of their own and not all zero. What the deriver throws
   * is refused as {@link hostThrewRefusal} says.
   *
   * @example await proof.wayinKeyFor(wayin.record)   // a CryptoKey that wraps and unwraps, and cannot be exported
   */
  async wayinKeyFor(wayin: Pick<PassphraseWayinRecord, 'salt_b64'>): Promise<CryptoKey> {
    return await passphraseKeyOf(this.vault.keyDeriver, this.passphrase, fromB64(wayin.salt_b64))
  }
}

/** How many bytes a passkey's PRF answers with: always 32, by the WebAuthn PRF extension. */
const PrfAnswerBytes = 32

/** What a passkey's answer must carry. The refusal never quotes it: its bytes are secret. */
const passkeyAnswerShape = Z.object({
  credentialId: Z.string().check(Z.minLength(1)),
  prfSaltB64:   Z.string().check(Z.minLength(1)),
  prfBytes:     Z.custom<Uint8Array>((candidate) => candidate instanceof Uint8Array && candidate.length === PrfAnswerBytes),
})

/** What a passkey answered, as proof: which credential answered, the salt it was asked over, and its 32-byte PRF answer.
 * Only the PRF answer is secret: the credential and salt are visible fields of the wayin already.
 *
 * @example const proof = PasskeyProof.parse(vault, await askPasskey(vault.passkey))
 * @example JSON.stringify(proof)   // '{"kind":"passkey"}'
 */
export class PasskeyProof extends Proof {
  /** Always `passkey`. */
  readonly kind = 'passkey'
  /** The WebAuthn credential that answered, base64url: which wayin it is for. */
  readonly credentialId: string
  /** The salt the authenticator evaluated its PRF over, base64url. */
  readonly prfSaltB64: string
  /** The authenticator's 32-byte PRF answer. Secret: not enumerable, never logged, never stored. */
  declare readonly prfBytes: Uint8Array

  private constructor(vault: ProofVault, answer: PasskeyAnswer) {
    super(vault)
    this.credentialId = answer.credentialId
    this.prfSaltB64 = answer.prfSaltB64
    decorate<PasskeyProof>(this, { prfBytes: answer.prfBytes })
    Object.freeze(this)
  }

  /** A passkey's answer as a host hands one in, checked to be two non-empty strings and 32 bytes, as `safebyok-react`'s `askPasskey` gives it.
   * @param given - The {@link PasskeyAnswer}.
   *
   * @example PasskeyProof.parse(vault, answer)
   * @example PasskeyProof.parse(vault, { ...answer, prfBytes: [...answer.prfBytes] })   // throws 'bad_option': an array is not bytes
   */
  static override parse(vault: ProofVault, given: unknown): PasskeyProof {
    const checked = passkeyAnswerShape.safeParse(given)
    if (! checked.success) {
      throw new VaultError('bad_option', `A passkey's answer is { credentialId, prfSaltB64, prfBytes }: the credential's id and the salt it answered for, as base64url text, and its ${String(PrfAnswerBytes)}-byte PRF answer, as safebyok-react's askPasskey and createPasskey give them.`)
    }
    return new PasskeyProof(vault, checked.data)
  }

  /** The non-extractable passkeyKey this answer makes for `wayin`, by HKDF-SHA256 with the wayin's whole `wayinCtx` as its `info`.
   * So the same answer put to any other use, or in any other vault, makes another key.
   *
   * @example await proof.wayinKeyFor(wayin)   // a CryptoKey that wraps and unwraps, and cannot be exported
   */
  async wayinKeyFor(wayin: Pick<PasskeyWayin, 'wayinCtx'>): Promise<CryptoKey> {
    return await deriveWrappingKey(this.prfBytes, wayin.wayinCtx)
  }
}

/** Refuse 'bad_option' for a new passkey's answer over a salt that is not {@link PasskeySaltBytes} bytes as base64url text.
 * A passkey wayin sealed over another would read as damaged at every later unlock. Check it
 * before any key is made.
 *
 * @example checkSaltShape(PasskeyProof.parse(vault, await createPasskey(opts)))   // passes
 * @example checkSaltShape(PasskeyProof.parse(vault, { ...answer, prfSaltB64: 'c2hvcnQ' }))   // throws 'bad_option'
 */
export const checkSaltShape = (proof: PasskeyProof): void => {
  if (fromB64OrNull(proof.prfSaltB64)?.length !== PasskeySaltBytes) {
    throw new VaultError('bad_option', `A new passkey answers over a fresh salt of ${String(PasskeySaltBytes)} random bytes, as base64url text: safebyok-react's createPasskey mints one.`)
  }
}

/** The refusal for a key deriver's result that is not 32 bytes of a view. */
const notKeyBytes = () => new VaultError('bad_option', 'keyDeriver handed back something other than 32 key bytes: a passphraseKey is a 256-bit key.')

/** True when a key deriver's bytes sit in shared memory, told even across realms and where `SharedArrayBuffer` is absent. */
const isSharedMemory = (view: ArrayBufferView): boolean => Object.prototype.toString.call(view.buffer) === '[object SharedArrayBuffer]'

/** True when every byte of `bytes` is zero, read with no early exit, as libsodium's `sodium_is_zero` does.
 * No JavaScript engine promises constant time, but nothing here branches on a byte: only the
 * verdict steers what follows, and the refusal of an all-zero output tells that anyway.
 */
const isAllZero = (bytes: Uint8Array): boolean => bytes.reduce((seen, byte) => seen | byte, 0) === 0

/** The passphraseKey `keyDeriver` makes of `passphrase` and its salt, the deriver's bytes zeroed after, whatever happens.
 * It refuses 'bad_option' for anything but 32 bytes in memory of their own, before anything is
 * wrapped: WebCrypto would take 16 or 24 as a weaker key. It refuses 32 zero bytes alike: a key
 * anyone could rebuild, as a deriver handing back bytes kept from an earlier call, wiped since,
 * would make. Shared memory is refused untouched. What the deriver throws is refused as {@link
 * hostThrewRefusal} says.
 */
const passphraseKeyOf = async (keyDeriver: KeyDeriver, passphrase: string, saltBytes: Uint8Array): Promise<CryptoKey> => {
  let handed: unknown
  try {
    handed = await keyDeriver.deriveKeyBytes(passphrase, saltBytes)
  } catch (err) {
    // The deriver heard the passphrase: what it threw may quote it.
    throw hostThrewRefusal(err)
  }
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
