import { argon2idAsync } from '@noble/hashes/argon2.js'
import { type Argon2idKeyDeriver, parseKeyDeriverSpec } from './basederiver'
import { Argon2idWebV1, type KeyDeriverSpec } from './shapes'

// == [The deriver]: argon2idDeriver, argon2idWebV1Deriver

/** Make a key deriver that runs Argon2id under `spec`. */
export const argon2idDeriver = (spec: KeyDeriverSpec): Argon2idKeyDeriver => {
  const checked = parseKeyDeriverSpec(spec)
  const argonOpts = { m: checked.memory_kib, t: checked.iterations, p: checked.parallelism, dkLen: checked.output_size } // eslint-disable-line id-length -- noble's option names
  return Object.freeze({
    ...checked,
    deriveKeyBytes: (passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array> => argon2idAsync(passphrase, saltBytes, argonOpts),
  })
}

/** The supplied key deriver, running Argon2id at the {@link Argon2idWebV1} settings. */
export const argon2idWebV1Deriver = /* @__PURE__ */ argon2idDeriver(Argon2idWebV1)
// --
