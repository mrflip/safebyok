import { argon2idAsync } from '@noble/hashes/argon2.js'
import { Argon2idWebV1, checkSaltFits, parseKeyDeriverSpec, type KeyDeriverSpec } from './key-deriver-spec'

/** What every key deriver carries, whatever its algorithm: the label a vault stores, the salt length it takes, and the function that derives. */
type KeyDeriverBase = {
  /** Stored with each passphrase wayin, to say how its passphraseKey was made. */
  key_deriver_label: string
  /** How long a passphraseSalt this deriver expects, in bytes: from 1 to 65536. */
  salt_bytes:        number
  /** 32 key bytes from the passphrase and its salt: deterministic, and slow by design.
   * Refuse a salt of another length than `salt_bytes` as 'bad_option', as the supplied derivers do.
   * Nothing you throw reaches the caller, as you hear the passphrase. A condition-family VaultError
   * keeps its kind under safebyok's own words. Anything else becomes 'unexpected_error', and the
   * logger hears only the kind of a VaultError you threw.
   */
  deriveKeyBytes(passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array>
  /** Fetch or build what the deriver needs before it can derive, such as a WebAssembly module.
   * Each bank's `hello()` runs it, so call it early only to warm up. Make it cost nothing once it
   * has succeeded, and forget a failure, so the next call tries again. One that fails refuses the
   * hello 'unexpected_error', what it threw the cause, as it heard no passphrase.
   */
  load?:             (() => void | Promise<void>) | undefined
}

/** A key deriver running Argon2id, carrying its whole {@link KeyDeriverSpec}, as {@link argon2idDeriver}'s do.
 * So are {@link argon2idWebV1Deriver} and safebyok-fastkey's derivers.
 * `Bank.make` checks the spec as {@link parseKeyDeriverSpec} does, so a bad one is refused when the
 * Vault object is made, not at its first unlock.
 */
export type Argon2idKeyDeriver = KeyDeriverSpec & KeyDeriverBase

/** A key deriver of another algorithm, or none declared: a label, a salt length and a function, with no Argon2id parameters.
 * `Bank.make` refuses one that declares `algorithm: 'argon2id'` without a whole spec, and one
 * wearing a label safebyok reserves (beginning `argon2id_web_`).
 */
export type CustomKeyDeriver = KeyDeriverBase & {
  /** What the deriver runs, in the host's own words. `argon2id` here means a whole {@link KeyDeriverSpec} must be carried. */
  readonly algorithm?: string
}

/** What turns a passphrase into passphraseKey bytes: an {@link Argon2idKeyDeriver} or a {@link CustomKeyDeriver}.
 * Use {@link argon2idWebV1Deriver}, or {@link argon2idDeriver} for a spec of your own. The seam lets
 * tests use a cheap deriver, and a host plug in a faster build of the same spec (WebAssembly, native).
 * Make it once, before any bank, and hand the same one to each: a deriver costly to set up carries
 * that setup as `load`, which each bank's `hello()` runs.
 *
 * A vault unlocks only through a deriver carrying the `key_deriver_label` its wayin stores, so
 * plugging in your own commits every user's vault to it. A deriver wearing a supplied spec's label
 * must carry exactly its parameters, or Bank.make refuses it as 'bad_option'.
 *
 * Do not write your own derivation. To substitute, use a vetted Argon2id implementation, spread the
 * spec into it, keep the label, and test that it derives the same bytes. Bank.make warns of a
 * label beginning `test_`, the mark of a deriver made cheap for tests.
 *
 * @example const wasmDeriver: KeyDeriver = { ...Argon2idWebV1, deriveKeyBytes: deriveWithWasm }
 */
export type KeyDeriver = Argon2idKeyDeriver | CustomKeyDeriver

/** A frozen KeyDeriver running Argon2id at `spec` through `@noble/hashes`, audited pure JS that runs wherever the host app does.
 * It yields to the event loop as it works, so an unlock does not freeze the page. Choose a label of
 * your own, naming your app, say. Never change its parameters once a vault is made under it.
 *
 * It refuses `spec` as {@link parseKeyDeriverSpec} does. The deriver refuses 'bad_option' for a
 * salt of another length than `salt_bytes`, before deriving anything.
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
export const argon2idDeriver = (spec: KeyDeriverSpec): Argon2idKeyDeriver => deriverOf(parseKeyDeriverSpec(spec))

/** A frozen deriver of a spec already checked: Argon2idWebV1, or one argon2idDeriver parsed. */
const deriverOf = (spec: KeyDeriverSpec): Argon2idKeyDeriver => {
  const argonOpts = { m: spec.memory_kib, t: spec.iterations, p: spec.parallelism, dkLen: spec.output_bytes } // eslint-disable-line id-length -- noble's option names
  return Object.freeze({
    ...spec,
    deriveKeyBytes: async (passphrase: string, saltBytes: Uint8Array) => {
      checkSaltFits(spec, saltBytes)
      return await argon2idAsync(passphrase, saltBytes, argonOpts)
    },
  })
}

/** The KeyDeriver to use: Argon2id at the supplied {@link Argon2idWebV1} spec.
 * `browserOpts()` hands it to Bank.make. Outside a browser, pass it as `keyDeriver` yourself.
 *
 * @example
 *   const keyBytes = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', passphraseSalt)
 *   keyBytes.length  // 32
 */
export const argon2idWebV1Deriver = /* @__PURE__ */ deriverOf(Argon2idWebV1)
