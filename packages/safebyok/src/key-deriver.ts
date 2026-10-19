import { argon2idAsync } from '@noble/hashes/argon2.js'
import { importWrappingKeyBytes } from './crypto'
import { VaultError } from './errors'
import { Argon2idWebV1, PassphraseKeyBytes, ensureKeyDeriverSpec, ensureSaltFits, parseArgon2idSpec, type Argon2idSpec, type KeyDeriverSpec } from './key-deriver-spec'

/**
 * What turns a passphrase into the passphraseKey that wraps a vault's vaultKey: what `Vault.make`
 * asks for as `keyDeriver`, whatever algorithm it runs. Use {@link argon2idWebV1Deriver} (which
 * `browserOpts()` from `safebyok/browser` hands over), or {@link argon2idDeriver} for an Argon2id
 * spec of your own; safebyok-fastkey runs either through WebAssembly.
 *
 * To derive another way, extend this class -- or {@link Argon2idKeyDeriver}, for another
 * implementation of Argon2id -- and implement `doDeriveKeyBytes`, the runner: the key bytes of a
 * passphrase and its salt, deterministic, and slow by design. That is the whole job. The class does
 * the rest, for every deriver alike:
 *
 *  * **As it is made**, it checks its spec: an `algorithm` and a `key_deriver_label` of non-empty
 *    text, a `salt_bytes` from 1 to 65536, and a label safebyok does not reserve (those beginning
 *    `argon2id_web_`, in any case, but a supplied spec's own label carrying that spec whole). Only
 *    an Argon2idKeyDeriver, which checks Argon2id's own floors, may say `algorithm: 'argon2id'`.
 *    Kind 'bad_option' otherwise.
 *  * **At each derivation**, `passphraseKeyOf` -- the one method the vault calls -- refuses a salt
 *    of another length than the spec's before the runner sees it, refuses what the runner hands
 *    back unless it is 32 bytes in memory of their own (not a `SharedArrayBuffer`) and not all
 *    zero, makes the passphraseKey of them, and zeroes them. So the runner hands back fresh bytes
 *    each call, never bytes it keeps.
 *
 * Implement `doDeriveKeyBytes`; never override the public methods. A vault stores its deriver's
 * `key_deriver_label`, and unlocks only through a deriver carrying that same label: plugging in
 * your own commits every one of your users' vaults to it, so never change what a label derives.
 * Do not write your own derivation; run a vetted implementation, and test that it derives what the
 * deriver it stands in for does (`deriveKeyBytes`, on each). Vault.make logs a warning for a label
 * beginning `test_`, the mark of a deriver made cheap for tests.
 *
 * @example
 *   class ScryptDeriver extends KeyDeriver {
 *     constructor() { super({ algorithm: 'scrypt', key_deriver_label: 'acme_scrypt_v1', salt_bytes: 16 }) }
 *     protected doDeriveKeyBytes(passphrase: string, saltBytes: Uint8Array) {
 *       return scryptAsync(passphrase, saltBytes, { N: 2 ** 17, r: 8, p: 1, dkLen: 32 })
 *     }
 *   }
 *   const vault = Vault.make({ ...browserOpts(), keyDeriver: new ScryptDeriver(), applabel: 'acme', userId, vaultlabel: 'main', vaultDB })
 * @example
 *   new ScryptDeriver().key_deriver_label  // 'acme_scrypt_v1'
 */
export abstract class KeyDeriver<Spec extends KeyDeriverSpec = KeyDeriverSpec> {
  /** The spec this deriver was made with, checked and frozen. */
  readonly spec: Spec

  /** Stored beside each vault, so the stored format says how it was made: the spec's. */
  readonly key_deriver_label: string

  /** How long a passphraseSalt this deriver takes, in bytes: the spec's. */
  readonly salt_bytes: number

  /** What this deriver runs, as its spec names it. */
  readonly algorithm: string

  /**
   * A deriver of `spec`, once the spec passes the floor every deriver keeps (kind 'bad_option'
   * otherwise). A subclass checks its own spec first, and hands on what passes.
   *
   * @param spec - What the deriver runs, under which label, with what length of salt.
   */
  constructor(spec: Spec) {
    ensureKeyDeriverSpec(spec)
    // Argon2id's floors are checked in the Argon2id family: a deriver outside it may not claim it.
    if (spec.algorithm.toLowerCase() === 'argon2id' && ! (this instanceof Argon2idKeyDeriver)) {
      throw new VaultError('bad_option', 'A key deriver running Argon2id extends Argon2idKeyDeriver, which checks its parameters, rather than KeyDeriver itself.')
    }
    this.spec = Object.freeze({ ...spec })
    this.key_deriver_label = spec.key_deriver_label
    this.salt_bytes = spec.salt_bytes
    this.algorithm = spec.algorithm
  }

  /**
   * The passphraseKey `passphrase` and its salt make: the one method the vault calls. It runs
   * {@link KeyDeriver.deriveKeyBytes}, imports the 32 bytes as a non-extractable wrapping key, and
   * zeroes them, whether or not the import succeeds.
   *
   * @param passphrase - What the user typed.
   * @param saltBytes - The passphraseSalt of the wayin being sealed or opened.
   * @returns The passphraseKey, which only wraps and unwraps a vaultKey.
   *
   * @example const passphraseKey = await keyDeriver.passphraseKeyOf('correct horse battery staple', saltBytes)
   */
  async passphraseKeyOf(passphrase: string, saltBytes: Uint8Array): Promise<CryptoKey> {
    const keyBytes = await this.deriveKeyBytes(passphrase, saltBytes)
    try {
      return await importWrappingKeyBytes(keyBytes)
    } finally {
      keyBytes.fill(0)
    }
  }

  /**
   * 32 key bytes from the passphrase and its salt, through this deriver's runner, checked: a salt
   * of another length than the spec's is refused before the runner sees it, and what the runner
   * hands back is refused unless it is 32 bytes in memory of their own -- WebCrypto would take 16
   * or 24 as a weaker AES key, and refuses shared memory with no kind. Thirty-two zero bytes are
   * refused too: a key anyone could rebuild, which no derivation makes, but a runner handing back
   * bytes it kept from an earlier call, wiped since, would. Each refusal is kind 'bad_option', and
   * bytes refused for their length are zeroed first; shared memory is refused untouched. The vault reaches it through {@link KeyDeriver.passphraseKeyOf}; call it yourself to
   * test that a deriver derives what another does. The bytes it returns are yours to zero.
   *
   * @param passphrase - What the user typed.
   * @param saltBytes - A passphraseSalt of the spec's `salt_bytes`.
   * @returns The 32 key bytes.
   *
   * @example
   *   const keyBytes = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', passphraseSalt)
   *   keyBytes.length  // 32
   */
  async deriveKeyBytes(passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array> {
    ensureSaltFits(this.spec, saltBytes)
    const handed: unknown = await this.doDeriveKeyBytes(passphrase, saltBytes)
    if (! ArrayBuffer.isView(handed)) { throw notKeyBytes() }
    if (isSharedMemory(handed)) {
      throw new VaultError('bad_option', 'keyDeriver handed back key bytes in shared memory (a SharedArrayBuffer), which WebCrypto will not import and other threads could read: hand back a fresh Uint8Array.')
    }
    const keyBytes = new Uint8Array(handed.buffer, handed.byteOffset, handed.byteLength)
    if (keyBytes.byteLength !== PassphraseKeyBytes) {
      keyBytes.fill(0)
      throw notKeyBytes()
    }
    if (isAllZero(keyBytes)) {
      throw new VaultError('bad_option', 'keyDeriver handed back 32 zero bytes, a key anyone could rebuild: derive the key afresh on every call, and never hand back bytes kept from an earlier one.')
    }
    return keyBytes
  }

  /**
   * The runner, and all a subclass supplies: the key bytes of `passphrase` under `saltBytes`, at
   * this deriver's spec, fresh each call. The salt is already the spec's length.
   *
   * @param passphrase - What the user typed.
   * @param saltBytes - A passphraseSalt of the spec's `salt_bytes`.
   * @returns 32 key bytes, in memory of their own.
   */
  protected abstract doDeriveKeyBytes(passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array>
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
 * A KeyDeriver running Argon2id: the family every implementation of Argon2id joins, so that
 * Argon2id's floors are checked once, here, for all of them. As it is made it checks its
 * {@link Argon2idSpec} -- refusing (kind 'bad_option') a salt under 8 bytes or over 65536, memory
 * under 8 KiB a lane or over 1 GiB, no passes, no lanes, a key other than 32 bytes, a label safebyok
 * reserves, or a supplied spec's label on other parameters -- and keeps nothing but the spec's
 * fields. A weak spec that runs is allowed: choosing it is the host's call.
 *
 * {@link argon2idDeriver} (`@noble/hashes`) and safebyok-fastkey's `argon2idWasmDeriver`
 * (WebAssembly) are two. For a third, extend it and implement `doDeriveKeyBytes` at `this.spec`'s
 * parameters, then test that it derives what argon2idDeriver does at the same spec.
 *
 * @example
 *   class NativeArgon2idDeriver extends Argon2idKeyDeriver {
 *     protected doDeriveKeyBytes(passphrase: string, saltBytes: Uint8Array) {
 *       const { memory_kib, iterations, parallelism, output_bytes } = this.spec
 *       return nativeArgon2id({ passphrase, saltBytes, memory_kib, iterations, parallelism, output_bytes })
 *     }
 *   }
 *   const keyDeriver = new NativeArgon2idDeriver(Argon2idWebV1)  // stands in for argon2idWebV1Deriver
 * @example
 *   new NativeArgon2idDeriver({ ...Argon2idWebV1, iterations: 4 })
 *   // throws 'bad_option': argon2id_web_v1 always means 3 passes
 */
export abstract class Argon2idKeyDeriver extends KeyDeriver<Argon2idSpec> {
  /**
   * An Argon2id deriver of `spec`, checked and stripped to its fields.
   *
   * @param spec - The whole Argon2id parameter set, and the label vaults made under it record.
   */
  constructor(spec: Argon2idSpec) {
    super(parseArgon2idSpec(spec))
  }
}

/**
 * Argon2id through `@noble/hashes`: audited, pure JavaScript, running wherever the host app does.
 * Its async form yields to the event loop as it works, so a browser unlock does not freeze the page.
 */
class NobleArgon2idDeriver extends Argon2idKeyDeriver {
  protected doDeriveKeyBytes(passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array> {
    const { memory_kib, iterations, parallelism, output_bytes } = this.spec
    return argon2idAsync(passphrase, saltBytes, { m: memory_kib, t: iterations, p: parallelism, dkLen: output_bytes }) // eslint-disable-line id-length -- noble's option names
  }
}

/** A frozen NobleArgon2idDeriver of `spec`, once it passes. */
const nobleDeriverOf = (spec: Argon2idSpec): Argon2idKeyDeriver => {
  const deriver = new NobleArgon2idDeriver(spec)
  Object.freeze(deriver)
  return deriver
}

/**
 * A KeyDeriver running Argon2id at `spec` through `@noble/hashes` (audited, pure JS, runs wherever
 * the host app does). Choose a label of your own (naming your app, say), and never change its
 * parameters once a vault is made under it.
 *
 * Refuses (kind 'bad_option') what every {@link Argon2idKeyDeriver} refuses: a spec Argon2id
 * cannot run -- a salt under 8 bytes or over 65536, memory under 8 KiB a lane or over 1 GiB, no
 * passes, no lanes, a key other than 32 bytes -- a label safebyok reserves, and a supplied spec's
 * label without its parameters. A weak spec that runs is allowed.
 *
 * @param spec - The whole Argon2id parameter set, and the label vaults made under it record.
 * @returns A frozen Argon2idKeyDeriver of the spec.
 *
 * @example
 *   const keyDeriver = argon2idDeriver({
 *     ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072,
 *   })
 * @example
 *   argon2idDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', salt_bytes: 4 })
 *   // throws 'bad_option': Argon2id takes no salt under 8 bytes
 * @example
 *   argon2idDeriver({ ...Argon2idWebV1, iterations: 4 })
 *   // throws 'bad_option': argon2id_web_v1 always means 3 passes
 */
export const argon2idDeriver = (spec: Argon2idSpec): Argon2idKeyDeriver => nobleDeriverOf(spec)

/**
 * The KeyDeriver to use: Argon2id at the supplied {@link Argon2idWebV1} spec, through
 * `@noble/hashes`. `browserOpts()`, from `safebyok/browser`, hands it to Vault.make; outside a
 * browser, pass it as `keyDeriver` yourself.
 *
 * @example
 *   const keyBytes = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', passphraseSalt)
 *   keyBytes.length  // 32
 */
export const argon2idWebV1Deriver = /* @__PURE__ */ nobleDeriverOf(Argon2idWebV1)
