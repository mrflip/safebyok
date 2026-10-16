import { argon2id } from 'hash-wasm'
import { Argon2idKeyDeriver, Argon2idWebV1, VaultError, type Argon2idSpec } from 'safebyok'

/**
 * Argon2id through hash-wasm's WebAssembly: its runner is all it adds to the Argon2id family,
 * which checks its spec, its salt and what it hands back, as for the core's own.
 */
class WasmArgon2idDeriver extends Argon2idKeyDeriver {
  protected doDeriveKeyBytes(passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array> {
    return deriveWithWasm(this.spec, passphrase, saltBytes)
  }
}

/** A frozen WasmArgon2idDeriver of `spec`, once it passes. */
const wasmDeriverOf = (spec: Argon2idSpec): Argon2idKeyDeriver => {
  const deriver = new WasmArgon2idDeriver(spec)
  Object.freeze(deriver)
  return deriver
}

/**
 * A KeyDeriver running Argon2id at `spec` through hash-wasm's WebAssembly: the WebAssembly twin
 * of safebyok's `argon2idDeriver`, deriving the same bytes from the same spec, passphrase and
 * salt, several times faster. A vault made under one opens under the other, so each device may use
 * whichever it runs best.
 *
 * Both are an `Argon2idKeyDeriver`, so it checks `spec` exactly as `argon2idDeriver` does, and
 * refuses (kind 'bad_option') what that refuses: a spec Argon2id cannot run, a label safebyok
 * reserves, and one wearing a supplied spec's label without its parameters; and, at each
 * derivation, a passphraseSalt of another length than the spec's `salt_bytes`. Choose a label of
 * your own, and never change its parameters once a vault is made under it.
 *
 * It needs WebAssembly, which React Native's Hermes lacks, and a page whose
 * Content-Security-Policy allows `'wasm-unsafe-eval'`; where either is missing, `deriveKeyBytes`
 * refuses with kind 'bad_option'. It refuses an empty passphrase too (kind 'wrong_passphrase'), as
 * `unlock()` does before it ever reaches a deriver. Each derivation holds the thread it runs on
 * until it is done.
 *
 * @param spec - The whole Argon2id parameter set, and the label vaults made under it record.
 * @returns A frozen Argon2idKeyDeriver of the spec.
 *
 * @example
 *   const keyDeriver = argon2idWasmDeriver({
 *     ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072,
 *   })
 * @example
 *   argon2idWasmDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', salt_bytes: 4 })
 *   // throws 'bad_option': Argon2id takes no salt under 8 bytes
 * @example
 *   argon2idWasmDeriver({ ...Argon2idWebV1, iterations: 4 })
 *   // throws 'bad_option': argon2id_web_v1 always means 3 passes
 */
export const argon2idWasmDeriver = (spec: Argon2idSpec): Argon2idKeyDeriver => wasmDeriverOf(spec)

/**
 * Argon2id at the supplied `Argon2idWebV1` spec, through WebAssembly: a stand-in for safebyok's
 * `argon2idWebV1Deriver`, wearing its label and deriving its bytes. Pass it as `keyDeriver`, after
 * any `browserOpts()` spread, so it wins.
 *
 * @example
 *   const vault = Vault.make({ ...browserOpts(), keyDeriver: argon2idWasmWebV1Deriver, applabel: 'acme', userId, vaultlabel: 'main', vaultDB })
 * @example
 *   const keyBytes = await argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', passphraseSalt)
 *   keyBytes.length  // 32
 */
export const argon2idWasmWebV1Deriver = /* @__PURE__ */ wasmDeriverOf(Argon2idWebV1)

/** 32 key bytes from hash-wasm's Argon2id at `spec`; its failures to run come back as VaultErrors. */
const deriveWithWasm = async (spec: Argon2idSpec, passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array> => {
  if (typeof WebAssembly === 'undefined') {
    throw new VaultError('bad_option', "This platform has no WebAssembly (React Native's Hermes has none), so the WebAssembly key deriver cannot run here: use argon2idWebV1Deriver, or argon2idDeriver, from safebyok.")
  }
  // hash-wasm refuses an empty password with a plain Error; a vault never hands one over.
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
      throw new VaultError('bad_option', "WebAssembly would not compile here, so Argon2id cannot run through it: a page's Content-Security-Policy must allow 'wasm-unsafe-eval' in script-src. Allow it, or use argon2idWebV1Deriver from safebyok.", { cause: err })
    }
    throw err
  }
}
