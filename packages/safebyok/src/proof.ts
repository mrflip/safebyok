import * as Z from 'zod/mini'
import { deriveWrappingKey, fromB64, fromB64OrNull, importWrappingKeyBytes } from './crypto'
import { VaultError } from './errors'
import type { KeyDeriver } from './key-deriver'
import { hostThrewRefusal } from './outcome'
import { PassphraseKeyBytes } from './key-deriver-spec'
import { checkStrongEnough } from './passphrase-strength'
import { PasskeySaltBytes, type PasskeyAnswer, type WayinKind } from './types'
import { decorate } from './adorn'
import type { Vault } from './vault'
import type { PasskeyWayin, PassphraseWayin } from './wayin'

/**
 * Proofs: what the user hands in to show a way in is theirs, checked once at the vault's door. A
 * {@link PassphraseProof} holds the passphrase the user typed; a {@link PasskeyProof}, what a
 * passkey's authenticator answered. Neither is ever stored or logged, and each is held for one
 * attempt only. The derivation that turns a proof into a way in's wayinKey lives here, so the
 * secret never leaves its proof: `proof.wayinKeyFor(wayin)` hands back a non-extractable key, and
 * the bytes behind it are dropped at once.
 */

/**
 * The slice of a {@link Vault} a proof reads: the key deriver a passphrase's derivation runs on,
 * and the strength checker a new passphrase is put to, with the scope it is told.
 */
export type ProofVault = Pick<Vault, 'keyDeriver' | 'strengthChecker' | 'applabel' | 'user_id' | 'vaultlabel'>

/**
 * What the user handed in to show a way into the vault is theirs, checked: a
 * {@link PassphraseProof} or a {@link PasskeyProof}, told apart by `kind`. The vault makes one at
 * its door with `Proof.parse`, holds it for one attempt, and drops it. Its secret shows in no
 * `JSON.stringify`, spread or log line: `toJSON()` is its `kind` alone.
 *
 * @example const proof = Proof.parse(vault, passphrase)   // a PassphraseProof; kind 'passphrase'
 * @example JSON.stringify(Proof.parse(vault, passphrase))   // '{"kind":"passphrase"}'
 */
export abstract class Proof {
  /** The vault the proof was handed to: its key deriver makes a passphrase's key, its strength checker judges a new one. Not enumerable. */
  declare readonly vault: ProofVault
  /** Which kind of way in the proof can open: `passphrase` or `passkey`. */
  abstract readonly kind: WayinKind

  protected constructor(vault: ProofVault) {
    decorate<Proof>(this, { vault })
  }

  /**
   * A proof as a host hands one in, checked: text is a passphrase, anything else a passkey's
   * answer. Refuses a passkey's answer of the wrong shape as 'bad_option', quoting none of it. A
   * blank passphrase is a proof all the same: what it is refused as depends on its use, a
   * new passphrase (`checkStrongEnough`) or one that proves (`wayin.tryOpen`).
   *
   * @param vault - The vault the proof is for.
   * @param given - What the host handed in: the passphrase typed, or a {@link PasskeyAnswer}.
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

/**
 * A passphrase the user typed, as proof: it opens a passphrase's way in through the key deriver,
 * over that way in's own salt. The passphrase is the one secret field, and is not enumerable.
 *
 * @example const proof = PassphraseProof.parse(vault, typed)
 * @example await proof.wayinKeyFor(wayin)   // the passphraseKey, non-extractable
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

  /**
   * A passphrase as a host hands one in, checked: kind 'bad_option' for anything but text, not
   * quoting it. What the vault makes of a passphrase to unlock with, and of a new one to seal; a
   * new one is then put to {@link checkStrongEnough}.
   *
   * @param vault - The vault the passphrase is for.
   * @param given - The passphrase the user typed.
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

  /** True for a passphrase that is empty or only spaces: no way in opens to one, and no new one may be one. */
  get isBlank(): boolean {
    return ! this.passphrase.trim()
  }

  /**
   * Check this passphrase as a new one, before it becomes a way in: put to its vault's
   * `strengthChecker`, with the vault's scope. Refuses with kind 'weak_passphrase' for a blank one,
   * before the checker hears it, and for one the checker finds weak, its reason the message. A
   * checker that throws is refused 'unexpected_error', carrying nothing of what it threw; one that
   * answers no verdict, 'bad_option'. Only a new passphrase is checked: one that proves never is.
   *
   * @example await PassphraseProof.parse(vault, chosen).checkStrongEnough()   // throws 'weak_passphrase' with the checker's reason
   */
  async checkStrongEnough(): Promise<void> {
    const { vault } = this
    // Frozen, so the host's checker can change nothing of what it is told.
    const scope = Object.freeze({ applabel: vault.applabel, user_id: vault.user_id, vaultlabel: vault.vaultlabel })
    await checkStrongEnough(vault.strengthChecker, this.passphrase, scope)
  }

  /**
   * The passphraseKey this passphrase makes over the salt of `wayin`: the vault's key deriver's 32
   * bytes, imported as a non-extractable wrapping key and then zeroed. Refuses with kind
   * 'bad_option' for a key deriver that hands back anything but 32 bytes of memory of their own,
   * or 32 zero bytes. What a key deriver throws is refused as {@link hostThrewRefusal} says: a
   * condition as itself, anything else as 'unexpected_error', the throw its cause.
   *
   * @param wayin - The way in to make the key for: its `salt_b64` is all that is read.
   *
   * @example await proof.wayinKeyFor(wayin)   // a CryptoKey that wraps and unwraps, and cannot be exported
   */
  async wayinKeyFor(wayin: Pick<PassphraseWayin, 'salt_b64'>): Promise<CryptoKey> {
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

/**
 * What a passkey answered, as proof: which credential answered, the salt it was asked over, and
 * its 32-byte PRF answer. The answer is the one secret field, and is not enumerable; the
 * credential and salt are visible fields of the way in already.
 *
 * @example const proof = PasskeyProof.parse(vault, await askPasskey(vault.passkey))
 * @example JSON.stringify(proof)   // '{"kind":"passkey"}'
 */
export class PasskeyProof extends Proof {
  /** Always `passkey`. */
  readonly kind = 'passkey'
  /** The WebAuthn credential that answered, base64url: which way in it is for. */
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

  /**
   * A passkey's answer as a host hands one in, checked: kind 'bad_option' unless it is
   * `{ credentialId, prfSaltB64, prfBytes }`, two non-empty strings and 32 bytes, as
   * `safebyok-react`'s `askPasskey` and `createPasskey` give it. The refusal quotes none of it.
   *
   * @param vault - The vault the answer is for.
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

  /**
   * The passkeyKey this answer makes for `wayin`: HKDF-SHA256 over the answer, its `info` the way
   * in's whole `wayinCtx` -- the vault, the purpose, and every visible field of the way in, the
   * credential and salt among them -- so the same answer put to any other use, or in any other
   * vault, makes another key. Non-extractable.
   *
   * @param wayin - The way in to make the key for: its `wayinCtx` is all that is read.
   *
   * @example await proof.wayinKeyFor(wayin)   // a CryptoKey that wraps and unwraps, and cannot be exported
   */
  async wayinKeyFor(wayin: Pick<PasskeyWayin, 'wayinCtx'>): Promise<CryptoKey> {
    return await deriveWrappingKey(this.prfBytes, wayin.wayinCtx)
  }
}

/**
 * Refuse with kind 'bad_option' a new passkey's answer over anything but a salt of
 * {@link PasskeySaltBytes} bytes, as base64url text. A passkey's way in sealed over another would
 * read as damaged at every later unlock. The vault checks it at its door, before any key is made.
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
 * memory helps no one. Shared memory is refused untouched. What the deriver throws is refused as
 * {@link hostThrewRefusal} says: a condition as itself, anything else as 'unexpected_error'.
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
