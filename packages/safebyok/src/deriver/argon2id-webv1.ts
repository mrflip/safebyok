import { argon2idAsync } from '@noble/hashes/argon2.js'
import { type Argon2idKeyDeriver, checkSaltFits, parseKeyDeriverSpec } from './basederiver'
import { Argon2idWebV1, type KeyDeriverSpec } from './shapes'

// == [The deriver]: argon2idDeriver, argon2idWebV1Deriver

/** A frozen {@link Argon2idKeyDeriver} running Argon2id at `spec` through `@noble/hashes`, pure JS that yields to the event loop as it derives.
 * Never change a spec's parameters once a vault is made under it. Refuses `spec` as {@link parseKeyDeriverSpec} does.
 * The passphrase goes straight to noble, which holds its bytes for the call.
 *
 * @example argon2idDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
 */
export const argon2idDeriver = (spec: KeyDeriverSpec): Argon2idKeyDeriver => {
  const checked = parseKeyDeriverSpec(spec)
  const argonOpts = { m: checked.memory_kib, t: checked.iterations, p: checked.parallelism, dkLen: checked.output_bytes } // eslint-disable-line id-length -- noble's option names
  return Object.freeze({
    ...checked,
    deriveKeyBytes: async (passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array> => {
      checkSaltFits(checked, saltBytes)
      return argon2idAsync(passphrase, saltBytes, argonOpts)
    },
  })
}

/** The {@link KeyDeriver} to use: Argon2id at the supplied {@link Argon2idWebV1} spec, 64 MiB and three passes.
 *
 * @example const keyBytes = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', passphraseSalt)
 */
export const argon2idWebV1Deriver = /* @__PURE__ */ argon2idDeriver(Argon2idWebV1)
// --
