import { argon2id } from 'hash-wasm'
import { VaultError } from 'safebyok-big'
import { Argon2idWebV1, parseKeyDeriverSpec, type Argon2idKeyDeriver, type KeyDeriverSpec } from 'safebyok-big/browser'

/** Make a frozen key deriver from a spec that has already been validated. */
function deriverOf(spec: KeyDeriverSpec): Argon2idKeyDeriver {
  return Object.freeze({
    ...spec,
    deriveKeyBytes: (passphrase: string, saltBytes: Uint8Array) => deriveWithWasm(spec, passphrase, saltBytes),
  })
}

/** Make a frozen key deriver that runs Argon2id at `spec` through WebAssembly.
 * It derives the same bytes as safebyok's `makeArgon2idDeriver` does for the same spec.
 *
 * @example makeArgon2idWasmDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
 */
export function makeArgon2idWasmDeriver(spec: KeyDeriverSpec): Argon2idKeyDeriver { return deriverOf(parseKeyDeriverSpec(spec)) }

/** The key deriver for the supplied `Argon2idWebV1` spec, run through WebAssembly: a drop-in replacement for safebyok's `argon2idWebV1Deriver`.
 *
 * @example Device.make({ user_id: session.user_id, banklabel: 'acme', gates: ['main'], bankDB, deviceDB, requestCleartext, keyDeriver: argon2idWasmWebV1Deriver })
 */
export const argon2idWasmWebV1Deriver = /* @__PURE__ */ deriverOf(Argon2idWebV1)

// hash-wasm throws a plain Error for an empty password, so that case is refused here first. A vault never passes an empty
// passphrase, and does not pass on what a deriver throws, so these refusals only reach a host that calls `deriveKeyBytes` directly.
/** Derive the key bytes with hash-wasm's Argon2id at `spec`. */
async function deriveWithWasm(spec: KeyDeriverSpec, passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array> {
  if (typeof WebAssembly === 'undefined') {
    throw new VaultError('bad_option', "This platform has no WebAssembly (React Native's Hermes has none), so the WebAssembly key deriver cannot run here: use argon2idWebV1Deriver, or makeArgon2idDeriver, from safebyok-big/browser.")
  }
  if (passphrase === '') { throw new VaultError('wrong_passphrase', "A passphrase can't be empty.") }
  try {
    return await argon2id({
      password:    passphrase,
      salt:        saltBytes,
      iterations:  spec.iterations,
      parallelism: spec.parallelism,
      memorySize:  spec.memory_kib,
      hashLength:  spec.output_size,
      outputType:  'binary',
    })
  } catch (err) {
    if (err instanceof WebAssembly.CompileError) {
      throw new VaultError('bad_option', "WebAssembly would not compile here, so Argon2id cannot run through it: a page's Content-Security-Policy must allow 'wasm-unsafe-eval' in script-src. Allow it, or use argon2idWebV1Deriver from safebyok-big/browser.", { cause: err })
    }
    throw err
  }
}
