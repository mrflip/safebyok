import { argon2id } from 'hash-wasm'
import { VaultError } from 'safebyok'
import { Argon2idWebV1, checkSaltFits, parseKeyDeriverSpec, type Argon2idKeyDeriver, type KeyDeriverSpec } from 'safebyok/browser'

/** A frozen deriver of a spec already checked: Argon2idWebV1, or one parseKeyDeriverSpec passed. */
const deriverOf = (spec: KeyDeriverSpec): Argon2idKeyDeriver => Object.freeze({
  ...spec,
  deriveKeyBytes: (passphrase: string, saltBytes: Uint8Array) => deriveWithWasm(spec, passphrase, saltBytes),
})

/**
 * A key deriver running Argon2id at `spec` through WebAssembly, deriving the same bytes as safebyok's `argon2idDeriver`.
 *
 * @param spec - The whole Argon2id parameter set, and the label vaults made under it record.
 * @returns A frozen deriver: the spec's fields and `deriveKeyBytes`.
 * @example argon2idWasmDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
 */
export const argon2idWasmDeriver = (spec: KeyDeriverSpec): Argon2idKeyDeriver => deriverOf(parseKeyDeriverSpec(spec))

/**
 * Argon2id at the supplied `Argon2idWebV1` spec through WebAssembly: a stand-in for safebyok's `argon2idWebV1Deriver`.
 *
 * @example Bank.make({ ...browserOpts(), keyDeriver: argon2idWasmWebV1Deriver, applabel: 'acme', user_id: session.user_id, vaultDB })
 */
export const argon2idWasmWebV1Deriver = /* @__PURE__ */ deriverOf(Argon2idWebV1)

// hash-wasm refuses an empty password with a plain Error, and a vault never hands one over.
// The vault keeps nothing of what a deriver throws, so a refusal here is for a host calling `deriveKeyBytes` directly.
const deriveWithWasm = async (spec: KeyDeriverSpec, passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array> => {
  checkSaltFits(spec, saltBytes)
  if (typeof WebAssembly === 'undefined') {
    throw new VaultError('bad_option', "This platform has no WebAssembly (React Native's Hermes has none), so the WebAssembly key deriver cannot run here: use argon2idWebV1Deriver, or argon2idDeriver, from safebyok/browser.")
  }
  if (passphrase === '') { throw new VaultError('wrong_passphrase', "A passphrase can't be empty.") }
  try {
    return await argon2id({
      password:    passphrase,
      salt:        saltBytes,
      iterations:  spec.iterations,
      parallelism: spec.parallelism,
      memorySize:  spec.memory_kib,
      hashLength:  spec.output_bytes,
      outputType:  'binary',
    })
  } catch (err) {
    if (err instanceof WebAssembly.CompileError) {
      throw new VaultError('bad_option', "WebAssembly would not compile here, so Argon2id cannot run through it: a page's Content-Security-Policy must allow 'wasm-unsafe-eval' in script-src. Allow it, or use argon2idWebV1Deriver from safebyok/browser.", { cause: err })
    }
    throw err
  }
}
