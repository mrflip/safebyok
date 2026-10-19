import { argon2idAsync } from '@noble/hashes/argon2.js'
import { Argon2idWebV1, checkSaltFits, parseKeyDeriverSpec, type KeyDeriverSpec } from './key-deriver-spec'

/**
 * What every key deriver carries, whatever its algorithm: the label a vault stores, the salt
 * length it takes, and the function that derives.
 */
type KeyDeriverBase = {
  /** Stored beside each vault, so the stored format says how it was made. */
  key_deriver_label: string
  /** How long a passphraseSalt this deriver expects, in bytes: from 1 to 65536. */
  salt_bytes:        number
  /**
   * 32 key bytes from the passphrase and its salt: deterministic, and slow by design. Refuses a
   * salt of another length than `salt_bytes` (kind 'bad_option'), as the supplied derivers do.
   */
  deriveKeyBytes(passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array>
}

/**
 * A key deriver running Argon2id: the whole {@link KeyDeriverSpec} beside its function, every
 * parameter present. `Vault.make` checks the spec as `argon2idDeriver` does, so one Argon2id
 * cannot run is refused (kind 'bad_option') when the vault is opened, not at its first unlock.
 * What {@link argon2idDeriver}, {@link argon2idWebV1Deriver} and safebyok-fastkey's derivers are.
 */
export type Argon2idKeyDeriver = KeyDeriverSpec & KeyDeriverBase

/**
 * A key deriver of any other algorithm, or of none declared: a label, a salt length and a
 * function, and optionally the `algorithm` it runs, named in the host's own words. It carries no
 * Argon2id parameters; `Vault.make` refuses one that declares `algorithm: 'argon2id'` without
 * them being a whole spec, and one whose label safebyok reserves (those beginning `argon2id_web_`).
 */
export type CustomKeyDeriver = KeyDeriverBase & {
  /** What the deriver runs, if it says: `argon2id` here means a whole {@link KeyDeriverSpec} must be carried. */
  readonly algorithm?: string
}

/**
 * What turns a passphrase into passphraseKey bytes: an {@link Argon2idKeyDeriver}, the one to use
 * being {@link argon2idWebV1Deriver} and {@link argon2idDeriver} making one for a spec of your
 * own, or a {@link CustomKeyDeriver} of some other algorithm. The seam exists so tests can
 * substitute a cheap deriver, and so a host on a platform with a faster implementation of the
 * same Argon2id spec (WebAssembly, native) can plug it in.
 *
 * A vault stores its deriver's `key_deriver_label`, and unlocks only through a deriver carrying
 * that same label: plugging in your own commits every one of your users' vaults to it. An
 * Argon2id deriver carries its whole keyDeriverSpec beside its function, and one that wears the
 * label of a spec safebyok supplies must carry exactly that spec's parameters, or Vault.make
 * refuses it (kind 'bad_option'); so does a label beginning `argon2id_web_` that is not one
 * safebyok supplies, those being reserved. Do not write your own derivation; if you must
 * substitute, use a vetted Argon2id implementation, spread the spec into it, keep the label, and
 * test that it derives the same bytes as the deriver it stands in for. Vault.make logs a warning
 * for a label beginning `test_`, the mark of a deriver made cheap for tests.
 *
 * @example const wasmDeriver: KeyDeriver = { ...Argon2idWebV1, deriveKeyBytes: deriveWithWasm }
 */
export type KeyDeriver = Argon2idKeyDeriver | CustomKeyDeriver

/**
 * A KeyDeriver running Argon2id at `spec`, through `@noble/hashes` (audited, pure JS, runs
 * wherever the host app does), carrying the spec beside its function. The async form yields to
 * the event loop as it works, so a browser unlock does not freeze the page. Choose a label of
 * your own (naming your app, say), and never change its parameters once a vault is made under it.
 *
 * Refuses (kind 'bad_option') a spec Argon2id cannot run -- a salt under 8 bytes or over 65536,
 * memory under 8 KiB a lane or over 1 GiB, no passes, no lanes, a key other than 32 bytes -- and
 * one wearing a label safebyok reserves, or a supplied spec's without its parameters. A weak spec
 * that runs is allowed. The deriver it returns refuses (kind 'bad_option') a salt of another
 * length than the spec's `salt_bytes`, before any derivation.
 *
 * @param spec - The whole Argon2id parameter set, and the label vaults made under it record.
 * @returns A frozen KeyDeriver: the spec's fields and `deriveKeyBytes`.
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

/**
 * The KeyDeriver to use: Argon2id at the supplied {@link Argon2idWebV1} spec. `browserOpts()`,
 * from `safebyok/browser`, hands it to Vault.make; outside a browser, pass it as `keyDeriver`
 * yourself.
 *
 * @example
 *   const keyBytes = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', passphraseSalt)
 *   keyBytes.length  // 32
 */
export const argon2idWebV1Deriver = /* @__PURE__ */ deriverOf(Argon2idWebV1)
