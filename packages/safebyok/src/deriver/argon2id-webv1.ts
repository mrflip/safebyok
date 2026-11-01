import { argon2idAsync } from '@noble/hashes/argon2.js'
import { type Argon2idKeyDeriver, checkSaltFits, parseKeyDeriverSpec } from './basederiver'
import { Argon2idWebV1, type KeyDeriverSpec } from './shapes'

// == [The deriver]: argon2idDeriver, argon2idWebV1Deriver

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

export const argon2idWebV1Deriver = /* @__PURE__ */ argon2idDeriver(Argon2idWebV1)
// --
