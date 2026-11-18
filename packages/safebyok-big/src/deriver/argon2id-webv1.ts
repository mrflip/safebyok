import { argon2idAsync } from '@noble/hashes/argon2.js'
import { type Argon2idKeyDeriver, parseKeyDeriverSpec } from './basederiver'
import { Argon2idWebV1, type KeyDeriverSpec } from './shapes'

// == [The deriver]: makeArgon2idDeriver, argon2idWebV1Deriver

/** Make a key deriver that runs Argon2id under `spec`. */
export function makeArgon2idDeriver(spec: KeyDeriverSpec): Argon2idKeyDeriver {
  const keyDeriverSpec = parseKeyDeriverSpec(spec)
  const argonOpts = { m: keyDeriverSpec.memory_kib, t: keyDeriverSpec.iterations, p: keyDeriverSpec.parallelism, dkLen: keyDeriverSpec.output_size } // eslint-disable-line id-length -- noble's option names
  return Object.freeze({
    ...keyDeriverSpec,
    deriveKeyBytes: (passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array> => argon2idAsync(passphrase, saltBytes, argonOpts),
  })
}

/** The supplied key deriver, running Argon2id at the {@link Argon2idWebV1} settings. */
export const argon2idWebV1Deriver = /* @__PURE__ */ makeArgon2idDeriver(Argon2idWebV1)
// --
